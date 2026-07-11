/**
 * 测试单张图片迁移
 * 通过云函数测试单张图片迁移
 */
async function testMigrate() {
    try {
        // 1. 查询一张有图片的帖子
        console.log('1. 查询帖子...');
        const { data: posts, error: qErr } = await supabaseClient.from('posts')
            .select('id, image_urls')
            .not('image_urls', 'is', null)
            .limit(1);
        if (qErr) { console.error('查询失败:', qErr); return; }
        if (!posts || posts.length === 0) { console.log('没有有图片的帖子'); return; }
        
        const post = posts[0];
        const oldUrl = post.image_urls[0];
        console.log('2. 帖子ID:', post.id);
        console.log('3. 图片URL:', oldUrl);
        
        // 2. 调用云函数迁移单张图片
        console.log('4. 调用云函数迁移...');
        let result;
        if (typeof MIGRATE_HTTP_URL !== 'undefined' && MIGRATE_HTTP_URL) {
            const res = await fetch(MIGRATE_HTTP_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'migrateOne', url: oldUrl })
            });
            result = await res.json();
        } else {
            result = await cloudbase.callFunction({
                name: 'migrate-images',
                data: { action: 'migrateOne', url: oldUrl }
            });
        }
        console.log('5. 云函数返回:', result);
        const migratedResult = (result.result || result).result;
        console.log('6. 迁移结果:', migratedResult);

        if (migratedResult.error) {
            console.error('✗ 迁移失败:', migratedResult.error);
        } else {
            console.log('✓ 测试成功！新URL:', migratedResult.newUrl);
        }
    } catch (err) {
        console.error('测试出错:');
        console.error('  name:', err.name);
        console.error('  message:', err.message);
        console.error('  完整对象:', JSON.stringify(err, null, 2));
        console.error('  原始对象:', err);
    }
}
