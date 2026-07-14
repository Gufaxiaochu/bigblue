// Cloudbase 云函数 - API 主入口
// 包含：用户注册/登录、帖子CRUD、评论CRUD、文件上传等

const tcb = require('@cloudbase/node-sdk');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const cos = require('cos-nodejs-sdk-v5');

// 初始化 Cloudbase SDK
// 使用 SecretId/SecretKey 确保有数据库写权限
const app = tcb.init({
  env: 'cmfootball-d3gp9t11528eabd1f',
  region: 'ap-shanghai',
  secretId: process.env.COS_SECRET_ID || 'AKIDd7NcdR0KDyiS8pRs66ub7PTIrEPPCnDk',
  secretKey: process.env.COS_SECRET_KEY || 'cGvU4eEkZEgvvdHkAPREoBPPBsV5a0FI'
});

const db = app.database();
const _ = db.command;

// JWT 配置
const JWT_SECRET = process.env.JWT_SECRET || 'bigblue-secret-key-change-in-production';
const JWT_EXPIRES_IN = '7d';

// COS 配置（腾讯云对象存储）
const COS_SECRET_ID = process.env.COS_SECRET_ID || 'AKIDd7NcdR0KDyiS8pRs66ub7PTIrEPPCnDk';
const COS_SECRET_KEY = process.env.COS_SECRET_KEY || 'cGvU4eEkZEgvvdHkAPREoBPPBsV5a0FI';
const COS_BUCKET = process.env.COS_BUCKET || 'fotos-1259156410';
const COS_REGION = process.env.COS_REGION || 'ap-guangzhou';

const cosClient = new cos({
  SecretId: COS_SECRET_ID,
  SecretKey: COS_SECRET_KEY
});

// 超级管理员手机号
const SUPER_ADMIN_PHONE = '19256680343';

// ============ 工具函数 ============

// 通过自定义 id 查询文档（因为 CloudBase 使用 _id 作为主键）
async function findByCustomId(collection, id) {
  const result = await db.collection(collection).where({ id }).get();
  return result.data?.[0] || null;
}

// 通过自定义 id 更新文档
async function updateByCustomId(collection, id, data) {
  const doc = await findByCustomId(collection, id);
  if (!doc) return false;
  await db.collection(collection).doc(doc._id).update(data);
  return true;
}

// 通过自定义 id 删除文档
async function deleteByCustomId(collection, id) {
  const doc = await findByCustomId(collection, id);
  if (!doc) return false;
  await db.collection(collection).doc(doc._id).remove();
  return true;
}

// 生成 JWT
function generateToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

// 验证 JWT
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

// 从请求头获取用户 ID
function getUserIdFromHeader(event) {
  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.slice(7);
  const decoded = verifyToken(token);
  return decoded?.userId || null;
}

// 检查是否为超级管理员
async function isSuperAdmin(userId) {
  const user = await findByCustomId('profiles', userId);
  if (!user) return false;
  return user.phone === SUPER_ADMIN_PHONE;
}

// ============ 用户相关 API ============

// 注册（支持邮箱或手机号）
async function register(body) {
  const { email, phone, password, nickname, device_id } = body;

  if (!password || !nickname) {
    return { code: 400, message: '密码、昵称不能为空' };
  }

  if (!email && !phone) {
    return { code: 400, message: '邮箱或手机号不能为空' };
  }

  // 检查设备是否被封禁
  if (device_id) {
    const bannedDevice = await db.collection('banned_devices')
      .where({ device_id })
      .get();
    if (bannedDevice.data && bannedDevice.data.length > 0) {
      return { code: 403, message: '该设备已被封禁，无法注册新账号' };
    }
  }

  // 检查是否已注册
  let existUser;
  if (email) {
    existUser = await db.collection('profiles')
      .where({ email })
      .get();
  } else {
    existUser = await db.collection('profiles')
      .where({ phone })
      .get();
  }
  if (existUser.data && existUser.data.length > 0) {
    return { code: 400, message: '该账号已注册' };
  }

  const userId = uuidv4();
  const hashedPassword = await bcrypt.hash(password, 10);

  // 创建用户
  await db.collection('profiles').add({
    id: userId,
    email: email || null,
    phone: phone || null,
    password: hashedPassword,
    nickname,
    username: nickname,
    avatar_url: null,
    created_at: new Date(),
    followers_count: 0,
    following_count: 0
  });

  // 记录设备
  if (device_id) {
    await db.collection('user_devices').add({
      user_id: userId,
      device_id,
      created_at: new Date()
    });
  }

  // 记录 IP（如果传了 IP）
  if (body.ip) {
    await db.collection('user_ips').add({
      user_id: userId,
      ip: body.ip,
      created_at: new Date()
    });
  }

  const token = generateToken(userId);
  return {
    code: 200,
    data: {
      user: { id: userId, email, phone, nickname },
      token
    }
  };
}

