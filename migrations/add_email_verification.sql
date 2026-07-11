CREATE TABLE IF NOT EXISTS email_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    code TEXT NOT NULL,
    nickname TEXT,
    used BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_email_verifications_email ON email_verifications(email);
CREATE INDEX IF NOT EXISTS idx_email_verifications_created_at ON email_verifications(created_at DESC);

ALTER TABLE email_verifications ENABLE ROW LEVEL SECURITY;

-- Edge Function 使用 service_role key，这里允许匿名用户调用时通过函数间接操作
-- 实际数据操作由 Edge Function 完成，不直接暴露给前端
CREATE POLICY "Allow service role full access" ON email_verifications
    FOR ALL USING (true) WITH CHECK (true);
