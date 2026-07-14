// 检查 COS 中的文件是否存在
const cos = require('cos-nodejs-sdk-v5');

const client = new cos({
  SecretId: 'AKIDd7NcdR0KDyiS8pRs66ub7PTIrEPPCnDk',
  SecretKey: 'cGvU4eEkZEgvvdHkAPREoBPPBsV5a0FI'
});

const tcb = require('@cloudbase/node-sdk');
const app = tcb.init({ 
  env: 'cmfootball-d3gp9t11528eabd1f',
  secretId: 'AKIDd7NcdR0KDyiS8pRs66ub7PTIrEPPCnDk',
  secretKey: 'cGvU4eEkZEgvvdHkAPREoBPPBsV5a0FI'
});
const db = app.database();

// 检查文件是否存在
async function checkFileExists(url) {
  try {
    const match = url.match(/fotos-1259156410\.cos\.ap-guangzhou\.myqcloud\.com\/(.+)$/);
    if (!match) return { exists: false, error: 'URL格式不正确' };
    
    const key = match[1];
    return new Promise((resolve) => {
      client.headObject({
        Bucket: 'fotos-1259156410',
        Region: 'ap-guangzhou',
        Key: key
      }, (err, data) => {
        resolve({ exists: !err, error: err?.message, key, url });
      });
    });
  } catch (e) {
    return { exists: false, error: e.message, url };
  }
}

async function main() {
  console.log('========== 检查图片文件存在性 ==========\n');

  // 获取最近的帖子
  const posts = await db.collection('posts').orderBy('created_at', 'desc').limit(10).get();
  
  for (const post of (posts.data || [])) {
    console.log(`帖子: ${post.title}`);
    
    if (post.image_urls && post.image_urls.length > 0) {
      for (const url of post.image_urls) {
        const result = await checkFileExists(url);
        console.log(`  ${result.exists ? '✓' : '✗'} ${result.url.substring(0, 80)}...`);
        if (!result.exists) {
          console.log(`    原因: ${result.error || '文件不存在'}`);
        }
      }
    }
    
    if (post.thumbnail_urls && post.thumbnail_urls.length > 0) {
      for (const url of post.thumbnail_urls) {
        const result = await checkFileExists(url);
        console.log(`  [缩略] ${result.exists ? '✓' : '✗'} ${result.url.substring(0, 80)}...`);
        if (!result.exists) {
          console.log(`    原因: ${result.error || '文件不存在'}`);
        }
      }
    }
    console.log('');
  }

  // 获取几个有头像的用户
  const profiles = await db.collection('profiles').where({
    avatar_url: db.command.neq(null)
  }).limit(5).get();
  
  console.log(`\n检查用户头像...`);
  for (const profile of (profiles.data || [])) {
    if (profile.avatar_url) {
      const result = await checkFileExists(profile.avatar_url);
      console.log(`  ${profile.nickname || profile.username || '匿名'}: ${result.exists ? '✓' : '✗'}`);
      if (!result.exists) {
        console.log(`    URL: ${profile.avatar_url.substring(0, 80)}...`);
        console.log(`    原因: ${result.error || '文件不存在'}`);
      }
    }
  }
}

main().catch(console.error);