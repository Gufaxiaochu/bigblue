// 修复头像 URL
const tcb = require('@cloudbase/node-sdk');
const cos = require('cos-nodejs-sdk-v5');

const app = tcb.init({ 
  env: 'cmfootball-d3gp9t11528eabd1f',
  secretId: 'AKIDd7NcdR0KDyiS8pRs66ub7PTIrEPPCnDk',
  secretKey: 'cGvU4eEkZEgvvdHkAPREoBPPBsV5a0FI'
});
const db = app.database();

const cosClient = new cos({
  SecretId: 'AKIDd7NcdR0KDyiS8pRs66ub7PTIrEPPCnDk',
  SecretKey: 'cGvU4eEkZEgvvdHkAPREoBPPBsV5a0FI'
});

async function fixAvatarUrls() {
  console.log('========== 修复头像 URL ==========\n');

  // 1. 获取所有有头像的用户
  const profiles = await db.collection('profiles').where({
    avatar_url: db.command.neq(null)
  }).get();

  console.log(`找到 ${profiles.data?.length || 0} 个有头像的用户\n`);

  let fixedCount = 0;

  for (const profile of (profiles.data || [])) {
    if (!profile.avatar_url) continue;

    // 提取原始文件名
    const match = profile.avatar_url.match(/\/([^\/]+\.jpg\??.*)$/);
    if (!match) {
      console.log(`✗ 无法解析: ${profile.avatar_url}`);
      continue;
    }

    const originalFilename = match[1].split('?')[0]; // 去除 ?t= 参数
    const userId = profile.id;

    // 在 COS 中查找该用户的头像文件
    const files = await new Promise((resolve) => {
      cosClient.getBucket({
        Bucket: 'fotos-1259156410',
        Region: 'ap-guangzhou',
        Prefix: `posts/${userId}/`,
        MaxKeys: 1000
      }, (err, data) => {
        resolve(err ? [] : (data.Contents || []));
      });
    });

    // 查找匹配的头像文件
    const avatarFiles = files.filter(f => f.Key.includes(originalFilename));
    
    if (avatarFiles.length === 0) {
      console.log(`✗ 未找到: ${profile.nickname || profile.username} (${userId})`);
      console.log(`   期望: ${originalFilename}`);
      continue;
    }

    // 使用第一个匹配的文件
    const newAvatarUrl = `https://fotos-1259156410.cos.ap-guangzhou.myqcloud.com/${avatarFiles[0].Key}`;

    // 更新数据库
    if (newAvatarUrl !== profile.avatar_url) {
      await db.collection('profiles').doc(profile._id).update({
        avatar_url: newAvatarUrl
      });
      fixedCount++;
      console.log(`✓ 修复: ${profile.nickname || profile.username}`);
      console.log(`   旧: ${profile.avatar_url.substring(50)}...`);
      console.log(`   新: ${newAvatarUrl.substring(50)}...`);
    } else {
      console.log(`- 已是最新: ${profile.nickname || profile.username}`);
    }
  }

  console.log(`\n========== 完成 ==========`);
  console.log(`修复了 ${fixedCount} 个头像 URL`);
}

fixAvatarUrls().catch(console.error);