// 搜索用户发的帖子
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
  
  console.log(`总帖子数: ${posts.length}\n`);
  
  // 搜索包含特定关键词的帖子
  const keywords = ['呵呵哒', '你好妲己', '你好呀', '测试帖子'];
  
  keywords.forEach(kw => {
    const found = posts.filter(p => p.title && p.title.includes(kw));
    if (found.length > 0) {
      console.log(`找到 "${kw}":`);
      found.forEach(p => {
        console.log(`  - ${p.title} (${new Date(p.created_at).toLocaleString('zh-CN')})`);
      });
    }
  });
  
  // 搜索包含"测试"的帖子
  const tests = posts.filter(p => p.title && p.title.includes('测试'));
  console.log(`\n包含"测试"的帖子: ${tests.length} 个`);
  
  // 搜索包含"HTTP"的帖子（我们之前测试插入的）
  const https = posts.filter(p => p.title && p.title.includes('HTTP'));
  console.log(`包含"HTTP"的帖子: ${https.length} 个`);
  
  // 搜索最新下午的帖子
  const afternoon = posts.filter(p => {
    const h = new Date(p.created_at).getHours();
    const d = new Date(p.created_at).getDate();
    return d === 14 && h >= 13;
  });
  console.log(`\n今天下午的帖子: ${afternoon.length} 个`);
}

main().catch(console.error);