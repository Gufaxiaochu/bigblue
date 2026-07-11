-- 为评论增加缩略图 URL 数组，用于详情页小图展示
ALTER TABLE comments
    ADD COLUMN IF NOT EXISTS thumbnail_urls TEXT[] DEFAULT NULL;