// 登录（支持邮箱或手机号）
async function login(body) {
  const { email, phone, password } = body;

  if (!password) {
    return { code: 400, message: '密码不能为空' };
  }

  let user;
  if (email) {
    user = await db.collection('profiles')
      .where({ email })
      .get();
  } else if (phone) {
    user = await db.collection('profiles')
      .where({ phone })
      .get();
  } else {
    return { code: 400, message: '邮箱或手机号不能为空' };
  }

  if (!user.data || user.data.length === 0) {
    return { code: 401, message: '账号或密码错误' };
  }

  const profile = user.data[0];
  const validPassword = await bcrypt.compare(password, profile.password);
  if (!validPassword) {
    return { code: 401, message: '账号或密码错误' };
  }

  const token = generateToken(profile.id);
  return {
    code: 200,
    data: {
      user: {
        id: profile.id,
        email: profile.email,
        phone: profile.phone,
        nickname: profile.nickname,
        avatar_url: profile.avatar_url
      },
      token
    }
  };
}

// 获取用户信息
async function getProfile(userId) {
  // 使用 where 查询，因为我们的 id 字段不是 _id
  const result = await db.collection('profiles').where({ id: userId }).get();
  if (!result.data || result.data.length === 0) {
    return { code: 404, message: '用户不存在' };
  }
  const profile = result.data[0];
  delete profile.password;
  return { code: 200, data: profile };
}

// 更新用户信息
async function updateProfile(userId, body) {
  if (!userId) {
    return { code: 401, message: '用户未登录' };
  }

  const { username, bio, avatar_url } = body;
  const updates = {};
  
  if (username) updates.username = username;
  if (bio !== undefined) updates.bio = bio;
  if (avatar_url) updates.avatar_url = avatar_url;

  await updateByCustomId('profiles', userId, updates);
  
  return { code: 200, message: '更新成功' };
}

// ============ 帖子相关 API ============

// 获取帖子列表
async function getPosts(query) {
  const { page, offset, limit = 10, category, sort = 'latest' } = query;
  
  // 兼容 offset 和 page 两种参数
  let skip = 0;
  if (offset !== undefined) {
    skip = parseInt(offset) || 0;
  } else if (page !== undefined) {
    skip = (parseInt(page) - 1) * limit;
  }

  let posts = [];

  // 分批获取所有帖子（每次1000条）
  let batch = 0;
  let hasMore = true;
  while (hasMore) {
    let dbQuery = db.collection('posts');
    
    // 分类筛选
    if (category) {
      dbQuery = dbQuery.where({ category });
    }
    
    const result = await dbQuery.skip(batch * 1000).limit(1000).get();
    const batchPosts = result.data || [];
    
    if (batchPosts.length === 0) {
      hasMore = false;
    } else {
      posts = posts.concat(batchPosts);
      batch++;
      // 防止无限循环，最多加载 5000 条
      if (batch >= 5) break;
    }
  }

  // 排除隐藏帖子
  const hiddenPosts = await db.collection('hidden_posts').limit(1000).get();
  const hiddenIds = (hiddenPosts.data || []).map(h => h.post_id);

  // 过滤隐藏帖子
  if (hiddenIds.length > 0) {
    posts = posts.filter(p => !hiddenIds.includes(p.id));
  }

  // 分离置顶帖（2099年）和普通帖
  const pinnedPosts = posts.filter(p => {
    const year = new Date(p.created_at).getFullYear();
    return year > 2030; // 置顶帖
  });
  
  const normalPosts = posts.filter(p => {
    const year = new Date(p.created_at).getFullYear();
    return year <= 2030; // 普通帖
  });

  // 客户端排序
  if (sort === 'hot') {
    normalPosts.sort((a, b) => (b.likes_count || 0) - (a.likes_count || 0));
  } else {
    // 按时间排序（最新优先）
    normalPosts.sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return dateB - dateA;
    });
  }

  // 置顶帖排最前面，然后是普通帖
  const sortedPosts = [...pinnedPosts, ...normalPosts];

  // 分页
  const paginatedPosts = sortedPosts.slice(skip, skip + limit);

  // 获取作者信息
  console.log('[getPosts] paginatedPosts count:', paginatedPosts.length);
  console.log('[getPosts] first post:', paginatedPosts[0]);
  
  const userIds = [...new Set(paginatedPosts.map(p => p.user_id).filter(Boolean))];
  console.log('[getPosts] userIds:', userIds);
  
  if (userIds.length === 0) {
    console.log('[getPosts] No userIds found in posts');
    return { code: 200, data: paginatedPosts };
  }
  
  const users = await db.collection('profiles')
    .where({ id: _.in(userIds) })
    .get();
  console.log('[getPosts] users found:', users.data?.length);
  
  const userMap = {};
  (users.data || []).forEach(u => {
    userMap[u.id] = { id: u.id, nickname: u.nickname || u.username || '匿名', avatar_url: u.avatar_url };
  });
  console.log('[getPosts] userMap:', userMap);

  const postsWithAuthor = paginatedPosts.map(p => ({
    ...p,
    profiles: userMap[p.user_id] || null
  }));

  return { code: 200, data: postsWithAuthor };
}

