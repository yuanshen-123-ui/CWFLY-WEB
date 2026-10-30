-- 2026-10-30 计划锁定 + 在线时长统计（幂等：已存在则跳过）
--
-- 背景：借鉴 SimpleFSD（MIT）的 FlightPlan.Locked 与 UpdateUserAtcTime/PilotTime：
--   1) 管制员 $AM 修正计划后应锁定该计划，机组再提交不覆盖（起降机场变更才会解锁）；
--   2) 每次连线结束结算在线时长，累加到用户总时长，供排行/统计使用。
--
-- 说明：ALTER 用 information_schema 守卫，重复执行安全。

-- FlightPlan.locked
SET @ddl := (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `FlightPlan` ADD COLUMN `locked` TINYINT(1) NOT NULL DEFAULT 0',
  'DO 0')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'FlightPlan' AND COLUMN_NAME = 'locked');
PREPARE s1 FROM @ddl; EXECUTE s1; DEALLOCATE PREPARE s1;

-- User.totalPilotTime
SET @ddl := (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `User` ADD COLUMN `totalPilotTime` INT NOT NULL DEFAULT 0',
  'DO 0')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'User' AND COLUMN_NAME = 'totalPilotTime');
PREPARE s2 FROM @ddl; EXECUTE s2; DEALLOCATE PREPARE s2;

-- User.totalAtcTime
SET @ddl := (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `User` ADD COLUMN `totalAtcTime` INT NOT NULL DEFAULT 0',
  'DO 0')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'User' AND COLUMN_NAME = 'totalAtcTime');
PREPARE s3 FROM @ddl; EXECUTE s3; DEALLOCATE PREPARE s3;
