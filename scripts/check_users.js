// 检查数据库中的用户数据
const tcb = require('@cloudbase/node-sdk');

const app = tcb.init({
  env: 'cmfootball-d3gp9t11528eabd1f',
  secretId: 'AKIDd7NcdR0KDyiS8pRs66ub7PTIrEPPCnDk',
  secretKey: 'cGvU4eEkZEgvvdHkAPREoBPPBsV5a0FI'
});

const db = app.database();

async function checkUsers() {
  console.log('========== 检查用户数据 ==========\n');

  // 获取所有用户
  const result = await db.collection('profiles').limit(10).get();
  
  console.log(`找到 ${result.data?.length || 0} 个用户:\n`);
  
  for (const user of (result.data || [])) {
    console.log(`用户: ${user.nickname || user.username || '匿名'}`);
    console.log(`  ID: ${user.id}`);
    console.log(`  Email: ${user.email || '无'}`);
    console.log(`  Phone: ${user.phone || '无'}`);
    console.log(`  Password存在: ${user.password ? '是' : '否'}`);
    console.log(`  Avatar: ${user.avatar_url ? '有' : '无'}`);
    console.log('');
  }

  // 检查特定邮箱的用户
  console.log('========== 检查邮箱登录 ==========\n');
  
  const testEmails = ['test@test.com', 'admin@admin.com', '2211354141@qq.com'];
  
  for (const email of testEmails) {
    const userResult = await db.collection('profiles').where({ email }).get();
    if (userResult.data && userResult.data.length > 0) {
      const user = userResult.data[0];
      console.log(`邮箱 ${email}:`);
      console.log(`  用户: ${user.nickname || user.username}`);
      console.log(`  ID: ${user.id}`);
      console.log(`  有密码: ${user.password ? '是' : '否'}`);
    } else {
      console.log(`邮箱 ${email}: 不存在`);
    }
  }
}

checkUsers().catch(console.error);