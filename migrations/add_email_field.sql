ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email TEXT;

DROP POLICY IF EXISTS "用户可更新自己的资料" ON profiles;
CREATE POLICY "用户可更新自己的资料" ON profiles FOR UPDATE USING (auth.uid() = id);

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    BEGIN
        INSERT INTO profiles (id, username, email, avatar_url, bio)
        VALUES (
            NEW.id,
            COALESCE(
                NEW.raw_user_meta_data->>'nickname',
                NEW.raw_user_meta_data->>'username',
                '用户' || substr(NEW.id::text, 1, 8)
            ),
            NEW.email,
            NEW.raw_user_meta_data->>'avatar_url',
            ''
        )
        ON CONFLICT (id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
        RAISE LOG '创建用户资料失败: %', SQLERRM;
    END;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- 为已注册但没有 profile 的用户补数据
INSERT INTO profiles (id, username, email, avatar_url, bio)
SELECT 
    u.id,
    COALESCE(u.raw_user_meta_data->>'nickname', u.raw_user_meta_data->>'username', '用户' || substr(u.id::text, 1, 8)),
    u.email,
    u.raw_user_meta_data->>'avatar_url',
    ''
FROM auth.users u
LEFT JOIN profiles p ON u.id = p.id
WHERE p.id IS NULL;
