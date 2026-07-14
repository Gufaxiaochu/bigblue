// 清理 Storage 中没有关联帖子的孤立图片
// 运行方式：node scripts/clean_orphan_images.js

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '../.env' });

// 替换成你的 Supabase 配置
const SUPABASE_URL = process.env.SUPABASE_URL || '你的项目URL';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '你的服务密钥（service_role）';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function cleanOrphanImages() {
    console.log('开始查找孤立图片...');

    // 1. 获取所有帖子中的图片文件名
    const { data: posts, error: postsError } = await supabase
        .from('posts')
        .select('image_urls, thumbnail_urls');

    if (postsError) {
        console.error('查询帖子失败:', postsError);
        return;
    }

    const usedImages = new Set();
    posts.forEach(post => {
        (post.image_urls || []).forEach(url => {
            const filename = url.split('/').pop();
            usedImages.add(filename);
        });
        (post.thumbnail_urls || []).forEach(url => {
            const filename = url.split('/').pop();
            usedImages.add(filename);
        });
    });

    console.log(`帖子中使用的图片数量: ${usedImages.size}`);

    // 2. 获取 Storage 中所有图片
    const { data: objects, error: listError } = await supabase
        .storage
        .from('posts')
        .list('', {
            limit: 10000,
            sortBy: { column: 'name', order: 'asc' }
        });

    if (listError) {
        console.error('列出 Storage 文件失败:', listError);
        return;
    }

    // 3. 找出孤立图片
    const orphanFiles = objects
        .filter(obj => obj.metadata)
        .filter(obj => {
            // 检查每个文件夹下的文件
            return true; // 先返回所有，下面会进一步过滤
        });

    console.log(`Storage 中文件总数: ${objects.length}`);

    // 4. 获取完整路径并检查是否孤立
    const { data: allObjects, error: allError } = await supabase
        .rpc('get_all_storage_objects', { bucket_name: 'posts' })
        .catch(() => {
            // 如果没有这个函数，用另一种方式
            return { data: null };
        });

    // 5. 直接查询孤立图片（用 SQL 函数）
    const { data: orphanRecords, error: orphanError } = await supabase
        .rpc('get_orphan_images');

    if (orphanError) {
        console.log('没有 get_orphan_images 函数，改用手动方式...');
        
        // 手动查找：遍历文件夹
        const folders = objects.filter(o => !o.metadata);
        let orphanCount = 0;
        let deletedCount = 0;

        for (const folder of folders) {
            const { data: files, error: filesError } = await supabase
                .storage
                .from('posts')
                .list(folder.name, { limit: 1000 });

            if (filesError || !files) continue;

            for (const file of files) {
                if (!file.metadata) continue;

                const fullPath = `${folder.name}/${file.name}`;
                const isUsed = usedImages.has(file.name) || 
                              [...usedImages].some(used => fullPath.includes(used));

                if (!isUsed) {
                    orphanCount++;
                    console.log(`发现孤立图片: ${fullPath}`);

                    // 删除文件
                    const { error: deleteError } = await supabase
                        .storage
                        .from('posts')
                        .remove([fullPath]);

                    if (deleteError) {
                        console.error(`删除失败: ${fullPath}`, deleteError);
                    } else {
                        deletedCount++;
                        console.log(`已删除: ${fullPath}`);
                    }
                }
            }
        }

        console.log(`\n清理完成！`);
        console.log(`发现孤立图片: ${orphanCount} 个`);
        console.log(`成功删除: ${deletedCount} 个`);

    } else {
        console.log(`找到孤立图片: ${orphanRecords?.length || 0} 个`);
        
        // 批量删除
        if (orphanRecords && orphanRecords.length > 0) {
            const pathsToDelete = orphanRecords.map(r => r.name);
            const batchSize = 100;

            for (let i = 0; i < pathsToDelete.length; i += batchSize) {
                const batch = pathsToDelete.slice(i, i + batchSize);
                const { error: deleteError } = await supabase
                    .storage
                    .from('posts')
                    .remove(batch);

                if (deleteError) {
                    console.error(`批量删除失败:`, deleteError);
                } else {
                    console.log(`已删除 ${Math.min(i + batchSize, pathsToDelete.length)}/${pathsToDelete.length} 个文件`);
                }
            }

            console.log('清理完成！');
        }
    }
}

cleanOrphanImages().catch(console.error);