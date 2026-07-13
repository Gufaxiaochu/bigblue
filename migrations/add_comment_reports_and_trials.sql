-- 评论举报表
CREATE TABLE IF NOT EXISTS comment_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_comment_reports_comment_user ON comment_reports(comment_id, user_id);

-- 评论公审表
CREATE TABLE IF NOT EXISTS comment_trials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'active',
    ban_count INT DEFAULT 0,
    innocent_count INT DEFAULT 0,
    resolved_at TIMESTAMPTZ,
    ban_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_comment_trials_comment ON comment_trials(comment_id);

-- 评论公审投票表
CREATE TABLE IF NOT EXISTS comment_trial_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trial_id UUID NOT NULL REFERENCES comment_trials(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    verdict TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_comment_trial_votes_trial_user ON comment_trial_votes(trial_id, user_id);

-- 自动创建评论公审触发器
CREATE OR REPLACE FUNCTION auto_create_comment_trial()
RETURNS TRIGGER AS $$
DECLARE
    report_count INT;
    existing_trial UUID;
    post_id_val UUID;
BEGIN
    SELECT COUNT(*) INTO report_count FROM comment_reports WHERE comment_id = NEW.comment_id;
    SELECT id INTO existing_trial FROM comment_trials WHERE comment_id = NEW.comment_id LIMIT 1;
    
    IF report_count >= 2 AND existing_trial IS NULL THEN
        SELECT post_id INTO post_id_val FROM comments WHERE id = NEW.comment_id;
        INSERT INTO comment_trials (comment_id, post_id) VALUES (NEW.comment_id, post_id_val);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_auto_create_comment_trial ON comment_reports;
CREATE TRIGGER trigger_auto_create_comment_trial
    AFTER INSERT ON comment_reports
    FOR EACH ROW EXECUTE FUNCTION auto_create_comment_trial();

-- 获取活跃评论公审列表
CREATE OR REPLACE FUNCTION get_active_comment_trials()
RETURNS TABLE (
    trial_id UUID,
    comment_id UUID,
    post_id UUID,
    comment_content TEXT,
    comment_created_at TIMESTAMPTZ,
    post_title TEXT,
    target_username TEXT,
    target_avatar_url TEXT,
    status TEXT,
    ban_count INT,
    innocent_count INT,
    resolved_at TIMESTAMPTZ,
    ban_reason TEXT,
    report_count BIGINT,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ct.trial_id as trial_id,
        ct.comment_id,
        ct.post_id,
        c.content as comment_content,
        c.created_at as comment_created_at,
        p.title as post_title,
        prof.username as target_username,
        prof.avatar_url as target_avatar_url,
        ct.status,
        ct.ban_count,
        ct.innocent_count,
        ct.resolved_at,
        ct.ban_reason,
        COALESCE(comment_reports.report_count, 0) as report_count,
        ct.created_at
    FROM comment_trials ct
    JOIN comments c ON ct.comment_id = c.id
    JOIN posts p ON ct.post_id = p.id
    JOIN profiles prof ON c.user_id = prof.id
        LEFT JOIN (
        SELECT comment_reports.comment_id, COUNT(*) as report_count
        FROM comment_reports
        GROUP BY comment_reports.comment_id
    )  comment_reports ON ct.comment_id = comment_reports.comment_id
    WHERE ct.status = 'active' OR (ct.status IN ('banned', 'innocent') AND ct.resolved_at > NOW() - INTERVAL '24 hours')
    ORDER BY ct.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 评论公审投票
CREATE OR REPLACE FUNCTION vote_comment_trial(p_trial_id UUID, p_user_id UUID, p_verdict TEXT)
RETURNS JSONB AS $$
DECLARE
    existing_verdict TEXT;
BEGIN
    SELECT verdict INTO existing_verdict FROM comment_trial_votes WHERE trial_id = p_trial_id AND user_id = p_user_id;
    
    IF existing_verdict IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', '您已经投过票了');
    END IF;
    
    INSERT INTO comment_trial_votes (trial_id, user_id, verdict) VALUES (p_trial_id, p_user_id, p_verdict);
    
    IF p_verdict = 'ban' THEN
        UPDATE comment_trials SET ban_count = ban_count + 1 WHERE id = p_trial_id;
    ELSE
        UPDATE comment_trials SET innocent_count = innocent_count + 1 WHERE id = p_trial_id;
    END IF;
    
    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 管理员结案（删除评论）
CREATE OR REPLACE FUNCTION admin_delete_comment_trial(p_trial_id UUID, admin_user_id UUID, p_reason TEXT)
RETURNS JSONB AS $$
DECLARE
    comment_id_val UUID;
    post_id_val UUID;
BEGIN
    SELECT comment_id, post_id INTO comment_id_val, post_id_val FROM comment_trials WHERE id = p_trial_id;
    
    DELETE FROM comments WHERE id = comment_id_val;
    
    UPDATE posts SET comments_count = comments_count - 1 WHERE id = post_id_val;
    
    UPDATE comment_trials SET 
        status = 'banned', 
        resolved_at = NOW(),
        ban_reason = p_reason
    WHERE id = p_trial_id;
    
    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 管理员结案（保留评论）
CREATE OR REPLACE FUNCTION resolve_comment_trial(p_trial_id UUID, admin_user_id UUID)
RETURNS JSONB AS $$
BEGIN
    UPDATE comment_trials SET 
        status = 'innocent', 
        resolved_at = NOW()
    WHERE id = p_trial_id;
    
    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
