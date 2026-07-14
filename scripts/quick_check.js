// 持续检查新帖子
const tcb = require('@cloudbase/node-sdk');

const app = tcb.init({
  env: 'cmfootball-d3gp9t11528eabd1f',
  secretId: 'AKIDd7NcdR0KDyiS8pRs66ub7PTIrEPPCnDk',
  secretKey: 'cGvU4eEkZEgvvdHkAPREoBPPBsV5a0FI'
});
const db = app.database();

async function check() {
  console.log('检查最新帖子...\n');
  
  const result = await db.collection('posts').limit(100).get();
  const posts = result.data || [];
  
  // 按时间排序
  posts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  
  console.log('最新5个帖子:');
  posts.slice(0, 5).forEach((p, i) => {
    const date = new Date(p.created_at).toLocaleString('zh-CN');
    console.log(`  ${i+1}. ${p.title} - ${date}`);
  });
  
  // 检查包含"妲己"的帖子
  const daji = posts.filter(p => p.title && p.title.includes('妲己'));
  if (daji.length > 0) {
    console.log('\n✓ 找到包含"妲己"的帖子:');
    daji.forEach(p => console.log(`  - ${p.title}`));
  }
  
  // 检查包含"你好"的帖子
  const nihao = posts.filter(p => p.title && p.title.includes('你好'));
  if (nihao.length > 0) {
    console.log('\n✓ 找到包含"你好"的帖子:');
    nihao.forEach(p => console.log(`  - ${p.title}`));
  }
}

check().catch(console.error);