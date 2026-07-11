-- 超级管理员与用户拉黑系统
-- 超级管理员手机号：19256680343

-- 记录用户最近 IP
CREATE TABLE IF NOT EXISTS user_ips (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    ip TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 拉黑 IP 表
CREATE TABLE IF NOT EXISTS banned_ips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ip TEXT NOT NULL UNIQUE,
    reason TEXT,
    banned_by UUID REFERENCES auth.users(id),
    banned_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 记录用户设备 ID
CREATE TABLE IF NOT EXISTS user_devices (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    device_id TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 拉黑设备表
CREATE TABLE IF NOT EXISTS banned_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id TEXT NOT NULL UNIQUE,
    reason TEXT,
    banned_by UUID REFERENCES auth.users(id),
    banned_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 判断是否为超级管理员（必须在 RLS 策略之前定义）
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

-- 启用 RLS
ALTER TABLE user_ips ENABLE ROW LEVEL SECURITY;
ALTER TABLE banned_ips ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE banned_devices ENABLE ROW LEVEL SECURITY;

-- 只有超级管理员能读写这些表
DROP POLICY IF EXISTS "super_admin_only" ON user_ips;
CREATE POLICY "super_admin_only" ON user_ips
    FOR ALL
    USING (is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "super_admin_only" ON banned_ips;
CREATE POLICY "super_admin_only" ON banned_ips
    FOR ALL
    USING (is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "super_admin_only" ON user_devices;
CREATE POLICY "super_admin_only" ON user_devices
    FOR ALL
    USING (is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "super_admin_only" ON banned_devices;
CREATE POLICY "super_admin_only" ON banned_devices
    FOR ALL
    USING (is_super_admin(auth.uid()));

-- 检查 IP 是否被拉黑
CREATE OR REPLACE FUNCTION check_ip_banned(check_ip TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (SELECT 1 FROM banned_ips WHERE ip = check_ip);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 更新用户 IP（前端主动上报，只能更新自己的 IP）
CREATE OR REPLACE FUNCTION update_user_ip(user_id UUID, user_ip TEXT)
RETURNS VOID AS $$
BEGIN
    IF user_id IS DISTINCT FROM auth.uid() THEN
        RETURN;
    END IF;
    INSERT INTO user_ips (user_id, ip, updated_at)
    VALUES (user_id, user_ip, now())
    ON CONFLICT (user_id) DO UPDATE SET ip = EXCLUDED.ip, updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 更新用户设备 ID（前端主动上报，只能更新自己的）
CREATE OR REPLACE FUNCTION update_user_device(p_user_id UUID, p_device_id TEXT)
RETURNS VOID AS $$
BEGIN
    IF p_user_id IS DISTINCT FROM auth.uid() THEN
        RETURN;
    END IF;
    INSERT INTO user_devices (user_id, device_id, updated_at)
    VALUES (p_user_id, p_device_id, now())
    ON CONFLICT (user_id) DO UPDATE SET device_id = EXCLUDED.device_id, updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 检查设备是否被拉黑
CREATE OR REPLACE FUNCTION check_device_banned(check_device TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (SELECT 1 FROM banned_devices WHERE device_id = check_device);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 拉黑用户（IP + 设备，自动选择可用方式）
CREATE OR REPLACE FUNCTION ban_user_ip(target_user_id UUID, admin_user_id UUID, reason TEXT DEFAULT '')
RETURNS JSONB AS $$
DECLARE
    target_ip TEXT;
    target_device TEXT;
    banned_something BOOLEAN := false;
BEGIN
    IF NOT is_super_admin(admin_user_id) THEN
        RETURN jsonb_build_object('success', false, 'error', '无权限');
    END IF;

    SELECT ip INTO target_ip FROM user_ips WHERE user_id = target_user_id;
    IF target_ip IS NOT NULL THEN
        INSERT INTO banned_ips (ip, reason, banned_by)
        VALUES (target_ip, reason, admin_user_id)
        ON CONFLICT (ip) DO NOTHING;
        banned_something := true;
    END IF;

    SELECT device_id INTO target_device FROM user_devices WHERE user_id = target_user_id;
    IF target_device IS NOT NULL THEN
        INSERT INTO banned_devices (device_id, reason, banned_by)
        VALUES (target_device, reason, admin_user_id)
        ON CONFLICT (device_id) DO NOTHING;
        banned_something := true;
    END IF;

    IF NOT banned_something THEN
        RETURN jsonb_build_object('success', false, 'error', '未记录到该用户IP或设备');
    END IF;

    RETURN jsonb_build_object('success', true, 'ip', target_ip, 'device', target_device);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 删除用户所有帖子
CREATE OR REPLACE FUNCTION delete_user_posts(target_user_id UUID, admin_user_id UUID)
RETURNS JSONB AS $$
DECLARE
    deleted_count INT;
BEGIN
    IF NOT is_super_admin(admin_user_id) THEN
        RETURN jsonb_build_object('success', false, 'error', '无权限');
    END IF;

    DELETE FROM posts WHERE user_id = target_user_id;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    RETURN jsonb_build_object('success', true, 'deleted_count', deleted_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 删除用户所有评论
CREATE OR REPLACE FUNCTION delete_user_comments(target_user_id UUID, admin_user_id UUID)
RETURNS JSONB AS $$
DECLARE
    deleted_count INT;
BEGIN
    IF NOT is_super_admin(admin_user_id) THEN
        RETURN jsonb_build_object('success', false, 'error', '无权限');
    END IF;

    DELETE FROM comments WHERE user_id = target_user_id;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    RETURN jsonb_build_object('success', true, 'deleted_count', deleted_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 删除用户账号（会级联删除 posts/comments/profiles 等）
CREATE OR REPLACE FUNCTION delete_user_account(target_user_id UUID, admin_user_id UUID)
RETURNS JSONB AS $$
BEGIN
    IF NOT is_super_admin(admin_user_id) THEN
        RETURN jsonb_build_object('success', false, 'error', '无权限');
    END IF;

    IF target_user_id = admin_user_id THEN
        RETURN jsonb_build_object('success', false, 'error', '不能删除自己');
    END IF;

    DELETE FROM auth.users WHERE id = target_user_id;
    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
