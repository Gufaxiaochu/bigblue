/**
 * 前端图片迁移工具
 * 通过 CloudBase 云函数把图片从 Supabase 迁移到 CloudBase
 * 在浏览器控制台执行 migrateAllImages() 即可
 */

// 如果配置了 HTTP 触发器 URL，优先使用 fetch 调用
const MIGRATE_HTTP_URL = '';

async function callMigrateFunction(data) {
    if (MIGRATE_HTTP_URL) {
        const res = await fetch(MIGRATE_HTTP_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return await res.json();
    } else {
        return await cloudbase.callFunction({ name: 'migrate-images', data: data });
    }
}

async function migrateAllImages() {
    console.log('===== 开始迁移图片 =====');
    let migrated = 0, failed = 0, skipped = 0;

    // 调用云函数迁移单张图片
    async function migrateOne(url) {
        try {
            const response = await callMigrateFunction({ action: 'migrateOne', url: url });
            return (response.result || response).result;
        } catch (err) {
            console.error('云函数调用失败:', url, err);
            return { oldUrl: url, newUrl: url, error: err.message || '云函数调用失败' };
        }
    }

    // 1. 迁移帖子图片
    console.log('查询帖子...');
    const { data: posts } = await supabaseClient.from('posts').select('id, image_urls').not('image_urls', 'is', null);
    const postsWithImages = (posts || []).filter(p => p.image_urls && p.image_urls.length > 0);
    console.log('有图片的帖子: ' + postsWithImages.length);

    for (const post of postsWithImages) {
        const newUrls = [];
        for (const oldUrl of post.image_urls) {
            const result = await migrateOne(oldUrl);
            newUrls.push(result.newUrl);
            if (result.skipped) skipped++;
            else if (result.error) { failed++; console.error('迁移失败:', oldUrl, result.error); }
            else { migrated++; console.log('✓ 帖子图片 ' + post.id); }
        }
        await supabaseClient.from('posts').update({ image_urls: newUrls }).eq('id', post.id);
    }

    // 2. 迁移评论图片
    console.log('查询评论...');
    const { data: comments } = await supabaseClient.from('comments').select('id, image_urls').not('image_urls', 'is', null);
    const commentsWithImages = (comments || []).filter(c => c.image_urls && c.image_urls.length > 0);
    console.log('有图片的评论: ' + commentsWithImages.length);

    for (const comment of commentsWithImages) {
        const newUrls = [];
        for (const oldUrl of comment.image_urls) {
            const result = await migrateOne(oldUrl);
            newUrls.push(result.newUrl);
            if (result.skipped) skipped++;
            else if (result.error) { failed++; console.error('评论图片迁移失败:', oldUrl, result.error); }
            else { migrated++; console.log('✓ 评论图片 ' + comment.id); }
        }
        await supabaseClient.from('comments').update({ image_urls: newUrls }).eq('id', comment.id);
    }

    // 3. 迁移头像
    console.log('查询头像...');
    const { data: profiles } = await supabaseClient.from('profiles').select('id, avatar_url').not('avatar_url', 'is', null);
    const profilesWithAvatar = (profiles || []).filter(p => p.avatar_url && p.avatar_url.includes('supabase'));
    console.log('有Supabase头像的用户: ' + profilesWithAvatar.length);

    for (const profile of profilesWithAvatar) {
        const cleanUrl = profile.avatar_url.split('?')[0];
        const result = await migrateOne(cleanUrl);
        if (result.skipped) skipped++;
        else if (result.error) { failed++; console.error('头像迁移失败:', profile.id, result.error); }
        else {
            migrated++;
            await supabaseClient.from('profiles').update({ avatar_url: result.newUrl + '?t=' + Date.now() }).eq('id', profile.id);
            console.log('✓ 头像 ' + profile.id);
        }
    }

    console.log('===== 迁移完成 =====');
    console.log('成功: ' + migrated + ' | 失败: ' + failed + ' | 跳过: ' + skipped);
    return { migrated, failed, skipped };
}
