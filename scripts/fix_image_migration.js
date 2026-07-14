// 修复图片迁移：从Supabase下载并上传到COS，保持原始文件名
const axios = require('axios');
const cos = require('cos-nodejs-sdk-v5');

// 配置
const SUPABASE_URL = 'https://vmdwztwwdfmqheqfcdbn.supabase.co';
const COS_SECRET_ID = 'AKIDd7NcdR0KDyiS8pRs66ub7PTIrEPPCnDk';
const COS_SECRET_KEY = 'cGvU4eEkZEgvvdHkAPREoBPPBsV5a0FI';
const COS_BUCKET = 'fotos-1259156410';
const COS_REGION = 'ap-guangzhou';

const cosClient = new cos({ SecretId: COS_SECRET_ID, SecretKey: COS_SECRET_KEY });

// 需要迁移的图片URL列表（从数据库中提取）
const IMAGES_TO_MIGRATE = [
  // 示例：'posts/714de343-b96b-440c-be54-55d4792f45fd/avatar_1783852511128.jpg'
];

// 从URL下载图片
async function downloadImage(url) {
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    return Buffer.from(response.data);
  } catch (e) {
    console.error(`下载失败: ${url}`, e.message);
    return null;
  }
}

// 上传到COS
async function uploadToCOS(key, buffer) {
  return new Promise((resolve, reject) => {
    cosClient.putObject({
      Bucket: COS_BUCKET,
      Region: COS_REGION,
      Key: key,
      Body: buffer
    }, (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(`https://${COS_BUCKET}.cos.${COS_REGION}.myqcloud.com/${key}`);
      }
    });
  });
}

// 处理单个图片
async function migrateImage(supabaseUrl) {
  // 提取路径
  const match = supabaseUrl.match(/\/storage\/v1\/object\/public\/posts\/(.+)$/);
  if (!match) {
    console.log(`跳过（路径不匹配）: ${supabaseUrl}`);
    return null;
  }

  const key = `posts/${match[1]}`;
  
  // 检查是否已存在
  try {
    await new Promise((resolve, reject) => {
      cosClient.headObject({
        Bucket: COS_BUCKET,
        Region: COS_REGION,
        Key: key
      }, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });
    console.log(`已存在: ${key}`);
    return key;
  } catch (e) {
    // 不存在，继续下载
  }

  // 下载并上传
  console.log(`迁移: ${key}`);
  const buffer = await downloadImage(supabaseUrl);
  if (!buffer) return null;

  try {
    const newUrl = await uploadToCOS(key, buffer);
    console.log(`✅ 成功: ${key}`);
    return newUrl;
  } catch (e) {
    console.error(`上传失败: ${key}`, e.message);
    return null;
  }
}

// 主函数
async function main() {
  console.log('开始修复图片迁移...');
  console.log('从Supabase下载图片并上传到COS（保持原始文件名）');
  
  for (const url of IMAGES_TO_MIGRATE) {
    await migrateImage(url);
  }

  console.log('\n完成！');
}

main().catch(console.error);