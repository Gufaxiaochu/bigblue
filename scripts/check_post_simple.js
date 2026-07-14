// 检查帖子
const tcb = require('@cloudbase/node-sdk');

const app = tcb.init({
  env: 'cmfootball-d3gp9t11528eabd1f',
  secretId: 'AKIDd7NcdR0KDyiS8pRs66ub7PTIrEPPCnDk',
  secretKey: 'cGvU4eEkZEgvvdHkAPREoBPPBsV5a0FI'
});
const db = app.database();

async function main() {
  // 获取所有帖子
  const result = await db.collection('posts').limit(1000).get();
  const posts = result.data || [];

  // 搜索目标帖子
  const target = posts.filter(p => p.title && p.title.includes('21 v12v1v2'));
  console.log('找到 "21 v12v1v2" 帖子:', target.length, '个');
  
  if (target.length > 0) {
    target.forEach(p => {
      console.log(`  ID: ${p.id}`);
      console.log(`  标题: ${p.title}`);
      console.log(`  时间: ${new Date(p.created_at).toLocaleString('zh-CN')}`);
    });
  }

  // 显示最新帖子
  console.log('\n最新10个帖子（普通帖）:');
  const normal = posts.filter(p => new Date(p.created_at).getFullYear() <= 2030);
  normal.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  normal.slice(0, 10).forEach((p, i) => {
    console.log(`  ${i+1}. ${p.title.substring(0, 25)} - ${new Date(p.created_at).toLocaleString('zh-CN')}`);
  });
}

main().catch(console.error);