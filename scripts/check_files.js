const cos = require('cos-nodejs-sdk-v5');

const client = new cos({
  SecretId: 'AKIDd7NcdR0KDyiS8pRs66ub7PTIrEPPCnDk',
  SecretKey: 'cGvU4eEkZEgvvdHkAPREoBPPBsV5a0FI'
});

const Bucket = 'fotos-1259156410';
const Region = 'ap-guangzhou';

// 检查特定文件是否存在
const filesToCheck = [
  'posts/714de343-b96b-440c-be54-55d4792f45fd/avatar_1783852511128.jpg',
  'posts/c0b337b8-e742-462f-90d9-bc9bd5aedee8/1783747876791_0.jpg',
  'posts/7f1c739e-90d1-4e34-bc8d-d4e93737e15b/1783699716623_0.jpg',
];

filesToCheck.forEach(key => {
  client.headObject({
    Bucket,
    Region,
    Key: key
  }, (err, data) => {
    if (err) {
      console.log(`❌ 不存在: ${key}`);
    } else {
      console.log(`✅ 存在: ${key}`);
    }
  });
});

// 搜索特定前缀的文件
client.getBucket({
  Bucket,
  Region,
  Prefix: 'posts/714de343',
  MaxKeys: 100
}, (err, data) => {
  console.log('\n=== posts/714de343 目录下的文件 ===');
  if (err) {
    console.log('错误:', err.message);
  } else if (data.Contents) {
    data.Contents.forEach(item => {
      console.log(item.Key);
    });
  } else {
    console.log('没有文件');
  }
});