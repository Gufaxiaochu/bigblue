-- 修复评论公审系统：column id did not exist 问题
-- 这套 SQL 会删除并重建评论公审相关表和函数，已有评论公审投票数据会被清空

-- 先确保超级管理员判断函数是最新的（使用邮箱）
CREATE OR REPLACE FUNCTION is_super_admin(check_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    user_email TEXT;
    user_phone TEXT;
BEGIN
    SELECT email INTO user_email FROM auth.users WHERE id = check_user_id;
    IF user_email IN ('2211354141@qq.com', '19256680343@bigblue.com', '13590179040@bigblue.com') THEN
        RETURN TRUE;
    END IF;

    SELECT raw_user_meta_data->>'phone' INTO user_phone FROM auth.users WHERE id = check_user_id;
    IF user_phone = '19256680343' THEN
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 删除旧触发器和函数
DROP TRIGGER IF EXISTS trigger_auto_create_comment_trial ON comment_reports;
DROP FUNCTION IF EXISTS check_and_create_comment_trial();
DROP FUNCTION IF EXISTS get_active_comment_trials();
DROP FUNCTION IF EXISTS vote_comment_trial(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS admin_delete_comment_trial(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS resolve_comment_trial(UUID, UUID);

-- 删除旧表（会清空评论举报和公审数据）
DROP TABLE IF EXISTS comment_trial_votes CASCADE;
DROP TABLE IF EXISTS comment_trials CASCADE;
DROP TABLE IF EXISTS comment_reports CASCADE;

-- 1. 评论举报表
CREATE TABLE comment_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(comment_id, user_id)
);

CREATE INDEX idx_comment_reports_comment_id ON comment_reports(comment_id);
CREATE INDEX idx_comment_reports_created_at ON comment_reports(created_at DESC);

ALTER TABLE comment_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "comment_reports_read_all" ON comment_reports;
CREATE POLICY "comment_reports_read_all" ON comment_reports FOR SELECT USING (true);
DROP POLICY IF EXISTS "comment_reports_insert_own" ON comment_reports;
CREATE POLICY "comment_reports_insert_own" ON comment_reports FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 2. 评论公审表
CREATE TABLE comment_trials (
    trial_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'active',
    ban_count INT DEFAULT 0,
    innocent_count INT DEFAULT 0,
    ban_reason TEXT,
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_comment_trials_active_comment_id ON comment_trials(comment_id) WHERE status IN ('active', 'banned');

-- 3. 评论公审投票表
CREATE TABLE comment_trial_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trial_id UUID NOT NULL REFERENCES comment_trials(trial_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    verdict TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(trial_id, user_id)
);

ALTER TABLE comment_trials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "comment_trials_read_all" ON comment_trials;
CREATE POLICY "comment_trials_read_all" ON comment_trials FOR SELECT USING (true);

ALTER TABLE comment_trial_votes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "comment_trial_votes_read_all" ON comment_trial_votes;
CREATE POLICY "comment_trial_votes_read_all" ON comment_trial_votes FOR SELECT USING (true);
DROP POLICY IF EXISTS "comment_trial_votes_insert_own" ON comment_trial_votes;
CREATE POLICY "comment_trial_votes_insert_own" ON comment_trial_votes FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 4. 返回待处理评论公审列表
CREATE OR REPLACE FUNCTION get_active_comment_trials()
RETURNS TABLE (
    trial_id UUID,
    comment_id UUID,
    post_id UUID,
    post_title TEXT,
    comment_content TEXT,
    target_user_id UUID,
    target_username TEXT,
    target_avatar_url TEXT,
    ban_count INT,
    innocent_count INT,
    status TEXT,
    ban_reason TEXT,
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE,
    report_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ct.trial_id,
        ct.comment_id,
        ct.post_id,
        p.title,
        c.content,
        c.user_id,
        pr.username,
        pr.avatar_url,
        ct.ban_count,
        ct.innocent_count,
        ct.status,
        ct.ban_reason,
        ct.resolved_at,
        ct.created_at,
        (SELECT COUNT(*) FROM comment_reports cr WHERE cr.comment_id = ct.comment_id)
    FROM comment_trials ct
    JOIN comments c ON c.id = ct.comment_id
    JOIN posts p ON p.id = ct.post_id
    LEFT JOIN profiles pr ON pr.id = c.user_id
    ORDER BY
        CASE WHEN ct.status = 'active' THEN 0 ELSE 1 END,
        ct.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. 评论公审投票
CREATE OR REPLACE FUNCTION vote_comment_trial(
    p_trial_id UUID,
    p_user_id UUID,
    p_verdict TEXT
)
RETURNS JSONB AS $$
DECLARE
    trial_record RECORD;
BEGIN
    SELECT * INTO trial_record
    FROM comment_trials
    WHERE trial_id = p_trial_id AND status = 'active';

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', '公审不存在或已结束');
    END IF;

    IF EXISTS (SELECT 1 FROM comment_trial_votes WHERE trial_id = p_trial_id AND user_id = p_user_id) THEN
        RETURN jsonb_build_object('success', false, 'error', '您已投过票');
    END IF;

    INSERT INTO comment_trial_votes (trial_id, user_id, verdict)
    VALUES (p_trial_id, p_user_id, p_verdict);

    IF p_verdict = 'ban' THEN
        UPDATE comment_trials SET ban_count = COALESCE(ban_count, 0) + 1 WHERE trial_id = p_trial_id;
    ELSE
        UPDATE comment_trials SET innocent_count = COALESCE(innocent_count, 0) + 1 WHERE trial_id = p_trial_id;
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. 超管删除评论公审
CREATE OR REPLACE FUNCTION admin_delete_comment_trial(
    p_trial_id UUID,
    admin_user_id UUID,
    p_reason TEXT
)
RETURNS JSONB AS $$
DECLARE
    trial_record RECORD;
BEGIN
    IF NOT is_super_admin(admin_user_id) THEN
        RETURN jsonb_build_object('success', false, 'error', '无权限');
    END IF;

    SELECT * INTO trial_record
    FROM comment_trials
    WHERE trial_id = p_trial_id AND status = 'active';

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', '公审不存在或已处理');
    END IF;

    DELETE FROM comments WHERE id = trial_record.comment_id;

    UPDATE comment_trials
    SET status = 'banned', ban_reason = p_reason, resolved_at = NOW()
    WHERE trial_id = p_trial_id;

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. 超管保留评论公审
CREATE OR REPLACE FUNCTION resolve_comment_trial(
    p_trial_id UUID,
    admin_user_id UUID
)
RETURNS JSONB AS $$
BEGIN
    IF NOT is_super_admin(admin_user_id) THEN
        RETURN jsonb_build_object('success', false, 'error', '无权限');
    END IF;

    UPDATE comment_trials
    SET status = 'innocent', resolved_at = NOW()
    WHERE trial_id = p_trial_id AND status = 'active';

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', '公审不存在或已处理');
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. 评论被举报≥2次时自动进入公审
CREATE OR REPLACE FUNCTION check_and_create_comment_trial()
RETURNS TRIGGER AS $$
DECLARE
    v_post_id UUID;
BEGIN
    SELECT c.post_id INTO v_post_id FROM comments c WHERE c.id = NEW.comment_id;

    IF (SELECT COUNT(*) FROM comment_reports WHERE comment_id = NEW.comment_id) >= 2 THEN
        IF NOT EXISTS (
            SELECT 1 FROM comment_trials
            WHERE comment_id = NEW.comment_id AND status IN ('active', 'banned')
        ) THEN
            INSERT INTO comment_trials (comment_id, post_id, status)
            VALUES (NEW.comment_id, v_post_id, 'active');
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_auto_create_comment_trial ON comment_reports;
CREATE TRIGGER trigger_auto_create_comment_trial
AFTER INSERT ON comment_reports
FOR EACH ROW
EXECUTE FUNCTION check_and_create_comment_trial();
