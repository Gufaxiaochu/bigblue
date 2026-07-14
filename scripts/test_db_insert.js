// 检查数据库集合
const tcb = require('@cloudbase/node-sdk');

const app = tcb.init({
  env: 'cmfootball-d3gp9t11528eabd1f',
  secretId: 'AKIDd7NcdR0KDyiS8pRs66ub7PTIrEPPCnDk',
  secretKey: 'cGvU4eEkZEgvvdHkAPREoBPPBsV5a0FI'
});
const db = app.database();

async function main() {
  console.log('检查数据库集合...\n');
  
  // 获取 posts 集合的统计
  try {
    const stats = await db.collection('posts').count();
    console.log('posts 集合文档数:', stats.total);
  } catch (e) {
    console.log('posts 集合错误:', e.message);
  }
  
  // 尝试直接插入一条数据
  console.log('\n尝试直接插入数据...');
  try {
    const result = await db.collection('posts').add({
      id: 'test-' + Date.now(),
      title: '测试插入',
      content: '测试内容',
      created_at: new Date()
    });
    console.log('插入结果:', JSON.stringify(result));
    
    // 立即检查是否存在
    const check = await db.collection('posts').where({ title: '测试插入' }).get();
    console.log('查询结果:', check.data?.length, '条');
  } catch (e) {
    console.log('插入错误:', e.message);
  }
}

main().catch(console.error);