// 获取帖子详情
async function getPostDetail(postId) {
  // 使用 where 查询，因为我们的 id 字段不是 _id
  const postResult = await db.collection('posts').where({ id: postId }).get();
  if (!postResult.data || postResult.data.length === 0) {
    return { code: 404, message: '帖子不存在' };
  }

  const postData = postResult.data[0];

  // 获取作者信息
  const authorResult = await db.collection('profiles').where({ id: postData.user_id }).get();
  postData.profiles = authorResult.data?.[0] || null;

  return { code: 200, data: postData };
}

// 发布帖子
async function createPost(userId, body) {
  const { title, content, image_urls, thumbnail_urls, category, content_type, poll_options } = body;

  console.log('[createPost] 开始执行');
  console.log('[createPost] userId:', userId);
  console.log('[createPost] title:', title);

  if (!title || !content) {
    console.log('[createPost] 错误：标题或内容为空');
    return { success: false, code: 400, message: '标题和内容不能为空' };
  }

  if (!userId) {
    console.log('[createPost] 错误：用户未登录');
    return { success: false, code: 401, message: '用户未登录' };
  }

  const postId = uuidv4();
  const postData = {
    id: postId,
    user_id: userId,
    title,
    content,
    image_urls: image_urls || [],
    thumbnail_urls: thumbnail_urls || [],
    category: category || 'default',
    content_type: content_type || 'text',
    poll_options: poll_options || null,
    likes_count: 0,
    comments_count: 0,
    views: 0,
    created_at: new Date()
  };

  console.log('[createPost] 准备插入数据, ID:', postId);

  try {
    // 使用 await 直接等待（不使用回调）
    const result = await db.collection('posts').add(postData);
    console.log('[createPost] 插入返回:', JSON.stringify(result));
    
    // 验证数据是否写入
    const verify = await db.collection('posts').where({ id: postId }).get();
    console.log('[createPost] 验证结果:', verify.data?.length || 0, '条');
    
    if (verify.data && verify.data.length > 0) {
      console.log('[createPost] 成功');
      return { success: true, code: 200, data: { id: postId } };
    } else {
      console.error('[createPost] 验证失败：数据未写入');
      return { success: false, code: 500, message: '数据写入失败' };
    }
  } catch (err) {
    console.error('[createPost] 插入异常:', err);
    return { success: false, code: 500, message: '发布失败', error: err.message };
  }
}

// 删除帖子
async function deletePost(userId, postId) {
  const post = await findByCustomId('posts', postId);
  if (!post) {
    return { code: 404, message: '帖子不存在' };
  }

  if (post.user_id !== userId) {
    // 检查是否为超管
    const isAdmin = await isSuperAdmin(userId);
    if (!isAdmin) {
      return { code: 403, message: '无权删除该帖子' };
    }
  }

  await deleteByCustomId('posts', postId);
  await db.collection('comments').where({ post_id: postId }).remove();

  return { code: 200, message: '删除成功' };
}

// ============ 评论相关 API ============

// 获取评论列表
async function getComments(postId, query) {
  const { page = 1, limit = 20 } = query;
  const skip = (page - 1) * limit;

  const comments = await db.collection('comments')
    .where({ post_id: postId })
    .orderBy('created_at', 'desc')
    .skip(skip)
    .limit(limit)
    .get();

  // 获取评论者信息
  const userIds = [...new Set((comments.data || []).map(c => c.user_id))];
  const users = await db.collection('profiles')
    .where({ id: _.in(userIds) })
    .get();
  const userMap = {};
  (users.data || []).forEach(u => {
    userMap[u.id] = { id: u.id, nickname: u.nickname || u.username || '匿名', avatar_url: u.avatar_url };
  });

  const commentsWithAuthor = (comments.data || []).map(c => ({
    ...c,
    profiles: userMap[c.user_id] || null
  }));

  return { code: 200, data: commentsWithAuthor };
}

// 发布评论
async function createComment(userId, body) {
  const { post_id, content, parent_id, image_urls, thumbnail_urls } = body;

  if (!post_id || !content) {
    return { code: 400, message: '帖子ID和内容不能为空' };
  }

  const commentId = uuidv4();
  await db.collection('comments').add({
    id: commentId,
    post_id,
    user_id: userId,
    content,
    parent_id: parent_id || null,
    image_urls: image_urls || [],
    thumbnail_urls: thumbnail_urls || [],
    likes_count: 0,
    created_at: new Date()
  });

  // 增加帖子评论数
  await updateByCustomId('posts', post_id, {
    comments_count: _.inc(1)
  });

  return { code: 200, data: { id: commentId } };
}

