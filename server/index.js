const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');

const app = express();
app.use(cors());
app.use(express.json());

// 从环境变量读取 SMTP 配置（部署时设置）
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.163.com';
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_USER = process.env.SMTP_USER || '18520893735@163.com';
const SMTP_PASS = process.env.SMTP_PASS || ''; // 部署时必填
const FROM_EMAIL = process.env.FROM_EMAIL || SMTP_USER;

// 内存存储验证码：{ email: { code, nickname, expiresAt, used } }
const codes = new Map();

// 清理过期验证码（每10分钟）
setInterval(() => {
  const now = Date.now();
  for (const [email, data] of codes.entries()) {
    if (data.expiresAt < now) {
      codes.delete(email);
    }
  }
}, 10 * 60 * 1000);

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// 发送验证码
app.post('/send-code', async (req, res) => {
  try {
    const { email, nickname } = req.body;
    if (!email) {
      return res.status(400).json({ error: '邮箱不能为空' });
    }
    if (!SMTP_PASS) {
      return res.status(500).json({ error: 'SMTP 授权码未配置' });
    }

    const code = generateCode();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5分钟有效

    codes.set(email, {
      code,
      nickname: nickname || '',
      expiresAt,
      used: false
    });

    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS
      }
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

    console.log(`[发送验证码] ${email}: ${code}`);
    res.json({ success: true });
  } catch (err) {
    console.error('发送邮件失败:', err);
    res.status(500).json({ error: err.message || '发送失败' });
  }
});

// 验证验证码
app.post('/verify-code', (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) {
      return res.status(400).json({ valid: false, error: '邮箱和验证码不能为空' });
    }

    const data = codes.get(email);
    if (!data || data.code !== code || data.expiresAt < Date.now()) {
      return res.json({ valid: false, error: '验证码错误或已过期' });
    }

    // 验证通过，但不立即标记为已使用，允许5分钟内多次尝试注册
    res.json({ valid: true, nickname: data.nickname });
  } catch (err) {
    console.error('验证失败:', err);
    res.status(500).json({ valid: false, error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`邮箱验证码服务已启动，端口：${PORT}`);
});
