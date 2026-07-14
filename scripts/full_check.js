// 完整检查
const tcb = require('@cloudbase/node-sdk');

const app = tcb.init({
  env: 'cmfootball-d3gp9t11528eabd1f',
  secretId: 'AKIDd7NcdR0KDyiS8pRs66ub7PTIrEPPCnDk',
  secretKey: 'cGvU4eEkZEgvvdHkAPREoBPPBsV5a0FI'
});
const db = app.database();

async function main() {
  console.log('========== 完整检查 ==========\n');
  
  // 获取所有帖子
  const result = await db.collection('posts').limit(1000).get();
  console.log(`查询到 ${result.data?.length || 0} 个帖子\n`);
  
  const posts = result.data || [];
  
  // 按时间排序
  posts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  
  console.log('最新10个帖子:');
  posts.slice(0, 10).forEach((p, i) => {
    const date = new Date(p.created_at).toLocaleString('zh-CN');
    console.log(`  ${i+1}. ${p.title.substring(0, 40)} - ${date}`);
  });
  
  // 检查"你好呀"
  const target = posts.filter(p => p.title && p.title.includes('你好呀'));
  console.log(`\n包含"你好呀"的帖子: ${target.length} 个`);
  if (target.length > 0) {
    target.forEach(p => console.log(`  - ${p.title} (${new Date(p.created_at).toLocaleString('zh-CN')})`));
  }
  
  // 检查今天7月14日的帖子
  const today = posts.filter(p => {
    const d = new Date(p.created_at);
    return d.getMonth() === 6 && d.getDate() === 14;
  });
  console.log(`\n7月14日的帖子: ${today.length} 个`);
}

main().catch(console.error);