// 删除评论
async function deleteComment(userId, commentId) {
  if (!userId) {
    return { code: 401, message: '用户未登录' };
  }

  const comment = await findByCustomId('comments', commentId);
  if (!comment) {
    return { code: 404, message: '评论不存在' };
  }

  if (comment.user_id !== userId) {
    return { code: 403, message: '无权删除该评论' };
  }

  await deleteByCustomId('comments', commentId);
  
  // 减少帖子评论数
  await updateByCustomId('posts', comment.post_id, {
    comments_count: _.inc(-1)
  });

  return { code: 200, message: '删除成功' };
}

// ============ 文件上传 API ============

// 上传图片到 COS
async function uploadImage(userId, body) {
  const { file_base64, filename, folder = 'posts' } = body;

  if (!file_base64 || !filename) {
    return { code: 400, message: '文件内容不能为空' };
  }

  const buffer = Buffer.from(file_base64, 'base64');
  const key = `${folder}/${userId}/${Date.now()}_${filename}`;

  return new Promise((resolve) => {
    cosClient.putObject({
      Bucket: COS_BUCKET,
      Region: COS_REGION,
      Key: key,
      Body: buffer
    }, async (err, data) => {
      if (err) {
        resolve({ code: 500, message: '上传失败', error: err.message });
        return;
      }

      const url = `https://${COS_BUCKET}.cos.${COS_REGION}.myqcloud.com/${key}`;
      resolve({ code: 200, data: { url, key } });
    });
  });
}

// ============ 热榜相关 API ============

// 获取今日热榜（24小时内）
async function getHotPosts(query) {
  const { limit = 30 } = query;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const posts = await db.collection('posts')
    .where({ created_at: _.gte(since) })
    .orderBy('likes_count', 'desc')
    .limit(limit)
    .get();

  return { code: 200, data: posts.data || [] };
}

// 获取历史总热榜
async function getAllTimeHotPosts(query) {
  const { limit = 30 } = query;

  const posts = await db.collection('posts')
    .orderBy('likes_count', 'desc')
    .limit(limit)
    .get();

  return { code: 200, data: posts.data || [] };
}

// ============ 公审相关 API ============

// 获取公审列表
async function getTrials() {
  const trials = await db.collection('trials')
    .where({ status: _.in(['active', 'violate']) })
    .orderBy('created_at', 'desc')
    .get();

  // 获取帖子信息
  const postIds = [...new Set((trials.data || []).map(t => t.post_id))];
  const posts = await db.collection('posts')
    .where({ id: _.in(postIds) })
    .get();
  const postMap = {};
  (posts.data || []).forEach(p => {
    postMap[p.id] = p;
  });

  const trialsWithPost = (trials.data || []).map(t => ({
    ...t,
    post: postMap[t.post_id] || null
  }));

  return { code: 200, data: trialsWithPost };
}

// 投票
async function voteTrial(userId, body) {
  const { trial_id, verdict } = body;

  if (!trial_id || !verdict) {
    return { code: 400, message: '参数错误' };
  }

  // 检查是否已投票
  const existVote = await db.collection('trial_votes')
    .where({ trial_id, user_id: userId })
    .get();

  if (existVote.data && existVote.data.length > 0) {
    return { code: 400, message: '您已投过票' };
  }

  await db.collection('trial_votes').add({
    id: uuidv4(),
    trial_id,
    user_id: userId,
    verdict,
    created_at: new Date()
  });

  // 更新票数
  const field = verdict === 'violate' ? 'violate_count' : 'clean_count';
  await updateByCustomId('trials', trial_id, {
    [field]: _.inc(1)
  });

  return { code: 200, message: '投票成功' };
}

// 超管处理公审
async function resolveTrial(userId, body) {
  const { trial_id, action } = body; // action: 'delete' | 'keep'

  const isAdmin = await isSuperAdmin(userId);
  if (!isAdmin) {
    return { code: 403, message: '无权限' };
  }

  const trial = await findByCustomId('trials', trial_id);
  if (!trial) {
    return { code: 404, message: '公审不存在' };
  }

  if (action === 'delete') {
    // 隐藏帖子
    await db.collection('hidden_posts').add({
      post_id: trial.post_id,
      hidden_by: userId,
      hidden_at: new Date()
    });
  }

  // 结案
  await updateByCustomId('trials', trial_id, {
    status: 'resolved',
    resolved_at: new Date()
  });

  return { code: 200, message: '处理成功' };
}

// ============ 其他辅助接口 ============

// 获取用户总数
async function getUserCount() {
  const result = await db.collection('profiles').count();
  return { code: 200, data: { count: result.total || 0 } };
}

