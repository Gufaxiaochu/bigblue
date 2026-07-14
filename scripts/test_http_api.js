// 使用 HTTP API 写入数据库
const tcb = require('@cloudbase/node-sdk');
const crypto = require('crypto');

const app = tcb.init({
  env: 'cmfootball-d3gp9t11528eabd1f',
  secretId: 'AKIDd7NcdR0KDyiS8pRs66ub7PTIrEPPCnDk',
  secretKey: 'cGvU4eEkZEgvvdHkAPREoBPPBsV5a0FI'
);

async function testHttpApi() {
  console.log('测试使用 HTTP API 写入数据库...\n');
  
  // 获取数据库的访问令牌
  const auth = app.auth();
  const credential = await auth.getAppSign();
  
  console.log('AppSign:', credential);
  
  // 或者尝试使用 admin 权限
  const db = app.database();
  
  // 尝试创建集合（如果不存在）
  try {
    console.log('尝试列出集合...');
    const collections = await db.listCollections();
    console.log('集合列表:', collections);
  } catch (e) {
    console.log('列出集合失败:', e.message);
  }
  
  // 尝试写入
  console.log('\n尝试写入数据...');
  try {
    const result = await db.collection('posts').add({
      test_id: 'http_api_test_' + Date.now(),
      title: 'HTTP API 测试',
      created_at: new Date()
    });
    console.log('写入结果:', JSON.stringify(result));
  } catch (e) {
    console.log('写入失败:', e.message);
    console.log('错误详情:', e);
  }
}

testHttpApi().catch(console.error);