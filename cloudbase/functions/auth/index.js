/**
 * 认证云函数
 * 支持 5 个操作：login / register / logout / updatePassword / getUser
 * 
 * 调用方式：
 *   cloudbase.callFunction({ name: 'auth', data: { action: 'login', phone, password } })
 */

const cloudbase = require('@cloudbase/node-sdk');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

const TURNSILE_SECRET_KEY = '0x4AAAAAADzd4ceE1MaOLsShkmINzikuz3U';

// 初始化 CloudBase
const app = cloudbase.init({
    env: process.env.CLOUDBASE_ENV_ID || 'cmfootball-d3gp9t11528eabd1f'
});

// 获取数据库连接
const db = app.database();

// 会话有效期 30 天
const SESSION_EXPIRE_DAYS = 30;

// 生成随机 token
function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

// 生成会话并返回
async function createSession(userId) {
    const token = generateToken();
    const sessionId = uuidv4();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + SESSION_EXPIRE_DAYS);

    await db.collection('user_sessions').add({
        id: sessionId,
        user_id: userId,
        token: token,
        expires_at: expiresAt,
        created_at: new Date()
    });

    return { token, expiresAt };
}

// 通过 token 验证用户
async function getUserByToken(token) {
    if (!token) return null;
    const result = await db.collection('user_sessions')
        .where({ token: token })
        .get();
    if (!result.data || result.data.length === 0) return null;
    const session = result.data[0];
    if (new Date(session.expires_at) < new Date()) return null; // 已过期
    return session.user_id;
}

// ========== 主函数 ==========
exports.main = async (event, context) => {
    const { action } = event;
    
    try {
        switch (action) {
            case 'login': return await handleLogin(event);
            case 'register': return await handleRegister(event);
            case 'logout': return await handleLogout(event);
            case 'updatePassword': return await handleUpdatePassword(event);
            case 'getUser': return await handleGetUser(event);
            case 'verifyTurnstile': return await handleVerifyTurnstile(event);
            default: return { error: '未知操作: ' + action };
        }
    } catch (err) {
        console.error('Auth error:', err);
        return { error: err.message || '服务器错误' };
    }
};

// ========== 登录 ==========
async function handleLogin(event) {
    const { phone, password } = event;
    if (!phone || !password) return { error: '请填写手机号和密码' };

    // 查询用户
    const userResult = await db.collection('users')
        .where({ phone: phone })
        .get();
    
    if (!userResult.data || userResult.data.length === 0) {
        return { error: '手机号或密码错误' };
    }
    
    const user = userResult.data[0];
    
    // 验证密码
    const valid = bcrypt.compareSync(password, user.password_hash);
    if (!valid) return { error: '手机号或密码错误' };
    
    // 创建会话
    const { token, expiresAt } = await createSession(user.id);
    
    // 查询用户资料
    const profileResult = await db.collection('profiles')
        .where({ id: user.id })
        .get();
    const profile = profileResult.data[0] || {};
    
    return {
        success: true,
        user: {
            id: user.id,
            phone: user.phone,
            email: user.email,
            username: profile.username || user.nickname,
            bio: profile.bio || '',
            avatar_url: profile.avatar_url || null
        },
        token: token,
        expires_at: expiresAt
    };
}

// ========== 注册 ==========
async function handleRegister(event) {
    const { phone, password, nickname } = event;
    if (!phone || !password || !nickname) return { error: '请填写完整信息' };
    if (password.length < 6) return { error: '密码至少需要6位' };
    
    // 检查手机号是否已注册
    const existing = await db.collection('users')
        .where({ phone: phone })
        .get();
    if (existing.data && existing.data.length > 0) {
        return { error: '该手机号已注册' };
    }
    
    // 创建用户
    const userId = uuidv4();
    const email = `${phone}@bigblue.com`;
    const passwordHash = bcrypt.hashSync(password, 10);
    
    await db.collection('users').add({
        id: userId,
        phone: phone,
        email: email,
        password_hash: passwordHash,
        nickname: nickname,
        created_at: new Date(),
        updated_at: new Date()
    });
    
    // 创建用户资料
    await db.collection('profiles').add({
        id: userId,
        username: nickname,
        phone: phone,
        bio: '',
        avatar_url: null,
        created_at: new Date(),
        updated_at: new Date()
    });
    
    // 创建会话
    const { token, expiresAt } = await createSession(userId);
    
    return {
        success: true,
        user: {
            id: userId,
            phone: phone,
            email: email,
            username: nickname,
            bio: '',
            avatar_url: null
        },
        token: token,
        expires_at: expiresAt
    };
}

// ========== 退出登录 ==========
async function handleLogout(event) {
    const { token } = event;
    if (!token) return { success: true };
    
    // 删除会话
    await db.collection('user_sessions')
        .where({ token: token })
        .remove();
    
    return { success: true };
}

// ========== 修改密码 ==========
async function handleUpdatePassword(event) {
    const { token, newPassword } = event;
    if (!newPassword) return { error: '请输入新密码' };
    if (newPassword.length < 6) return { error: '密码至少需要6位' };
    
    // 验证用户
    const userId = await getUserByToken(token);
    if (!userId) return { error: '未登录或会话已过期' };
    
    // 更新密码
    const passwordHash = bcrypt.hashSync(newPassword, 10);
    await db.collection('users')
        .where({ id: userId })
        .update({ password_hash: passwordHash, updated_at: new Date() });
    
    return { success: true };
}

// ========== 获取当前用户 ==========
async function handleGetUser(event) {
    const { token } = event;
    
    const userId = await getUserByToken(token);
    if (!userId) return { user: null };
    
    // 查询用户
    const userResult = await db.collection('users')
        .where({ id: userId })
        .get();
    if (!userResult.data || userResult.data.length === 0) {
        return { user: null };
    }
    const user = userResult.data[0];
    
    // 查询资料
    const profileResult = await db.collection('profiles')
        .where({ id: userId })
        .get();
    const profile = profileResult.data[0] || {};
    
    return {
        user: {
            id: user.id,
            phone: user.phone,
            email: user.email,
            username: profile.username || user.nickname,
            bio: profile.bio || '',
            avatar_url: profile.avatar_url || null
        }
    };
}

async function handleVerifyTurnstile(event) {
    const { token } = event;
    if (!token) return { error: '验证码不能为空' };
    
    try {
        const https = require('https');
        const querystring = require('querystring');
        
        const postData = querystring.stringify({
            secret: TURNSILE_SECRET_KEY,
            response: token
        });
        
        const options = {
            hostname: 'challenges.cloudflare.com',
            path: '/turnstile/v0/siteverify',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData)
            }
        };
        
        return new Promise((resolve, reject) => {
            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    try {
                        const result = JSON.parse(data);
                        if (result.success) {
                            resolve({ success: true });
                        } else {
                            resolve({ error: '验证码验证失败' });
                        }
                    } catch (e) {
                        resolve({ error: '验证响应解析失败' });
                    }
                });
            });
            
            req.on('error', (e) => {
                resolve({ error: '验证码验证网络错误' });
            });
            
            req.write(postData);
            req.end();
        });
    } catch (e) {
        console.error('Turnstile verify error:', e);
        return { error: '验证码验证失败' };
    }
}
