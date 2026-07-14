// 数据迁移脚本：Supabase PostgreSQL -> 腾讯云 Cloudbase 数据库
// 运行方式：node scripts/migrate_to_cloudbase.js

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

// Cloudbase 配置
const CLOUDBASE_ENV = 'cmfootball-d3gp9t11528eabd1f';

// 腾讯云凭证
const TCB_SECRET_ID = process.env.COS_SECRET_ID;
const TCB_SECRET_KEY = process.env.COS_SECRET_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// 初始化 Cloudbase（需要腾讯云凭证）
const app = tcb.init({
  env: CLOUDBASE_ENV,
  secretId: TCB_SECRET_ID,
  secretKey: TCB_SECRET_KEY
});
const db = app.database();

// 要迁移的表列表
const TABLES = [
  'profiles',
  'posts',
  'comments',
  'likes',
  'follows',
  'reports',
  'trials',
  'trial_votes',
  'hidden_posts',
  'featured_posts',
  'user_ips',
  'user_devices',
  'banned_ips',
  'banned_devices'
];

// 迁移单个表
async function migrateTable(tableName) {
  console.log(`\n开始迁移表: ${tableName}`);

  try {
    // 1. 从 Supabase 读取数据
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .limit(10000);

    if (error) {
      console.error(`读取表 ${tableName} 失败:`, error.message);
      return { table: tableName, status: 'error', error: error.message };
    }

    if (!data || data.length === 0) {
      console.log(`表 ${tableName} 没有数据`);
      return { table: tableName, status: 'empty', count: 0 };
    }

    console.log(`从 Supabase 读取到 ${data.length} 条记录`);

    // 2. 批量写入 Cloudbase
    const batchSize = 100;
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize);
      
      try {
        // 转换数据格式（处理日期和UUID）
        const convertedBatch = batch.map(row => convertRow(row, tableName));
        
        await db.collection(tableName).add(convertedBatch);
        successCount += batch.length;
        console.log(`已写入 ${Math.min(i + batchSize, data.length)}/${data.length} 条`);
      } catch (err) {
        console.error(`批量写入失败:`, err.message);
        // 单条写入
        for (const row of batch) {
          try {
            await db.collection(tableName).add(convertRow(row, tableName));
            successCount++;
          } catch (e) {
            failCount++;
          }
        }
      }
    }

    console.log(`表 ${tableName} 迁移完成: 成功 ${successCount}, 失败 ${failCount}`);
    return { table: tableName, status: 'success', successCount, failCount };

  } catch (err) {
    console.error(`迁移表 ${tableName} 异常:`, err);
    return { table: tableName, status: 'error', error: err.message };
  }
}

// 转换数据格式
function convertRow(row, tableName) {
  const converted = { ...row };

  // 处理日期字段
  const dateFields = ['created_at', 'updated_at', 'resolved_at', 'hidden_at', 'featured_at', 'expires_at'];
  for (const field of dateFields) {
    if (converted[field] && typeof converted[field] === 'string') {
      converted[field] = new Date(converted[field]);
    }
  }

  // 确保有 id 字段
  if (!converted.id && converted.user_id && tableName === 'profiles') {
    converted.id = converted.user_id;
  }

  return converted;
}

// 主函数
async function migrate() {
  console.log('========== Supabase -> Cloudbase 数据迁移 ==========');
  console.log(`Cloudbase 环境: ${CLOUDBASE_ENV}`);
  console.log(`待迁移表数量: ${TABLES.length}`);

  const results = [];

  for (const table of TABLES) {
    const result = await migrateTable(table);
    results.push(result);
  }

  console.log('\n========== 迁移结果汇总 ==========');
  for (const r of results) {
    console.log(`${r.table}: ${r.status}${r.successCount ? ` (${r.successCount} 条)` : ''}${r.error ? ` - ${r.error}` : ''}`);
  }

  // 输出失败的表
  const failed = results.filter(r => r.status === 'error');
  if (failed.length > 0) {
    console.log('\n需要重新迁移的表:', failed.map(f => f.table).join(', '));
  }
}

migrate().catch(console.error);