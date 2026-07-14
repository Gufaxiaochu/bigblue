// 测试发帖功能
const tcb = require('@cloudbase/node-sdk');
const { v4: uuidv4 } = require('uuid');

const app = tcb.init({
  env: 'cmfootball-d3gp9t11528eabd1f',
  secretId: 'AKIDd7NcdR0KDyiS8pRs66ub7PTIrEPPCnDk',
  secretKey: 'cGvU4eEkZEgvvdHkAPREoBPPBsV5a0FI'
});
const db = app.database();

async function testCreatePost() {
  console.log('========== 测试发帖功能 ==========\n');

  // 获取一个用户
  const users = await db.collection('profiles').limit(1).get();
  if (!users.data || users.data.length === 0) {
    console.log('没有找到用户');
    return;
  }
  const user = users.data[0];
  console.log(`使用用户: ${user.nickname || user.username} (${user.id})\n`);

  // 创建测试帖子
  const postId = uuidv4();
  const postData = {
    id: postId,
    user_id: user.id,
    title: `测试帖子 ${Date.now()}`,
    content: '这是一条测试内容',
    image_urls: [],
    thumbnail_urls: [],
    category: 'default',
    content_type: 'text',
    likes_count: 0,
    comments_count: 0,
    views: 0,
    created_at: new Date()
  };

  console.log('尝试创建帖子...');
  console.log(`  标题: ${postData.title}`);

  try {
    await db.collection('posts').add(postData);
    console.log('✓ 帖子创建成功');
    console.log(`  ID: ${postId}`);

    // 验证帖子是否存在
    const check = await db.collection('posts').where({ id: postId }).get();
    if (check.data && check.data.length > 0) {
      console.log('✓ 帖子已保存到数据库');
      console.log(`  标题: ${check.data[0].title}`);
      
      // 清理测试帖子
      await db.collection('posts').where({ id: postId }).remove();
      console.log('✓ 测试帖子已清理');
    } else {
      console.log('✗ 帖子未保存到数据库');
    }
  } catch (e) {
    console.log('✗ 发帖失败:', e.message);
    console.log('  错误:', e);
  }
}

testCreatePost().catch(console.error);