// 获取分区列表
async function getCategories() {
  // 从帖子中提取所有分区
  const posts = await db.collection('posts').field({ category: true }).get();
  const categories = [...new Set((posts.data || []).map(p => p.category).filter(Boolean))];
  return { code: 200, data: categories };
}

// 获取分区帖子
async function getCategoryPosts(data) {
  const { category, page = 1, limit = 20 } = data;
  const skip = (page - 1) * limit;

  const posts = await db.collection('posts')
    .where({ category })
    .orderBy('created_at', 'desc')
    .skip(skip)
    .limit(limit)
    .get();

  // 获取作者信息
  const userIds = [...new Set((posts.data || []).map(p => p.user_id))];
  const users = await db.collection('profiles')
    .where({ id: _.in(userIds) })
    .get();
  const userMap = {};
  (users.data || []).forEach(u => {
    userMap[u.id] = { id: u.id, nickname: u.nickname || u.username || '匿名', username: u.username, avatar_url: u.avatar_url };
  });

  const postsWithAuthor = (posts.data || []).map(p => ({
    ...p,
    profiles: userMap[p.user_id] || null
  }));

  return { code: 200, data: postsWithAuthor };
}

// 搜索帖子
async function searchPosts(data) {
  const { keyword, limit = 20 } = data;
  if (!keyword) return { code: 400, message: '关键词不能为空' };

  const posts = await db.collection('posts')
    .where(_.or([
      { title: db.RegExp({ regexp: keyword, options: 'i' }) },
      { content: db.RegExp({ regexp: keyword, options: 'i' }) }
    ]))
    .orderBy('created_at', 'desc')
    .limit(limit)
    .get();

  // 获取作者信息
  const userIds = [...new Set((posts.data || []).map(p => p.user_id))];
  const users = await db.collection('profiles')
    .where({ id: _.in(userIds) })
    .get();
  const userMap = {};
  (users.data || []).forEach(u => {
    userMap[u.id] = { id: u.id, nickname: u.nickname || u.username || '匿名', username: u.username, avatar_url: u.avatar_url };
  });

  const postsWithAuthor = (posts.data || []).map(p => ({
    ...p,
    profiles: userMap[p.user_id] || null
  }));

  return { code: 200, data: postsWithAuthor };
}

// 搜索用户
async function searchUsers(data) {
  const { keyword, limit = 20 } = data;
  if (!keyword) return { code: 400, message: '关键词不能为空' };

  const users = await db.collection('profiles')
    .where(_.or([
      { nickname: db.RegExp({ regexp: keyword, options: 'i' }) },
      { username: db.RegExp({ regexp: keyword, options: 'i' }) }
    ]))
    .limit(limit)
    .get();

  // 移除密码字段
  const safeUsers = (users.data || []).map(u => {
    const { password, ...rest } = u;
    return rest;
  });

  return { code: 200, data: safeUsers };
}

// 获取精选帖子（推荐）
async function getFeaturedPosts(limit = 10) {
  const posts = await db.collection('posts')
    .orderBy('likes_count', 'desc')
    .limit(limit)
    .get();

  // 获取作者信息
  const userIds = [...new Set((posts.data || []).map(p => p.user_id))];
  const users = await db.collection('profiles')
    .where({ id: _.in(userIds) })
    .get();
  const userMap = {};
  (users.data || []).forEach(u => {
    userMap[u.id] = { id: u.id, nickname: u.nickname || u.username || '匿名', username: u.username, avatar_url: u.avatar_url };
  });

  const postsWithAuthor = (posts.data || []).map(p => ({
    ...p,
    profiles: userMap[p.user_id] || null
  }));

  return { code: 200, data: postsWithAuthor };
}

// 检查用户名是否可用
async function checkUsername(data) {
  const { username } = data;
  if (!username) return { code: 400, message: '用户名不能为空' };

  const exist = await db.collection('profiles')
    .where(_.or([{ username }, { nickname: username }]))
    .get();

  return { code: 200, data: { available: !(exist.data && exist.data.length > 0) } };
}

// 创建用户资料（注册后调用）
async function createProfile(data) {
  const { userId, nickname, email } = data;
  if (!userId || !nickname) {
    return { code: 400, message: '参数不完整' };
  }

  await db.collection('profiles').add({
    id: userId,
    nickname,
    username: nickname,
    email: email || null,
    avatar_url: null,
    created_at: new Date(),
    followers_count: 0,
    following_count: 0
  });

  return { code: 200, message: '创建成功' };
}

// 获取隐藏帖子ID列表
async function getHiddenPostIds() {
  const hidden = await db.collection('hidden_posts').get();
  const ids = (hidden.data || []).map(h => h.post_id);
  return { code: 200, data: ids };
}

// 获取公告
async function getAnnouncement() {
  const result = await db.collection('site_content')
    .where({ key: 'announcement' })
    .get();

  if (result.data && result.data.length > 0) {
    return { code: 200, data: result.data[0] };
  }
  return { code: 200, data: null };
}

