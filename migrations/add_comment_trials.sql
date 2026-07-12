-- 评论公审系统
-- 1. 评论举报表
CREATE TABLE IF NOT EXISTS comment_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(comment_id, user_id) -- 同一用户不能重复举报同一评论
);

CREATE INDEX IF NOT EXISTS idx_comment_reports_comment_id ON comment_reports(comment_id);
CREATE INDEX IF NOT EXISTS idx_comment_reports_created_at ON comment_reports(created_at DESC);

-- RLS
ALTER TABLE comment_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "comment_reports_read_all" ON comment_reports;
CREATE POLICY "comment_reports_read_all" ON comment_reports FOR SELECT USING (true);
DROP POLICY IF EXISTS "comment_reports_insert_own" ON comment_reports;
CREATE POLICY "comment_reports_insert_own" ON comment_reports FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 2. 评论公审表
CREATE TABLE IF NOT EXISTS comment_trials (
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

-- 同一评论最多只能有一个待处理公审
CREATE UNIQUE INDEX IF NOT EXISTS idx_comment_trials_active_comment_id ON comment_trials(comment_id) WHERE status IN ('active', 'banned');

-- 3. 评论公审投票表
CREATE TABLE IF NOT EXISTS comment_trial_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trial_id UUID NOT NULL REFERENCES comment_trials(trial_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    verdict TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(trial_id, user_id)
);

-- RLS
ALTER TABLE comment_trials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "comment_trials_read_all" ON comment_trials;
CREATE POLICY "comment_trials_read_all" ON comment_trials FOR SELECT USING (true);

ALTER TABLE comment_trial_votes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "comment_trial_votes_read_all" ON comment_trial_votes;
CREATE POLICY "comment_trial_votes_read_all" ON comment_trial_votes FOR SELECT USING (true);
DROP POLICY IF EXISTS "comment_trial_votes_insert_own" ON comment_trial_votes;
CREATE POLICY "comment_trial_votes_insert_own" ON comment_trial_votes FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 4. 返回待处理评论公审列表
DROP FUNCTION IF EXISTS get_active_comment_trials();

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
DROP FUNCTION IF EXISTS vote_comment_trial(UUID, UUID, TEXT);

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

-- 6. 超管删除评论公审：删除评论并结案
DROP FUNCTION IF EXISTS admin_delete_comment_trial(UUID, UUID, TEXT);

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

    -- 删除评论
    DELETE FROM comments WHERE id = trial_record.comment_id;

    -- 结案
    UPDATE comment_trials
    SET status = 'banned', ban_reason = p_reason, resolved_at = NOW()
    WHERE trial_id = p_trial_id;

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. 超管保留评论公审：保留评论并结案
DROP FUNCTION IF EXISTS resolve_comment_trial(UUID, UUID);

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
    -- 获取评论所属的帖子ID
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