/**
 * 图片迁移云函数
 * 接收前端传来的图片 URL，从 Supabase 下载后上传到 CloudBase COS
 */

const https = require('https');
const COS = require('cos-nodejs-sdk-v5');

const SUPABASE_URL = 'https://vmdwztwwdfmqheqfcdbn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZtZHd6dHd3ZGZtcWhlcWZjZGJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzMDM5MDksImV4cCI6MjA5Nzg3OTkwOX0.e3xYd3dLgUdthr6kAHvUKqQOeNiLClk1-sIPmraNkf8';

// 腾讯云 COS 配置（CloudBase 存储底层就是 COS）
const BUCKET = 'cmfootball-d3gp9t11528eabd1f-1259156410';
const REGION = 'ap-shanghai';

// 初始化 COS 客户端
// 优先使用环境变量中的永久密钥（需在 CloudBase 控制台配置）
// 如果没有配置，则尝试使用 SCF 运行角色临时密钥
const cosSecretId = process.env.COS_SECRET_ID || process.env.TENCENTCLOUD_SECRETID;
const cosSecretKey = process.env.COS_SECRET_KEY || process.env.TENCENTCLOUD_SECRETKEY;
const cosSessionToken = process.env.COS_SECRET_KEY ? undefined : process.env.TENCENTCLOUD_SESSIONTOKEN;

const cos = new COS({
    getAuthorization: function (options, callback) {
        const auth = {
            TmpSecretId: cosSecretId,
            TmpSecretKey: cosSecretKey,
            ExpiredTime: Math.floor(Date.now() / 1000) + 3600
        };
        if (cosSessionToken) auth.SecurityToken = cosSessionToken;
        callback(auth);
    }
});

// 下载图片
function downloadImage(url) {
    return new Promise((resolve, reject) => {
        const cleanUrl = url.split('?')[0];
        https.get(cleanUrl, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                return downloadImage(res.headers.location).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) {
                return reject(new Error('HTTP ' + res.statusCode));
            }
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', reject);
        }).on('error', reject);
    });
}

// 上传到 COS
function uploadToCOS(filePath, buffer) {
    return new Promise((resolve, reject) => {
        cos.putObject({
            Bucket: BUCKET,
            Region: REGION,
            Key: filePath,
            Body: buffer,
            ContentType: 'application/octet-stream'
        }, (err, data) => {
            if (err) {
                console.error('COS putObject 错误:', JSON.stringify(err, null, 2));
                reject(new Error(err.message || JSON.stringify(err)));
            } else {
                const url = `https://${BUCKET}.cos.${REGION}.myqcloud.com/${encodeURI(filePath)}`;
                resolve({ url, location: data.Location });
            }
        });
    });
}

// 从 URL 提取 COS 路径
function getCloudPath(oldUrl) {
    const match = oldUrl.match(/\/storage\/v1\/object\/public\/posts\/(.+)/);
    return match ? match[1].split('?')[0] : 'migrated/' + Date.now() + '_' + Math.random().toString(36).slice(2) + '.jpg';
}

// 迁移单张图片
async function migrateImage(oldUrl) {
    if (!oldUrl || !oldUrl.includes('supabase')) {
        return { oldUrl, newUrl: oldUrl, skipped: true };
    }
    try {
        const filePath = getCloudPath(oldUrl);
        const buffer = await downloadImage(oldUrl);
        const result = await uploadToCOS(filePath, buffer);
        return { oldUrl, newUrl: result.url };
    } catch (err) {
        return { oldUrl, newUrl: oldUrl, error: err.message };
    }
}

// 查询 Supabase
async function querySupabase(table, select) {
    return new Promise((resolve, reject) => {
        const url = SUPABASE_URL + '/rest/v1/' + table + '?select=' + select;
        https.get(url, {
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': 'Bearer ' + SUPABASE_ANON_KEY
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(e); }
            });
        }).on('error', reject);
    });
}

