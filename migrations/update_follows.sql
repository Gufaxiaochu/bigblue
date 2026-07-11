-- 关注表
CREATE TABLE IF NOT EXISTS follows (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    follower_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    following_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(follower_id, following_id)
);

-- RLS
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "用户可查看关注记录" ON follows;
CREATE POLICY "用户可查看关注记录" ON follows
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "用户可关注他人" ON follows;
CREATE POLICY "用户可关注他人" ON follows
    FOR INSERT WITH CHECK (auth.uid() = follower_id);

DROP POLICY IF EXISTS "用户可取消关注" ON follows;
CREATE POLICY "用户可取消关注" ON follows
    FOR DELETE USING (auth.uid() = follower_id);

-- 增加帖子作者的粉丝数、关注数字段（可选，避免连表聚合）
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS followers_count INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS following_count INTEGER DEFAULT 0;

-- 触发器：关注时自动更新粉丝数/关注数
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
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS follow_counts_trigger ON follows;
CREATE TRIGGER follow_counts_trigger
    AFTER INSERT OR DELETE ON follows
    FOR EACH ROW EXECUTE FUNCTION update_follow_counts();

-- 初始化已有数据的计数（可选，运行一次即可）
UPDATE profiles p SET followers_count = (
    SELECT COUNT(*) FROM follows f WHERE f.following_id = p.id
);
UPDATE profiles p SET following_count = (
    SELECT COUNT(*) FROM follows f WHERE f.follower_id = p.id
);
