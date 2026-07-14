const cos = require('cos-nodejs-sdk-v5');

const client = new cos({
  SecretId: 'AKIDd7NcdR0KDyiS8pRs66ub7PTIrEPPCnDk',
  SecretKey: 'cGvU4eEkZEgvvdHkAPREoBPPBsV5a0FI'
});

const Bucket = 'fotos-1259156410';
const Region = 'ap-guangzhou';

// 设置存储桶为公有读私有写
client.putBucketAcl({
  Bucket,
  Region,
  ACL: 'public-read'  // 公有读私有写
}, (err, data) => {
  if (err) {
    console.log('设置权限失败:', err.message);
  } else {
    console.log('设置权限成功！');
    console.log('存储桶已设置为: 公有读私有写');
    console.log('现在图片可以通过URL直接访问了');
  }
});