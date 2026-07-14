// 完整的图片修复脚本
// 1. 从CloudBase数据库获取所有图片URL
// 2. 从Supabase下载图片
// 3. 上传到COS（保持原始文件名）
// 4. 更新数据库中的URL

const axios = require('axios');
const cos = require('cos-nodejs-sdk-v5');
const tcb = require('@cloudbase/node-sdk');

// 配置
const SUPABASE_URL = 'https://vmdwztwwdfmqheqfcdbn.supabase.co';
const COS_SECRET_ID = 'AKIDd7NcdR0KDyiS8pRs66ub7PTIrEPPCnDk';
const COS_SECRET_KEY = 'cGvU4eEkZEgvvdHkAPREoBPPBsV5a0FI';
const COS_BUCKET = 'fotos-1259156410';
const COS_REGION = 'ap-guangzhou';

const cosClient = new cos({ SecretId: COS_SECRET_ID, SecretKey: COS_SECRET_KEY });
const app = tcb.init({ 
  env: 'cmfootball-d3gp9t11528eabd1f',
  secretId: COS_SECRET_ID,
  secretKey: COS_SECRET_KEY
});
const db = app.database();

// 下载图片
async function downloadImage(url) {
  try {
    const response = await axios.get(url, { 
      responseType: 'arraybuffer',
      timeout: 30000
    });
    return Buffer.from(response.data);
  } catch (e) {
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
      if (err) reject(err);
      else resolve(true);
    });
  });
}

// 检查文件是否存在
async function checkExists(key) {
  return new Promise((resolve) => {
    cosClient.headObject({
      Bucket: COS_BUCKET,
      Region: COS_REGION,
      Key: key
    }, (err, data) => {
      resolve(!err);
    });
  });
}

// 处理单个图片
async function migrateImage(supabaseUrl) {
  if (!supabaseUrl || supabaseUrl.includes('fotos-1259156410')) {
    return null; // 已经是COS的URL或为空
  }

  // 提取路径
  const match = supabaseUrl.match(/\/storage\/v1\/object\/public\/posts\/(.+)$/);
  if (!match) {
    // 尝试其他格式
    const match2 = supabaseUrl.match(/supabase\.co\/storage\/v1\/.*\/posts\/(.+)$/);
    if (!match2) return null;
  }

  const key = match ? `posts/${match[1]}` : null;
  if (!key) return null;

  // 检查是否已存在
  const exists = await checkExists(key);
  if (exists) {
    console.log(`✓ 已存在: ${key}`);
    return `https://${COS_BUCKET}.cos.${COS_REGION}.myqcloud.com/${key}`;
  }

  // 下载并上传
  console.log(`迁移: ${key}`);
  const buffer = await downloadImage(supabaseUrl);
  if (!buffer) {
    console.log(`✗ 下载失败: ${supabaseUrl}`);
    return null;
  }

  try {
    await uploadToCOS(key, buffer);
    const newUrl = `https://${COS_BUCKET}.cos.${COS_REGION}.myqcloud.com/${key}`;
    console.log(`✅ 成功: ${key}`);
    return newUrl;
  } catch (e) {
    console.log(`✗ 上传失败: ${key}`, e.message);
    return null;
  }
}

// 主函数
async function main() {
  console.log('========== 开始修复图片迁移 ==========\n');

  // 1. 获取所有帖子
  console.log('获取帖子数据...');
  const posts = await db.collection('posts').limit(1000).get();
  console.log(`找到 ${posts.data?.length || 0} 个帖子`);

  // 2. 获取所有用户
  console.log('获取用户数据...');
  const profiles = await db.collection('profiles').limit(1000).get();
  console.log(`找到 ${profiles.data?.length || 0} 个用户`);

  const urlMapping = {}; // 旧URL -> 新URL

  // 3. 处理帖子图片
  for (const post of (posts.data || [])) {
    if (post.image_urls && post.image_urls.length > 0) {
      for (let i = 0; i < post.image_urls.length; i++) {
        const oldUrl = post.image_urls[i];
        if (!urlMapping[oldUrl]) {
          const newUrl = await migrateImage(oldUrl);
          if (newUrl) {
            urlMapping[oldUrl] = newUrl;
          }
        }
      }
    }
    if (post.thumbnail_urls && post.thumbnail_urls.length > 0) {
      for (let i = 0; i < post.thumbnail_urls.length; i++) {
        const oldUrl = post.thumbnail_urls[i];
        if (!urlMapping[oldUrl]) {
          const newUrl = await migrateImage(oldUrl);
          if (newUrl) {
            urlMapping[oldUrl] = newUrl;
          }
        }
      }
    }
  }

  // 4. 处理用户头像
  for (const profile of (profiles.data || [])) {
    if (profile.avatar_url && !urlMapping[profile.avatar_url]) {
      const newUrl = await migrateImage(profile.avatar_url);
      if (newUrl) {
        urlMapping[profile.avatar_url] = newUrl;
      }
    }
  }

  // 5. 更新数据库
  console.log('\n更新数据库...');
  let updateCount = 0;

  for (const post of (posts.data || [])) {
    const updates = {};
    
    if (post.image_urls) {
      const newUrls = post.image_urls.map(url => urlMapping[url] || url);
      if (JSON.stringify(newUrls) !== JSON.stringify(post.image_urls)) {
        updates.image_urls = newUrls;
      }
    }
    
    if (post.thumbnail_urls) {
      const newUrls = post.thumbnail_urls.map(url => urlMapping[url] || url);
      if (JSON.stringify(newUrls) !== JSON.stringify(post.thumbnail_urls)) {
        updates.thumbnail_urls = newUrls;
      }
    }

    if (Object.keys(updates).length > 0) {
      await db.collection('posts').doc(post._id).update(updates);
      updateCount++;
    }
  }

  for (const profile of (profiles.data || [])) {
    if (profile.avatar_url && urlMapping[profile.avatar_url]) {
      await db.collection('profiles').doc(profile._id).update({
        avatar_url: urlMapping[profile.avatar_url]
      });
      updateCount++;
    }
  }

  console.log(`\n========== 完成 ==========`);
  console.log(`迁移了 ${Object.keys(urlMapping).length} 个图片`);
  console.log(`更新了 ${updateCount} 条数据库记录`);
}

main().catch(console.error);