// 检查评论
const tcb = require('@cloudbase/node-sdk');

const app = tcb.init({
  env: 'cmfootball-d3gp9t11528eabd1f',
  secretId: 'AKIDd7NcdR0KDyiS8pRs66ub7PTIrEPPCnDk',
  secretKey: 'cGvU4eEkZEgvvdHkAPREoBPPBsV5a0FI'
});
const db = app.database();

async function main() {
  console.log('========== 检查评论 ==========\n');
  
  // 获取评论总数
  const comments = await db.collection('comments').limit(1000).get();
  console.log(`评论总数: ${comments.data?.length || 0}`);
  
  // 按时间排序
  const sorted = (comments.data || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  
  console.log('\n最新10条评论:');
  sorted.slice(0, 10).forEach((c, i) => {
    const date = new Date(c.created_at).toLocaleString('zh-CN');
    const content = c.content?.substring(0, 30) || '';
    console.log(`  ${i+1}. ${content}... - ${date}`);
  });
  
  // 检查今天的评论
  const today = sorted.filter(c => {
    const d = new Date(c.created_at);
    return d.getMonth() === 6 && d.getDate() === 14;
  });
  console.log(`\n今天的评论: ${today.length} 条`);
}

main().catch(console.error);