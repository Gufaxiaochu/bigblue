# 精选帖子功能实施计划

## Context
在首页上方增加一个「精选帖子」入口，用户点击进入后可浏览被超级管理员标记为精选的帖子；超级管理员可以在帖子详情页将帖子设为精选或取消精选。

## Approach
采用「首页 Tab 栏」方案，复用已有的 `currentHomeTab` 状态，把首页内容区扩展为三个 Tab：最新 / 热榜 / 精选。这样无需新增独立页面，与现有首页下拉刷新、DOM 缓存、返回恢复机制更容易集成。

## Implementation Steps

### 1. 数据库迁移
新建 `migrations/add_featured_posts.sql`：
- 创建 `featured_posts` 表：`post_id`（PK，引用 `posts`）、`featured_by`、`featured_at`。
- 启用 RLS：SELECT 对所有人开放，写入/删除仅超级管理员（手机号 `19256680343`）。
- 定义 RPC：
  - `is_post_featured(p_post_id UUID)` — 查询帖子是否精选。
  - `feature_post(p_post_id, admin_user_id)` / `unfeature_post(...)` — 仅超管可调用。
  - `get_featured_posts(p_limit INT DEFAULT 50, p_offset INT DEFAULT 0)` — 返回精选帖子列表（含 `thumbnail_urls`、作者信息），按 `featured_at` 倒序，并排除 `hidden_posts`。

### 2. 首页 Tab UI
在 `index.html` 的 `#page-home` 中，`#home-content` 上方插入 `.home-tabs`：
```html
<div class="home-tabs">
  <button class="active" onclick="switchHomeTab('latest')">最新</button>
  <button onclick="switchHomeTab('hot')">热榜</button>
  <button onclick="switchHomeTab('featured')">精选</button>
</div>
```
新增 CSS：`.home-tabs` 横向 flex 布局，`.active` 使用与顶部导航一致的蓝色高亮风格。

### 3. 前端状态与加载逻辑
- 扩展 `currentHomeTab` 取值：`latest | hot | featured`。
- 新增 `switchHomeTab(tab)`：更新 `currentHomeTab`、切换按钮 `.active`、清空 `home-content` 并调用对应加载函数。
- 新增 `loadFeaturedPosts()`：调用 `get_featured_posts`，用现有 `renderPostCard()` 渲染为 masonry 列表。
- 同步修改 `navigateHome()`、`showPage()` 中的缓存/恢复逻辑、`setupHomeScrollListener()` 的触底加载判断，以及点赞/删除后的刷新逻辑，使其识别 `featured` Tab。

### 4. 超级管理员精选按钮
在 `loadPostDetail()` 中：
- 超管额外查询 `is_post_featured`。
- 在帖子底部 admin 按钮区增加：
  - 未精选：「⭐ 加精选」调用 `feature_post`。
  - 已精选：「取消精选」调用 `unfeature_post`。
- 操作成功后重新加载帖子详情并给出提示。

## Critical Files
- `d:\zch\VIBECODING\bigblue\index.html` — 首页 Tab UI、状态、加载与 admin 按钮。
- `d:\zch\VIBECODING\bigblue\migrations\add_featured_posts.sql` — 新表、RLS、RPC 函数。

## Verification
1. 普通用户打开首页，顶部出现「最新/热榜/精选」Tab，点击「精选」加载精选帖子列表。
2. 使用超管账号（手机号 `19256680343`）进入任意帖子详情，出现「加精选」按钮；点击后该帖子出现在精选列表。
3. 点击「取消精选」后，帖子从精选列表移除。
4. 非超管用户看不到精选/取消精选按钮。
5. 在精选 Tab 下拉刷新、返回首页、点赞后刷新均正常工作。
