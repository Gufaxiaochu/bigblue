// Cloudbase API 封装 - 替代 Supabase 调用
// 在 index.html 里引入：<script src="https://static.cloudbase.net/cloudbase-js-sdk/latest/cloudbase.full.js"></script>
// 然后 <script src="api.js"></script>

const CLOUDBASE_ENV = 'cmfootball-d3gp9t11528eabd1f';

// 初始化 Cloudbase（官方 SDK 使用 cloudbase 小写）
const app = cloudbase.init({
    env: CLOUDBASE_ENV,
    region: 'ap-shanghai'
});

// 匿名登录（必须先登录才能调用云函数）
let authInitialized = false;
async function ensureAuth() {
    if (authInitialized) return;
    const auth = app.auth();
    const loginState = await auth.getLoginState();
    if (!loginState) {
        await auth.signInAnonymously();
    }
    authInitialized = true;
}

// 页面加载时自动匿名登录
ensureAuth().catch(console.error);

// 获取数据库引用
const db = app.database();

// 认证模块
const auth = {
    // 登录（邮箱）
    async login(email, password) {
        const result = await app.callFunction({
            name: 'api',
            data: { action: 'auth/login', email, password }
        });
        if (result.result?.success && result.result?.data?.token) {
            localStorage.setItem('token', result.result.data.token);
            localStorage.setItem('user', JSON.stringify(result.result.data.user));
        }
        return result.result;
    },

    // 登录（邮箱或手机号）
    async loginWithPhoneOrEmail(data) {
        const result = await app.callFunction({
            name: 'api',
            data: { action: 'auth/login', ...data }
        });
        // 兼容 success 和 code 两种格式
        const isSuccess = result.result?.success === true || result.result?.code === 200;
        if (isSuccess && result.result?.data?.token) {
            localStorage.setItem('token', result.result.data.token);
            localStorage.setItem('user', JSON.stringify(result.result.data.user));
        }
        return result.result;
    },

    // 注册（邮箱）
    async register(email, password, nickname, device_id) {
        const result = await app.callFunction({
            name: 'api',
            data: { action: 'auth/register', email, password, nickname, device_id }
        });
        if (result.result?.success && result.result?.data?.token) {
            localStorage.setItem('token', result.result.data.token);
            localStorage.setItem('user', JSON.stringify(result.result.data.user));
        }
        return result.result;
    },

    // 登出
    async logout() {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
    },

    // 获取当前用户
    getCurrentUser() {
        const user = localStorage.getItem('user');
        return user ? JSON.parse(user) : null;
    },

    // 获取 token
    getToken() {
        return localStorage.getItem('token');
    }
};

// 数据库模块
const database = {
    // 查询帖子列表
    async getPosts(options = {}) {
        const result = await app.callFunction({
            name: 'api',
            data: { action: 'posts/list', ...options }
        });
        return result.result;
    },

    // 获取帖子详情
    async getPost(postId) {
        const result = await app.callFunction({
            name: 'api',
            data: { action: 'posts/detail', postId }
        });
        return result.result;
    },

    // 创建帖子
    async createPost(data) {
        const result = await callFunction('posts/create', data);
        return result;
    },

    // 更新帖子
    async updatePost(postId, data) {
        const result = await callFunction('posts/update', { postId, ...data });
        return result;
    },

    // 删除帖子
    async deletePost(postId) {
        const result = await callFunction('posts/delete', { postId });
        return result;
    },

    // 获取评论
    async getComments(postId) {
        const result = await app.callFunction({
            name: 'api',
            data: { action: 'comments/list', postId }
        });
        return result.result;
    },

    // 创建评论
    async createComment(data) {
        const result = await callFunction('comments/create', data);
        return result;
    },

    // 删除评论
    async deleteComment(commentId) {
        const result = await callFunction('comments/delete', { commentId });
        return result;
    },

    // 获取用户信息
    async getProfile(userId) {
        const result = await app.callFunction({
            name: 'api',
            data: { action: 'users/profile', userId }
        });
        return result.result;
    },

    // 更新用户信息
    async updateProfile(data) {
        const result = await callFunction('users/update', data);
        return result;
    },

    // 点赞
    async toggleLike(postId) {
        const result = await callFunction('likes/toggle', { postId });
        return result;
    },

    // 关注
    async toggleFollow(targetUserId) {
        const result = await callFunction('follows/toggle', { targetUserId });
        return result;
    },

    // 检查关注状态
    async checkFollowStatus(targetUserId) {
        const result = await callFunction('follows/check', { targetUserId });
        return result;
    },

    // 举报
    async report(data) {
        const result = await callFunction('reports/create', data);
        return result;
    },

    // 获取热榜
    async getHotPosts(limit = 30) {
        const result = await app.callFunction({
            name: 'api',
            data: { action: 'posts/hot', limit }
        });
        return result.result;
    },

    // 获取精选帖子
    async getFeaturedPosts(limit = 50) {
        const result = await app.callFunction({
            name: 'api',
            data: { action: 'posts/featured', limit }
        });
        return result.result;
    },

    // 获取公审列表
    async getTrials() {
        const result = await app.callFunction({
            name: 'api',
            data: { action: 'trials/list' }
        });
        return result.result;
    },

    // 公审投票
    async voteTrial(trialId, verdict) {
        const result = await callFunction('trials/vote', { trialId, verdict });
        return result;
    },

    // 超管操作
    async adminAction(action, data) {
        const result = await callFunction(`admin/${action}`, data);
        return result;
    }
};

