// 检查最新帖子
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

  // 按时间排序（最新的在前）
  posts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  console.log('========== 最新帖子（前20个）==========\n');
  posts.slice(0, 20).forEach((p, i) => {
    const date = new Date(p.created_at).toLocaleString('zh-CN');
    const year = new Date(p.created_at).getFullYear();
    const badge = year > 2030 ? '[置顶]' : '';
    console.log(`  ${i+1}. ${badge} ${p.title.substring(0, 30)} - ${date}`);
  });

  // 检查是否有"你好妲己"
  const target = posts.filter(p => p.title && p.title.includes('你好妲己'));
  if (target.length > 0) {
    console.log('\n✓ 找到"你好妲己"帖子');
    target.forEach(p => {
      console.log(`  ID: ${p.id}`);
      console.log(`  时间: ${new Date(p.created_at).toLocaleString('zh-CN')}`);
    });
  } else {
    console.log('\n✗ 未找到"你好妲己"帖子');
    
    // 检查包含"妲己"的帖子
    const daji = posts.filter(p => p.title && p.title.includes('妲己'));
    console.log(`包含"妲己"的帖子: ${daji.length} 个`);
  }
}

main().catch(console.error);