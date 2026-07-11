/**
 * 图片迁移脚本
 * 将 Supabase Storage 中的图片迁移到 CloudBase 云存储
 * 
 * 迁移内容：
 *   1. 帖子图片 (posts.image_urls)
 *   2. 评论图片 (comments.image_urls)  
 *   3. 用户头像 (profiles.avatar_url)
 * 
 * 使用方式：
 *   cd cloudbase/migrate-images
 *   npm install
 *   node migrate.js
 */

const { createClient } = require('@supabase/supabase-js');
const cloudbase = require('@cloudbase/node-sdk');
const https = require('https');
const http = require('http');

// ========== 配置 ==========
const SUPABASE_URL = 'https://vmdwztwwdfmqheqfcdbn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZtZHd6dHd3ZGZtcWhlcWZjZGJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzMDM5MDksImV4cCI6MjA5Nzg3OTkwOX0.e3xYd3dLgUdthr6kAHvUKqQOeNiLClk1-sIPmraNkf8';

const CLOUDBASE_ENV_ID = 'cmfootball-d3gp9t11528eabd1f';

// 初始化
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const cbApp = cloudbase.init({ env: CLOUDBASE_ENV_ID });

// ========== 工具函数 ==========

// 下载图片（返回 Buffer）
function downloadImage(url) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        client.get(url, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                // 跟随重定向
                return downloadImage(res.headers.location).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) {
                return reject(new Error(`下载失败: ${res.statusCode}`));
            }
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', reject);
        }).on('error', reject);
    });
}