// 更新 Supabase
async function updateSupabase(table, id, updateData) {
    return new Promise((resolve, reject) => {
        const url = SUPABASE_URL + '/rest/v1/' + table + '?id=eq.' + id;
        const body = JSON.stringify(updateData);
        const req = https.request(url, {
            method: 'PATCH',
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal',
                'Content-Length': Buffer.byteLength(body)
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode }));
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

// 包装响应，兼容 HTTP 触发器和云调用
function makeResponse(isHttp, data) {
    if (isHttp) {
        return {
            isBase64Encoded: false,
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        };
    }
    return data;
}

exports.main = async (event, context) => {
    // 判断是否是 HTTP 触发器
    const isHttp = !!event.httpMethod || !!event.requestContext;
    const body = isHttp ? JSON.parse(event.body || '{}') : event;

    // 打印环境变量状态（不泄露完整密钥）
    const hasCosSecret = !!(process.env.COS_SECRET_ID && process.env.COS_SECRET_KEY);
    const hasScfSecret = !!(process.env.TENCENTCLOUD_SECRETID && process.env.TENCENTCLOUD_SECRETKEY);
    console.log('COS_SECRET_ID 是否配置:', hasCosSecret, process.env.COS_SECRET_ID ? process.env.COS_SECRET_ID.slice(0, 6) + '...' : '无');
    console.log('TENCENTCLOUD_SECRETID 是否配置:', hasScfSecret, process.env.TENCENTCLOUD_SECRETID ? process.env.TENCENTCLOUD_SECRETID.slice(0, 6) + '...' : '无');

    const action = body.action || 'migrateOne';

    // 单张图片迁移：前端调用
    if (action === 'migrateOne' && body.url) {
        const result = await migrateImage(body.url);
        return makeResponse(isHttp, { action: 'migrateOne', result });
    }

    // 批量迁移
    const stats = { migrated: 0, failed: 0, skipped: 0, errors: [] };

    try {
        // 帖子图片
        const posts = await querySupabase('posts', 'id,image_urls');
        const postsWithImages = posts.filter(p => p.image_urls && p.image_urls.length > 0);
        for (const post of postsWithImages) {
            const newUrls = [];
            for (const oldUrl of post.image_urls) {
                const result = await migrateImage(oldUrl);
                newUrls.push(result.newUrl);
                if (result.skipped) stats.skipped++;
                else if (result.error) {
                    stats.failed++;
                    if (stats.errors.length < 5) stats.errors.push(result.error);
                } else stats.migrated++;
            }
            await updateSupabase('posts', post.id, { image_urls: newUrls });
        }

        // 评论图片
        const comments = await querySupabase('comments', 'id,image_urls');
        const commentsWithImages = comments.filter(c => c.image_urls && c.image_urls.length > 0);
        for (const comment of commentsWithImages) {
            const newUrls = [];
            for (const oldUrl of comment.image_urls) {
                const result = await migrateImage(oldUrl);
                newUrls.push(result.newUrl);
                if (result.skipped) stats.skipped++;
                else if (result.error) {
                    stats.failed++;
                    if (stats.errors.length < 5) stats.errors.push(result.error);
                } else stats.migrated++;
            }
            await updateSupabase('comments', comment.id, { image_urls: newUrls });
        }

        // 头像
        const profiles = await querySupabase('profiles', 'id,avatar_url');
        const profilesWithAvatar = profiles.filter(p => p.avatar_url && p.avatar_url.includes('supabase'));
        for (const profile of profilesWithAvatar) {
            const cleanAvatar = profile.avatar_url.split('?')[0];
            const result = await migrateImage(cleanAvatar);
            if (result.skipped) stats.skipped++;
            else if (result.error) {
                stats.failed++;
                if (stats.errors.length < 5) stats.errors.push(result.error);
            } else {
                stats.migrated++;
                await updateSupabase('profiles', profile.id, { avatar_url: result.newUrl + '?t=' + Date.now() });
            }
        }

        return makeResponse(isHttp, { action: 'migrateAll', stats });
    } catch (err) {
        return makeResponse(isHttp, { action: 'migrateAll', error: err.message, stats });
    }
};