// ============ 点赞相关 API ============

// 点赞/取消点赞
async function toggleLike(userId, postId) {
  if (!userId) {
    return { code: 401, message: '用户未登录' };
  }

  // 检查是否已点赞
  const existing = await db.collection('likes')
    .where({ user_id: userId, post_id: postId })
    .get();

  if (existing.data && existing.data.length > 0) {
    // 取消点赞
    await db.collection('likes').doc(existing.data[0]._id).remove();
    await updateByCustomId('posts', postId, { likes_count: _.inc(-1) });
    return { code: 200, data: { liked: false } };
  } else {
    // 点赞
    await db.collection('likes').add({
      id: uuidv4(),
      user_id: userId,
      post_id: postId,
      created_at: new Date()
    });
    await updateByCustomId('posts', postId, { likes_count: _.inc(1) });
    return { code: 200, data: { liked: true } };
  }
}

// ============ 关注相关 API ============

// 关注/取消关注
async function toggleFollow(userId, targetUserId) {
  if (!userId) {
    return { code: 401, message: '用户未登录' };
  }

  if (userId === targetUserId) {
    return { code: 400, message: '不能关注自己' };
  }

  // 检查是否已关注
  const existing = await db.collection('follows')
    .where({ follower_id: userId, following_id: targetUserId })
    .get();

  if (existing.data && existing.data.length > 0) {
    // 取消关注
    await db.collection('follows').doc(existing.data[0]._id).remove();
    await updateByCustomId('profiles', userId, { following_count: _.inc(-1) });
    await updateByCustomId('profiles', targetUserId, { followers_count: _.inc(-1) });
    return { code: 200, data: { isFollowing: false } };
  } else {
    // 关注
    await db.collection('follows').add({
      id: uuidv4(),
      follower_id: userId,
      following_id: targetUserId,
      created_at: new Date()
    });
    await updateByCustomId('profiles', userId, { following_count: _.inc(1) });
    await updateByCustomId('profiles', targetUserId, { followers_count: _.inc(1) });
    return { code: 200, data: { isFollowing: true } };
  }
}

// 检查关注状态
async function checkFollowStatus(userId, targetUserId) {
  if (!userId) {
    return { code: 200, data: { isFollowing: false } };
  }

  const existing = await db.collection('follows')
    .where({ follower_id: userId, following_id: targetUserId })
    .get();

  return { code: 200, data: { isFollowing: existing.data && existing.data.length > 0 } };
}

// ============ 举报相关 API ============

// 创建举报
async function createReport(userId, body) {
  if (!userId) {
    return { code: 401, message: '用户未登录' };
  }

  const { post_id, comment_id, target_user_id, reason, type } = body;

  await db.collection('reports').add({
    id: uuidv4(),
    user_id: userId,
    post_id: post_id || null,
    comment_id: comment_id || null,
    target_user_id: target_user_id || null,
    reason: reason || '',
    type: type || 'post',
    created_at: new Date()
  });

  return { code: 200, message: '举报成功' };
}

// ============ 云函数入口 ============

