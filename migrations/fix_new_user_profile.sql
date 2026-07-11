-- 修复新用户注册后 profile 不创建的问题
-- 请在 Supabase SQL Editor 中执行此文件

-- 1. 确保 profiles 表有所有必要的字段
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS followers_count INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS following_count INTEGER DEFAULT 0;

-- 2. 删除旧的触发器和函数
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();

-- 3. 创建新的触发器函数（修复版本）
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    base_username TEXT;
    final_username TEXT;
BEGIN
    -- 获取基础用户名
    base_username := COALESCE(
        NEW.raw_user_meta_data->>'nickname',
        NEW.raw_user_meta_data->>'username',
        '用户' || substr(NEW.id::text, 1, 8)
    );
    
    -- 检查用户名是否已存在，如果存在则添加 UUID 后缀
    IF EXISTS (SELECT 1 FROM profiles WHERE username = base_username) THEN
        final_username := base_username || '_' || substr(NEW.id::text, 1, 8);
    ELSE
        final_username := base_username;
    END IF;
    
    -- 插入 profile
    INSERT INTO profiles (id, username, email, bio, followers_count, following_count)
    VALUES (
        NEW.id,
        final_username,
        NEW.email,
        '',
        0,
        0
    )
    ON CONFLICT (id) DO UPDATE SET
        username = final_username,
        email = COALESCE(NEW.email, profiles.email);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. 创建触发器
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- 5. 确保 RLS 策略正确
DROP POLICY IF EXISTS "所有人可查看用户资料" ON profiles;
DROP POLICY IF EXISTS "用户可更新自己的资料" ON profiles;
DROP POLICY IF EXISTS "用户可插入自己的资料" ON profiles;

CREATE POLICY "所有人可查看用户资料" ON profiles FOR SELECT USING (true);
CREATE POLICY "用户可更新自己的资料" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "用户可插入自己的资料" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- 6. 检查并修复现有缺失 profile 的用户
-- 执行后会显示有多少用户缺少 profile
DO $$
DECLARE
    missing_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO missing_count
    FROM auth.users u
    WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = u.id);
    
    IF missing_count > 0 THEN
        RAISE NOTICE '发现 % 个用户缺少 profile，正在修复...', missing_count;
        
        -- 为每个缺失 profile 的用户创建记录，用户名冲突时添加 UUID 后缀
        INSERT INTO profiles (id, username, email, bio, followers_count, following_count)
        SELECT 
            u.id,
            -- 确保用户名唯一：如果用户名已存在，添加 UUID 前8位
            CASE 
                WHEN EXISTS (
                    SELECT 1 FROM profiles p2 
                    WHERE p2.username = COALESCE(
                        u.raw_user_meta_data->>'nickname',
                        u.raw_user_meta_data->>'username',
                        '用户' || substr(u.id::text, 1, 8)
                    )
                ) THEN
                    COALESCE(
                        u.raw_user_meta_data->>'nickname',
                        u.raw_user_meta_data->>'username',
                        '用户'
                    ) || '_' || substr(u.id::text, 1, 8)
                ELSE
                    COALESCE(
                        u.raw_user_meta_data->>'nickname',
                        u.raw_user_meta_data->>'username',
                        '用户' || substr(u.id::text, 1, 8)
                    )
            END,
            u.email,
            '',
            0,
            0
        FROM auth.users u
        WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = u.id)
        ON CONFLICT (id) DO NOTHING;
        
        RAISE NOTICE '修复完成';
    ELSE
        RAISE NOTICE '所有用户都有 profile';
    END IF;
END $$;