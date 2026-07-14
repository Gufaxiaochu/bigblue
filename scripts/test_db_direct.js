// 直接测试云函数中的数据库写入
const tcb = require('@cloudbase/node-sdk');

// 使用相同的配置（和云函数一样）
const app = tcb.init({
  env: 'cmfootball-d3gp9t11528eabd1f',
  region: 'ap-shanghai',
  secretId: 'AKIDd7NcdR0KDyiS8pRs66ub7PTIrEPPCnDk',
  secretKey: 'cGvU4eEkZEgvvdHkAPREoBPPBsV5a0FI'
});

const db = app.database();

async function test() {
  console.log('测试数据库写入...\n');
  
  const testId = 'test-' + Date.now();
  const testPost = {
    id: testId,
    user_id: 'test-user',
    title: '直接测试 ' + new Date().toLocaleString('zh-CN'),
    content: '测试内容',
    created_at: new Date()
  };
  
  try {
    console.log('写入测试帖子...');
    const result = await db.collection('posts').add(testPost);
    console.log('写入结果:', JSON.stringify(result));
    
    // 立即验证
    console.log('\n验证数据...');
    const check = await db.collection('posts').where({ id: testId }).get();
    console.log('查询结果:', check.data?.length || 0, '条');
    
    if (check.data && check.data.length > 0) {
      console.log('✓ 写入成功');
      // 清理
      await db.collection('posts').where({ id: testId }).remove();
      console.log('✓ 已清理测试数据');
    } else {
      console.log('✗ 写入失败：数据不存在');
    }
  } catch (e) {
    console.log('错误:', e.message);
    console.log('详情:', e);
  }
}

test();