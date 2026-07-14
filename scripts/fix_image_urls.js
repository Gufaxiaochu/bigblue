// 修复数据库中的图片URL
// 将旧的COS bucket名称替换为新的

const tcb = require('@cloudbase/node-sdk');

const app = tcb.init({
  env: 'cmfootball-d3gp9t11528eabd1f',
  secretId: 'AKIDd7NcdR0KDyiS8pRs66ub7PTIrEPPCnDk',
  secretKey: 'cGvU4eEkZEgvvdHkAPREoBPPBsV5a0FI'
});

const db = app.database();

// 旧的Supabase URL需要替换为COS URL
const SUPABASE_URL_PATTERN = /https:\/\/[^.]+\.supabase\.co\/storage\/v1\/object\/public\/posts\/.+/;
const NEW_IMAGE_BASE_URL = 'https://fotos-1259156410.cos.ap-guangzhou.myqcloud.com';

function replaceUrl(url) {
  if (!url) return url;
  // 如果是Supabase URL，提取文件名并生成新的COS URL
  if (url.includes('supabase.co')) {
    const match = url.match(/posts\/(.+)$/);
    if (match) {
      return `${NEW_IMAGE_BASE_URL}/posts/${match[1]}`;
    }
  }
  // 如果是旧的COS bucket名称，替换为新的
  return url.replace(/636d-cmfootball-d3gp9t11528eabd1f-1259156410/g, 'fotos-1259156410');
}

async function fixPosts() {
  console.log('开始修复posts表...');
  const posts = await db.collection('posts').get();
  let fixedCount = 0;

  for (const post of posts.data || []) {
    const updates = {};
    let needsUpdate = false;

    // 修复 image_urls
    if (post.image_urls && post.image_urls.length > 0) {
      const newUrls = post.image_urls.map(replaceUrl);
      if (JSON.stringify(newUrls) !== JSON.stringify(post.image_urls)) {
        updates.image_urls = newUrls;
        needsUpdate = true;
      }
    }

    // 修复 thumbnail_urls
    if (post.thumbnail_urls && post.thumbnail_urls.length > 0) {
      const newUrls = post.thumbnail_urls.map(replaceUrl);
      if (JSON.stringify(newUrls) !== JSON.stringify(post.thumbnail_urls)) {
        updates.thumbnail_urls = newUrls;
        needsUpdate = true;
      }
    }

    if (needsUpdate) {
      await db.collection('posts').doc(post._id).update(updates);
      fixedCount++;
      console.log(`修复帖子 ${post.id}`);
    }
  }

  console.log(`posts表修复完成，共修复 ${fixedCount} 条记录`);
}

async function fixComments() {
  console.log('开始修复comments表...');
  const comments = await db.collection('comments').get();
  let fixedCount = 0;

  for (const comment of comments.data || []) {
    const updates = {};
    let needsUpdate = false;

    // 修复 image_urls
    if (comment.image_urls && comment.image_urls.length > 0) {
      const newUrls = comment.image_urls.map(replaceUrl);
      if (JSON.stringify(newUrls) !== JSON.stringify(comment.image_urls)) {
        updates.image_urls = newUrls;
        needsUpdate = true;
      }
    }

    // 修复 thumbnail_urls
    if (comment.thumbnail_urls && comment.thumbnail_urls.length > 0) {
      const newUrls = comment.thumbnail_urls.map(replaceUrl);
      if (JSON.stringify(newUrls) !== JSON.stringify(comment.thumbnail_urls)) {
        updates.thumbnail_urls = newUrls;
        needsUpdate = true;
      }
    }

    if (needsUpdate) {
      await db.collection('comments').doc(comment._id).update(updates);
      fixedCount++;
      console.log(`修复评论 ${comment.id}`);
    }
  }

  console.log(`comments表修复完成，共修复 ${fixedCount} 条记录`);
}

async function fixProfiles() {
  console.log('开始修复profiles表...');
  const profiles = await db.collection('profiles').get();
  let fixedCount = 0;

  for (const profile of profiles.data || []) {
    const updates = {};
    let needsUpdate = false;

    // 修复 avatar_url
    if (profile.avatar_url) {
      const newUrl = replaceUrl(profile.avatar_url);
      if (newUrl !== profile.avatar_url) {
        updates.avatar_url = newUrl;
        needsUpdate = true;
      }
    }

    if (needsUpdate) {
      await db.collection('profiles').doc(profile._id).update(updates);
      fixedCount++;
      console.log(`修复用户 ${profile.id}`);
    }
  }

  console.log(`profiles表修复完成，共修复 ${fixedCount} 条记录`);
}

async function checkUrls() {
  console.log('检查posts表中的图片URL...');
  const posts = await db.collection('posts').limit(5).get();
  
  for (const post of posts.data || []) {
    console.log(`帖子 ${post.id}:`);
    console.log(`  image_urls:`, post.image_urls);
    console.log(`  thumbnail_urls:`, post.thumbnail_urls);
  }
}

async function main() {
  console.log('=== 开始修复图片URL ===');
  console.log('');

  await fixPosts();
  await fixComments();
  await fixProfiles();

  console.log('');
  console.log('=== 全部修复完成 ===');
}

main().catch(console.error);