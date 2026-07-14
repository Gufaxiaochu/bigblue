// 测试登录功能
const axios = require('axios');

async function testLogin() {
  console.log('========== 测试登录 ==========\n');

  // 测试云函数直接调用
  const tcb = require('@cloudbase/node-sdk');
  const app = tcb.init({
    env: 'cmfootball-d3gp9t11528eabd1f',
    secretId: 'AKIDd7NcdR0KDyiS8pRs66ub7PTIrEPPCnDk',
    secretKey: 'cGvU4eEkZEgvvdHkAPREoBPPBsV5a0FI'
  });

  // 测试登录
  const result = await app.callFunction({
    name: 'api',
    data: { action: 'auth/login', email: 'test@test.com', password: '123456' }
  });

  console.log('登录结果:');
  console.log(JSON.stringify(result, null, 2));

  if (result.result?.success) {
    console.log('\n✓ 登录成功');
    console.log('Token:', result.result.data?.token);
    console.log('User:', result.result.data?.user);
  } else {
    console.log('\n✗ 登录失败');
    console.log('Error:', result.result?.message || result.result?.error);
  }
}

testLogin().catch(console.error);