-- 举报功能表
CREATE TABLE IF NOT EXISTS reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(post_id, user_id) -- 同一用户不能重复举报同一帖子
);

-- 添加索引
CREATE INDEX IF NOT EXISTS idx_reports_post_id ON reports(post_id);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at DESC);

-- RLS 策略
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- 所有人可以查看举报数量（仅统计，不暴露举报人信息）
DROP POLICY IF EXISTS "reports_read_all" ON reports;
CREATE POLICY "reports_read_all" ON reports FOR SELECT USING (true);

-- 只有登录用户可以举报
DROP POLICY IF EXISTS "reports_insert_own" ON reports;
CREATE POLICY "reports_insert_own" ON reports FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 允许用户删除自己的举报记录（超级管理员无限举报时需要先删除再插入）
DROP POLICY IF EXISTS "reports_delete_own" ON reports;
CREATE POLICY "reports_delete_own" ON reports FOR DELETE USING (auth.uid() = user_id);

-- 创建一个 RPC 函数获取帖子的举报数量
CREATE OR REPLACE FUNCTION get_post_reports_count(p_post_id UUID)
RETURNS INTEGER AS $$
DECLARE
    count INTEGER;
BEGIN
    SELECT COUNT(*) INTO count FROM reports WHERE post_id = p_post_id;
    RETURN count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 创建一个 RPC 函数获取所有帖子的举报统计（供后台查看）
CREATE OR REPLACE FUNCTION get_all_reports_stats()
RETURNS TABLE (
    post_id UUID,
    post_title TEXT,
    reports_count INTEGER,
    latest_report_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        r.post_id,
        p.title,
        COUNT(r.id) as reports_count,
        MAX(r.created_at) as latest_report_at
    FROM reports r
    JOIN posts p ON r.post_id = p.id
    GROUP BY r.post_id, p.title
    ORDER BY reports_count DESC, latest_report_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;