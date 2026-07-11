-- 用户举报与用户公审系统
-- 被举报≥2次的用户自动进入公审，整点自动判决

-- 用户举报记录表
CREATE TABLE IF NOT EXISTS user_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(target_user_id, reporter_id)
);

CREATE INDEX IF NOT EXISTS idx_user_reports_target ON user_reports(target_user_id);

ALTER TABLE user_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_reports_read_all" ON user_reports;
CREATE POLICY "user_reports_read_all" ON user_reports FOR SELECT USING (true);
DROP POLICY IF EXISTS "user_reports_insert_own" ON user_reports;
CREATE POLICY "user_reports_insert_own" ON user_reports FOR INSERT WITH CHECK (auth.uid() = reporter_id);
DROP POLICY IF EXISTS "user_reports_delete_own" ON user_reports;
CREATE POLICY "user_reports_delete_own" ON user_reports FOR DELETE USING (auth.uid() = reporter_id);

-- 用户公审表
CREATE TABLE IF NOT EXISTS user_trials (
    trial_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'active',
    ban_count INT DEFAULT 0,
    innocent_count INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resolved_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE user_trials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_trials_read_all" ON user_trials;
CREATE POLICY "user_trials_read_all" ON user_trials FOR SELECT USING (true);

-- 用户公审投票表
CREATE TABLE IF NOT EXISTS user_trial_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trial_id UUID NOT NULL REFERENCES user_trials(trial_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    verdict TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(trial_id, user_id)
);

ALTER TABLE user_trial_votes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_trial_votes_read_all" ON user_trial_votes;
CREATE POLICY "user_trial_votes_read_all" ON user_trial_votes FOR SELECT USING (true);
DROP POLICY IF EXISTS "user_trial_votes_insert_own" ON user_trial_votes;
CREATE POLICY "user_trial_votes_insert_own" ON user_trial_votes FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 获取待审用户列表
CREATE OR REPLACE FUNCTION get_active_user_trials()
RETURNS TABLE (
    trial_id UUID,
    target_user_id UUID,
    target_username TEXT,
    target_avatar_url TEXT,
    target_bio TEXT,
    report_count BIGINT,
    ban_count INT,
    innocent_count INT,
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ut.trial_id,
        ut.target_user_id,
        p.username,
        p.avatar_url,
        p.bio,
        (SELECT COUNT(*) FROM user_reports ur WHERE ur.target_user_id = ut.target_user_id),
        ut.ban_count,
        ut.innocent_count,
        ut.created_at
    FROM user_trials ut
    LEFT JOIN profiles p ON p.id = ut.target_user_id
    WHERE ut.status = 'active'
    ORDER BY ut.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 用户公审投票
CREATE OR REPLACE FUNCTION vote_user_trial(p_trial_id UUID, p_user_id UUID, p_verdict TEXT)
RETURNS JSONB AS $$
DECLARE
    trial_record RECORD;
    existing_vote RECORD;
BEGIN
    SELECT * INTO trial_record FROM user_trials WHERE trial_id = p_trial_id AND status = 'active';
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', '公审不存在或已结束');
    END IF;

    SELECT * INTO existing_vote FROM user_trial_votes WHERE trial_id = p_trial_id AND user_id = p_user_id;
    IF FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', '您已投过票');
    END IF;

    INSERT INTO user_trial_votes (trial_id, user_id, verdict) VALUES (p_trial_id, p_user_id, p_verdict);

    IF p_verdict = 'ban' THEN
        UPDATE user_trials SET ban_count = ban_count + 1 WHERE trial_id = p_trial_id;
    ELSE
        UPDATE user_trials SET innocent_count = innocent_count + 1 WHERE trial_id = p_trial_id;
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 整点检查用户公审
CREATE OR REPLACE FUNCTION check_hourly_user_trials()
RETURNS VOID AS $$
DECLARE
    trial_record RECORD;
    total INT;
BEGIN
    FOR trial_record IN SELECT * FROM user_trials WHERE status = 'active' LOOP
        total := trial_record.ban_count + trial_record.innocent_count;
        IF total >= 3 THEN
            IF trial_record.ban_count > trial_record.innocent_count THEN
                UPDATE user_trials SET status = 'banned', resolved_at = NOW() WHERE trial_id = trial_record.trial_id;
            ELSE
                UPDATE user_trials SET status = 'innocent', resolved_at = NOW() WHERE trial_id = trial_record.trial_id;
            END IF;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 检查并创建用户公审（被举报≥2次自动进入）
CREATE OR REPLACE FUNCTION check_and_create_user_trial()
RETURNS VOID AS $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT ur.target_user_id, COUNT(*) as cnt
        FROM user_reports ur
        WHERE ur.target_user_id NOT IN (
            SELECT ut.target_user_id FROM user_trials ut WHERE ut.status = 'active'
        )
        GROUP BY ur.target_user_id
        HAVING COUNT(*) >= 2
    LOOP
        INSERT INTO user_trials (target_user_id, status) VALUES (r.target_user_id, 'active');
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
