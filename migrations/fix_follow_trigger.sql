-- 修复关注触发器：添加 SECURITY DEFINER 绕过 RLS
-- 问题原因：触发器函数缺少 SECURITY DEFINER，普通用户关注他人时
-- 触发器尝试 UPDATE 别人的 profiles 记录被 RLS 拦截，粉丝数不更新

CREATE OR REPLACE FUNCTION update_follow_counts()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        UPDATE profiles SET followers_count = followers_count + 1 WHERE id = NEW.following_id;
        UPDATE profiles SET following_count = following_count + 1 WHERE id = NEW.follower_id;
        RETURN NEW;
    ELSIF (TG_OP = 'DELETE') THEN
        UPDATE profiles SET followers_count = GREATEST(followers_count - 1, 0) WHERE id = OLD.following_id;
        UPDATE profiles SET following_count = GREATEST(following_count - 1, 0) WHERE id = OLD.follower_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 重建触发器
DROP TRIGGER IF EXISTS follow_counts_trigger ON follows;
CREATE TRIGGER follow_counts_trigger
    AFTER INSERT OR DELETE ON follows
    FOR EACH ROW EXECUTE FUNCTION update_follow_counts();

-- 修复历史数据：重新计算所有人的粉丝数和关注数
UPDATE profiles p SET followers_count = (
    SELECT COUNT(*) FROM follows f WHERE f.following_id = p.id
);
UPDATE profiles p SET following_count = (
    SELECT COUNT(*) FROM follows f WHERE f.follower_id = p.id
);
