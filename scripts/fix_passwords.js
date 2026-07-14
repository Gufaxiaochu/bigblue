// 从 Supabase Auth 系统导出用户密码并更新到 CloudBase
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.tencent') });

const { createClient } = require('@supabase/supabase-js');
const tcb = require('@cloudbase/node-sdk');

// Supabase 配置
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('错误：请确保 .env.tencent 文件中配置了 SUPABASE_URL 和 SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// CloudBase 配置
const app = tcb.init({
  env: 'cmfootball-d3gp9t11528eabd1f',
  secretId: process.env.COS_SECRET_ID,
  secretKey: process.env.COS_SECRET_KEY
});
const db = app.database();

async function fixPasswords() {
  console.log('========== 修复用户密码 ==========\n');

  // 1. 从 Supabase auth.users 获取用户密码哈希
  // 注意：需要使用 service role key 才能访问 auth.users
  const { data: authUsers, error } = await supabase
    .from('users')  // Supabase auth.users 在某些情况下可以通过 public API 访问
    .select('id, email, encrypted_password, phone');

  if (error) {
    console.log('直接查询 users 表失败，尝试使用 RPC...');
    console.log('Error:', error.message);
    
    // 备选方案：让用户重置密码
    console.log('\n无法从 Supabase 导出密码。');
    console.log('解决方案：');
    console.log('1. 所有用户需要重新注册或使用手机号登录');
    console.log('2. 或者从 Supabase Dashboard 导出 auth.users 数据');
    return;
  }

  console.log(`找到 ${authUsers?.length || 0} 个认证用户\n`);

  // 2. 更新到 CloudBase
  let updatedCount = 0;
  
  for (const authUser of (authUsers || [])) {
    // 查找对应的 profile
    const profileResult = await db.collection('profiles')
      .where({ id: authUser.id })
      .get();

    if (profileResult.data && profileResult.data.length > 0) {
      const profile = profileResult.data[0];
      
      // 更新密码
      await db.collection('profiles').doc(profile._id).update({
        password: authUser.encrypted_password,
        email: authUser.email || profile.email,
        phone: authUser.phone || profile.phone
      });
      
      updatedCount++;
      console.log(`✓ 更新: ${profile.nickname || profile.username || authUser.email}`);
    }
  }

  console.log(`\n========== 完成 ==========`);
  console.log(`更新了 ${updatedCount} 个用户的密码`);
}

fixPasswords().catch(console.error);