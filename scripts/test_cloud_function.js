// 直接测试云函数
const tcb = require('@cloudbase/node-sdk');

const app = tcb.init({
  env: 'cmfootball-d3gp9t11528eabd1f',
  secretId: 'AKIDd7NcdR0KDyiS8pRs66ub7PTIrEPPCnDk',
  secretKey: 'cGvU4eEkZEgvvdHkAPREoBPPBsV5a0FI'
});

async function test() {
  console.log('直接调用云函数测试发帖...\n');
  
  // 获取一个用户ID
  const db = app.database();
  const users = await db.collection('profiles').limit(1).get();
  const userId = users.data?.[0]?.id;
  console.log('使用用户ID:', userId);
  
  // 直接调用云函数
  const result = await app.callFunction({
    name: 'api',
    data: {
      action: 'posts/create',
      userId: userId,
      user_id: userId,
      title: '直接测试帖子 ' + Date.now(),
      content: '这是直接调用云函数的测试内容',
      category: 'default',
      content_type: 'text'
    }
  });
  
  console.log('\n云函数返回:');
  console.log(JSON.stringify(result.result, null, 2));
  
  // 等待一下再检查
  console.log('\n等待2秒后检查数据库...');
  await new Promise(r => setTimeout(r, 2000));
  
  const posts = await db.collection('posts').limit(10).get();
  const titles = (posts.data || []).map(p => p.title);
  console.log('数据库中最新帖子:', titles.slice(0, 5));
  
  // 检查是否有测试帖子
  const testPost = (posts.data || []).find(p => p.title.includes('直接测试帖子'));
  if (testPost) {
    console.log('\n✓ 找到测试帖子:', testPost.title);
  } else {
    console.log('\n✗ 未找到测试帖子');
  }
}

test().catch(console.error);