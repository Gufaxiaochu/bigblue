// 诊断脚本：检查数据库中的图片URL
const tcb = require('@cloudbase/node-sdk');

const app = tcb.init({ 
  env: 'cmfootball-d3gp9t11528eabd1f',
  secretId: 'AKIDd7NcdR0KDyiS8pRs66ub7PTIrEPPCnDk',
  secretKey: 'cGvU4eEkZEgvvdHkAPREoBPPBsV5a0FI'
});
const db = app.database();

async function diagnose() {
  console.log('========== 图片URL诊断 ==========\n');

  // 1. 获取几个帖子
  const posts = await db.collection('posts').limit(5).get();
  console.log(`找到 ${posts.data?.length || 0} 个帖子\n`);

  for (const post of (posts.data || [])) {
    console.log(`帖子: ${post.title}`);
    console.log(`  ID: ${post.id}`);
    console.log(`  image_urls: ${post.image_urls?.length || 0} 个`);
    if (post.image_urls && post.image_urls.length > 0) {
      post.image_urls.forEach((url, i) => {
        console.log(`    ${i+1}. ${url.substring(0, 100)}...`);
      });
    }
    console.log(`  thumbnail_urls: ${post.thumbnail_urls?.length || 0} 个`);
    if (post.thumbnail_urls && post.thumbnail_urls.length > 0) {
      post.thumbnail_urls.forEach((url, i) => {
        console.log(`    ${i+1}. ${url.substring(0, 100)}...`);
      });
    }
    console.log('');
  }

  // 2. 获取几个用户
  const profiles = await db.collection('profiles').limit(5).get();
  console.log(`找到 ${profiles.data?.length || 0} 个用户\n`);

  for (const profile of (profiles.data || [])) {
    console.log(`用户: ${profile.nickname || profile.username || '匿名'}`);
    console.log(`  ID: ${profile.id}`);
    console.log(`  avatar_url: ${profile.avatar_url ? profile.avatar_url.substring(0, 100) + '...' : '无'}`);
    console.log('');
  }

  // 3. 统计URL类型
  let supabaseCount = 0;
  let cosCount = 0;
  let emptyCount = 0;

  const allPosts = await db.collection('posts').limit(1000).get();
  for (const post of (allPosts.data || [])) {
    if (post.image_urls) {
      post.image_urls.forEach(url => {
        if (url?.includes('supabase')) supabaseCount++;
        else if (url?.includes('fotos-1259156410')) cosCount++;
        else if (!url) emptyCount++;
      });
    }
    if (post.thumbnail_urls) {
      post.thumbnail_urls.forEach(url => {
        if (url?.includes('supabase')) supabaseCount++;
        else if (url?.includes('fotos-1259156410')) cosCount++;
        else if (!url) emptyCount++;
      });
    }
  }

  const allProfiles = await db.collection('profiles').limit(1000).get();
  for (const profile of (allProfiles.data || [])) {
    if (profile.avatar_url?.includes('supabase')) supabaseCount++;
    else if (profile.avatar_url?.includes('fotos-1259156410')) cosCount++;
    else if (!profile.avatar_url) emptyCount++;
  }

  console.log('========== URL统计 ==========');
  console.log(`Supabase URL: ${supabaseCount}`);
  console.log(`COS URL: ${cosCount}`);
  console.log(`空URL: ${emptyCount}`);
  console.log('');
}

diagnose().catch(console.error);