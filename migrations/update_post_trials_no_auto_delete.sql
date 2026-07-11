-- 改造帖子公审：取消自动结算，改由超级管理员在投票页直接删除或保留帖子

-- 帖子公审表
CREATE TABLE IF NOT EXISTS trials (
    trial_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'active',
    violate_count INT DEFAULT 0,
    clean_count INT DEFAULT 0,
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 同一帖子最多只能有一个待处理（active/violate）公审，已结案的可有多个
CREATE UNIQUE INDEX IF NOT EXISTS idx_trials_active_post_id ON trials(post_id) WHERE status IN ('active', 'violate');

-- 帖子公审投票表
CREATE TABLE IF NOT EXISTS trial_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trial_id UUID NOT NULL REFERENCES trials(trial_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    verdict TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(trial_id, user_id)
);

-- RLS
ALTER TABLE trials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trials_read_all" ON trials;
CREATE POLICY "trials_read_all" ON trials FOR SELECT USING (true);

ALTER TABLE trial_votes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trial_votes_read_all" ON trial_votes;
CREATE POLICY "trial_votes_read_all" ON trial_votes FOR SELECT USING (true);
DROP POLICY IF EXISTS "trial_votes_insert_own" ON trial_votes;
CREATE POLICY "trial_votes_insert_own" ON trial_votes FOR INSERT WITH CHECK (auth.uid() = user_id);

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

-- 整点检查：已取消自动结算，保留空函数避免旧引用报错
DROP FUNCTION IF EXISTS check_hourly_trials();

CREATE OR REPLACE FUNCTION check_hourly_trials()
RETURNS VOID AS $$
BEGIN
    -- 不再自动根据票数结算 trial 状态，改由超管在投票页手动处理
    NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 超管处理帖子公审：将任意 active/violate 状态标记为 resolved（保留帖子）
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
    WHERE trial_id = p_trial_id AND status IN ('active', 'violate');

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 超管删除帖子公审：隐藏帖子并结案
DROP FUNCTION IF EXISTS admin_delete_trial_post(UUID, UUID);

CREATE OR REPLACE FUNCTION admin_delete_trial_post(
    p_trial_id UUID,
    admin_user_id UUID
)
RETURNS JSONB AS $$
DECLARE
    trial_record RECORD;
    hide_result JSONB;
BEGIN
    IF NOT is_super_admin(admin_user_id) THEN
        RETURN jsonb_build_object('success', false, 'error', '无权限');
    END IF;

    SELECT * INTO trial_record
    FROM trials
    WHERE trial_id = p_trial_id AND status IN ('active', 'violate');

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', '公审不存在或已处理');
    END IF;

    -- 先隐藏帖子
    hide_result := hide_post_from_recommend(trial_record.post_id, admin_user_id);
    IF NOT (hide_result->>'success')::BOOLEAN THEN
        RETURN hide_result;
    END IF;

    -- 再结案
    UPDATE trials
    SET status = 'resolved', resolved_at = NOW()
    WHERE trial_id = p_trial_id;

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 帖子被举报≥2次时自动进入公审
CREATE OR REPLACE FUNCTION check_and_create_post_trial()
RETURNS TRIGGER AS $$
BEGIN
    IF (SELECT COUNT(*) FROM reports WHERE post_id = NEW.post_id) >= 2 THEN
        IF NOT EXISTS (
            SELECT 1 FROM trials
            WHERE post_id = NEW.post_id AND status IN ('active', 'violate')
        ) THEN
            INSERT INTO trials (post_id, status) VALUES (NEW.post_id, 'active');
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_auto_create_post_trial ON reports;
CREATE TRIGGER trigger_auto_create_post_trial
AFTER INSERT ON reports
FOR EACH ROW
EXECUTE FUNCTION check_and_create_post_trial();