exports.main = async (event, context) => {
  const { action, ...data } = event;

  // 如果没有 action，尝试从 path 路由（兼容旧方式）
  if (!action) {
    const { path, method, body, query, headers } = event;
    const routes = {
      'POST /auth/register': () => register(body),
      'POST /auth/login': () => login(body),
      'GET /auth/profile': () => getProfile(getUserIdFromHeader(event)),
      'GET /posts': () => getPosts(query),
      'GET /posts/:id': () => getPostDetail(query.id),
      'POST /posts': () => createPost(getUserIdFromHeader(event), body),
      'DELETE /posts/:id': () => deletePost(getUserIdFromHeader(event), query.id),
      'GET /comments': () => getComments(query.post_id, query),
      'POST /comments': () => createComment(getUserIdFromHeader(event), body),
      'POST /upload': () => uploadImage(getUserIdFromHeader(event), body),
      'GET /hot': () => getHotPosts(query),
      'GET /hot/all': () => getAllTimeHotPosts(query),
      'GET /trials': () => getTrials(),
      'POST /trials/vote': () => voteTrial(getUserIdFromHeader(event), body),
      'POST /trials/resolve': () => resolveTrial(getUserIdFromHeader(event), body)
    };

    const route = `${method} ${path}`;
    const handler = routes[route];

    if (!handler) {
      return { code: 404, message: '接口不存在' };
    }

    try {
      return await handler();
    } catch (err) {
      console.error('API Error:', err);
      return { code: 500, message: '服务器错误', error: err.message };
    }
  }

  // action 路由（前端 SDK 调用）
  const actionHandlers = {
    'auth/login': () => login(data),
    'auth/register': () => register(data),
    'auth/update-password': () => updatePassword(data.userId, data.password),
    'posts/list': () => getPosts(data),
    'posts/detail': () => getPostDetail(data.postId),
    'posts/create': () => createPost(data.userId, data),
    'posts/update': () => updatePost(data.userId, data.postId, data),
    'posts/delete': () => deletePost(data.userId, data.postId),
    'posts/hot': () => getHotPosts(data),
    'posts/all-time-hot': () => getAllTimeHotPosts(data),
    'posts/featured': () => getFeaturedPosts(data.limit),
    'posts/categories': () => getCategories(),
    'posts/category': () => getCategoryPosts(data),
    'posts/search': () => searchPosts(data),
    'posts/hiddenIds': () => getHiddenPostIds(),
    'posts/user-posts': () => getUserPosts(data.userId, data),
    'posts/increment-views': () => incrementViews(data.postId),
    'comments/list': () => getComments(data.postId, data),
    'comments/create': () => createComment(data.userId, data),
    'comments/delete': () => deleteComment(data.userId, data.commentId),
    'users/profile': () => getProfile(data.userId),
    'users/update': () => updateProfile(data.userId, data),
    'users/count': () => getUserCount(),
    'users/search': () => searchUsers(data),
    'users/checkUsername': () => checkUsername(data),
    'users/createProfile': () => createProfile(data),
    'users/update-ip': () => updateUserIp(data.userId, data.ip),
    'users/update-device': () => updateUserDevice(data.userId, data.deviceId),
    'likes/toggle': () => toggleLike(data.userId, data.postId),
    'follows/toggle': () => toggleFollow(data.userId, data.targetUserId),
    'follows/check': () => checkFollowStatus(data.userId, data.targetUserId),
    'reports/create': () => createReport(data.userId, data),
    'trials/list': () => getTrials(),
    'trials/vote': () => voteTrial(data.userId, data),
    'trials/my-votes': () => getMyVotes(data.userId, data.trialIds),
    'upload/image': () => uploadImage(data.userId, data),
    'site/content': () => getSiteContent(data.keys),
    'site/announcement': () => getAnnouncement(),
    'notifications/list': () => getNotifications(data.userId, data),
    'notifications/unread-count': () => getUnreadCount(data.userId),
    'notifications/mark-read': () => markNotificationRead(data.userId, data.notifId),
    'notifications/mark-all-read': () => markAllNotificationsRead(data.userId),
    'admin/check-ip-banned': () => checkIpBanned(data.ip),
    'admin/check-device-banned': () => checkDeviceBanned(data.deviceId),
    'admin/hide-post': () => hidePost(data.userId, data.postId),
    'admin/unhide-post': () => unhidePost(data.userId, data.postId),
    'admin/resolve-trial': () => resolveTrialAction(data.userId, data.trialId),
    'admin/delete-trial-post': () => deleteTrialPost(data.userId, data.trialId)
  };

  const handler = actionHandlers[action];

  if (!handler) {
    return { success: false, error: '未知的 action: ' + action };
  }

  try {
    const result = await handler();
    return { success: true, ...result };
  } catch (err) {
    console.error('API Error:', err);
    return { success: false, error: err.message };
  }
};

// ============ 额外的辅助函数 ============

// 获取用户投票记录
async function getMyVotes(userId, trialIds) {
  const votes = await db.collection('trial_votes')
    .where({
      user_id: userId,
      trial_id: _.in(trialIds)
    })
    .get();
  return { code: 200, data: votes.data || [] };
}

// 更新密码
async function updatePassword(userId, newPassword) {
  if (!newPassword || newPassword.length < 6) {
    return { code: 400, message: '密码至少需要6位' };
  }
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await updateByCustomId('profiles', userId, {
    password: hashedPassword
  });
  return { code: 200, message: '密码更新成功' };
}

// 获取站点内容
async function getSiteContent(keys) {
  const result = {};
  for (const key of keys) {
    const doc = await db.collection('site_content').where({ key }).get();
    if (doc.data && doc.data.length > 0) {
      result[key] = { content: doc.data[0].content };
    }
  }
  return { code: 200, data: result };
}

// 更新用户IP
async function updateUserIp(userId, ip) {
  // 检查是否已存在
  const existing = await db.collection('user_ips')
    .where({ user_id: userId })
    .get();
  if (existing.data && existing.data.length > 0) {
    await db.collection('user_ips').doc(existing.data[0]._id).update({
      ip,
      updated_at: new Date()
    });
  } else {
    await db.collection('user_ips').add({
      user_id: userId,
      ip,
      created_at: new Date()
    });
  }
  return { code: 200, message: 'IP更新成功' };
}

