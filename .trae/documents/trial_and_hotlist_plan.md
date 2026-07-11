# 公审简化与今日热榜实现计划

## 摘要

用户提出两个需求：

1. **取消公审自动结算**：移除“到达某时间后自动统计结果”的逻辑，改为超级管理员在投票页面直接「删除该帖子」或「保留该帖子」。
2. **首页热榜改为今日热榜**：只统计最近 24 小时内的热门帖子，取前 30 条。

经代码库核查，这两个功能在数据库迁移文件和前端页面中均已实现。本计划以「验证现有实现、确保迁移已应用、补齐可能的遗漏」为主，无需大规模重写代码。

## 当前状态分析

### 1. 数据库迁移层

- [`migrations/update_post_trials_no_auto_delete.sql`](file:///d:/zch/VIBECODING/bigblue/migrations/update_post_trials_no_auto_delete.sql)
  - `check_hourly_trials()` 已改为空函数，取消自动整点结算。
  - 新增 `resolve_trial(trial_id, admin_user_id)`：超管保留帖子并结案。
  - 新增 `admin_delete_trial_post(trial_id, admin_user_id)`：超管隐藏帖子并结案。
  - `vote_trial` 仅允许对 `status = 'active'` 的 trial 投票。
  - `get_active_trials()` 返回 `active` 和 `violate` 状态的 trial。

- [`migrations/add_hidden_posts.sql`](file:///d:/zch/VIBECODING/bigblue/migrations/add_hidden_posts.sql)
  - `get_hot_posts(p_limit INT DEFAULT 30)` 已加入 `p.created_at >= NOW() - INTERVAL '24 hours'` 过滤，并返回 `thumbnail_urls`。

- [`migrations/add_post_thumbnails.sql`](file:///d:/zch/VIBECODING/bigblue/migrations/add_post_thumbnails.sql)
  - 同样包含 24 小时过滤与 `thumbnail_urls` 字段，确保热榜函数定义一致。

### 2. 前端交互层

- [`index.html`](file:///d:/zch/VIBECODING/bigblue/index.html)
  - 首页 tab 文案已改为「今日热榜」（[#L1323](file:///d:/zch/VIBECODING/bigblue/index.html#L1323)）。
  - `loadHotPosts()` 优先调用 `get_hot_posts` RPC，回退查询也使用 `gte('created_at', since)` 限制 24 小时，并 `slice(0, 30)`（[#L3109-L3140](file:///d:/zch/VIBECODING/bigblue/index.html#L3109-L3140)）。
  - 公审列表卡片中，超管可见「🚫 删除该帖子」和「✅ 保留该帖子」按钮（[#L4383-L4387](file:///d:/zch/VIBECODING/bigblue/index.html#L4383-L4387)）。
  - `adminDeleteTrialPost()` 调用 `admin_delete_trial_post` RPC（[#L4427-L4447](file:///d:/zch/VIBECODING/bigblue/index.html#L4427-L4447)）。
  - `adminKeepTrialPost()` 调用 `resolve_trial` RPC（[#L4449-L4469](file:///d:/zch/VIBECODING/bigblue/index.html#L4449-L4469)）。
  - 原 `scheduleHourlyCheck` / `updateTrialTimers` 等整点结算相关逻辑已从前端移除。

## 计划步骤

### 步骤 1：清理残留的整点结算调用（如有）

- 在 `index.html` 中全局搜索 `scheduleHourlyCheck`、`updateTrialTimers`、`check_hourly_trials`、`整点`、`distanceToNextHour` 等关键词。
- 若仍有调用或 DOM 元素，彻底删除；若已不存在，跳过。

### 步骤 2：应用数据库迁移

按以下顺序在 Supabase SQL Editor 中执行：

1. `migrations/0001_init.sql`（如未执行）
2. `migrations/add_hidden_posts.sql`
3. `migrations/add_post_thumbnails.sql`
4. `migrations/update_post_trials_no_auto_delete.sql`
5. `migrations/add_featured_posts.sql`（如依赖已满足）

执行后确认：

- `get_hot_posts` 函数返回值包含 `thumbnail_urls` 且带 24 小时过滤。
- `check_hourly_trials()` 函数体为空。
- `resolve_trial` 和 `admin_delete_trial_post` 函数存在且仅对超管开放。

### 步骤 3：验证今日热榜

- 进入首页，切换到「今日热榜」。
- 检查列表仅展示 24 小时内帖子。
- 检查最多展示 30 条。
- 检查置顶规则仍生效：用户名「楚楚」且正文含「呵呵哒」置顶。

### 步骤 4：验证公审页面超管操作

- 使用超管账号进入「公审」页面。
- 对一个 active 的 trial 点击「删除该帖子」，确认：
  - 帖子被加入 `hidden_posts`，从首页/热榜/搜索/分类中消失。
  - trial 状态变为 `resolved`。
- 对另一个 active 的 trial 点击「保留该帖子」，确认：
  - 帖子保持正常显示。
  - trial 状态变为 `resolved`。
- 确认普通用户看不到这两个按钮。

### 步骤 5：确认无自动结算副作用

- 观察 `loadTrialList` 不再调用 `check_hourly_trials`。
- 观察页面中没有倒计时到整点的文案或定时器。
- 确认投票仅对 `active` trial 有效，已 `resolved` 的 trial 显示「投票已结束」。

## 假设与决策

- **假设**：当前仓库代码是最新状态，用户只需要确认实现无误并应用迁移。
- **决策**：由于代码已实现，本计划以验证和迁移应用为主，不新增功能。
- **决策**：保留 `check_hourly_trials()` 空函数而非删除，避免旧代码或定时任务引用时报错。
- **决策**：超管「删除」走的是 `hide_post_from_recommend`（加入 `hidden_posts`），帖子仍保留在作者主页，与现有隐藏帖子逻辑一致。

## 验证清单

- [ ] `index.html` 中无整点结算/倒计时相关残留代码。
- [ ] 数据库迁移按顺序成功执行，无 `return type` 或 `relation does not exist` 错误。
- [ ] 首页「今日热榜」tab 文案正确，列表只含 24 小时内帖子且最多 30 条。
- [ ] 超管在公审页可见「删除该帖子」和「保留该帖子」按钮。
- [ ] 点击后帖子状态/trial 状态更新符合预期。
- [ ] 普通用户看不到超管操作按钮。
