/**
 * CloudBase API 封装层
 * 用于渐进式替代 Supabase 的认证和存储功能
 * 
 * 使用方式：
 *   1. 在 index.html 中引入 CloudBase JS SDK 和此文件
 *   2. 配置 CLOUDBASE_CONFIG
 *   3. 用 CloudBaseAPI 替代 supabaseClient 的 auth 和 storage 调用
 */

// ========== 配置 ==========
const CLOUDBASE_CONFIG = {
    env: 'cmfootball-d3gp9t11528eabd1f', // CloudBase 环境 ID
};

// 初始化 CloudBase
let cbApp = null;
let cbAuth = null;

function initCloudBase() {
    if (cbApp) return;
    cbApp = cloudbase.init({
        env: CLOUDBASE_CONFIG.env,
        region: 'ap-shanghai'
    });
    cbAuth = cbApp.auth({ persistence: 'local' });
    // 暴露到全局，供 migrate-images.js 使用
    window.cbApp = cbApp;
    window.cbAuth = cbAuth;
    
    // 自动匿名登录（CloudBase 存储需要先登录）
    cbAuth.signInAnonymously().then(() => {
        console.log('CloudBase 匿名登录成功');
    }).catch((err) => {
        console.warn('CloudBase 匿名登录失败:', err);
    });
}

// ========== 认证 API ==========

const CloudBaseAPI = {
    
    // --- 认证 ---
    
    /**
     * 登录
     * 替代: supabaseClient.auth.signInWithPassword({ email, password })
     */
    async signInWithPassword({ email, password }) {
        // email 实际上是 phone@bigblue.com，提取手机号
        const phone = email.replace('@bigblue.com', '');
        
        const result = await cbApp.callFunction({
            name: 'auth',
            data: { action: 'login', phone, password }
        });
        
        if (result.result.error) {
            return { data: null, error: { message: result.result.error } };
        }
        
        // 保存 token
        localStorage.setItem('cb_token', result.result.token);
        localStorage.setItem('cb_user', JSON.stringify(result.result.user));
        
        return { data: { user: result.result.user }, error: null };
    },

    /**
     * 注册
     * 替代: supabaseClient.auth.signUp({ email, password, options: { data: { phone, nickname } } })
     */
    async signUp({ email, password, options }) {
        const phone = email.replace('@bigblue.com', '');
        const nickname = options?.data?.nickname || phone;
        
        const result = await cbApp.callFunction({
            name: 'auth',
            data: { action: 'register', phone, password, nickname }
        });
        
        if (result.result.error) {
            return { data: null, error: { message: result.result.error } };
        }
        
        // 保存 token
        localStorage.setItem('cb_token', result.result.token);
        localStorage.setItem('cb_user', JSON.stringify(result.result.user));
        
        return { data: { user: result.result.user }, error: null };
    },

    /**
     * 退出登录
     * 替代: supabaseClient.auth.signOut()
     */
    async signOut() {
        const token = localStorage.getItem('cb_token');
        if (token) {
            await cbApp.callFunction({
                name: 'auth',
                data: { action: 'logout', token }
            });
        }
        localStorage.removeItem('cb_token');
        localStorage.removeItem('cb_user');
        return { error: null };
    },

    /**
     * 获取当前用户
     * 替代: supabaseClient.auth.getUser()
     */
    async getUser() {
        const token = localStorage.getItem('cb_token');
        if (!token) return { data: { user: null } };
        
        const result = await cbApp.callFunction({
            name: 'auth',
            data: { action: 'getUser', token }
        });
        
        if (result.result.error || !result.result.user) {
            localStorage.removeItem('cb_token');
            localStorage.removeItem('cb_user');
            return { data: { user: null } };
        }
        
        // 更新缓存的用户信息
        localStorage.setItem('cb_user', JSON.stringify(result.result.user));
        
        return { data: { user: result.result.user } };
    },

    /**
     * 更新密码
     * 替代: supabaseClient.auth.updateUser({ password })
     */
    async updateUser({ password }) {
        const token = localStorage.getItem('cb_token');
        
        const result = await cbApp.callFunction({
            name: 'auth',
            data: { action: 'updatePassword', token, newPassword: password }
        });
        
        if (result.result.error) {
            return { error: { message: result.result.error } };
        }
        
        return { error: null };
    },

    // --- 存储 ---

    /**
     * 上传文件
     * 替代: supabaseClient.storage.from('posts').upload(filePath, file)
     *       + supabaseClient.storage.from('posts').getPublicUrl(filePath)
     */
    async uploadFile(filePath, file) {
        // 方式1：前端直传（推荐，速度快）
        const result = await cbApp.uploadFile({
            cloudPath: filePath,
            filePath: file // File 对象
        });
        
        if (result.fileID) {
            // 获取访问 URL
            const urlResult = await cbApp.getTempFileURL({
                fileList: [result.fileID]
            });
            const url = urlResult.fileList[0]?.tempFileURL || '';
            
            return {
                data: { path: result.fileID, url: url },
                error: null
            };
        }
        
        return { data: null, error: { message: '上传失败' } };
    },

    /**
     * 获取文件公开 URL
     * 替代: supabaseClient.storage.from('posts').getPublicUrl(filePath)
     */
    async getPublicUrl(fileID) {
        const urlResult = await cbApp.getTempFileURL({
            fileList: [fileID]
        });
        return {
            data: { publicUrl: urlResult.fileList[0]?.tempFileURL || '' }
        };
    },

    // --- 辅助 ---
    
    /**
     * 获取当前 token（供数据库 API 调用时使用）
     */
    getToken() {
        return localStorage.getItem('cb_token');
    },

    /**
     * 检查是否已登录
     */
    isLoggedIn() {
        return !!localStorage.getItem('cb_token');
    }
};

// 自动初始化
initCloudBase();
