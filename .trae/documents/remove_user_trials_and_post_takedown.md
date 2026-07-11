# 移除用户公审系统与帖子公审自动下架功能

## 背景与目标

当前系统同时存在「帖子公审」和「用户公审」两套公投机制，且帖子公审会在整点自动删除被判定违规的帖子。根据需求：

1. **彻底移除用户公审系统**（用户举报、用户公审、用户公审投票）。
2. **移除帖子公审的自动下架/删除功能**，仅保留用户对帖子「有罪/无罪」的投票斗争。
3. **超级管理员可查看投票结果后，手动下架帖子**。

## 关键决策

- 用户举报入口一并删除：用户资料页的「举报用户」按钮、举报用户弹窗、相关 JS 逻辑全部移除，后端 `user_reports / user_trials / user_trial_votes` 表及函数清理。
- 帖子公审整点只结算状态、不删帖：达到投票阈值后，trial 状态变为 `violate`（多数人投违规）或 `clean`（未构成违规），违规状态继续显示，方便超管查看。
- 超管手动下架直接做到公审卡片上：复用已有 `hide_post_from_recommend()` 将帖子从首页/搜索/热榜/分类移除，但保留在作者主页；同时提供「忽略」按钮把 trial 标记为 `resolved`。

## 需要修改的文件

### 1. `d:\zch\VIBECODING\bigblue\index.html`

- 删除 `#report-user-overlay` 举报用户弹窗 HTML。
- 用户资料页删除「🚨 举报用户」按钮。
- 删除 `currentTrialTab` 变量、`renderTrialTabs()`、`switchTrialTab()`。
- `navigateTrial()` 直接调用 `loadTrialList()`，不再设置 tab。
- 删除 `loadUserTrialList()`、`castUserTrialVote()`。
- 删除 `openReportUserModal()`、`closeReportUserModal()`、`selectUserReportReason()`、`submitUserReport()` 及对应变量。
- `loadTrialList()` 只调用 `check_hourly_trials()`，删除 `check_hourly_user_trials()` 和 `check_and_create_user_trial()` 调用。
- `loadPostTrialList()`：
  - 空状态文案去掉「整点自动删除」。
  - 副标题改为「X 个帖子等待审判 · 整点统计投票结果」。
  - 根据 `t.status` 显示徽标，`active` 显示「待审」，`violate` 显示「已判定违规，等待管理员处理」。
  - 仅 `status === 'active'` 时显示投票按钮。
  - 为超管增加「🚫 隐藏该帖子」和「✅ 忽略」按钮。
- `scheduleHourlyCheck()` 删除 `check_hourly_user_trials()` 调用，倒计时文案改为「整点统计投票结果」。
- 新增 `adminHideTrialPost(postId, trialId)`：调用 `hide_post_from_recommend` 成功后调用 `resolve_trial`。
- 新增 `adminIgnoreTrial(trialId)`：直接调用 `resolve_trial`。

### 2. 新增 `d:\zch\VIBECODING\bigblue\migrations\update_post_trials_no_auto_delete.sql`

改造帖子公审后端行为：

- 确保 `trials` 表有 `status` / `resolved_at` 字段。
- 重建 `get_active_trials()`，返回 `active` 和 `violate` 状态 trial，并返回 `post_id`。
- 重建 `vote_trial()`，仅允许对 `active` trial 投票。
- 重建 `check_hourly_trials()`，达到票数阈值后只更新状态为 `violate` / `clean`，不删除帖子。
- 新增 `resolve_trial(trial_id, admin_user_id)`，超管将 `violate` trial 标记为 `resolved`。

### 3. 新增 `d:\zch\VIBECODING\bigblue\migrations\drop_user_trial_system.sql`

清理用户公审数据库对象：

```sql
DROP FUNCTION IF EXISTS check_hourly_user_trials();
DROP FUNCTION IF EXISTS check_and_create_user_trial();
DROP FUNCTION IF EXISTS get_active_user_trials();
DROP FUNCTION IF EXISTS vote_user_trial(UUID, UUID, TEXT);
DROP TABLE IF EXISTS user_trial_votes;
DROP TABLE IF EXISTS user_trials;
DROP TABLE IF EXISTS user_reports;
```

## 不改动的文件

- `migrations/add_reports.sql`：帖子举报表保留。
- `migrations/add_super_admin.sql`：超管判断与拉黑/删账号逻辑保留。
- `migrations/add_hidden_posts.sql`：隐藏帖子逻辑直接复用。

## 验证方案

1. **页面结构**：打开「公审」页，确认没有用户公审 tab，用户资料页没有举报用户按钮。
2. **投票流程**：对公审帖子投票，确认计数更新。
3. **整点不删帖**：在 Supabase SQL Editor 执行 `SELECT check_hourly_trials();`，确认违规 trial 状态变为 `violate` 但对应 `posts` 记录仍存在。
4. **超管手动下架**：超管登录后，对 `violate` trial 点击「隐藏该帖子」，确认帖子进入 `hidden_posts` 且 trial 消失；点击「忽略」确认 trial 消失但帖子未隐藏。
5. **调用消失**：DevTools Network 确认不再调用 `check_hourly_user_trials`、`check_and_create_user_trial`、`get_active_user_trials`、`vote_user_trial`。
6. **迁移执行**：在 Supabase 依次执行两条新增迁移，确认成功。

## 实施顺序

1. 执行 `update_post_trials_no_auto_delete.sql`。
2. 执行 `drop_user_trial_system.sql`。
3. 修改 `index.html`。
4. 本地浏览器验证。
5. 超管账号验证手动下架/忽略。
