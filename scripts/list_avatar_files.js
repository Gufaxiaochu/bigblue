// 检查 COS 中所有 avatar 相关文件
const cos = require('cos-nodejs-sdk-v5');

const client = new cos({
  SecretId: 'AKIDd7NcdR0KDyiS8pRs66ub7PTIrEPPCnDk',
  SecretKey: 'cGvU4eEkZEgvvdHkAPREoBPPBsV5a0FI'
});

async function listAvatarFiles() {
  console.log('========== 检查 COS 中的头像文件 ==========\n');

  // 列出所有 posts/ 下的文件
  let allFiles = [];
  let marker = null;

  do {
    const result = await new Promise((resolve, reject) => {
      client.getBucket({
        Bucket: 'fotos-1259156410',
        Region: 'ap-guangzhou',
        Prefix: 'posts/',
        Marker: marker,
        MaxKeys: 1000
      }, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });

    if (result.Contents) {
      allFiles = allFiles.concat(result.Contents.map(f => f.Key));
    }
    marker = result.NextMarker;
    console.log(`已获取 ${allFiles.length} 个文件...`);
  } while (marker);

  console.log(`\n总共 ${allFiles.length} 个文件`);

  // 找出包含 avatar 的文件
  const avatarFiles = allFiles.filter(f => f.includes('avatar'));
  console.log(`\n包含 'avatar' 的文件: ${avatarFiles.length} 个`);
  avatarFiles.slice(0, 20).forEach(f => console.log(`  ${f}`));

  // 找出头像文件路径格式
  const avatarPaths = {};
  avatarFiles.forEach(f => {
    // 提取用户ID：posts/USER_ID/...
    const match = f.match(/^posts\/([^\/]+)\//);
    if (match) {
      const userId = match[1];
      if (!avatarPaths[userId]) avatarPaths[userId] = [];
      avatarPaths[userId].push(f);
    }
  });

  console.log(`\n包含头像的用户ID数: ${Object.keys(avatarPaths).length}`);
  console.log('\n示例:');
  Object.entries(avatarPaths).slice(0, 5).forEach(([userId, files]) => {
    console.log(`  ${userId}:`);
    files.forEach(f => console.log(`    ${f}`));
  });
}

listAvatarFiles().catch(console.error);