// 更新用户设备
async function updateUserDevice(userId, deviceId) {
  const existing = await db.collection('user_devices')
    .where({ user_id: userId })
    .get();
  if (existing.data && existing.data.length > 0) {
    await db.collection('user_devices').doc(existing.data[0]._id).update({
      device_id: deviceId,
      updated_at: new Date()
    });
  } else {
    await db.collection('user_devices').add({
      user_id: userId,
      device_id: deviceId,
      created_at: new Date()
    });
  }
  return { code: 200, message: '设备更新成功' };
}

// 检查IP是否被封禁
async function checkIpBanned(ip) {
  const result = await db.collection('banned_ips')
    .where({ ip })
    .get();
  return { code: 200, data: { banned: result.data && result.data.length > 0 } };
}

// 检查设备是否被封禁
async function checkDeviceBanned(deviceId) {
  const result = await db.collection('banned_devices')
    .where({ device_id: deviceId })
    .get();
  return { code: 200, data: { banned: result.data && result.data.length > 0 } };
}

// 获取用户帖子列表
async function getUserPosts(userId, query) {
  const { page = 1, limit = 20 } = query;
  const skip = (page - 1) * limit;

  const posts = await db.collection('posts')
    .where({ user_id: userId })
    .orderBy('created_at', 'desc')
    .skip(skip)
    .limit(limit)
    .get();

  return { code: 200, data: posts.data || [] };
}

// 增加浏览量
async function incrementViews(postId) {
  await updateByCustomId('posts', postId, {
    views: _.inc(1)
  });
  return { code: 200, message: '浏览量+1' };
}

// 隐藏帖子
async function hidePost(userId, postId) {
  const isAdmin = await isSuperAdmin(userId);
  if (!isAdmin) {
    return { code: 403, message: '无权限' };
  }
  await db.collection('hidden_posts').add({
    post_id: postId,
    hidden_by: userId,
    hidden_at: new Date()
  });
  return { code: 200, message: '已隐藏' };
}

// 取消隐藏帖子
async function unhidePost(userId, postId) {
  const isAdmin = await isSuperAdmin(userId);
  if (!isAdmin) {
    return { code: 403, message: '无权限' };
  }
  await db.collection('hidden_posts')
    .where({ post_id: postId })
    .remove();
  return { code: 200, message: '已取消隐藏' };
}

// 结案（前端调用的版本）
async function resolveTrialAction(userId, trialId) {
  const isAdmin = await isSuperAdmin(userId);
  if (!isAdmin) {
    return { code: 403, message: '无权限' };
  }
  await updateByCustomId('trials', trialId, {
    status: 'resolved',
    resolved_at: new Date()
  });
  return { code: 200, message: '已结案' };
}

// 删除公审帖子
async function deleteTrialPost(userId, trialId) {
  const isAdmin = await isSuperAdmin(userId);
  if (!isAdmin) {
    return { code: 403, message: '无权限' };
  }

  const trial = await findByCustomId('trials', trialId);
  if (!trial) {
    return { code: 404, message: '公审不存在' };
  }

  // 隐藏帖子
  await db.collection('hidden_posts').add({
    post_id: trial.post_id,
    hidden_by: userId,
    hidden_at: new Date()
  });

  // 结案
  await updateByCustomId('trials', trialId, {
    status: 'resolved',
    resolved_at: new Date()
  });

  return { code: 200, message: '已删除并结案' };
}

// ============ 通知相关 API ============

// 获取通知列表
async function getNotifications(userId, query) {
  if (!userId) {
    return { code: 401, message: '用户未登录' };
  }

  const { limit = 50 } = query;

  const notifications = await db.collection('notifications')
    .where({ recipient_id: userId })
    .orderBy('created_at', 'desc')
    .limit(limit)
    .get();

  return { code: 200, data: notifications.data || [] };
}

// 获取未读通知数
async function getUnreadCount(userId) {
  if (!userId) {
    return { code: 401, message: '用户未登录' };
  }

  const result = await db.collection('notifications')
    .where({ recipient_id: userId, read: false })
    .get();

  return { code: 200, data: { count: result.data?.length || 0 } };
}

// 标记通知已读
async function markNotificationRead(userId, notifId) {
  if (!userId) {
    return { code: 401, message: '用户未登录' };
  }

  const notif = await findByCustomId('notifications', notifId);
  if (!notif) {
    return { code: 404, message: '通知不存在' };
  }

  if (notif.recipient_id !== userId) {
    return { code: 403, message: '无权限' };
  }

  await updateByCustomId('notifications', notifId, { read: true });

  return { code: 200, message: '已标记为已读' };
}

// 标记所有通知已读
async function markAllNotificationsRead(userId) {
  if (!userId) {
    return { code: 401, message: '用户未登录' };
  }

  const notifs = await db.collection('notifications')
    .where({ recipient_id: userId, read: false })
    .get();

  for (const notif of (notifs.data || [])) {
    await db.collection('notifications').doc(notif._id).update({
      read: true
    });
  }

  return { code: 200, message: '已全部标记为已读' };
}