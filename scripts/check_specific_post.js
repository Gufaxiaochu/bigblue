// 检查特定帖子
const tcb = require('@cloudbase/node-sdk');

const app = tcb.init({
  env: 'cmfootball-d3gp9t11528eabd1f',
  secretId: 'AKIDd7NcdR0KDyiS8pRs66ub7PTIrEPPCnDk',
  secretKey: 'cGvU4eEkZEgvvdHkAPREoBPPBsV5a0FI'
});
const db = app.database();

async function checkPost() {
  console.log('========== 检查帖子 "21 v12v1v2" ==========\n');

  // 获取所有帖子，然后过滤
  const allPosts = await db.collection('posts').limit(1000).get();
  
  const targetPosts = (allPosts.data || []).filter(p => p.title && p.title.includes('21 v12v1v2'));

  if (targetPosts.length === 0) {
    console.log('未找到帖子 "21 v12v1v2"');
    
    // 搜索包含 "21" 的帖子
    const posts21 = (allPosts.data || []).filter(p => p.title && p.title.includes('21'));
    
    console.log('\n包含 "21" 的帖子:');
    posts21.slice(0, 10).forEach(p => {
      console.log(`  - ${p.title}`);
    });
    
    // 显示最新的帖子
    console.log('\n\n最新的10个帖子:');
    const sorted = (allPosts.data || []).sort((a, b) => {
      return new Date(b.created_at) - new Date(a.created_at);
    });
    sorted.slice(0, 10).forEach((p, i) => {
      const date = new Date(p.created_at).toLocaleString('zh-CN');
      console.log(`  ${i+1}. ${p.title.substring(0, 25)} - ${date}`);
    });
    return;
  }

  for (const post of posts.data) {
    console.log(`帖子: ${post.title}`);
    console.log(`  ID: ${post.id}`);
    console.log(`  用户: ${post.user_id}`);
    console.log(`  创建时间: ${new Date(post.created_at).toLocaleString('zh-CN')}`);
    console.log(`  图片: ${post.image_urls?.length || 0} 张`);
    console.log(`  点赞: ${post.likes_count || 0}`);
    console.log(`  评论: ${post.comments_count || 0}`);
    
    // 检查是否被隐藏
    const hidden = await db.collection('hidden_posts')
      .where({ post_id: post.id })
      .get();
    
    if (hidden.data && hidden.data.length > 0) {
      console.log(`  ⚠️ 已被隐藏！`);
    } else {
      console.log(`  ✓ 未被隐藏`);
    }
  }

  // 检查最新的帖子排序
  console.log('\n========== 最新帖子排序检查 ==========\n');
  
  const allPosts = await db.collection('posts').limit(1000).get();
  const normalPosts = (allPosts.data || []).filter(p => {
    const year = new Date(p.created_at).getFullYear();
    return year <= 2030;
  });
  
  normalPosts.sort((a, b) => {
    const dateA = new Date(a.created_at).getTime();
    const dateB = new Date(b.created_at).getTime();
    return dateB - dateA;
  });

  console.log('最新5个普通帖子:');
  normalPosts.slice(0, 5).forEach((p, i) => {
    const date = new Date(p.created_at).toLocaleString('zh-CN');
    console.log(`  ${i+1}. ${p.title.substring(0, 25)} - ${date}`);
  });
}

checkPost().catch(console.error);