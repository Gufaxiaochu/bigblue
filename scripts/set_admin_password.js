// 为超级管理员设置密码
const tcb = require('@cloudbase/node-sdk');
const bcrypt = require('bcryptjs');

const app = tcb.init({
  env: 'cmfootball-d3gp9t11528eabd1f',
  secretId: 'AKIDd7NcdR0KDyiS8pRs66ub7PTIrEPPCnDk',
  secretKey: 'cGvU4eEkZEgvvdHkAPREoBPPBsV5a0FI'
});
const db = app.database();

async function setAdminPassword() {
  console.log('========== 设置管理员密码 ==========\n');

  // 超级管理员手机号
  const adminPhones = ['19256680343', '2211354141@qq.com', '13590179040@bigblue.com'];
  
  // 新密码
  const newPassword = 'admin123456';
  const hashedPassword = await bcrypt.hash(newPassword, 10);

  console.log(`新密码: ${newPassword}`);
  console.log(`密码哈希: ${hashedPassword.substring(0, 20)}...\n`);

  // 查找管理员账号
  for (const phone of adminPhones) {
    const result = await db.collection('profiles')
      .where({ phone })
      .get();

    if (result.data && result.data.length > 0) {
      const admin = result.data[0];
      console.log(`找到管理员: ${admin.nickname || admin.username}`);
      console.log(`  手机: ${admin.phone}`);
      console.log(`  ID: ${admin.id}`);

      // 更新密码
      await db.collection('profiles').doc(admin._id).update({
        password: hashedPassword
      });
      
      console.log(`  ✓ 密码已更新\n`);
    } else {
      // 也尝试用 email 查找
      const emailResult = await db.collection('profiles')
        .where({ email: phone })
        .get();
      
      if (emailResult.data && emailResult.data.length > 0) {
        const admin = emailResult.data[0];
        console.log(`找到管理员: ${admin.nickname || admin.username}`);
        console.log(`  邮箱: ${admin.email}`);
        console.log(`  ID: ${admin.id}`);

        await db.collection('profiles').doc(admin._id).update({
          password: hashedPassword
        });
        
        console.log(`  ✓ 密码已更新\n`);
      } else {
        console.log(`未找到: ${phone}\n`);
      }
    }
  }

  console.log('========== 完成 ==========');
  console.log('管理员现在可以使用密码 admin123456 登录');
  console.log('登录后请立即修改密码！');
}

setAdminPassword().catch(console.error);