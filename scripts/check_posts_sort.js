// 检查帖子日期和排序
const tcb = require('@cloudbase/node-sdk');

const app = tcb.init({
  env: 'cmfootball-d3gp9t11528eabd1f',
  secretId: 'AKIDd7NcdR0KDyiS8pRs66ub7PTIrEPPCnDk',
  secretKey: 'cGvU4eEkZEgvvdHkAPREoBPPBsV5a0FI'
});
const db = app.database();

async function checkPosts() {
  console.log('========== 检查帖子日期和排序 ==========\n');

  // 获取所有帖子
  const result = await db.collection('posts').limit(100).get();
  const posts = result.data || [];

  console.log(`总帖子数: ${posts.length}\n`);

  // 检查日期格式
  const now = new Date();
  const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);

  let futurePosts = 0;
  let todayPosts = 0;
  let oldPosts = 0;

  posts.forEach(p => {
    const date = new Date(p.created_at);
    if (date > now) {
      futurePosts++;
    } else if (date > oneDayAgo) {
      todayPosts++;
    } else {
      oldPosts++;
    }
  });

  console.log(`未来日期的帖子: ${futurePosts}`);
  console.log(`24小时内的帖子: ${todayPosts}`);
  console.log(`旧帖子: ${oldPosts}\n`);

  // 显示最新10个帖子（按客户端排序）
  const sortedPosts = [...posts].sort((a, b) => {
    const dateA = new Date(a.created_at).getTime();
    const dateB = new Date(b.created_at).getTime();
    return dateB - dateA;
  });

  console.log('最新10个帖子（客户端排序）:');
  sortedPosts.slice(0, 10).forEach((p, i) => {
    const date = new Date(p.created_at).toLocaleString('zh-CN');
    console.log(`  ${i+1}. ${p.title.substring(0, 20)} - ${date}`);
  });

  // 检查隐藏帖子
  console.log('\n检查隐藏帖子...');
  const hidden = await db.collection('hidden_posts').get();
  console.log(`隐藏帖子数: ${hidden.data?.length || 0}`);
  
  if (hidden.data && hidden.data.length > 0) {
    console.log('隐藏的帖子ID:', hidden.data.map(h => h.post_id).join(', '));
  }
}

checkPosts().catch(console.error);