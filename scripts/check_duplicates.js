// 检查重复帖子
const tcb = require('@cloudbase/node-sdk');

const app = tcb.init({
  env: 'cmfootball-d3gp9t11528eabd1f',
  secretId: 'AKIDd7NcdR0KDyiS8pRs66ub7PTIrEPPCnDk',
  secretKey: 'cGvU4eEkZEgvvdHkAPREoBPPBsV5a0FI'
});
const db = app.database();

async function main() {
  console.log('========== 检查重复帖子 ==========\n');
  
  const result = await db.collection('posts').limit(1100).get();
  const posts = result.data || [];
  
  console.log(`总帖子数: ${posts.length}`);
  
  // 按标题分组
  const titleCount = {};
  posts.forEach(p => {
    const title = p.title;
    titleCount[title] = (titleCount[title] || 0) + 1;
  });
  
  // 找出重复的
  const duplicates = Object.entries(titleCount).filter(([title, count]) => count > 1);
  
  if (duplicates.length > 0) {
    console.log('\n重复的帖子:');
    duplicates.forEach(([title, count]) => {
      console.log(`  - "${title}" (${count}次)`);
      // 显示这些帖子的详情
      const same = posts.filter(p => p.title === title);
      same.forEach(p => {
        console.log(`    ID: ${p.id}, 时间: ${new Date(p.created_at).toLocaleString('zh-CN')}`);
      });
    });
  } else {
    console.log('\n没有重复的帖子');
  }
  
  // 按时间排序显示最新帖子
  console.log('\n========== 最新帖子（按时间排序）==========\n');
  const sorted = [...posts].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  sorted.slice(0, 15).forEach((p, i) => {
    const date = new Date(p.created_at).toLocaleString('zh-CN');
    const year = new Date(p.created_at).getFullYear();
    const badge = year > 2030 ? '[置顶]' : '';
    console.log(`  ${i+1}. ${badge} ${p.title.substring(0, 30)} - ${date}`);
  });
}

main().catch(console.error);