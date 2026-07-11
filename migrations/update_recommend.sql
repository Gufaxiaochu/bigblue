-- 主页推荐算法：少量热帖 + 大量新帖，支持排除已曝光的帖子（含点击过与未点击的）
-- 前5条为近3天高热度帖子，其余按发布时间倒序
-- p_excluded_ids: 用户已曝光的帖子ID（点击过或未点击均包含），短时间内不再推荐

CREATE OR REPLACE FUNCTION get_recommended_posts(p_limit INT DEFAULT 50, p_excluded_ids UUID[] DEFAULT '{}')
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
    WITH hot AS (
        SELECT p.id FROM posts p
        WHERE p.id <> ALL(COALESCE(p_excluded_ids, ARRAY[]::UUID[]))
          AND p.created_at > NOW() - INTERVAL '3 days'
          AND NOT EXISTS (SELECT 1 FROM hidden_posts h WHERE h.post_id = p.id)
        ORDER BY (COALESCE(p.likes_count,0)*10 + COALESCE(p.comments_count,0)*20 + COALESCE(p.views,0)) DESC
        LIMIT 5
    )
    SELECT
        p.id, p.user_id, p.title, p.content, p.image_urls,
        p.likes_count, p.comments_count, p.views, p.category,
        p.created_at, pr.username, pr.avatar_url, pr.id AS author_id
    FROM posts p
    LEFT JOIN profiles pr ON pr.id = p.user_id
    WHERE p.id <> ALL(COALESCE(p_excluded_ids, ARRAY[]::UUID[]))
      AND NOT EXISTS (SELECT 1 FROM hidden_posts h WHERE h.post_id = p.id)
    ORDER BY (p.id IN (SELECT id FROM hot)) DESC, p.created_at DESC
    LIMIT p_limit;
$$ LANGUAGE sql SECURITY DEFINER;
