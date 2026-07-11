-- 隐藏帖子：从推荐页/首页/热榜/分区/搜索中移除，但保留在作者主页
CREATE TABLE IF NOT EXISTS hidden_posts (
    post_id UUID PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
    hidden_by UUID REFERENCES auth.users(id),
    hidden_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- RLS
ALTER TABLE hidden_posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "hidden_posts_read_all" ON hidden_posts;
CREATE POLICY "hidden_posts_read_all" ON hidden_posts FOR SELECT USING (true);
DROP POLICY IF EXISTS "hidden_posts_admin_only" ON hidden_posts;
CREATE POLICY "hidden_posts_admin_only" ON hidden_posts FOR ALL USING ((SELECT COALESCE(raw_user_meta_data->>'phone', '') FROM auth.users WHERE id = auth.uid()) = '19256680343');

-- 确保 is_super_admin 函数存在（与 add_super_admin.sql 保持一致，可安全重复定义）
CREATE OR REPLACE FUNCTION is_super_admin(check_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    user_phone TEXT;
    profile_phone TEXT;
BEGIN
    SELECT raw_user_meta_data->>'phone' INTO user_phone
    FROM auth.users
    WHERE id = check_user_id;

    SELECT phone INTO profile_phone
    FROM profiles
    WHERE id = check_user_id;

    RETURN COALESCE(user_phone, profile_phone, '') = '19256680343';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 判断帖子是否被隐藏
CREATE OR REPLACE FUNCTION is_post_hidden(p_post_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (SELECT 1 FROM hidden_posts WHERE post_id = p_post_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 隐藏帖子（仅超级管理员）
CREATE OR REPLACE FUNCTION hide_post_from_recommend(p_post_id UUID, admin_user_id UUID)
RETURNS JSONB AS $$
BEGIN
    IF NOT is_super_admin(admin_user_id) THEN
        RETURN jsonb_build_object('success', false, 'error', '无权限');
    END IF;

    INSERT INTO hidden_posts (post_id, hidden_by)
    VALUES (p_post_id, admin_user_id)
    ON CONFLICT (post_id) DO NOTHING;

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 恢复帖子推荐（仅超级管理员）
CREATE OR REPLACE FUNCTION unhide_post_from_recommend(p_post_id UUID, admin_user_id UUID)
RETURNS JSONB AS $$
BEGIN
    IF NOT is_super_admin(admin_user_id) THEN
        RETURN jsonb_build_object('success', false, 'error', '无权限');
    END IF;

    DELETE FROM hidden_posts WHERE post_id = p_post_id;

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 热门帖子（用于首页插入推荐），自动排除被隐藏帖子
DROP FUNCTION IF EXISTS get_hot_posts(integer);
CREATE OR REPLACE FUNCTION get_hot_posts(p_limit INT DEFAULT 30)
RETURNS TABLE (
    id UUID,
    user_id UUID,
    title TEXT,
    content TEXT,
    image_urls TEXT[],
    likes_count INT,
    comments_count INT,
    views INT,
    category TEXT,
    created_at TIMESTAMPTZ,
    username TEXT,
    avatar_url TEXT,
    author_id UUID
) AS $$
    SELECT
        p.id, p.user_id, p.title, p.content, p.image_urls,
        p.likes_count, p.comments_count, p.views, p.category,
        p.created_at, pr.username, pr.avatar_url, pr.id AS author_id
    FROM posts p
    LEFT JOIN profiles pr ON pr.id = p.user_id
    WHERE NOT EXISTS (SELECT 1 FROM hidden_posts h WHERE h.post_id = p.id)
    ORDER BY (COALESCE(p.likes_count,0)*10 + COALESCE(p.comments_count,0)*20 + COALESCE(p.views,0)) DESC
    LIMIT p_limit;
$$ LANGUAGE sql SECURITY DEFINER;
