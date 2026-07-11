const cloudbase = require('@cloudbase/node-sdk');
const nodemailer = require('nodemailer');

const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
const db = app.database();

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.163.com';
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_USER = process.env.SMTP_USER || '18520893735@163.com';
const SMTP_PASS = process.env.SMTP_PASS || '';
const FROM_EMAIL = process.env.FROM_EMAIL || SMTP_USER;

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

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
  const nickname = body && body.nickname ? body.nickname.trim() : '';

  if (!email) return response(400, { error: '邮箱不能为空' });
  if (!SMTP_PASS) return response(500, { error: 'SMTP 授权码未配置' });

  const code = generateCode();
  const expiresAt = Date.now() + 5 * 60 * 1000;

  try {
    // 存入云开发数据库
    await db.collection('email_codes').add({
      email,
      code,
      nickname,
      expiresAt,
      used: false,
      createTime: new Date()
    });

    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS }
    });

    await transporter.sendMail({
      from: `"散帅啤酒馆" <${FROM_EMAIL}>`,
      to: email,
      subject: '您的验证码',
      text: `您的验证码是：${code}，5分钟内有效。`,
      html: `<div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2>验证码</h2>
        <p>您的验证码是：</p>
        <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; margin: 20px 0; padding: 15px; background: #f5f5f5; display: inline-block;">${code}</div>
        <p>此验证码5分钟内有效，请勿泄露给他人。</p>
      </div>`
    });

    return response(200, { success: true });
  } catch (err) {
    console.error('发送失败:', err);
    return response(500, { error: err.message || '发送失败' });
  }
};
