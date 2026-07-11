-- 将旧分区数据迁移到新的二级分区
-- 旧值: huzhu → qa (互助 > 求助问答), other → chat (其他 > 闲聊灌水)
UPDATE posts SET category = 'qa' WHERE category = 'huzhu';
UPDATE posts SET category = 'chat' WHERE category = 'other' OR category = '全部' OR category IS NULL;
