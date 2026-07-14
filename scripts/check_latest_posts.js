// 检查最近创建的帖子
const tcb = require('@cloudbase/node-sdk');

const app = tcb.init({
  env: 'cmfootball-d3gp9t11528eabd1f',
  secretId: 'AKIDd7NcdR0KDyiS8pRs66ub7PTIrEPPCnDk',
  secretKey: 'cGvU4eEkZEgvvdHkAPREoBPPBsV5a0FI'
});
const db = app.database();

async function main() {
  console.log('========== 最近创建的帖子 ==========\n');

  // 获取所有帖子
  const result = await db.collection('posts').limit(1000).get();
  const posts = result.data || [];

  // 按创建时间排序
  posts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  console.log('最新的20个帖子:');
  posts.slice(0, 20).forEach((p, i) => {
    const date = new Date(p.created_at).toLocaleString('zh-CN');
    console.log(`  ${i+1}. ${p.title.substring(0, 30)} - ${date}`);
  });

  // 检查今天创建的帖子
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayPosts = posts.filter(p => new Date(p.created_at) >= today);
  console.log(`\n今天创建的帖子: ${todayPosts.length} 个`);

  // 搜索包含"妲己"的帖子
  const dajiPosts = posts.filter(p => p.title && p.title.includes('妲己'));
  console.log(`\n包含"妲己"的帖子: ${dajiPosts.length} 个`);
  dajiPosts.forEach(p => {
    console.log(`  - ${p.title}`);
  });

  // 搜索包含"你好"的帖子
  const nihaoPosts = posts.filter(p => p.title && p.title.includes('你好'));
  console.log(`\n包含"你好"的帖子: ${nihaoPosts.length} 个`);
  nihaoPosts.forEach(p => {
    console.log(`  - ${p.title}`);
  });
}

main().catch(console.error);