// 存储模块
const storage = {
    // 上传图片
    async uploadImage(file, path) {
        const result = await app.uploadFile({
            cloudPath: path,
            filePath: file
        });
        return result;
    },

    // 获取图片 URL
    getImageUrl(path) {
        return `https://${CLOUDBASE_ENV}.tcb.qcloud.la/${path}`;
    }
};

// 通用云函数调用
async function callFunction(action, data = {}) {
    // 自动添加userId（如果已登录）
    const user = auth.getCurrentUser();
    if (user && !data.userId && !data.user_id) {
        data = { ...data, userId: user.id };
    }
    // 兼容 user_id 和 userId
    if (data.user_id && !data.userId) {
        data.userId = data.user_id;
    }
    const result = await app.callFunction({
        name: 'api',
        data: { action, ...data }
    });
    return result.result;
}

// 扩展数据库模块
Object.assign(database, {
    // 用户计数
    async getUserCount() {
        return callFunction('users/count');
    },

    // 检查昵称是否存在
    async checkUsername(username) {
        return callFunction('users/check-username', { username });
    },

    // 获取隐藏帖子ID列表
    async getHiddenPostIds() {
        return callFunction('posts/hidden-ids');
    },

    // 获取用户帖子列表
    async getUserPosts(userId, options = {}) {
        return callFunction('posts/user-posts', { userId, ...options });
    },

    // 获取帖子评论
    async getPostComments(postId) {
        return callFunction('comments/list', { postId });
    },

    // 创建评论
    async createComment(data) {
        return callFunction('comments/create', data);
    },

    // 删除评论
    async deleteComment(commentId) {
        return callFunction('comments/delete', { commentId });
    },

    // 获取通知列表
    async getNotifications(options = {}) {
        return callFunction('notifications/list', options);
    },

    // 获取未读通知数
    async getUnreadCount() {
        return callFunction('notifications/unread-count');
    },

    // 标记通知已读
    async markNotificationRead(notifId) {
        return callFunction('notifications/mark-read', { notifId });
    },

    // 标记所有通知已读
    async markAllNotificationsRead() {
        return callFunction('notifications/mark-all-read');
    },

    // 获取留言板
    async getGuestbook() {
        return callFunction('guestbook/list');
    },

    // 创建留言
    async createGuestbook(content) {
        return callFunction('guestbook/create', { content });
    },

    // 更新留言
    async updateGuestbook(entryId, content) {
        return callFunction('guestbook/update', { entryId, content });
    },

    // 投票
    async votePoll(postId, optionIndex) {
        return callFunction('polls/vote', { postId, optionIndex });
    },

    // 获取投票结果
    async getPollResults(postId) {
        return callFunction('polls/results', { postId });
    },

    // 搜索帖子
    async searchPosts(keyword, options = {}) {
        return callFunction('posts/search', { keyword, ...options });
    },

    // 搜索用户
    async searchUsers(keyword, options = {}) {
        return callFunction('users/search', { keyword, ...options });
    },

    // 获取分区帖子
    async getCategoryPosts(category, options = {}) {
        return callFunction('posts/category', { category, ...options });
    },

    // 获取关于页面内容
    async getSiteContent(keys) {
        return callFunction('site/content', { keys });
    },

    // 举报帖子
    async reportPost(postId, reason) {
        return callFunction('reports/create', { postId, reason, type: 'post' });
    },

    // 举报评论
    async reportComment(commentId, reason) {
        return callFunction('reports/create', { commentId, reason, type: 'comment' });
    },

    // 举报用户
    async reportUser(targetUserId, reason) {
        return callFunction('reports/create', { targetUserId, reason, type: 'user' });
    },

    // 检查举报状态
    async checkReportStatus(targetId, type) {
        return callFunction('reports/check', { targetId, type });
    },

    // 公审相关
    async getActiveTrials() {
        return callFunction('trials/active');
    },

    async getActiveUserTrials() {
        return callFunction('trials/active-users');
    },

    async getActiveCommentTrials() {
        return callFunction('trials/active-comments');
    },

    async voteTrial(trialId, verdict) {
        return callFunction('trials/vote', { trialId, verdict });
    },

    async voteUserTrial(trialId, verdict) {
        return callFunction('trials/vote-user', { trialId, verdict });
    },

    async voteCommentTrial(trialId, verdict) {
        return callFunction('trials/vote-comment', { trialId, verdict });
    },

    // 管理员操作
    async adminDeleteUserPosts(targetUserId) {
        return callFunction('admin/delete-user-posts', { targetUserId });
    },

    async adminDeleteUserComments(targetUserId) {
        return callFunction('admin/delete-user-comments', { targetUserId });
    },

    async adminBanUserIp(targetUserId, reason) {
        return callFunction('admin/ban-user-ip', { targetUserId, reason });
    },

    async adminDeleteUserAccount(targetUserId) {
        return callFunction('admin/delete-user-account', { targetUserId });
    },

    async adminHidePost(postId) {
        return callFunction('admin/hide-post', { postId });
    },

    async adminUnhidePost(postId) {
        return callFunction('admin/unhide-post', { postId });
    },

    async adminFeaturePost(postId) {
        return callFunction('admin/feature-post', { postId });
    },

    async adminUnfeaturePost(postId) {
        return callFunction('admin/unfeature-post', { postId });
    },

    async adminResolveTrial(trialId) {
        return callFunction('admin/resolve-trial', { trialId });
    },

    async adminDeleteTrialPost(trialId) {
        return callFunction('admin/delete-trial-post', { trialId });
    },

    async adminResolveUserTrial(trialId, status, reason) {
        return callFunction('admin/resolve-user-trial', { trialId, status, reason });
    },

    async adminDeleteCommentTrial(trialId, reason) {
        return callFunction('admin/delete-comment-trial', { trialId, reason });
    },

    async adminResolveCommentTrial(trialId) {
        return callFunction('admin/resolve-comment-trial', { trialId });
    },

    // IP 和设备相关
    async updateUserIp(userId, ip) {
        return callFunction('users/update-ip', { userId, ip });
    },

    async updateUserDevice(userId, deviceId) {
        return callFunction('users/update-device', { userId, deviceId });
    },

    async checkIpBanned(ip) {
        return callFunction('admin/check-ip-banned', { ip });
    },

    async checkDeviceBanned(deviceId) {
        return callFunction('admin/check-device-banned', { deviceId });
    },

    // 全站最热帖子
    async getAllTimeHotPosts(limit = 30) {
        return callFunction('posts/all-time-hot', { limit });
    },

    // 检查帖子隐藏状态
    async isPostHidden(postId) {
        return callFunction('posts/is-hidden', { postId });
    },

    // 检查帖子精选状态
    async isPostFeatured(postId) {
        return callFunction('posts/is-featured', { postId });
    },

    // 增加浏览量
    async incrementViews(postId) {
        return callFunction('posts/increment-views', { postId });
    }
});

// 导出
window.api = { auth, database, storage, app, callFunction };