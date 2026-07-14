// 图片迁移脚本：Supabase Storage -> 腾讯云 COS
// 运行方式：node scripts/migrate_images_to_cos.js

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.tencent') });

const { createClient } = require('@supabase/supabase-js');
const cos = require('cos-nodejs-sdk-v5');
const axios = require('axios');

// Supabase 配置
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('错误：请确保 .env.tencent 文件中配置了 SUPABASE_URL 和 SUPABASE_SERVICE_KEY');
  process.exit(1);
}

// COS 配置（已配置好）
const COS_SECRET_ID = process.env.COS_SECRET_ID;
const COS_SECRET_KEY = process.env.COS_SECRET_KEY;
const COS_BUCKET = process.env.COS_BUCKET;
const COS_REGION = process.env.COS_REGION || 'ap-guangzhou';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const cosClient = new cos({
  SecretId: COS_SECRET_ID,
  SecretKey: COS_SECRET_KEY
});

// 要迁移的 bucket
const BUCKETS = ['posts', 'character-images'];

// 迁移单个 bucket
async function migrateBucket(bucketName) {
  console.log(`\n开始迁移 bucket: ${bucketName}`);

  try {
    // 1. 列出 bucket 中所有文件
    const { data: objects, error } = await supabase
      .storage
      .from(bucketName)
      .list('', {
        limit: 10000,
        sortBy: { column: 'name', order: 'asc' }
      });

    if (error) {
      console.error(`列出 bucket ${bucketName} 失败:`, error.message);
      return { bucket: bucketName, status: 'error', error: error.message };
    }

    // 2. 遍历文件夹
    const folders = objects.filter(o => !o.metadata); // 文件夹没有 metadata
    console.log(`发现 ${folders.length} 个文件夹`);

    let successCount = 0;
    let failCount = 0;
    const urlMapping = {}; // 旧 URL -> 新 URL 映射

    for (const folder of folders) {
      const { data: files, error: filesError } = await supabase
        .storage
        .from(bucketName)
        .list(folder.name, { limit: 1000 });

      if (filesError || !files) {
        console.error(`列出文件夹 ${folder.name} 失败:`, filesError?.message);
        continue;
      }

      const imageFiles = files.filter(f => f.metadata);
      console.log(`文件夹 ${folder.name} 中有 ${imageFiles.length} 个文件`);

      for (const file of imageFiles) {
        const oldPath = `${folder.name}/${file.name}`;
        const oldUrl = `${SUPABASE_URL}/storage/v1/object/public/${bucketName}/${oldPath}`;

        try {
          // 下载图片
          const { data: fileData, error: downloadError } = await supabase
            .storage
            .from(bucketName)
            .download(oldPath);

          if (downloadError || !fileData) {
            console.error(`下载失败: ${oldPath}`, downloadError?.message);
            failCount++;
            continue;
          }

          // 上传到 COS
          const buffer = Buffer.from(await fileData.arrayBuffer());
          const newPath = `${bucketName}/${folder.name}/${Date.now()}_${file.name}`;
          const newUrl = await uploadToCOS(newPath, buffer);

          urlMapping[oldUrl] = newUrl;
          successCount++;
          
          if (successCount % 10 === 0) {
            console.log(`已迁移 ${successCount} 个文件...`);
          }

        } catch (err) {
          console.error(`迁移失败: ${oldPath}`, err.message);
          failCount++;
        }
      }
    }

    console.log(`Bucket ${bucketName} 迁移完成: 成功 ${successCount}, 失败 ${failCount}`);
    
    // 保存 URL 映射
    const fs = require('fs');
    fs.writeFileSync(`./url_mapping_${bucketName}.json`, JSON.stringify(urlMapping, null, 2));
    console.log(`URL 映射已保存到 url_mapping_${bucketName}.json`);

    return { bucket: bucketName, status: 'success', successCount, failCount };

  } catch (err) {
    console.error(`迁移 bucket ${bucketName} 异常:`, err);
    return { bucket: bucketName, status: 'error', error: err.message };
  }
}

// 上传到 COS
function uploadToCOS(key, buffer) {
  return new Promise((resolve, reject) => {
    cosClient.putObject({
      Bucket: COS_BUCKET,
      Region: COS_REGION,
      Key: key,
      Body: buffer
    }, (err, data) => {
      if (err) {
        reject(err);
        return;
      }
      const url = `https://${COS_BUCKET}.cos.${COS_REGION}.myqcloud.com/${key}`;
      resolve(url);
    });
  });
}

// 主函数
async function migrate() {
  console.log('========== Supabase Storage -> 腾讯云 COS 图片迁移 ==========');
  console.log(`COS Bucket: ${COS_BUCKET}`);
  console.log(`COS Region: ${COS_REGION}`);

  const results = [];

  for (const bucket of BUCKETS) {
    const result = await migrateBucket(bucket);
    results.push(result);
  }

  console.log('\n========== 迁移结果汇总 ==========');
  for (const r of results) {
    console.log(`${r.bucket}: ${r.status}${r.successCount ? ` (${r.successCount} 个文件)` : ''}${r.error ? ` - ${r.error}` : ''}`);
  }
}

migrate().catch(console.error);