import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { email, nickname } = await req.json();
    if (!email) {
      return new Response(JSON.stringify({ error: "邮箱不能为空" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // 生成6位英文+数字验证码（去掉容易混淆的字符）
    const code = generateCode();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    // 先删除该邮箱旧的未使用验证码
    await supabaseAdmin
      .from("email_verifications")
      .delete()
      .eq("email", email)
      .eq("used", false);

    // 保存新验证码
    const { error: insertError } = await supabaseAdmin
      .from("email_verifications")
      .insert({ email, code, nickname, expires_at: expiresAt });

    if (insertError) throw insertError;

    // 发送邮件
    const client = new SMTPClient({
      connection: {
        hostname: Deno.env.get("SMTP_HOST") ?? "",
        port: Number(Deno.env.get("SMTP_PORT") ?? "465"),
        tls: true,
        auth: {
          username: Deno.env.get("SMTP_USER") ?? "",
          password: Deno.env.get("SMTP_PASS") ?? "",
        },
      },
    });

    await client.send({
      from: Deno.env.get("FROM_EMAIL") ?? Deno.env.get("SMTP_USER") ?? "",
      to: email,
      subject: "您的验证码",
      content: `您的验证码是：${code}，5分钟内有效。`,
      html: `<div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2>验证码</h2>
        <p>您的验证码是：</p>
        <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; margin: 20px 0; padding: 15px; background: #f5f5f5; display: inline-block;">${code}</div>
        <p>此验证码5分钟内有效，请勿泄露给他人。</p>
      </div>`,
    });

    await client.close();

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}
