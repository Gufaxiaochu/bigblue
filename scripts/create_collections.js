// 创建缺失的集合
const tcb = require('@cloudbase/node-sdk');

const app = tcb.init({
  env: 'cmfootball-d3gp9t11528eabd1f',
  secretId: 'AKIDd7NcdR0KDyiS8pRs66ub7PTIrEPPCnDk',
  secretKey: 'cGvU4eEkZEgvvdHkAPREoBPPBsV5a0FI'
});
const db = app.database();

async function main() {
  console.log('========== 创建缺失的集合 ==========\n');
  
  // 尝试创建 notifications 集合（通过插入一条测试数据）
  try {
    const testNotif = {
      id: 'test-' + Date.now(),
      recipient_id: 'test',
      actor_id: 'test',
      type: 'like',
      post_id: null,
      read: true,
      created_at: new Date()
    };
    
    await db.collection('notifications').add(testNotif);
    console.log('✓ notifications 集合已创建');
    
    // 删除测试数据
    await db.collection('notifications').where({ id: testNotif.id }).remove();
    console.log('✓ 测试数据已清理');
  } catch (e) {
    if (e.message.includes('already exist')) {
      console.log('✓ notifications 集合已存在');
    } else {
      console.log('创建 notifications 失败:', e.message);
    }
  }
  
  // 检查现有集合
  console.log('\n现有集合:');
  const collections = ['profiles', 'posts', 'comments', 'likes', 'follows', 'reports', 'trials', 'trial_votes', 'hidden_posts', 'featured_posts', 'user_ips', 'user_devices', 'banned_ips', 'banned_devices', 'notifications'];
  
  for (const col of collections) {
    try {
      const count = await db.collection(col).count();
      console.log(`  ${col}: ${count.total} 条`);
    } catch (e) {
      console.log(`  ${col}: 不存在`);
    }
  }
}

main().catch(console.error);