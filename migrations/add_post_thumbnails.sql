-- 为帖子增加缩略图 URL 数组，用于列表封面展示
ALTER TABLE posts
    ADD COLUMN IF NOT EXISTS thumbnail_urls TEXT[] DEFAULT NULL;

-- 更新热门帖子函数，返回缩略图字段
DROP FUNCTION IF EXISTS get_hot_posts(integer);
CREATE OR REPLACE FUNCTION get_hot_posts(p_limit INT DEFAULT 30)
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
    FROM posts p
    LEFT JOIN profiles pr ON pr.id = p.user_id
    WHERE NOT EXISTS (SELECT 1 FROM hidden_posts h WHERE h.post_id = p.id)
    ORDER BY (COALESCE(p.likes_count,0)*10 + COALESCE(p.comments_count,0)*20 + COALESCE(p.views,0)) DESC
    LIMIT p_limit;
$$ LANGUAGE sql SECURITY DEFINER;
