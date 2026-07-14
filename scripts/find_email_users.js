// 查找所有有邮箱的用户
const tcb = require('@cloudbase/node-sdk');

const app = tcb.init({
  env: 'cmfootball-d3gp9t11528eabd1f',
  secretId: 'AKIDd7NcdR0KDyiS8pRs66ub7PTIrEPPCnDk',
  secretKey: 'cGvU4eEkZEgvvdHkAPREoBPPBsV5a0FI'
});
const db = app.database();

async function findEmailUsers() {
  console.log('========== 查找有邮箱的用户 ==========\n');

  // 获取所有用户
  const result = await db.collection('profiles').limit(1000).get();
  
  const usersWithEmail = [];
  const usersWithPhone = [];
  
  for (const user of (result.data || [])) {
    if (user.email) {
      usersWithEmail.push(user);
    }
    if (user.phone) {
      usersWithPhone.push(user);
    }
  }

  console.log(`总用户数: ${result.data?.length || 0}`);
  console.log(`有邮箱的用户: ${usersWithEmail.length}`);
  console.log(`有手机号的用户: ${usersWithPhone.length}\n`);

  if (usersWithEmail.length > 0) {
    console.log('有邮箱的用户:');
    usersWithEmail.slice(0, 10).forEach(u => {
      console.log(`  ${u.nickname || u.username}: ${u.email}`);
    });
  }

  // 查找特定邮箱
  console.log('\n查找管理员邮箱...');
  const adminEmails = ['2211354141@qq.com'];
  
  for (const email of adminEmails) {
    const userResult = await db.collection('profiles').where({ email }).get();
    if (userResult.data && userResult.data.length > 0) {
      const user = userResult.data[0];
      console.log(`\n找到管理员: ${user.nickname || user.username}`);
      console.log(`  Email: ${user.email}`);
      console.log(`  Phone: ${user.phone || '无'}`);
      console.log(`  ID: ${user.id}`);
    } else {
      console.log(`未找到: ${email}`);
    }
  }
}

findEmailUsers().catch(console.error);