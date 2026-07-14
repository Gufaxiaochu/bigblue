// 检查帖子"你好妲己"
const tcb = require('@cloudbase/node-sdk');

const app = tcb.init({
  env: 'cmfootball-d3gp9t11528eabd1f',
  secretId: 'AKIDd7NcdR0KDyiS8pRs66ub7PTIrEPPCnDk',
  secretKey: 'cGvU4eEkZEgvvdHkAPREoBPPBsV5a0FI'
});
const db = app.database();

async function main() {
  console.log('========== 检查帖子 "你好妲己" ==========\n');

  // 获取所有帖子
  const result = await db.collection('posts').limit(1000).get();
  const posts = result.data || [];

  // 搜索目标帖子
  const target = posts.filter(p => p.title && p.title.includes('你好妲己'));
  
  if (target.length > 0) {
    target.forEach(p => {
      console.log(`帖子: ${p.title}`);
      console.log(`  ID: ${p.id}`);
      console.log(`  用户ID: ${p.user_id}`);
      console.log(`  创建时间: ${new Date(p.created_at).toLocaleString('zh-CN')}`);
      console.log(`  年份: ${new Date(p.created_at).getFullYear()}`);
    });
  } else {
    console.log('未找到帖子"你好妲己"');
  }

  // 检查隐藏帖子
  const hidden = await db.collection('hidden_posts').get();
  const hiddenIds = (hidden.data || []).map(h => h.post_id);
  console.log(`\n隐藏帖子数: ${hiddenIds.length}`);
  console.log('隐藏帖子ID:', hiddenIds.slice(0, 5).join(', '), '...');

  // 显示最新帖子排序
  console.log('\n========== 最新帖子排序 ==========\n');
  
  // 分离置顶帖和普通帖
  const pinnedPosts = posts.filter(p => new Date(p.created_at).getFullYear() > 2030);
  const normalPosts = posts.filter(p => new Date(p.created_at).getFullYear() <= 2030);
  
  // 排除隐藏帖子
  const visibleNormal = normalPosts.filter(p => !hiddenIds.includes(p.id));
  
  // 按时间排序
  visibleNormal.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  console.log(`置顶帖: ${pinnedPosts.length} 个`);
  console.log(`可见普通帖: ${visibleNormal.length} 个\n`);

  console.log('首页应该显示的帖子顺序（前15个）:');
  // 置顶帖 + 普通帖
  const finalPosts = [...pinnedPosts, ...visibleNormal];
  finalPosts.slice(0, 15).forEach((p, i) => {
    const date = new Date(p.created_at).toLocaleString('zh-CN');
    const year = new Date(p.created_at).getFullYear();
    const badge = year > 2030 ? '[置顶]' : '';
    console.log(`  ${i+1}. ${badge} ${p.title.substring(0, 25)} - ${date}`);
  });

  // 检查"你好妲己"在排序中的位置
  const idx = finalPosts.findIndex(p => p.title && p.title.includes('你好妲己'));
  if (idx >= 0) {
    console.log(`\n"你好妲己" 在第 ${idx + 1} 位`);
  }
}

main().catch(console.error);