// 从 Supabase URL 中提取文件路径
// URL 格式: https://xxx.supabase.co/storage/v1/object/public/posts/userId/filename.jpg
function extractFilePath(url) {
    const match = url.match(/\/storage\/v1\/object\/public\/posts\/(.+)/);
    if (match) return match[1];
    // 如果不是 Supabase URL，返回 null
    if (!url.includes('supabase')) return null;
    // 其他格式，用时间戳生成路径
    return `migrated/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
}

// 上传到 CloudBase
async function uploadToCloudBase(filePath, buffer) {
    try {
        const result = await cbApp.uploadFile({
            cloudPath: filePath,
            fileContent: buffer
        });
        
        if (result.fileID) {
            // 获取访问 URL
            const urlResult = await cbApp.getTempFileURL({
                fileList: [result.fileID]
            });
            const url = urlResult.fileList[0]?.tempFileURL || '';
            return { fileID: result.fileID, url: url };
        }
        return null;
    } catch (err) {
        console.error('上传失败:', err.message);
        return null;
    }
}

// 迁移单张图片
async function migrateImage(oldUrl) {
    if (!oldUrl || !oldUrl.includes('supabase')) {
        // 不是 Supabase 图片，跳过
        return { oldUrl, newUrl: oldUrl, skipped: true };
    }

    try {
        // 去掉 URL 后面的查询参数
        const cleanUrl = oldUrl.split('?')[0];
        const filePath = extractFilePath(cleanUrl) || `migrated/${Date.now()}.jpg`;
        
        // 下载
        console.log(`  下载: ${cleanUrl.substring(0, 60)}...`);
        const buffer = await downloadImage(cleanUrl);
        
        // 上传
        console.log(`  上传到 CloudBase: ${filePath}`);
        const result = await uploadToCloudBase(filePath, buffer);
        
        if (result) {
            console.log(`  ✓ 成功`);
            return { oldUrl, newUrl: result.url, fileID: result.fileID, skipped: false };
        }
        console.log(`  ✗ 上传失败`);
        return { oldUrl, newUrl: oldUrl, skipped: false, error: '上传失败' };
    } catch (err) {
        console.log(`  ✗ 下载失败: ${err.message}`);
        return { oldUrl, newUrl: oldUrl, skipped: false, error: err.message };
    }
}

// ========== 主迁移逻辑 ==========

async function migratePostImages() {
    console.log('\n===== 迁移帖子图片 =====');
    const { data: posts, error } = await supabase.from('posts')
        .select('id, image_urls')
        .not('image_urls', 'is', null);
    
    if (error) { console.error('查询帖子失败:', error.message); return; }
    console.log(`找到 ${posts.length} 个有图片的帖子`);

    for (const post of posts) {
        if (!post.image_urls || post.image_urls.length === 0) continue;
        console.log(`\n帖子 ${post.id}: ${post.image_urls.length} 张图片`);
        
        const newUrls = [];
        for (const oldUrl of post.image_urls) {
            const result = await migrateImage(oldUrl);
            newUrls.push(result.newUrl);
        }
        
        // 更新数据库
        const { error: updateError } = await supabase.from('posts')
            .update({ image_urls: newUrls })
            .eq('id', post.id);
        
        if (updateError) {
            console.log(`  更新数据库失败: ${updateError.message}`);
        } else {
            console.log(`  ✓ 数据库已更新`);
        }
    }
}

async function migrateCommentImages() {
    console.log('\n===== 迁移评论图片 =====');
    const { data: comments, error } = await supabase.from('comments')
        .select('id, image_urls')
        .not('image_urls', 'is', null);
    
    if (error) { console.error('查询评论失败:', error.message); return; }
    console.log(`找到 ${comments.length} 条有图片的评论`);

    for (const comment of comments) {
        if (!comment.image_urls || comment.image_urls.length === 0) continue;
        console.log(`\n评论 ${comment.id}: ${comment.image_urls.length} 张图片`);
        
        const newUrls = [];
        for (const oldUrl of comment.image_urls) {
            const result = await migrateImage(oldUrl);
            newUrls.push(result.newUrl);
        }
        
        const { error: updateError } = await supabase.from('comments')
            .update({ image_urls: newUrls })
            .eq('id', comment.id);
        
        if (updateError) {
            console.log(`  更新数据库失败: ${updateError.message}`);
        } else {
            console.log(`  ✓ 数据库已更新`);
        }
    }
}

async function migrateAvatars() {
    console.log('\n===== 迁移用户头像 =====');
    const { data: profiles, error } = await supabase.from('profiles')
        .select('id, avatar_url')
        .not('avatar_url', 'is', null);
    
    if (error) { console.error('查询头像失败:', error.message); return; }
    console.log(`找到 ${profiles.length} 个有头像的用户`);

    for (const profile of profiles) {
        if (!profile.avatar_url) continue;
        console.log(`\n用户 ${profile.id}:`);
        
        // 去掉 URL 后面的 ?t=xxx 参数
        const cleanAvatar = profile.avatar_url.split('?')[0];
        const result = await migrateImage(cleanAvatar);
        
        if (result.newUrl !== profile.avatar_url) {
            const newAvatarUrl = result.newUrl + '?t=' + Date.now();
            const { error: updateError } = await supabase.from('profiles')
                .update({ avatar_url: newAvatarUrl })
                .eq('id', profile.id);
            
            if (updateError) {
                console.log(`  更新数据库失败: ${updateError.message}`);
            } else {
                console.log(`  ✓ 数据库已更新`);
            }
        }
    }
}

// ========== 主函数 ==========

async function main() {
    console.log('====================================');
    console.log('  Supabase → CloudBase 图片迁移工具');
    console.log('====================================');
    console.log(`Supabase URL: ${SUPABASE_URL}`);
    console.log(`CloudBase Env: ${CLOUDBASE_ENV_ID}`);
    console.log('====================================');

    try {
        // 1. 迁移帖子图片
        await migratePostImages();
        
        // 2. 迁移评论图片
        await migrateCommentImages();
        
        // 3. 迁移用户头像
        await migrateAvatars();
        
        console.log('\n====================================');
        console.log('  迁移完成！');
        console.log('====================================');
    } catch (err) {
        console.error('\n迁移出错:', err);
    }
}

main();
