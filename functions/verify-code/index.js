const cloudbase = require('@cloudbase/node-sdk');

const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
const db = app.database();

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
}

function response(statusCode, body) {
  return { statusCode, headers: corsHeaders(), body: JSON.stringify(body) };
}

exports.main = async (event) => {
  // 处理跨域预检请求
  if (event.httpMethod === 'OPTIONS') {
    return response(200, {});
  }

  let body = event.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) {}
  }

  const email = body && body.email ? body.email.trim() : '';
  const code = body && body.code ? body.code.trim() : '';

  if (!email || !code) {
    return response(400, { valid: false, error: '邮箱和验证码不能为空' });
  }

  try {
    const { data } = await db.collection('email_codes')
      .where({ email, code })
      .orderBy('createTime', 'desc')
      .limit(1)
      .get();

    if (!data || data.length === 0) {
      return response(200, { valid: false, error: '验证码错误或已过期' });
    }

    const record = data[0];
    if (record.expiresAt < Date.now()) {
      return response(200, { valid: false, error: '验证码已过期' });
    }

    // 标记为已使用
    await db.collection('email_codes').doc(record._id).update({
      used: true
    });

    return response(200, { valid: true, nickname: record.nickname });
  } catch (err) {
    console.error('验证失败:', err);
    return response(500, { valid: false, error: err.message || '验证失败' });
  }
};
