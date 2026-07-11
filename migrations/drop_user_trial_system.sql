-- 删除用户公审系统相关数据库对象

-- 先删除依赖函数
DROP FUNCTION IF EXISTS check_hourly_user_trials();
DROP FUNCTION IF EXISTS check_and_create_user_trial();
DROP FUNCTION IF EXISTS get_active_user_trials();
DROP FUNCTION IF EXISTS vote_user_trial(UUID, UUID, TEXT);

-- 再删除表（按依赖顺序：先投票表，再 trial 表，最后举报记录表）
DROP TABLE IF EXISTS user_trial_votes;
DROP TABLE IF EXISTS user_trials;
DROP TABLE IF EXISTS user_reports;
