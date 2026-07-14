// 为所有用户设置默认密码
const tcb = require('@cloudbase/node-sdk');
const bcrypt = require('bcryptjs');

const app = tcb.init({
  env: 'cmfootball-d3gp9t11528eabd1f',
  secretId: 'AKIDd7NcdR0KDyiS8pRs66ub7PTIrEPPCnDk',
  secretKey: 'cGvU4eEkZEgvvdHkAPREoBPPBsV5a0FI'
});
const db = app.database();

async function setDefaultPasswords() {
  console.log('========== 为用户设置默认密码 ==========\n');

  // 默认密码（用户手机号后6位）
  // 或者使用固定密码
  const defaultPassword = '123456';
  const hashedPassword = await bcrypt.hash(defaultPassword, 10);

  console.log(`默认密码: ${defaultPassword}`);
  console.log('请通知所有用户登录后立即修改密码！\n');

  // 获取所有用户
  const result = await db.collection('profiles').limit(1000).get();
  
  console.log(`找到 ${result.data?.length || 0} 个用户\n`);

  let updatedCount = 0;

  for (const user of (result.data || [])) {
    if (!user.phone && !user.email) {
      console.log(`跳过: ${user.nickname || user.username} (无手机号/邮箱)`);
      continue;
    }

    // 设置密码
    await db.collection('profiles').doc(user._id).update({
      password: hashedPassword
    });
    
    updatedCount++;
    
    if (updatedCount % 100 === 0) {
      console.log(`已更新 ${updatedCount} 个用户...`);
    }
  }

  console.log(`\n========== 完成 ==========`);
  console.log(`更新了 ${updatedCount} 个用户的密码`);
  console.log(`默认密码: ${defaultPassword}`);
  console.log('\n用户可以使用手机号 + 密码登录');
}

setDefaultPasswords().catch(console.error);