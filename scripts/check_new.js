// 检查最新帖子
const tcb = require('@cloudbase/node-sdk');

const app = tcb.init({
  env: 'cmfootball-d3gp9t11528eabd1f',
  secretId: 'AKIDd7NcdR0KDyiS8pRs66ub7PTIrEPPCnDk',
  secretKey: 'cGvU4eEkZEgvvdHkAPREoBPPBsV5a0FI'
});
const db = app.database();

async function main() {
  const result = await db.collection('posts').limit(1100).get();
  const posts = result.data || [];
  
  // 按时间排序
  posts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  
  console.log('最新20个帖子:');
  posts.slice(0, 20).forEach((p, i) => {
    const date = new Date(p.created_at).toLocaleString('zh-CN');
    console.log(`  ${i+1}. ${p.title.substring(0, 35)} - ${date}`);
  });
}

main().catch(console.error);