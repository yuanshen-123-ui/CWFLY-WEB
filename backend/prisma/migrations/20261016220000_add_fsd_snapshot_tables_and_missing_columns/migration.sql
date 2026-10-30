-- 2026-10-16 FSD 在线快照表 + 缺失列（幂等：对象已存在时自动跳过）
--
-- 背景（本次排障发现）：
--   1) FlightPilot / FlightController 两张在线快照表**从未纳入迁移也从未创建**，
--      导致 fsd-py 每 2 秒写库失败（Table 'cwfly.FlightPilot' doesn't exist），
--      且 /api/flightplans/fsd/online、/fsd/controllers、/fsd/boundaries 恒返回空数组；
--   2) ControllerSchedule 缺 date 列（接口按 date 查询 → Prisma 校验失败 500）；
--   3) FlightLog 缺 createdIp / offlineAt 列（fsd-py 上线日志 100% 写入失败）；
--   4) SecurityEvent.referrer 仅 191 字符而代码写入最长 500 → 安全事件静默丢失。
--
-- 列定义与 fsd-py/db.py 的 upsert_pilot / upsert_controller 严格对齐；
-- callsign 为主键（upsert 依赖 ON DUPLICATE KEY）。
-- 排序规则显式指定 utf8mb4_unicode_ci，与 FlightPlan 等既有表一致
-- （否则 JOIN 会报 1267 Illegal mix of collations）。

CREATE TABLE IF NOT EXISTS `FlightPilot` (
  `callsign`      VARCHAR(16)  NOT NULL,
  `cid`           VARCHAR(16)  NOT NULL DEFAULT '',
  `realname`      VARCHAR(64)  NOT NULL DEFAULT '',
  `home`          VARCHAR(8)   NOT NULL DEFAULT '',
  `latitude`      DOUBLE       NOT NULL DEFAULT 0,
  `longitude`     DOUBLE       NOT NULL DEFAULT 0,
  `altitude`      INT          NOT NULL DEFAULT 0,
  `bank`          INT          NOT NULL DEFAULT 0,
  `pitch`         INT          NOT NULL DEFAULT 0,
  `heading`       INT          NOT NULL DEFAULT 0,
  `AltitudeC`     INT          NOT NULL DEFAULT 0,
  `groundspd`     INT          NOT NULL DEFAULT 0,
  `transponder`   INT          NOT NULL DEFAULT 0,
  `transpondermd` VARCHAR(4)   NOT NULL DEFAULT '',
  `updatedAt`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`callsign`),
  KEY `idx_updatedAt` (`updatedAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `FlightController` (
  `callsign`     VARCHAR(16) NOT NULL,
  `cid`          VARCHAR(16) NOT NULL DEFAULT '',
  `realname`     VARCHAR(64) NOT NULL DEFAULT '',
  `latitude`     DOUBLE      NOT NULL DEFAULT 0,
  `longitude`    DOUBLE      NOT NULL DEFAULT 0,
  `frequency`    VARCHAR(16) NOT NULL DEFAULT '',
  `facilityType` INT         NOT NULL DEFAULT 0,
  `visualRange`  INT         NOT NULL DEFAULT 0,
  `updatedAt`    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`callsign`),
  KEY `idx_updatedAt` (`updatedAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ControllerSchedule.date
SET @ddl := (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `ControllerSchedule` ADD COLUMN `date` VARCHAR(191) NOT NULL DEFAULT ''''',
  'DO 0')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ControllerSchedule' AND COLUMN_NAME = 'date');
PREPARE s1 FROM @ddl;
EXECUTE s1;
DEALLOCATE PREPARE s1;

-- FlightLog.createdIp
SET @ddl := (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `FlightLog` ADD COLUMN `createdIp` VARCHAR(64) NOT NULL DEFAULT ''''',
  'DO 0')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'FlightLog' AND COLUMN_NAME = 'createdIp');
PREPARE s2 FROM @ddl;
EXECUTE s2;
DEALLOCATE PREPARE s2;

-- FlightLog.offlineAt
SET @ddl := (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `FlightLog` ADD COLUMN `offlineAt` DATETIME NULL',
  'DO 0')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'FlightLog' AND COLUMN_NAME = 'offlineAt');
PREPARE s3 FROM @ddl;
EXECUTE s3;
DEALLOCATE PREPARE s3;

-- SecurityEvent.referrer 放宽到 512
SET @ddl := (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `SecurityEvent` MODIFY `referrer` VARCHAR(512) NOT NULL DEFAULT ''''',
  'DO 0')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'SecurityEvent'
    AND COLUMN_NAME = 'referrer' AND CHARACTER_MAXIMUM_LENGTH >= 512);
PREPARE s4 FROM @ddl;
EXECUTE s4;
DEALLOCATE PREPARE s4;
