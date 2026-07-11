-- 精选帖子表
CREATE TABLE IF NOT EXISTS featured_posts (
    post_id UUID PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
    featured_by UUID REFERENCES auth.users(id),
    featured_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

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

-- RLS
ALTER TABLE featured_posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "featured_posts_read_all" ON featured_posts;
CREATE POLICY "featured_posts_read_all" ON featured_posts FOR SELECT USING (true);
DROP POLICY IF EXISTS "featured_posts_admin_only" ON featured_posts;
CREATE POLICY "featured_posts_admin_only" ON featured_posts FOR ALL USING (is_super_admin(auth.uid()));

-- 判断帖子是否被精选
CREATE OR REPLACE FUNCTION is_post_featured(p_post_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (SELECT 1 FROM featured_posts WHERE post_id = p_post_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 标记帖子为精选（仅超级管理员）
CREATE OR REPLACE FUNCTION feature_post(p_post_id UUID, admin_user_id UUID)
RETURNS JSONB AS $$
BEGIN
    IF NOT is_super_admin(admin_user_id) THEN
        RETURN jsonb_build_object('success', false, 'error', '无权限');
    END IF;

    INSERT INTO featured_posts (post_id, featured_by)
    VALUES (p_post_id, admin_user_id)
    ON CONFLICT (post_id) DO NOTHING;

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 取消帖子精选（仅超级管理员）
CREATE OR REPLACE FUNCTION unfeature_post(p_post_id UUID, admin_user_id UUID)
RETURNS JSONB AS $$
BEGIN
    IF NOT is_super_admin(admin_user_id) THEN
        RETURN jsonb_build_object('success', false, 'error', '无权限');
    END IF;

    DELETE FROM featured_posts WHERE post_id = p_post_id;

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 获取精选帖子列表
DROP FUNCTION IF EXISTS get_featured_posts(integer, integer);
CREATE OR REPLACE FUNCTION get_featured_posts(p_limit INT DEFAULT 50, p_offset INT DEFAULT 0)
RETURNS TABLE (
    id UUID,
    user_id UUID,
    title TEXT,
    content TEXT,
    image_urls TEXT[],
    thumbnail_urls TEXT[],
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
        p.id, p.user_id, p.title, p.content, p.image_urls, p.thumbnail_urls,
        p.likes_count, p.comments_count, p.views, p.category,
        p.created_at, pr.username, pr.avatar_url, pr.id AS author_id
    FROM featured_posts f
    JOIN posts p ON p.id = f.post_id
    LEFT JOIN profiles pr ON pr.id = p.user_id
    WHERE NOT EXISTS (SELECT 1 FROM hidden_posts h WHERE h.post_id = p.id)
    ORDER BY f.featured_at DESC
    LIMIT p_limit OFFSET p_offset;
$$ LANGUAGE sql SECURITY DEFINER;
