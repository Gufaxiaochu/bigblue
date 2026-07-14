// 检查所有帖子，找出今天的
const tcb = require('@cloudbase/node-sdk');

const app = tcb.init({
  env: 'cmfootball-d3gp9t11528eabd1f',
  secretId: 'AKIDd7NcdR0KDyiS8pRs66ub7PTIrEPPCnDk',
  secretKey: 'cGvU4eEkZEgvvdHkAPREoBPPBsV5a0FI'
});
const db = app.database();

async function checkAllPosts() {
  console.log('========== 检查所有帖子 ==========\n');

  // 获取所有帖子（最多1000）
  const result = await db.collection('posts').limit(1000).get();
  const posts = result.data || [];

  console.log(`总帖子数: ${posts.length}\n`);

  // 按日期排序
  posts.sort((a, b) => {
    const dateA = new Date(a.created_at).getTime();
    const dateB = new Date(b.created_at).getTime();
    return dateB - dateA;
  });

  // 显示最新20个
  console.log('最新20个帖子:');
  posts.slice(0, 20).forEach((p, i) => {
    const date = new Date(p.created_at).toLocaleString('zh-CN');
    console.log(`  ${i+1}. [${p.id.substring(0, 8)}] ${p.title.substring(0, 30)} - ${date}`);
  });

  // 检查7月14日的帖子
  const july14Posts = posts.filter(p => {
    const date = new Date(p.created_at);
    return date.getMonth() === 6 && date.getDate() === 14; // 月份从0开始
  });

  console.log(`\n7月14日的帖子数: ${july14Posts.length}`);
  if (july14Posts.length > 0) {
    console.log('7月14日的帖子:');
    july14Posts.forEach((p, i) => {
      const date = new Date(p.created_at).toLocaleString('zh-CN');
      console.log(`  ${i+1}. ${p.title} - ${date}`);
    });
  }

  // 检查7月13日的帖子
  const july13Posts = posts.filter(p => {
    const date = new Date(p.created_at);
    return date.getMonth() === 6 && date.getDate() === 13;
  });

  console.log(`\n7月13日的帖子数: ${july13Posts.length}`);
}

checkAllPosts().catch(console.error);