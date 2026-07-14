const cos = require('cos-nodejs-sdk-v5');

const client = new cos({
  SecretId: 'AKIDd7NcdR0KDyiS8pRs66ub7PTIrEPPCnDk',
  SecretKey: 'cGvU4eEkZEgvvdHkAPREoBPPBsV5a0FI'
});

const Bucket = 'fotos-1259156410';
const Region = 'ap-guangzhou';

// 检查存储桶权限
client.getBucketAcl({
  Bucket,
  Region
}, (err, data) => {
  console.log('=== 存储桶权限 ===');
  if (err) {
    console.log('错误:', err.message);
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
});

// 检查CORS配置
client.getBucketCors({
  Bucket,
  Region
}, (err, data) => {
  console.log('\n=== CORS配置 ===');
  if (err) {
    console.log('错误:', err.message);
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
});

// 列出最近的文件
client.getBucket({
  Bucket,
  Region,
  Prefix: 'posts/',
  MaxKeys: 10
}, (err, data) => {
  console.log('\n=== 最近的文件 ===');
  if (err) {
    console.log('错误:', err.message);
  } else {
    if (data.Contents) {
      data.Contents.forEach(item => {
        console.log(item.Key);
      });
    }
  }
});