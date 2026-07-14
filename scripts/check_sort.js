// 检查帖子排序
const tcb = require('@cloudbase/node-sdk');

const app = tcb.init({
  env: 'cmfootball-d3gp9t11528eabd1f',
  secretId: 'AKIDd7NcdR0KDyiS8pRs66ub7PTIrEPPCnDk',
  secretKey: 'cGvU4eEkZEgvvdHkAPREoBPPBsV5a0FI'
});
const db = app.database();

async function main() {
  console.log('========== 检查帖子排序 ==========\n');
  
  const result = await db.collection('posts').limit(1000).get();
  const posts = result.data || [];
  
  // 分离置顶帖和普通帖
  const pinnedPosts = posts.filter(p => new Date(p.created_at).getFullYear() > 2030);
  const normalPosts = posts.filter(p => new Date(p.created_at).getFullYear() <= 2030);
  
  // 按时间排序普通帖
  normalPosts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  
  console.log(`置顶帖: ${pinnedPosts.length} 个`);
  console.log(`普通帖: ${normalPosts.length} 个\n`);
  
  // 显示最终排序的前15个
  const finalPosts = [...pinnedPosts, ...normalPosts];
  console.log('首页应该显示的顺序（前15个）:');
  finalPosts.slice(0, 15).forEach((p, i) => {
    const date = new Date(p.created_at).toLocaleString('zh-CN');
    const year = new Date(p.created_at).getFullYear();
    const badge = year > 2030 ? '[置顶]' : '';
    console.log(`  ${i+1}. ${badge} ${p.title.substring(0, 30)} - ${date}`);
  });
  
  // 检查是否有今天的帖子
  const today = new Date();
  const todayPosts = normalPosts.filter(p => {
    const d = new Date(p.created_at);
    return d.getDate() === today.getDate() && d.getMonth() === today.getMonth();
  });
  console.log(`\n今天的帖子: ${todayPosts.length} 个`);
}

main().catch(console.error);