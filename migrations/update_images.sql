-- 为 posts 表添加图片数组字段
ALTER TABLE posts ADD COLUMN IF NOT EXISTS image_urls TEXT[] DEFAULT '{}';

-- 更新 storage 策略（如果 posts 存储桶已存在）
INSERT INTO storage.buckets (id, name, public) VALUES ('posts', 'posts', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "所有人可查看帖子图片" ON storage.objects;
CREATE POLICY "所有人可查看帖子图片" ON storage.objects
    FOR SELECT USING (bucket_id = 'posts');

DROP POLICY IF EXISTS "登录用户可上传帖子图片" ON storage.objects;
CREATE POLICY "登录用户可上传帖子图片" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'posts' AND auth.role() = 'authenticated');
