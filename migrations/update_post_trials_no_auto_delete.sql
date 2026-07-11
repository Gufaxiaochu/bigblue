-- 改造帖子公审：移除整点自动删帖，仅结算投票状态；超管可手动处理

-- 确保 trials 表有 status / resolved_at 字段
ALTER TABLE IF EXISTS trials
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP WITH TIME ZONE;

-- 返回待处理帖子公审：包含 active（可投票）和 violate（已判定违规，等待超管处理）
DROP FUNCTION IF EXISTS get_active_trials();

CREATE OR REPLACE FUNCTION get_active_trials()
RETURNS TABLE (
    trial_id UUID,
    post_id UUID,
    post_title TEXT,
    post_content TEXT,
    post_image_urls TEXT[],
    author_username TEXT,
    author_avatar_url TEXT,
    violate_count INT,
    clean_count INT,
    status TEXT,
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        t.trial_id,
        t.post_id,
        p.title,
        p.content,
        p.image_urls,
        pr.username,
        pr.avatar_url,
        t.violate_count,
        t.clean_count,
        t.status,
        t.created_at
    FROM trials t
    JOIN posts p ON p.id = t.post_id
    LEFT JOIN profiles pr ON pr.id = p.user_id
    WHERE t.status IN ('active', 'violate')
    ORDER BY
        CASE WHEN t.status = 'active' THEN 0 ELSE 1 END,
        t.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 帖子公审投票：仅允许对 active 的 trial 投票
DROP FUNCTION IF EXISTS vote_trial(UUID, UUID, TEXT);

CREATE OR REPLACE FUNCTION vote_trial(
    p_trial_id UUID,
    p_user_id UUID,
    p_verdict TEXT
)
RETURNS JSONB AS $$
DECLARE
    trial_record RECORD;
    existing_vote RECORD;
BEGIN
    SELECT * INTO trial_record
    FROM trials
    WHERE trial_id = p_trial_id AND status = 'active';

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', '公审不存在或已结束');
    END IF;

    SELECT * INTO existing_vote
    FROM trial_votes
    WHERE trial_id = p_trial_id AND user_id = p_user_id;

    IF FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', '您已投过票');
    END IF;

    INSERT INTO trial_votes (trial_id, user_id, verdict)
    VALUES (p_trial_id, p_user_id, p_verdict);

    IF p_verdict = 'violate' THEN
        UPDATE trials SET violate_count = COALESCE(violate_count, 0) + 1 WHERE trial_id = p_trial_id;
    ELSE
        UPDATE trials SET clean_count = COALESCE(clean_count, 0) + 1 WHERE trial_id = p_trial_id;
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 整点检查：只结算状态，不删除帖子
DROP FUNCTION IF EXISTS check_hourly_trials();

CREATE OR REPLACE FUNCTION check_hourly_trials()
RETURNS VOID AS $$
DECLARE
    r RECORD;
    total INT;
BEGIN
    FOR r IN SELECT * FROM trials WHERE status = 'active' LOOP
        total := COALESCE(r.violate_count, 0) + COALESCE(r.clean_count, 0);

        IF total >= 3 THEN
            IF r.violate_count > r.clean_count THEN
                UPDATE trials
                SET status = 'violate', resolved_at = NOW()
                WHERE trial_id = r.trial_id;
            ELSE
                UPDATE trials
                SET status = 'clean', resolved_at = NOW()
                WHERE trial_id = r.trial_id;
            END IF;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 超管处理帖子公审：将 violate 状态标记为 resolved
DROP FUNCTION IF EXISTS resolve_trial(UUID, UUID);

CREATE OR REPLACE FUNCTION resolve_trial(
    p_trial_id UUID,
    admin_user_id UUID
)
RETURNS JSONB AS $$
BEGIN
    IF NOT is_super_admin(admin_user_id) THEN
        RETURN jsonb_build_object('success', false, 'error', '无权限');
    END IF;

    UPDATE trials
    SET status = 'resolved', resolved_at = NOW()
    WHERE trial_id = p_trial_id AND status = 'violate';

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
