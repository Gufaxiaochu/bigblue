// 测试数据库写入
const tcb = require('@cloudbase/node-sdk');

const app = tcb.init({
  env: 'cmfootball-d3gp9t11528eabd1f',
  secretId: 'AKIDd7NcdR0KDyiS8pRs66ub7PTIrEPPCnDk',
  secretKey: 'cGvU4eEkZEgvvdHkAPREoBPPBsV5a0FI'
});

async function test() {
  const db = app.database();
  
  console.log('尝试写入测试数据...');
  try {
    const result = await db.collection('posts').add({
      test_id: 'test_' + Date.now(),
      title: '测试帖子 HTTP',
      created_at: new Date()
    });
    console.log('写入结果:', JSON.stringify(result));
    
    // 立即查询
    const check = await db.collection('posts').where({ title: '测试帖子 HTTP' }).get();
    console.log('查询结果:', check.data?.length, '条');
    if (check.data && check.data.length > 0) {
      console.log('✓ 数据写入成功');
    }
  } catch (e) {
    console.log('错误:', e.message);
  }
}

test();