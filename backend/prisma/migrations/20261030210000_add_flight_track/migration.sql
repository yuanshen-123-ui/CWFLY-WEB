-- 2026-10-30 航迹回放：记录机组位置轨迹（whazzup 回放增强）
--
-- 数据来源：fsd-py 收到机组位置包后按 TRACK_INTERVAL(10s) 采样写入；
-- 用途：地图回放（前端 Replay 页）、飞行轨迹统计、事后核查。
-- 幂等：CREATE TABLE IF NOT EXISTS。

CREATE TABLE IF NOT EXISTS `FlightTrack` (
  `id`          INT          NOT NULL AUTO_INCREMENT,
  `callsign`    VARCHAR(16)  NOT NULL,
  `sessionId`   INT          NOT NULL DEFAULT 0 COMMENT 'FlightLog.id，一次连线一个会话',
  `lat`         DOUBLE       NOT NULL,
  `lon`         DOUBLE       NOT NULL,
  `altitude`    INT          NOT NULL DEFAULT 0,
  `groundSpeed` INT          NOT NULL DEFAULT 0,
  `heading`     INT          NOT NULL DEFAULT 0,
  `onGround`    TINYINT(1)   NOT NULL DEFAULT 0,
  `recordedAt`  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `FlightTrack_callsign_recordedAt_idx` (`callsign`, `recordedAt`),
  KEY `FlightTrack_sessionId_idx` (`sessionId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
