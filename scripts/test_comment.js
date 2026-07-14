// 测试评论功能
const tcb = require('@cloudbase/node-sdk');

const app = tcb.init({
  env: 'cmfootball-d3gp9t11528eabd1f',
  secretId: 'AKIDd7NcdR0KDyiS8pRs66ub7PTIrEPPCnDk',
  secretKey: 'cGvU4eEkZEgvvdHkAPREoBPPBsV5a0FI'
});
const db = app.database();

async function testComment() {
  console.log('========== 测试评论功能 ==========\n');

  // 1. 获取一个帖子
  const posts = await db.collection('posts').limit(1).get();
  if (!posts.data || posts.data.length === 0) {
    console.log('没有找到帖子');
    return;
  }
  const post = posts.data[0];
  console.log(`测试帖子: ${post.title} (${post.id})\n`);

  // 2. 获取一个用户
  const users = await db.collection('profiles').limit(1).get();
  if (!users.data || users.data.length === 0) {
    console.log('没有找到用户');
    return;
  }
  const user = users.data[0];
  console.log(`测试用户: ${user.nickname || user.username} (${user.id})\n`);

  // 3. 测试创建评论
  const { v4: uuidv4 } = require('uuid');
  const commentId = uuidv4();
  
  try {
    await db.collection('comments').add({
      id: commentId,
      post_id: post.id,
      user_id: user.id,
      content: '测试评论内容',
      parent_id: null,
      image_urls: [],
      thumbnail_urls: [],
      likes_count: 0,
      created_at: new Date()
    });
    console.log('✓ 评论创建成功');
    console.log(`  评论ID: ${commentId}`);
    
    // 4. 检查评论是否存在
    const checkComment = await db.collection('comments').where({ id: commentId }).get();
    if (checkComment.data && checkComment.data.length > 0) {
      console.log('✓ 评论已保存到数据库');
      console.log(`  内容: ${checkComment.data[0].content}`);
      
      // 清理测试评论
      await db.collection('comments').where({ id: commentId }).remove();
      console.log('✓ 测试评论已清理');
    } else {
      console.log('✗ 评论未保存到数据库');
    }
  } catch (e) {
    console.log('✗ 评论创建失败:', e.message);
  }

  // 5. 检查最新的帖子
  console.log('\n========== 检查最新帖子 ==========\n');
  const latestPosts = await db.collection('posts')
    .orderBy('created_at', 'desc')
    .limit(5)
    .get();
  
  console.log('最新5个帖子:');
  (latestPosts.data || []).forEach((p, i) => {
    const date = new Date(p.created_at).toLocaleString('zh-CN');
    console.log(`  ${i+1}. ${p.title} - ${date}`);
  });
}

testComment().catch(console.error);