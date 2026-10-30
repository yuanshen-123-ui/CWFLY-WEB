-- MySQL dump 10.13  Distrib 8.0.46, for Linux (x86_64)
--
-- Host: localhost    Database: cwfly
-- ------------------------------------------------------
-- Server version	8.0.46

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Current Database: `cwfly`
--

CREATE DATABASE /*!32312 IF NOT EXISTS*/ `cwfly` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci */ /*!80016 DEFAULT ENCRYPTION='N' */;

USE `cwfly`;

--
-- Table structure for table `Achievement`
--

DROP TABLE IF EXISTS `Achievement`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Achievement` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `icon` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `criteria` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `condition` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Achievement`
--

LOCK TABLES `Achievement` WRITE;
/*!40000 ALTER TABLE `Achievement` DISABLE KEYS */;
/*!40000 ALTER TABLE `Achievement` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `ActivityReview`
--

DROP TABLE IF EXISTS `ActivityReview`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ActivityReview` (
  `id` int NOT NULL AUTO_INCREMENT,
  `eventId` int NOT NULL,
  `userId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `rating` int NOT NULL DEFAULT '5',
  `comment` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ActivityReview`
--

LOCK TABLES `ActivityReview` WRITE;
/*!40000 ALTER TABLE `ActivityReview` DISABLE KEYS */;
/*!40000 ALTER TABLE `ActivityReview` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Airport`
--

DROP TABLE IF EXISTS `Airport`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Airport` (
  `icao` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `iata` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `city` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `country` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `lat` double NOT NULL DEFAULT '0',
  `lon` double NOT NULL DEFAULT '0',
  `elevation` int NOT NULL DEFAULT '0',
  `timezone` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `magnetic` double NOT NULL DEFAULT '0',
  `isMilitary` tinyint(1) NOT NULL DEFAULT '0',
  `frequencies` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '[]',
  `runways` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '[]',
  PRIMARY KEY (`icao`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Airport`
--

LOCK TABLES `Airport` WRITE;
/*!40000 ALTER TABLE `Airport` DISABLE KEYS */;
/*!40000 ALTER TABLE `Airport` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Announcement`
--

DROP TABLE IF EXISTS `Announcement`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Announcement` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `content` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `publisher` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `time` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `pinned` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Announcement`
--

LOCK TABLES `Announcement` WRITE;
/*!40000 ALTER TABLE `Announcement` DISABLE KEYS */;
/*!40000 ALTER TABLE `Announcement` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Application`
--

DROP TABLE IF EXISTS `Application`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Application` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `department` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `reason` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '待审核',
  `time` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `reviewComment` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `reviewedBy` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `interviewTime1` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `interviewTime2` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  PRIMARY KEY (`id`),
  KEY `Application_userId_idx` (`userId`),
  KEY `Application_type_idx` (`type`),
  KEY `Application_status_idx` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=26 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Application`
--

LOCK TABLES `Application` WRITE;
/*!40000 ALTER TABLE `Application` DISABLE KEYS */;
INSERT INTO `Application` VALUES (19,'6251','6251','controller','塔台管制','isfpS2UM想申请平移\n','已通过','2026/7/31 20:44:15','','','2026-08-03T15:00','2026-08-04T16:00'),(20,'2325','JiaqiZhang','controller','塔台管制','1test','已通过','2026/8/3 20:00:19','','','',''),(21,'1618','Kesol Liu','controller','塔台管制','VATUK\nISFP','已通过','2026/8/3 20:08:28','','','',''),(22,'9698','CES9698','staff','管理部','我想替代2325的位置','已拒绝','2026/8/4 03:48:57','?30天都没到呢','','',''),(23,'1618','Kesol Liu','staff','活动部','优势：了解扇区，可以想出奇特的活动\n期望：开一些多元化的活动','已通过','2026/8/4 19:53:34','','','2026-08-04T20:30',''),(25,'1712','1712','controller','塔台管制','你好，为了给平台提供管制服务，申请管制','待面试','2026/8/4 22:49:12','感谢您选择我平台，若您对给出的面试时间不满意，请联系toujours@cwflysim.cn;\n平台主管 2325','','','');
/*!40000 ALTER TABLE `Application` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `ApplicationReply`
--

DROP TABLE IF EXISTS `ApplicationReply`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ApplicationReply` (
  `id` int NOT NULL AUTO_INCREMENT,
  `appId` int NOT NULL,
  `userId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `content` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `internal` tinyint(1) NOT NULL DEFAULT '0',
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ApplicationReply`
--

LOCK TABLES `ApplicationReply` WRITE;
/*!40000 ALTER TABLE `ApplicationReply` DISABLE KEYS */;
/*!40000 ALTER TABLE `ApplicationReply` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `AuditLog`
--

DROP TABLE IF EXISTS `AuditLog`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `AuditLog` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `action` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `target` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `detail` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `AuditLog_userId_idx` (`userId`),
  KEY `AuditLog_createdAt_idx` (`createdAt`)
) ENGINE=InnoDB AUTO_INCREMENT=51 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `AuditLog`
--

LOCK TABLES `AuditLog` WRITE;
/*!40000 ALTER TABLE `AuditLog` DISABLE KEYS */;
INSERT INTO `AuditLog` VALUES (1,'0000','edit_user','User 2325 updated','User 2325 updated','2026-07-26 13:42:57.064'),(2,'0000','kick_fsd','User 0000 kicked from FSD: Test kick notification','User 0000 kicked from FSD: Test kick notification','2026-07-26 13:52:35.625'),(3,'5966','edit_user','User 2325 updated','User 2325 updated','2026-07-27 05:32:29.612'),(4,'5966','edit_user','User 0325 updated','User 0325 updated','2026-07-27 05:32:39.421'),(5,'5966','edit_user','User 0325 updated','User 0325 updated','2026-07-27 05:32:52.941'),(6,'5966','edit_user','User 0325 updated','User 0325 updated','2026-07-27 05:33:09.573'),(7,'5966','edit_user','User 2327 updated','User 2327 updated','2026-07-27 05:33:27.957'),(8,'5966','edit_user','User 2327 updated','User 2327 updated','2026-07-27 16:37:25.493'),(9,'2325','add_staff','Staff Eric He(2327) added','Staff Eric He(2327) added','2026-07-27 16:41:31.374'),(10,'2327','add_staff','Staff quanquan(1234) added','Staff quanquan(1234) added','2026-07-27 16:43:54.082'),(11,'2325','add_staff','Staff JiaqiZhang(2325) added','Staff JiaqiZhang(2325) added','2026-07-27 16:44:12.828'),(12,'2325','add_staff','Staff yuanshen(5966) added','Staff yuanshen(5966) added','2026-07-27 16:46:24.862'),(13,'2327','edit_user','User 1234 updated','User 1234 updated','2026-07-27 16:56:30.558'),(14,'2325','edit_user','User 0325 updated','User 0325 updated','2026-07-27 17:01:07.853'),(15,'2325','edit_user','User 7298 updated','User 7298 updated','2026-07-27 17:01:35.115'),(16,'7298','create_announcement','Announcement created: 7298sb','Announcement created: 7298sb','2026-07-28 02:52:25.961'),(17,'5966','delete_announcement','Announcement #1 deleted','Announcement #1 deleted','2026-07-28 04:14:17.430'),(18,'5966','edit_user','User 7298 updated','User 7298 updated','2026-07-28 14:50:10.990'),(19,'5966','edit_user','User 0325 updated','User 0325 updated','2026-07-28 14:50:15.683'),(20,'5966','edit_user','User 0325 updated','User 0325 updated','2026-07-28 14:51:07.034'),(21,'5966','edit_user','User 2325 updated','User 2325 updated','2026-07-28 14:51:17.172'),(22,'7298','create_announcement','Announcement created: 5966sb','Announcement created: 5966sb','2026-07-29 15:01:40.275'),(23,'7298','edit_announcement','Announcement #2 updated','Announcement #2 updated','2026-07-29 15:02:00.586'),(24,'7298','delete_announcement','Announcement #2 deleted','Announcement #2 deleted','2026-07-29 15:02:35.428'),(25,'5966','edit_user','User 0325 updated','User 0325 updated','2026-07-29 16:43:42.492'),(26,'2325','add_staff','Staff 龙云(325) added','Staff 龙云(325) added','2026-08-02 07:29:35.877'),(27,'5966','edit_user','User 1234 updated','User 1234 updated','2026-08-02 08:29:02.137'),(28,'7298','edit_user','User 7298 updated','User 7298 updated','2026-08-03 04:56:42.390'),(29,'7298','edit_user','User 7298 updated','User 7298 updated','2026-08-03 04:57:55.785'),(30,'7298','edit_user','User 7298 updated','User 7298 updated','2026-08-03 04:58:06.154'),(31,'7298','edit_user','User 7298 updated','User 7298 updated','2026-08-03 04:58:21.410'),(32,'7298','edit_user','User 7298 updated','User 7298 updated','2026-08-03 04:58:33.362'),(33,'2327','edit_user','User 1860 updated','User 1860 updated','2026-08-03 10:44:05.634'),(34,'2327','add_staff','Staff SCHINA(1860) added','Staff SCHINA(1860) added','2026-08-03 10:44:48.432'),(35,'5966','edit_user','User 1234 updated','User 1234 updated','2026-08-03 10:50:43.709'),(36,'2325','add_staff','Staff Kesol Liu(1618) added','Staff Kesol Liu(1618) added','2026-08-03 11:58:51.648'),(37,'2327','edit_user','User 1618 updated','User 1618 updated','2026-08-03 12:11:11.469'),(38,'2327','edit_user','User 6251 updated','User 6251 updated','2026-08-03 12:22:18.168'),(39,'0325','edit_user','User 1234 updated','User 1234 updated','2026-08-04 14:16:10.836'),(40,'2325','edit_user','User 1234 updated','User 1234 updated','2026-08-04 14:46:20.119'),(41,'5966','edit_user','User 1234 updated','User 1234 updated','2026-08-04 14:46:32.277'),(42,'7298','edit_user','User 7298 updated','User 7298 updated','2026-08-04 14:47:27.659'),(43,'7298','edit_user','User 7298 updated','User 7298 updated','2026-08-04 14:47:30.309'),(44,'7298','edit_user','User 7298 updated','User 7298 updated','2026-08-04 14:47:32.831'),(45,'7298','edit_user','User 7298 updated','User 7298 updated','2026-08-04 14:47:34.733'),(46,'7298','edit_user','User 7298 updated','User 7298 updated','2026-08-04 14:47:37.363'),(47,'7298','edit_user','User 7298 updated','User 7298 updated','2026-08-04 14:47:40.606'),(48,'7298','edit_user','User 9999 updated','User 9999 updated','2026-08-04 14:47:55.816'),(49,'7298','edit_user','User 7298 updated','User 7298 updated','2026-08-04 14:48:06.378'),(50,'2325','edit_user','User 1618 updated','User 1618 updated','2026-08-04 15:10:39.836');
/*!40000 ALTER TABLE `AuditLog` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `CheckInRecord`
--

DROP TABLE IF EXISTS `CheckInRecord`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `CheckInRecord` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `eventId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `eventTitle` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `time` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `CheckInRecord`
--

LOCK TABLES `CheckInRecord` WRITE;
/*!40000 ALTER TABLE `CheckInRecord` DISABLE KEYS */;
/*!40000 ALTER TABLE `CheckInRecord` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `ControllerSchedule`
--

DROP TABLE IF EXISTS `ControllerSchedule`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ControllerSchedule` (
  `id` int NOT NULL AUTO_INCREMENT,
  `eventId` int NOT NULL,
  `cid` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `position` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `frequency` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `startTime` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `endTime` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `status` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ControllerSchedule`
--

LOCK TABLES `ControllerSchedule` WRITE;
/*!40000 ALTER TABLE `ControllerSchedule` DISABLE KEYS */;
/*!40000 ALTER TABLE `ControllerSchedule` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `EmailLog`
--

DROP TABLE IF EXISTS `EmailLog`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `EmailLog` (
  `id` int NOT NULL AUTO_INCREMENT,
  `to` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `subject` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `status` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'sent',
  `error` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `cid` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=132 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `EmailLog`
--

LOCK TABLES `EmailLog` WRITE;
/*!40000 ALTER TABLE `EmailLog` DISABLE KEYS */;
INSERT INTO `EmailLog` VALUES (5,'guichangyang@ccflysim.cn','[CW 模拟飞行] register - 验证码','verify','sent','','','2026-07-26 09:50:03.369'),(6,'guichangyang@ccflysim.cn','[CW 模拟飞行] register - 验证码','verify','sent','','','2026-07-26 09:57:45.628'),(7,'guichangyang@ccflysim.cn','[CW 模拟飞行] 欢迎加入 CW 模拟飞行','notification','sent','','','2026-07-26 09:58:03.697'),(8,'13621877532@163.com','[CW 模拟飞行] register - 验证码','verify','sent','','','2026-07-26 10:27:03.150'),(9,'13621877532@163.com','[CW 模拟飞行] 欢迎加入 CW 模拟飞行','notification','sent','','','2026-07-26 10:27:24.243'),(10,'3677157374@qq.com','[CW 模拟飞行] register - 验证码','verify','sent','','','2026-07-26 10:30:15.820'),(11,'3677157374@qq.com','[CW 模拟飞行] 欢迎加入 CW 模拟飞行','notification','sent','','','2026-07-26 10:30:31.799'),(12,'13621877532@163.com','[CW 模拟飞行] 账号安全通知 - 邮箱绑定','security','sent','','','2026-07-26 10:31:16.113'),(13,'hihaar9@gmail.com','[CW 模拟飞行] register - 验证码','verify','sent','','','2026-07-26 10:31:54.646'),(14,'hihaar9@gmail.com','[CW 模拟飞行] 欢迎加入 CW 模拟飞行','notification','sent','','','2026-07-26 10:34:30.038'),(15,'255674717@qq.com','[CW 模拟飞行] register - 验证码','verify','sent','','','2026-07-26 10:37:09.857'),(16,'255674717@qq.com','[CW 模拟飞行] 欢迎加入 CW 模拟飞行','notification','sent','','','2026-07-26 10:37:18.913'),(17,'guichangyang@ccflysim.cn','[CW 模拟飞行] 账号信息已变更','notification','sent','','','2026-07-26 10:40:27.407'),(18,'guichangyang@ccflysim.cn','[CW 模拟飞行] 账号安全通知 - 邮箱绑定','security','sent','','','2026-07-26 11:08:38.066'),(19,'sn37313@163.com','[CW 模拟飞行] register - 验证码','verify','sent','','','2026-07-26 11:45:42.025'),(20,'sn37313@163.com','[CW 模拟飞行] 欢迎加入 CW 模拟飞行','notification','sent','','','2026-07-26 11:46:00.890'),(21,'cca_3327@qq.com','[CW 模拟飞行] register - 验证码','verify','sent','','','2026-07-26 11:57:07.071'),(22,'3639023079@qq.com','[CW 模拟飞行] register - 验证码','verify','sent','','','2026-07-26 12:04:36.934'),(23,'test@test.com','[CW 模拟飞行] 欢迎加入 CW 模拟飞行','notification','sent','','','2026-07-26 13:37:19.085'),(24,'1663867250@qq.com','[CW 模拟飞行] register - 验证码','verify','sent','','','2026-07-26 13:40:54.106'),(25,'1663867250@qq.com','[CW 模拟飞行] 欢迎加入 CW 模拟飞行','notification','sent','','','2026-07-26 13:41:19.785'),(26,'1663867250@qq.com','[CW 模拟飞行] 账号安全通知 - 邮箱绑定','security','sent','','','2026-07-26 13:41:44.999'),(27,'guichangyang@ccflysim.cn','[CW 模拟飞行] 账号安全通知 - Account Login from New Location','security','sent','','','2026-07-27 04:13:16.159'),(28,'guichangyang@ccflysim.cn','[CW 模拟飞行] 账号安全通知 - Account Login from New Location','security','sent','','','2026-07-27 04:39:36.129'),(29,'guichangyang@ccflysim.cn','[CW 模拟飞行] 账号安全通知 - Account Login from New Location','security','sent','','','2026-07-27 05:31:27.333'),(30,'13621877532@163.com','[CW 模拟飞行] Account Permissions Changed','notification','sent','','','2026-07-27 05:32:29.620'),(31,'3677157374@qq.com','[CW 模拟飞行] Account Permissions Changed','notification','sent','','','2026-07-27 05:32:39.423'),(32,'3677157374@qq.com','[CW 模拟飞行] Account Permissions Changed','notification','sent','','','2026-07-27 05:32:52.942'),(33,'3677157374@qq.com','[CW 模拟飞行] Account Permissions Changed','notification','sent','','','2026-07-27 05:33:09.574'),(34,'sn37313@163.com','[CW 模拟飞行] Account Permissions Changed','notification','sent','','','2026-07-27 05:33:27.958'),(35,'guichangyang@ccflysim.cn','[CW 模拟飞行] 账号安全通知 - Account Login from New Location','security','sent','','','2026-07-27 05:34:27.102'),(36,'guichangyang@ccflysim.cn','[CW 模拟飞行] 账号安全通知 - Account Login from New Location','security','sent','','','2026-07-27 06:57:24.368'),(37,'13621877532@163.com','[CW 模拟飞行] 账号安全通知 - Account Login from New Location','security','sent','','','2026-07-27 07:03:07.077'),(38,'guichangyang@ccflysim.cn','[CW 模拟飞行] 账号安全通知 - Account Login from New Location','security','sent','','','2026-07-27 07:04:21.321'),(39,'guichangyang@ccflysim.cn','[CW 模拟飞行] 账号安全通知 - Account Login from New Location','security','sent','','','2026-07-27 07:04:50.272'),(40,'guichangyang@ccflysim.cn','[CW 模拟飞行] 账号安全通知 - Account Login from New Location','security','sent','','','2026-07-27 07:05:14.114'),(41,'cca_3327@qq.com','[CW 模拟飞行] register - 验证码','verify','sent','','','2026-07-27 08:33:34.365'),(42,'cca_3327@qq.com','[CW 模拟飞行] 欢迎加入 CW 模拟飞行','notification','sent','','','2026-07-27 08:34:01.841'),(43,'3677157374@qq.com','[CW 模拟飞行] 账号安全通知 - Account Login from New Location','security','sent','','','2026-07-27 12:03:35.131'),(44,'3677157374@qq.com','[CW 模拟飞行] 账号安全通知 - Account Login from New Location','security','sent','','','2026-07-27 14:26:32.084'),(45,'3677157374@qq.com','[CW 模拟飞行] 账号安全通知 - Account Login from New Location','security','sent','','','2026-07-27 14:26:54.854'),(46,'3677157374@qq.com','[CW 模拟飞行] 账号安全通知 - Account Login from New Location','security','sent','','','2026-07-27 14:29:00.361'),(47,'3677157374@qq.com','[CW 模拟飞行] 账号安全通知 - Account Login from New Location','security','sent','','','2026-07-27 14:32:00.138'),(48,'3677157374@qq.com','[CW 模拟飞行] 账号安全通知 - Account Login from New Location','security','sent','','','2026-07-27 14:32:08.822'),(49,'3677157374@qq.com','[CW 模拟飞行] 账号安全通知 - Account Login from New Location','security','sent','','','2026-07-27 14:43:14.572'),(50,'3677157374@qq.com','[CW 模拟飞行] 账号安全通知 - Account Login from New Location','security','sent','','','2026-07-27 14:47:46.241'),(51,'guichangyang@ccflysim.cn','[CW 模拟飞行] 账号安全通知 - Account Login from New Location','security','sent','','','2026-07-27 14:48:39.192'),(52,'3677157374@qq.com','[CW 模拟飞行] 账号安全通知 - Account Login from New Location','security','sent','','','2026-07-27 14:52:40.137'),(53,'3677157374@qq.com','[CW 模拟飞行] 账号安全通知 - Account Login from New Location','security','sent','','','2026-07-27 14:53:08.386'),(54,'255674717@qq.com','[CW 模拟飞行] 账号安全通知 - Account Login from New Location','security','sent','','','2026-07-27 14:57:48.377'),(55,'255674717@qq.com','[CW 模拟飞行] 账号安全通知 - Account Login from New Location','security','sent','','','2026-07-27 16:33:16.477'),(56,'sn37313@163.com','[CW 模拟飞行] Account Permissions Changed','notification','sent','','','2026-07-27 16:37:28.025'),(57,'255674717@qq.com','[CW 模拟飞行] Ticket #2 Replied','notification','sent','','','2026-07-27 16:48:17.765'),(58,'255674717@qq.com','[CW 模拟飞行] Ticket #1 Replied','notification','sent','','','2026-07-27 16:48:26.459'),(59,'255674717@qq.com','[CW 模拟飞行] Ticket #3 Replied','notification','sent','','','2026-07-27 16:51:23.132'),(60,'255674717@qq.com','[CW 模拟飞行] Ticket #3 Replied','notification','sent','','','2026-07-27 16:51:23.207'),(61,'255674717@qq.com','[CW 模拟飞行] Account Permissions Changed','notification','sent','','','2026-07-27 16:56:33.138'),(62,'3677157374@qq.com','[CW 模拟飞行] Account Permissions Changed','notification','sent','','','2026-07-27 17:01:10.453'),(63,'cca_3327@qq.com','[CW 模拟飞行] Account Permissions Changed','notification','sent','','','2026-07-27 17:01:37.423'),(64,'cca_3327@qq.com','[CW 模拟飞行] Ticket #4 Replied','notification','sent','','','2026-07-28 02:35:21.612'),(65,'cca_3327@qq.com','[CW 模拟飞行] 账号安全通知 - 邮箱绑定','security','sent','','','2026-07-28 03:35:38.153'),(66,'hihaar9@gmail.com','[CW 模拟飞行] 邮箱验证 - 验证码','verify','sent','','','2026-07-28 07:55:21.786'),(67,'hihaar9@gmail.com','[CW 模拟飞行] 账号安全通知 - 邮箱绑定','security','sent','','','2026-07-28 07:55:30.933'),(68,'cca_3327@qq.com','[CW 模拟飞行] Account Permissions Changed','notification','sent','','','2026-07-28 14:50:13.633'),(69,'3677157374@qq.com','[CW 模拟飞行] Account Permissions Changed','notification','sent','','','2026-07-28 14:50:18.253'),(70,'3677157374@qq.com','[CW 模拟飞行] Account Permissions Changed','notification','sent','','','2026-07-28 14:51:09.197'),(71,'13621877532@163.com','[CW 模拟飞行] Account Permissions Changed','notification','sent','','','2026-07-28 14:51:19.662'),(72,'cca_3327@qq.com','[CW 模拟飞行] Staff Application - Rejected','review','sent','','','2026-07-28 14:51:52.168'),(73,'cca_3327@qq.com','[CW 模拟飞行] Controller Application - Rejected','review','sent','','','2026-07-28 18:12:21.766'),(74,'cca_3327@qq.com','[CW 模拟飞行] Staff Application - Rejected','review','sent','','','2026-07-29 15:08:40.510'),(75,'cca_3327@qq.com','[CW 模拟飞行] Staff Application - Approved','review','sent','','','2026-07-29 15:21:06.692'),(76,'3677157374@qq.com','[CW 模拟飞行] Account Permissions Changed','notification','sent','','','2026-07-29 16:43:44.853'),(77,'3841322452@qq.com','[CW 模拟飞行] register - 验证码','verify','sent','','','2026-07-30 05:09:57.901'),(78,'3841322452@qq.com','[CW 模拟飞行] 欢迎加入 CW 模拟飞行','notification','sent','','','2026-07-30 05:10:22.507'),(79,'2784808690@qq.com','[CW 模拟飞行] register - 验证码','verify','sent','','','2026-07-30 08:47:49.690'),(80,'2784808690@qq.com','[CW 模拟飞行] 欢迎加入 CW 模拟飞行','notification','sent','','','2026-07-30 08:48:11.344'),(81,'3819525145@qq.com','[CW 模拟飞行] register - 验证码','verify','sent','','','2026-07-30 08:49:07.908'),(82,'3819525145@qq.com','[CW 模拟飞行] 欢迎加入 CW 模拟飞行','notification','sent','','','2026-07-30 08:49:40.670'),(83,'2961431242@qq.com','[CW 模拟飞行] register - 验证码','verify','sent','','','2026-07-30 08:50:48.812'),(84,'2961431242@qq.com','[CW 模拟飞行] 欢迎加入 CW 模拟飞行','notification','sent','','','2026-07-30 08:51:20.735'),(85,'cca_3327@qq.com','[CW 模拟飞行] Controller Application - Rejected','review','sent','','','2026-07-31 06:27:22.872'),(86,'3639023079@qq.com','[CW 模拟飞行] register - 验证码','verify','sent','','','2026-08-02 08:08:57.295'),(87,'3639023079@qq.com','[CW 模拟飞行] 欢迎加入 CW 模拟飞行','notification','sent','','','2026-08-02 08:09:34.967'),(88,'255674717@qq.com','[CW 模拟飞行] Account Permissions Changed','notification','sent','','','2026-08-02 08:29:04.399'),(89,'3841322452@qq.com','[CW 模拟飞行] Controller Application - Approved','review','sent','','','2026-08-02 11:02:34.674'),(90,'cca_3327@qq.com','[CW 模拟飞行] Account Permissions Changed','notification','sent','','','2026-08-03 04:56:45.660'),(91,'cca_3327@qq.com','[CW 模拟飞行] Account Permissions Changed','notification','sent','','','2026-08-03 04:58:24.028'),(92,'cca_3327@qq.com','[CW 模拟飞行] Account Permissions Changed','notification','sent','','','2026-08-03 04:58:36.023'),(93,'3430075144@qq.com','[CW 模拟飞行] register - 验证码','verify','sent','','','2026-08-03 10:38:01.907'),(94,'3430075144@qq.com','[CW 模拟飞行] 欢迎加入 CW 模拟飞行','notification','sent','','','2026-08-03 10:39:09.429'),(95,'mnb123456789@qq.com','[CW 模拟飞行] register - 验证码','verify','sent','','','2026-08-03 10:39:36.710'),(96,'mnb1234567891@qq.com','[CW 模拟飞行] register - 验证码','verify','sent','','','2026-08-03 10:40:50.535'),(97,'mnb1234567891@qq.com','[CW 模拟飞行] 欢迎加入 CW 模拟飞行','notification','sent','','','2026-08-03 10:41:29.929'),(98,'mnb1234567891@qq.com','[CW 模拟飞行] Account Permissions Changed','notification','sent','','','2026-08-03 10:44:08.179'),(99,'255674717@qq.com','[CW 模拟飞行] Account Permissions Changed','notification','sent','','','2026-08-03 10:50:46.252'),(100,'3430075144@qq.com','[CW 模拟飞行] 账号安全通知 - 密码修改','security','sent','','','2026-08-03 11:04:00.810'),(101,'liuyiming2913@163.com','[CW 模拟飞行] register - 验证码','verify','sent','','','2026-08-03 11:45:47.756'),(102,'liuyiming2913@163.com','[CW 模拟飞行] 欢迎加入 CW 模拟飞行','notification','sent','','','2026-08-03 11:46:02.731'),(103,'13678991138@163.com','[CW 模拟飞行] register - 验证码','verify','sent','','','2026-08-03 11:57:48.605'),(104,'13678991138@163.com','[CW 模拟飞行] 欢迎加入 CW 模拟飞行','notification','sent','','','2026-08-03 11:58:07.029'),(105,'13621877532@163.com','[CW 模拟飞行] Controller Application - Approved','review','sent','','','2026-08-03 12:00:33.047'),(106,'3841322452@qq.com','[CW 模拟飞行] 账号安全通知 - 密码修改','security','sent','','','2026-08-03 12:03:23.016'),(107,'13678991138@163.com','[CW 模拟飞行] Controller Application - Approved','review','sent','','','2026-08-03 12:10:21.839'),(108,'13678991138@163.com','[CW 模拟飞行] Controller Application - Approved','review','sent','','','2026-08-03 12:10:29.141'),(109,'13678991138@163.com','[CW 模拟飞行] Account Permissions Changed','notification','sent','','','2026-08-03 12:11:14.145'),(110,'liuyiming2913@163.com','[CW 模拟飞行] 账号安全通知 - 密码修改','security','sent','','','2026-08-03 12:12:11.039'),(111,'3841322452@qq.com','[CW 模拟飞行] Account Permissions Changed','notification','sent','','','2026-08-03 12:22:21.051'),(112,'guichangyang@ccflysim.cn','[CW 模拟飞行] 账号安全通知 - 密码修改','security','sent','','','2026-08-03 16:30:10.731'),(113,'2784808690@qq.com','[CW 模拟飞行] Staff Application - Rejected','review','sent','','','2026-08-04 11:55:25.821'),(114,'13678991138@163.com','[CW 模拟飞行] Staff Application - Approved','review','sent','','','2026-08-04 11:55:49.723'),(115,'255674717@qq.com','[CW 模拟飞行] 账号权限变更','notification','sent','','','2026-08-04 14:16:13.253'),(116,'255674717@qq.com','[CW 模拟飞行] 账号权限变更','notification','sent','','','2026-08-04 14:46:22.570'),(117,'255674717@qq.com','[CW 模拟飞行] 账号权限变更','notification','sent','','','2026-08-04 14:46:34.637'),(118,'cca_3327@qq.com','[CW 模拟飞行] 账号权限变更','notification','sent','','','2026-08-04 14:47:29.872'),(119,'cca_3327@qq.com','[CW 模拟飞行] 账号权限变更','notification','sent','','','2026-08-04 14:47:32.880'),(120,'cca_3327@qq.com','[CW 模拟飞行] 账号权限变更','notification','sent','','','2026-08-04 14:47:34.950'),(121,'cca_3327@qq.com','[CW 模拟飞行] 账号权限变更','notification','sent','','','2026-08-04 14:47:37.057'),(122,'cca_3327@qq.com','[CW 模拟飞行] 账号权限变更','notification','sent','','','2026-08-04 14:47:39.767'),(123,'cca_3327@qq.com','[CW 模拟飞行] 账号权限变更','notification','sent','','','2026-08-04 14:47:42.769'),(124,'test@test.com','[CW 模拟飞行] 账号权限变更','notification','sent','','','2026-08-04 14:47:58.028'),(125,'aviation1712@163.com','[CW 模拟飞行] register - 验证码','verify','sent','','','2026-08-04 14:48:06.294'),(126,'aviation1712@163.com','[CW 模拟飞行] 欢迎加入 CW 模拟飞行','notification','sent','','','2026-08-04 14:48:30.029'),(127,'aviation1712@163.com','[CW 模拟飞行] 账号安全通知 - 邮箱绑定','security','sent','','','2026-08-04 14:49:37.834'),(128,'13621877532@163.com','[CW 模拟飞行] 账号安全通知 - 密码修改','security','sent','','','2026-08-04 14:49:57.530'),(129,'aviation1712@163.com','[CW 模拟飞行] 管制员申请 - 面试邀请','review','sent','','','2026-08-04 14:59:51.742'),(130,'13678991138@163.com','[CW 模拟飞行] 账号权限变更','notification','sent','','','2026-08-04 15:10:42.151'),(131,'sn37313@163.com','[CW 模拟飞行] 账号安全通知 - 密码修改','security','sent','','','2026-08-04 15:41:37.293');
/*!40000 ALTER TABLE `EmailLog` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Event`
--

DROP TABLE IF EXISTS `Event`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Event` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `date` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `dep` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `arr` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `route` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `publisher` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `distance` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `notams` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `atcPositions` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `desc` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '筹备中',
  `poster` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `time` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Event`
--

LOCK TABLES `Event` WRITE;
/*!40000 ALTER TABLE `Event` DISABLE KEYS */;
INSERT INTO `Event` VALUES (1,'展翅黄浦江，一览首都情','2026-08-03','ZSPD','ZBAA','ODULO B221 XDX W174 TAO W103 JDW V89 DOVIV W55 DUMAP','龙云','638nm','无','[{\"type\":\"GND\",\"callsign\":\"ZBAA_GND\",\"frequency\":\"121.800\",\"rating\":\"\"},{\"type\":\"TWR\",\"callsign\":\"ZBAA_TWR\",\"frequency\":\"118.50\",\"rating\":\"\"},{\"type\":\"APP\",\"callsign\":\"ZBAA_APP\",\"frequency\":\"120.600\",\"rating\":\"\"},{\"type\":\"CTR\",\"callsign\":\"ZBPE_CTR\",\"frequency\":\"125.900\",\"rating\":\"\"},{\"type\":\"CTR\",\"callsign\":\"ZSHA_CTR\",\"frequency\":\"124.550\",\"rating\":\"\"},{\"type\":\"APP\",\"callsign\":\"ZSSS_APP\",\"frequency\":\"120.300\",\"rating\":\"\"},{\"type\":\"TWR\",\"callsign\":\"ZSPD_TWR\",\"frequency\":\"118.80\",\"rating\":\"\"},{\"type\":\"GND\",\"callsign\":\"ZSPD_GND\",\"frequency\":\"121.700\",\"rating\":\"\"},{\"type\":\"DEL\",\"callsign\":\"ZSPD_DEL\",\"frequency\":\"121.950\",\"rating\":\"\"}]','','已结束','/uploads/posters/event_1785344429522.jpg',''),(2,'两京飞跃，盛举金陵','2026-08-09','ZBAA','ZSNJ','','龙云','','','[]','','筹备中','',''),(3,'湛江本场开放日 Zhanjiang Local Day','2026-08-11','ZGZJ','ZGZJ','','Kesol Liu','','','','','报名中','','');
/*!40000 ALTER TABLE `Event` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `EventRegistration`
--

DROP TABLE IF EXISTS `EventRegistration`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `EventRegistration` (
  `id` int NOT NULL AUTO_INCREMENT,
  `eventId` int NOT NULL,
  `userId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `callsign` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `aircraft` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `status` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'registered',
  `createdAt` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `updatedAt` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `position` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `type` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pilot',
  `frequency` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  PRIMARY KEY (`id`),
  KEY `EventRegistration_eventId_idx` (`eventId`),
  KEY `EventRegistration_userId_idx` (`userId`)
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `EventRegistration`
--

LOCK TABLES `EventRegistration` WRITE;
/*!40000 ALTER TABLE `EventRegistration` DISABLE KEYS */;
INSERT INTO `EventRegistration` VALUES (1,1,'6251','','','cancelled','2026-07-31T12:45:04.777Z','2026-07-31T12:45:04.777Z','TWR','controller',''),(2,1,'9698','','','cancelled','2026-07-31T12:47:51.295Z','2026-07-31T12:47:51.295Z','CTR','controller',''),(3,1,'7298','','','cancelled','2026-07-31T12:56:31.852Z','2026-07-31T12:56:31.852Z','APP','controller',''),(4,1,'7298','','','registered','2026-07-31T12:57:15.648Z','2026-07-31T12:57:15.648Z','','pilot',''),(5,1,'5966','','','cancelled','2026-07-31T19:11:21.626Z','2026-07-31T19:11:21.626Z','GND','controller',''),(6,1,'0325','','','cancelled','2026-07-31T19:18:49.373Z','2026-07-31T19:18:49.373Z','','pilot',''),(7,1,'5966','','','registered','2026-08-01T04:43:14.675Z','2026-08-01T04:43:14.675Z','ZBAA_TWR','controller',''),(8,1,'0116','CCA8358','A320-neo','cancelled','2026-08-02T08:11:48.915Z','2026-08-02T08:11:48.915Z','','pilot',''),(9,1,'9698','CES5155','A350-941','registered','2026-08-02T16:40:37.300Z','2026-08-02T16:40:37.300Z','','pilot',''),(10,1,'0325','PLAAF75','B737-800','registered','2026-08-02T17:13:46.866Z','2026-08-02T17:13:46.866Z','','pilot',''),(11,1,'2327','ZBPE_CTR','','registered','2026-08-03T09:51:35.475Z','2026-08-03T09:51:35.475Z','ZBPE_CTR','controller','125.900'),(12,1,'1145','RYA1145','A359','registered','2026-08-03T11:05:10.234Z','2026-08-03T11:05:10.234Z','','pilot','');
/*!40000 ALTER TABLE `EventRegistration` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Feedback`
--

DROP TABLE IF EXISTS `Feedback`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Feedback` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `content` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '待处理',
  `time` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`),
  KEY `Feedback_userId_idx` (`userId`),
  KEY `Feedback_status_idx` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Feedback`
--

LOCK TABLES `Feedback` WRITE;
/*!40000 ALTER TABLE `Feedback` DISABLE KEYS */;
/*!40000 ALTER TABLE `Feedback` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `FlightLog`
--

DROP TABLE IF EXISTS `FlightLog`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `FlightLog` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `callsign` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `aircraft` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `depIcao` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `arrIcao` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `route` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `flightTime` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `distance` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `depTime` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `arrTime` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `status` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'completed',
  `eventId` int NOT NULL DEFAULT '0',
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `FlightLog`
--

LOCK TABLES `FlightLog` WRITE;
/*!40000 ALTER TABLE `FlightLog` DISABLE KEYS */;
/*!40000 ALTER TABLE `FlightLog` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `FlightPlan`
--

DROP TABLE IF EXISTS `FlightPlan`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `FlightPlan` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `callsign` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `flightType` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'IFR',
  `aircraft` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `wakeCategory` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `equipment` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `transponder` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `depIcao` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `depTime` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `cruiseAlt` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `cruiseSpeed` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `arrIcao` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `alternate` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `flightTime` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `endurance` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `route` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `remarks` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `status` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'filed',
  `shareId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `filedAt` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `syncFsd` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `FlightPlan_userId_idx` (`userId`),
  KEY `FlightPlan_depIcao_idx` (`depIcao`),
  KEY `FlightPlan_arrIcao_idx` (`arrIcao`),
  KEY `FlightPlan_status_idx` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=21 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `FlightPlan`
--

LOCK TABLES `FlightPlan` WRITE;
/*!40000 ALTER TABLE `FlightPlan` DISABLE KEYS */;
INSERT INTO `FlightPlan` VALUES (6,'7298','CCA1729','IFR','A21N','M','SDE2E3FGHIRZ','LB1','ZBAA','0400','1200','450','ZBAA','ZBAA','0100','0100','LOCAL','','filed','ATRTB6ML','2026/8/3 11:46:35',0),(7,'7298','CCA1729','IFR','A21N','M','SDE2E3FGHIRZ','LB1','ZBAA','0400','1200','450','ZBAA','ZBAA','0100','0100','LOCAL','','filed','XKCWKXKS','2026/8/3 11:47:30',0),(8,'7298','CCA1729','IFR','A21N','M','SDE2E3FGHIRZ','LB1','ZBAA','0400','1200','450','ZBAA','ZBAA','0100','0100','LOCAL','','filed','TC4QKMFP','2026/8/3 12:55:41',0),(9,'0325','PLAAF75','IFR','B738','M','S','','ZSPD','1920','30100','450','ZBAA','ZBTJ','0130','0400','ODULO B221 XDX W174 TAO W103 JDW V89 DOVIV W55 DUMAP','','synced','23DLCZ7L','2026/8/3 18:31:04',1),(10,'6251','CCA6251','IFR','A339','H','SDE2E3FGILRWXY','LB1','ZSPD','1100','36100','480','ZBAA','ZBTJ','0330','0400','ODULO B221 XDX W174 TAO W103 JDW V89 DOVIV W55 DUMAP','','synced','F69CT5PS','2026/8/3 18:51:09',1),(11,'0325','PLAAF75','IFR','B738','M','S','','ZSPD','1920','30100','450','ZBAA','ZBTJ','0130','0400','ODULO B221 XDX W174 TAO W103 JDW V89 DOVIV W55 DUMAP','','filed','KZCF3R36','2026/8/3 19:12:04',0),(13,'0325','PLAAF75','IFR','B738','M','S','','ZSPD','1920','30100','450','ZBAA','ZBTJ','0130','0400','ODULO B221 XDX W174 TAO W103 JDW V89 DOVIV W55 DUMAP','','filed','W6PVDGVY','2026/8/3 19:12:43',0),(14,'1145','RYA1145','IFR','A359','H','','LB1','ZSPD','1130','36100','300','ZBAA','ZBAD','0230','0230','ODULO B221 XDX W174 TAO W103 JDW V89 DOVIV W55 DUMAP','','synced','SYB6PEJF','2026/8/3 19:12:48',1),(15,'2913','CSN2913','VFR','ZSPD','','','','ZSSS','','','467','ZGHA','','','15119','DCT POMOK G330 PIMOL A593 DALIM W157 AVBOX AVBO8Y','','filed','FLLZG6GZ','2026/8/3 20:10:52',0),(16,'2913','CSN2913','IFR','ZSPD','','','','ZSSS','','','467','ZGHA','','','15119','DCT POMOK G330 PIMOL A593 DALIM W157 AVBOX AVBO8Y','','filed','2WND6M3C','2026/8/3 20:10:59',0);
/*!40000 ALTER TABLE `FlightPlan` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `ForumBoard`
--

DROP TABLE IF EXISTS `ForumBoard`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ForumBoard` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `sort` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ForumBoard`
--

LOCK TABLES `ForumBoard` WRITE;
/*!40000 ALTER TABLE `ForumBoard` DISABLE KEYS */;
/*!40000 ALTER TABLE `ForumBoard` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `ForumPost`
--

DROP TABLE IF EXISTS `ForumPost`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ForumPost` (
  `id` int NOT NULL AUTO_INCREMENT,
  `boardId` int NOT NULL,
  `userId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `content` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `pinned` tinyint(1) NOT NULL DEFAULT '0',
  `locked` tinyint(1) NOT NULL DEFAULT '0',
  `views` int NOT NULL DEFAULT '0',
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `ForumPost_boardId_idx` (`boardId`),
  KEY `ForumPost_userId_idx` (`userId`),
  KEY `ForumPost_createdAt_idx` (`createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ForumPost`
--

LOCK TABLES `ForumPost` WRITE;
/*!40000 ALTER TABLE `ForumPost` DISABLE KEYS */;
/*!40000 ALTER TABLE `ForumPost` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `ForumReply`
--

DROP TABLE IF EXISTS `ForumReply`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ForumReply` (
  `id` int NOT NULL AUTO_INCREMENT,
  `postId` int NOT NULL,
  `userId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `content` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `ForumReply_postId_idx` (`postId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ForumReply`
--

LOCK TABLES `ForumReply` WRITE;
/*!40000 ALTER TABLE `ForumReply` DISABLE KEYS */;
/*!40000 ALTER TABLE `ForumReply` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `KnowledgeBase`
--

DROP TABLE IF EXISTS `KnowledgeBase`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `KnowledgeBase` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `content` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `category` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `tags` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `views` int NOT NULL DEFAULT '0',
  `status` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'published',
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `KnowledgeBase`
--

LOCK TABLES `KnowledgeBase` WRITE;
/*!40000 ALTER TABLE `KnowledgeBase` DISABLE KEYS */;
/*!40000 ALTER TABLE `KnowledgeBase` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `LoginLog`
--

DROP TABLE IF EXISTS `LoginLog`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `LoginLog` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `ip` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `userAgent` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `success` tinyint(1) NOT NULL DEFAULT '1',
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `LoginLog_userId_idx` (`userId`),
  KEY `LoginLog_createdAt_idx` (`createdAt`)
) ENGINE=InnoDB AUTO_INCREMENT=214 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `LoginLog`
--

LOCK TABLES `LoginLog` WRITE;
/*!40000 ALTER TABLE `LoginLog` DISABLE KEYS */;
INSERT INTO `LoginLog` VALUES (5,'5966','106.91.84.154','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',1,'2026-07-26 10:07:50.273'),(6,'5966','106.91.84.154','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',1,'2026-07-26 10:13:51.012'),(7,'5966','106.91.84.154','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',1,'2026-07-26 10:18:57.860'),(8,'0000','106.91.84.154','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',0,'2026-07-26 10:31:25.731'),(9,'0000','106.91.84.154','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',0,'2026-07-26 10:31:49.476'),(10,'0000','106.91.84.154','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',1,'2026-07-26 10:38:16.798'),(11,'5966','106.91.84.154','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Code/1.130.0 Chrome/148.0.7778.280 Electron/42.6.0 Safari/537.36',1,'2026-07-26 10:44:32.463'),(12,'5966','106.91.84.154','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Code/1.130.0 Chrome/148.0.7778.280 Electron/42.6.0 Safari/537.36',1,'2026-07-26 10:44:35.737'),(13,'0000','106.91.84.154','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Code/1.130.0 Chrome/148.0.7778.280 Electron/42.6.0 Safari/537.36',1,'2026-07-26 11:06:38.027'),(14,'5966','106.91.84.154','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',1,'2026-07-26 11:08:01.605'),(15,'5966','106.91.84.154','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',1,'2026-07-26 11:08:24.239'),(16,'0000','106.91.84.154','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Code/1.130.0 Chrome/148.0.7778.280 Electron/42.6.0 Safari/537.36',1,'2026-07-26 11:20:17.525'),(17,'5966','106.91.84.154','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',1,'2026-07-26 11:41:34.127'),(18,'5966','106.91.84.154','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',1,'2026-07-26 11:42:26.270'),(19,'2325','223.104.176.24','Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36 EdgA/150.0.0.0',1,'2026-07-26 11:43:43.140'),(20,'1234','1.202.123.78','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',1,'2026-07-26 11:44:13.104'),(21,'5966','106.91.84.154','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',1,'2026-07-26 11:51:58.652'),(22,'5966','106.91.84.154','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',1,'2026-07-26 12:00:51.071'),(23,'2325','223.104.176.24','Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36 EdgA/150.0.0.0',1,'2026-07-26 12:01:25.464'),(24,'0000','106.91.84.154','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Code/1.130.0 Chrome/148.0.7778.280 Electron/42.6.0 Safari/537.36',1,'2026-07-26 12:03:17.487'),(25,'0000','106.91.84.154','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Code/1.130.0 Chrome/148.0.7778.280 Electron/42.6.0 Safari/537.36',1,'2026-07-26 12:03:58.042'),(26,'0000','106.91.84.154','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Code/1.130.0 Chrome/148.0.7778.280 Electron/42.6.0 Safari/537.36',1,'2026-07-26 12:05:10.248'),(27,'0116','114.249.215.191','Mozilla/5.0 (iPad; CPU OS 18_7_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) EdgiOS/150.0.4078.81 Version/18.0 Mobile/15E148 Safari/604.1',0,'2026-07-26 12:08:12.320'),(28,'0116','114.249.215.191','Mozilla/5.0 (iPad; CPU OS 18_7_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) EdgiOS/150.0.4078.81 Version/18.0 Mobile/15E148 Safari/604.1',0,'2026-07-26 12:08:20.097'),(29,'0116','114.249.215.191','Mozilla/5.0 (iPad; CPU OS 18_7_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) EdgiOS/150.0.4078.81 Version/18.0 Mobile/15E148 Safari/604.1',0,'2026-07-26 12:08:22.649'),(30,'5966','106.91.84.154','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',1,'2026-07-26 12:09:33.328'),(31,'0000','::ffff:127.0.0.1','Python-urllib/3.11',0,'2026-07-26 13:52:01.452'),(32,'0000','::ffff:127.0.0.1','Python-urllib/3.11',1,'2026-07-26 13:52:35.563'),(33,'2325','223.104.176.24','Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36 EdgA/150.0.0.0',1,'2026-07-26 23:04:15.300'),(34,'2325','223.104.176.24','Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36 EdgA/150.0.0.0',1,'2026-07-26 23:04:22.355'),(35,'2325','223.104.176.24','Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36 EdgA/150.0.0.0',1,'2026-07-26 23:04:35.956'),(36,'2325','223.104.176.24','Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36 EdgA/150.0.0.0',1,'2026-07-26 23:05:27.125'),(37,'5966','106.91.86.25','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',1,'2026-07-27 04:13:13.138'),(38,'5966','106.91.86.25','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',1,'2026-07-27 04:39:33.288'),(39,'unknown','::1','curl/7.61.1',0,'2026-07-27 05:02:39.057'),(40,'unknown','::1','curl/7.61.1',0,'2026-07-27 05:03:01.009'),(41,'unknown','::1','curl/7.61.1',0,'2026-07-27 05:03:41.636'),(42,'unknown','::1','curl/7.61.1',0,'2026-07-27 05:04:16.614'),(43,'unknown','::1','curl/7.61.1',0,'2026-07-27 05:05:33.485'),(44,'unknown','::1','curl/7.61.1',0,'2026-07-27 05:22:36.287'),(45,'0000','::1','',1,'2026-07-27 05:25:49.171'),(46,'5966','106.91.86.25','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',1,'2026-07-27 05:31:27.233'),(47,'5966','106.91.86.25','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Code/1.130.0 Chrome/148.0.7778.280 Electron/42.6.0 Safari/537.36',1,'2026-07-27 05:34:27.066'),(48,'unknown','::1','curl/7.61.1',0,'2026-07-27 06:17:21.320'),(49,'unknown','::1','curl/7.61.1',0,'2026-07-27 06:50:05.540'),(50,'5966','106.91.86.25','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Code/1.130.0 Chrome/148.0.7778.280 Electron/42.6.0 Safari/537.36',0,'2026-07-27 06:57:10.562'),(51,'5966','106.91.86.25','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Code/1.130.0 Chrome/148.0.7778.280 Electron/42.6.0 Safari/537.36',1,'2026-07-27 06:57:21.841'),(52,'0000','::1','node',1,'2026-07-27 06:58:08.846'),(53,'0000','106.91.86.25','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Code/1.130.0 Chrome/148.0.7778.280 Electron/42.6.0 Safari/537.36',1,'2026-07-27 07:00:07.808'),(54,'0000','106.91.86.25','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Code/1.130.0 Chrome/148.0.7778.280 Electron/42.6.0 Safari/537.36',1,'2026-07-27 07:00:43.367'),(55,'unknown','38.76.182.6','curl/7.61.1',0,'2026-07-27 07:02:31.553'),(56,'unknown','38.76.182.6','curl/7.61.1',0,'2026-07-27 07:02:39.558'),(57,'2325','117.136.120.8','Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36 EdgA/150.0.0.0',1,'2026-07-27 07:03:04.226'),(58,'5966','106.91.86.25','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Code/1.130.0 Chrome/148.0.7778.280 Electron/42.6.0 Safari/537.36',1,'2026-07-27 07:04:18.553'),(59,'5966','106.91.86.25','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',1,'2026-07-27 07:04:47.685'),(60,'5966','106.91.86.25','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',1,'2026-07-27 07:05:11.713'),(61,'0000','127.0.0.1','',1,'2026-07-27 07:06:29.946'),(62,'0000','127.0.0.1','',1,'2026-07-27 07:06:57.242'),(63,'0000','127.0.0.1','',1,'2026-07-27 07:07:58.060'),(64,'0325','39.144.81.121','Mozilla/5.0 (Linux; U; Android 16; zh-tw; PKB110 Build/BP2A.250605.015) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/115.0.5790.168 Mobile Safari/537.36 HeyTapBrowser/40.10.19.1',1,'2026-07-27 07:41:00.030'),(65,'0325','39.144.81.121','Mozilla/5.0 (Linux; U; Android 16; zh-tw; PKB110 Build/BP2A.250605.015) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/115.0.5790.168 Mobile Safari/537.36 HeyTapBrowser/40.10.19.1',1,'2026-07-27 08:15:54.961'),(66,'unknown','::1','curl/7.61.1',0,'2026-07-27 09:15:45.945'),(67,'0325','111.32.73.209','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',1,'2026-07-27 12:03:32.529'),(68,'5966','106.91.86.25','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',1,'2026-07-27 14:48:36.683'),(69,'1234','36.112.178.83','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',1,'2026-07-27 14:57:45.908'),(70,'1234','36.112.178.83','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',1,'2026-07-27 16:33:13.844'),(71,'2327','125.76.41.225','Mozilla/5.0 (Linux; Android 15; ALI-AN00 Build/HONORALI-AN00; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/149.0.7827.91 Mobile Safari/537.36',1,'2026-07-27 16:34:27.869'),(72,'2327','125.76.41.225','Mozilla/5.0 (Linux; Android 15; ALI-AN00 Build/HONORALI-AN00; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/149.0.7827.91 Mobile Safari/537.36',1,'2026-07-27 16:35:48.888'),(73,'2325','183.193.165.139','Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36 EdgA/150.0.0.0',1,'2026-07-27 16:37:02.074'),(74,'2325','114.88.34.240','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',1,'2026-07-27 16:37:48.409'),(75,'2325','114.88.34.240','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',1,'2026-07-27 16:37:52.791'),(76,'2325','114.88.34.240','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',1,'2026-07-27 16:37:54.144'),(77,'2325','114.88.34.240','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',1,'2026-07-27 16:37:56.269'),(78,'2325','114.88.34.240','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',1,'2026-07-27 16:38:06.179'),(79,'2325','114.88.34.240','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',1,'2026-07-27 16:38:26.758'),(80,'2325','114.88.34.240','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',1,'2026-07-27 16:38:29.618'),(81,'2327','125.76.41.225','Mozilla/5.0 (Linux; Android 15; ALI-AN00 Build/HONORALI-AN00; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/149.0.7827.91 Mobile Safari/537.36',1,'2026-07-27 16:38:35.525'),(82,'2325','114.88.34.240','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',1,'2026-07-27 16:38:36.980'),(83,'2327','125.76.41.225','Mozilla/5.0 (Linux; Android 15; ALI-AN00 Build/HONORALI-AN00; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/149.0.7827.91 Mobile Safari/537.36',1,'2026-07-27 16:39:04.161'),(84,'2327','125.76.41.225','Mozilla/5.0 (Linux; Android 15; ALI-AN00 Build/HONORALI-AN00; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/149.0.7827.91 Mobile Safari/537.36',1,'2026-07-27 16:49:44.224'),(85,'2325','114.88.34.240','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',1,'2026-07-27 16:56:08.862'),(86,'unknown','106.91.86.25','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/81.0.4044.138 Safari/537.36',0,'2026-07-27 17:46:29.717'),(87,'unknown','106.91.86.25','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.3 Safari/605.1.15',0,'2026-07-27 17:46:42.692'),(88,'unknown','106.91.86.25','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',0,'2026-07-27 17:46:43.593'),(89,'unknown','106.91.86.25','Mozilla/5.0 (Macintosh, Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',0,'2026-07-27 17:46:43.645'),(90,'unknown','106.91.86.25','Mozilla/5.0 (X11; Linux i686; en-US) Gecko/20010604 Firefox/109.0',0,'2026-07-27 17:46:43.730'),(91,'0000','106.91.86.25','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Code/1.130.0 Chrome/148.0.7778.280 Electron/42.6.0 Safari/537.36',0,'2026-07-27 18:41:58.052'),(92,'5966','38.76.182.6','Mozilla/5.0',0,'2026-07-27 19:23:08.547'),(93,'5966','38.76.182.6','Mozilla/5.0',0,'2026-07-27 19:30:41.350'),(94,'5966','38.76.182.6','Mozilla/5.0',0,'2026-07-27 19:30:46.898'),(95,'7298','120.225.64.0','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 QuarkPC/7.0.0.907',0,'2026-07-28 02:25:50.933'),(96,'7298','120.225.64.0','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 QuarkPC/7.0.0.907',1,'2026-07-28 02:26:05.436'),(97,'5966','106.91.86.25','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Code/1.130.0 Chrome/148.0.7778.280 Electron/42.6.0 Safari/537.36',0,'2026-07-28 02:28:50.371'),(98,'unknown','106.91.86.25','Mozilla/5.0 (Debian; Linux i686) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',0,'2026-07-28 03:39:47.257'),(99,'unknown','106.91.86.25','Mozilla/5.0 (ZZ; Linux i686) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',0,'2026-07-28 03:39:59.948'),(100,'unknown','106.91.86.25','Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',0,'2026-07-28 03:40:00.900'),(101,'unknown','106.91.86.25','Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/604.1',0,'2026-07-28 03:40:00.954'),(102,'unknown','106.91.86.25','Mozilla/5.0 (Kubuntu; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',0,'2026-07-28 03:40:01.063'),(103,'5966','106.91.86.25','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Code/1.130.0 Chrome/148.0.7778.280 Electron/42.6.0 Safari/537.36',1,'2026-07-28 04:11:32.174'),(104,'1234','124.127.12.46','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',1,'2026-07-28 06:22:32.506'),(105,'7298','120.225.64.0','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 QuarkPC/7.0.0.907',1,'2026-07-28 07:49:13.787'),(106,'6737','14.117.155.68','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',1,'2026-07-28 07:55:16.284'),(107,'5966','106.91.86.25','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',1,'2026-07-28 08:32:29.961'),(108,'7298','120.225.64.0','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 QuarkPC/7.0.0.907',1,'2026-07-28 13:17:06.741'),(109,'7298','120.225.64.0','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 QuarkPC/7.0.0.907',1,'2026-07-28 13:26:40.544'),(110,'7298','120.225.64.0','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.5735.196 Safari/537.36',0,'2026-07-28 14:34:17.546'),(111,'7298','120.225.64.0','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.5735.196 Safari/537.36',0,'2026-07-28 14:34:31.351'),(112,'7298','120.225.64.0','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.5735.196 Safari/537.36',0,'2026-07-28 14:34:33.821'),(113,'7298','120.225.64.0','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.5735.196 Safari/537.36',0,'2026-07-28 14:34:50.535'),(114,'7298','120.225.64.0','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.5735.196 Safari/537.36',0,'2026-07-28 14:36:27.811'),(115,'7298','120.225.64.0','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.5735.196 Safari/537.36',0,'2026-07-28 14:37:37.287'),(116,'7298','120.225.64.0','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.5735.196 Safari/537.36',0,'2026-07-28 14:37:52.022'),(117,'7298','120.225.64.0','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.5735.196 Safari/537.36',0,'2026-07-28 14:38:04.681'),(118,'7298','120.225.64.0','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.5735.196 Safari/537.36',1,'2026-07-28 14:39:40.534'),(119,'unknown','::ffff:127.0.0.1','curl/7.61.1',0,'2026-07-29 14:07:07.930'),(120,'1234','124.127.221.239','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',1,'2026-07-29 14:12:36.316'),(121,'7298','120.225.64.0','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.5735.196 Safari/537.36',1,'2026-07-29 14:45:54.618'),(122,'5966','106.91.86.25','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',1,'2026-07-29 14:51:55.647'),(123,'0325','111.30.236.159','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',1,'2026-07-29 15:01:19.372'),(124,'5966','106.91.86.25','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Code/1.130.0 Chrome/148.0.7778.280 Electron/42.6.0 Safari/537.36',1,'2026-07-29 17:52:23.111'),(125,'7298','120.225.64.0','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 QuarkPC/7.0.0.907',1,'2026-07-30 00:32:36.483'),(126,'5966','106.91.86.25','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',1,'2026-07-30 09:58:05.565'),(127,'unknown','::1','curl/7.61.1',0,'2026-07-30 10:41:56.944'),(128,'unknown','::1','curl/7.61.1',0,'2026-07-30 10:42:50.232'),(129,'unknown','::1','curl/7.61.1',0,'2026-07-30 10:44:15.988'),(130,'unknown','::1','curl/7.61.1',0,'2026-07-30 10:45:12.662'),(131,'0000','::ffff:127.0.0.1','',0,'2026-07-30 10:45:40.844'),(132,'0000','106.91.86.25','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Code/1.131.0 Chrome/148.0.7778.280 Electron/42.7.0 Safari/537.36',0,'2026-07-30 11:22:02.091'),(133,'unknown','106.91.86.25','Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',0,'2026-07-30 12:14:04.832'),(134,'unknown','106.91.86.25','Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0',0,'2026-07-30 12:14:17.808'),(135,'unknown','106.91.86.25','Mozilla/5.0 (X11; Linux i686; en-US) Gecko/20010604 Firefox/109.0',0,'2026-07-30 12:14:19.724'),(136,'unknown','106.91.86.25','Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/117.0',0,'2026-07-30 12:14:19.871'),(137,'unknown','106.91.86.25','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1',0,'2026-07-30 12:14:19.970'),(138,'7298','111.36.255.29','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 QuarkPC/7.0.0.907',1,'2026-07-31 06:11:49.668'),(139,'7298','111.36.255.29','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.131 Safari/537.36 Edg/92.0.902.67',1,'2026-07-31 06:24:26.513'),(140,'7298','111.36.255.29','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 QuarkPC/7.0.0.907',1,'2026-07-31 06:41:51.652'),(141,'9698','114.84.8.204','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',1,'2026-07-31 12:46:58.333'),(142,'5966','106.91.86.25','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',1,'2026-07-31 18:24:46.980'),(143,'0325','111.30.236.159','Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.7049.79 Safari/537.36 XiaoMi/MiuiBrowser/20.5.810527',1,'2026-07-31 19:15:41.343'),(144,'7298','111.36.255.29','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 QuarkPC/7.0.0.907',1,'2026-08-01 03:47:20.132'),(145,'6737','14.117.137.171','Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',1,'2026-08-02 06:33:24.981'),(146,'6737','14.117.137.171','Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',1,'2026-08-02 06:37:52.809'),(147,'2325','133.18.145.81','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',1,'2026-08-02 07:28:48.765'),(148,'7298','111.36.255.29','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 QuarkPC/7.0.0.907',1,'2026-08-02 07:46:03.138'),(149,'5966','106.91.86.25','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0',1,'2026-08-02 08:28:26.881'),(150,'unknown','::1','curl/7.61.1',0,'2026-08-02 11:01:12.601'),(151,'unknown','127.0.0.1','curl/7.61.1',0,'2026-08-02 11:14:58.541'),(152,'unknown','::1','node',0,'2026-08-02 11:31:08.236'),(153,'unknown','106.91.86.25','Mozilla/5.0 (Windows NT 10.0: Win64: x64: rv:140.0) Gecko/20100101 Firefox/140.0',0,'2026-08-02 18:20:53.124'),(154,'unknown','106.91.86.25','Mozilla/5.0 (Windows NT 6.2; rv:31.0) Gecko/20100101 Firefox/31.0',0,'2026-08-02 18:21:32.148'),(155,'unknown','106.91.86.25','Mozilla/5.0 (X11; Linux i686; rv:1.9.7.20) Gecko/ Firefox/3.6.20',0,'2026-08-02 18:21:37.015'),(156,'unknown','106.91.86.25','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Safari/605.1.15',0,'2026-08-02 18:21:37.015'),(157,'unknown','106.91.86.25','Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/117.0',0,'2026-08-02 18:21:37.129'),(158,'7298','111.36.255.29','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 QuarkPC/7.0.0.907',0,'2026-08-03 03:21:14.521'),(159,'7298','111.36.255.29','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 QuarkPC/7.0.0.907',1,'2026-08-03 03:21:31.251'),(160,'2327','42.91.136.206','Mozilla/5.0 (Linux; Android 15; ALI-AN00 Build/HONORALI-AN00; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/149.0.7827.91 Mobile Safari/537.36',1,'2026-08-03 05:46:11.416'),(161,'2327','39.144.210.22','Mozilla/5.0 (Linux; Android 15; ALI-AN00 Build/HONORALI-AN00; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/149.0.7827.91 Mobile Safari/537.36',1,'2026-08-03 09:50:58.450'),(162,'0325','111.32.73.60','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0',1,'2026-08-03 10:20:28.487'),(163,'2327','42.91.136.206','Mozilla/5.0 (Linux; Android 15; ALI-AN00 Build/HONORALI-AN00; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/149.0.7827.91 Mobile Safari/537.36',1,'2026-08-03 10:31:09.764'),(164,'2327','42.91.136.206','Mozilla/5.0 (Linux; Android 15; ALI-AN00 Build/HONORALI-AN00; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/149.0.7827.91 Mobile Safari/537.36',1,'2026-08-03 10:41:49.455'),(165,'5966','106.91.83.179','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0',1,'2026-08-03 10:50:11.143'),(166,'9698','114.84.8.204','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0',1,'2026-08-03 11:12:31.861'),(167,'2327','39.144.210.22','Mozilla/5.0 (Linux; Android 15; ALI-AN00 Build/HONORALI-AN00; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/149.0.7827.91 Mobile Safari/537.36',1,'2026-08-03 11:14:52.958'),(168,'5966','::ffff:127.0.0.1','Mozilla/5.0',0,'2026-08-03 11:16:08.754'),(169,'1234','124.127.26.2','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',1,'2026-08-03 11:33:19.757'),(170,'6737','134.195.101.48','Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',1,'2026-08-03 11:33:57.010'),(171,'2325','183.193.159.217','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',1,'2026-08-03 11:55:58.455'),(172,'1618','112.94.187.166','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',1,'2026-08-03 12:20:13.618'),(173,'0000','106.91.83.179','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Code/1.131.0 Chrome/148.0.7778.280 Electron/42.7.0 Safari/537.36',1,'2026-08-03 14:18:59.359'),(174,'5966','::1','curl/7.61.1',0,'2026-08-03 16:24:43.336'),(175,'0000','::1','curl/7.61.1',1,'2026-08-03 16:25:07.417'),(176,'0000','::1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',1,'2026-08-03 16:25:21.905'),(177,'0000','::1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',1,'2026-08-03 16:25:41.028'),(178,'0000','::1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/125.0',1,'2026-08-03 17:50:44.250'),(179,'0000','::1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/125.0',1,'2026-08-03 17:51:18.575'),(180,'0000','::1','curl/7.61.1',1,'2026-08-03 17:53:02.913'),(181,'0000','::1','curl/7.61.1',1,'2026-08-03 17:53:28.742'),(182,'0000','::1','curl/7.61.1',1,'2026-08-03 17:54:24.857'),(183,'0000','::1','curl/7.61.1',1,'2026-08-03 17:55:20.123'),(184,'0000','::1','curl/7.61.1',1,'2026-08-03 17:56:26.035'),(185,'0000','::1','curl/7.61.1',1,'2026-08-03 18:05:10.240'),(186,'0000','::1','curl/7.61.1',1,'2026-08-03 18:05:37.049'),(187,'9698','114.84.8.204','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0',1,'2026-08-03 19:47:07.467'),(188,'0325','111.30.237.56','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0',1,'2026-08-04 10:24:45.628'),(189,'2327','117.136.27.141','Mozilla/5.0 (Linux; Android 15; ALI-AN00 Build/HONORALI-AN00; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/149.0.7827.91 Mobile Safari/537.36',1,'2026-08-04 12:09:47.704'),(190,'2327','117.136.27.141','Mozilla/5.0 (Linux; Android 15; ALI-AN00 Build/HONORALI-AN00; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/149.0.7827.91 Mobile Safari/537.36',1,'2026-08-04 12:09:53.279'),(191,'2327','117.136.27.141','Mozilla/5.0 (Linux; Android 15; ALI-AN00 Build/HONORALI-AN00; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/149.0.7827.91 Mobile Safari/537.36',1,'2026-08-04 12:40:47.661'),(192,'5966','106.91.83.179','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0',0,'2026-08-04 12:54:53.812'),(193,'5966','106.91.83.179','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0',1,'2026-08-04 12:55:00.131'),(194,'5966','36.112.178.80','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0',0,'2026-08-04 14:05:33.329'),(195,'2327','36.112.178.80','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0',1,'2026-08-04 14:07:23.187'),(196,'2327','36.112.178.80','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0',1,'2026-08-04 14:07:28.261'),(197,'2327','36.112.178.80','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0',1,'2026-08-04 14:07:32.097'),(198,'2327','36.112.178.80','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0',1,'2026-08-04 14:07:45.838'),(199,'7298','36.112.178.80','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0',0,'2026-08-04 14:11:03.813'),(200,'1729','36.112.178.80','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0',0,'2026-08-04 14:11:11.524'),(201,'0325','36.112.178.80','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0',1,'2026-08-04 14:11:38.447'),(202,'1234','36.112.178.80','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0',1,'2026-08-04 14:16:19.167'),(203,'5966','106.91.83.179','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Code/1.131.0 Chrome/148.0.7778.280 Electron/42.7.0 Safari/537.36',1,'2026-08-04 14:36:59.802'),(204,'2325','114.88.34.240','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',1,'2026-08-04 14:45:57.416'),(205,'5966','106.91.83.179','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0',1,'2026-08-04 14:46:01.046'),(206,'7298','111.36.255.29','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 QuarkPC/7.0.5.931',1,'2026-08-04 14:46:38.055'),(207,'2325','114.88.34.240','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',1,'2026-08-04 14:50:12.872'),(208,'1618','112.94.187.166','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',1,'2026-08-04 15:04:56.048'),(209,'1618','112.94.187.166','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',1,'2026-08-04 15:23:19.957'),(210,'2327','117.136.27.141','Mozilla/5.0 (Linux; Android 15; ALI-AN00 Build/HONORALI-AN00; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/149.0.7827.91 Mobile Safari/537.36',1,'2026-08-04 15:40:54.853'),(211,'0325','111.30.237.56','Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.7049.79 Safari/537.36 XiaoMi/MiuiBrowser/20.5.810527',1,'2026-08-04 15:54:11.135'),(212,'0325','111.30.237.56','Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.7049.79 Safari/537.36 XiaoMi/MiuiBrowser/20.5.810527',1,'2026-08-04 15:54:27.608'),(213,'0325','111.30.237.56','Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.7049.79 Safari/537.36 XiaoMi/MiuiBrowser/20.5.810527',1,'2026-08-04 15:55:05.427');
/*!40000 ALTER TABLE `LoginLog` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Meeting`
--

DROP TABLE IF EXISTS `Meeting`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Meeting` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `date` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `size` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `content` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ready',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Meeting`
--

LOCK TABLES `Meeting` WRITE;
/*!40000 ALTER TABLE `Meeting` DISABLE KEYS */;
/*!40000 ALTER TABLE `Meeting` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Notification`
--

DROP TABLE IF EXISTS `Notification`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Notification` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `content` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `link` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `read` tinyint(1) NOT NULL DEFAULT '0',
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `Notification_userId_idx` (`userId`),
  KEY `Notification_read_idx` (`read`)
) ENGINE=InnoDB AUTO_INCREMENT=23 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Notification`
--

LOCK TABLES `Notification` WRITE;
/*!40000 ALTER TABLE `Notification` DISABLE KEYS */;
INSERT INTO `Notification` VALUES (1,'0000','announcement','5966sb','5966sb','/announcements',0,'2026-07-29 15:01:40.276'),(2,'0325','announcement','5966sb','5966sb','/announcements',0,'2026-07-29 15:01:40.298'),(3,'1234','announcement','5966sb','5966sb','/announcements',0,'2026-07-29 15:01:40.308'),(4,'2325','announcement','5966sb','5966sb','/announcements',0,'2026-07-29 15:01:40.330'),(5,'2327','announcement','5966sb','5966sb','/announcements',0,'2026-07-29 15:01:40.345'),(6,'5966','announcement','5966sb','5966sb','/announcements',0,'2026-07-29 15:01:40.357'),(7,'6737','announcement','5966sb','5966sb','/announcements',0,'2026-07-29 15:01:40.365'),(8,'7250','announcement','5966sb','5966sb','/announcements',0,'2026-07-29 15:01:40.377'),(9,'7298','announcement','5966sb','5966sb','/announcements',1,'2026-07-29 15:01:40.393'),(10,'9999','announcement','5966sb','5966sb','/announcements',0,'2026-07-29 15:01:40.411'),(11,'6251','event','管制员报名成功：展翅黄浦江，一览首都情','您已成功以管制员身份报名「展翅黄浦江，一览首都情」。','/events',0,'2026-07-31 12:45:04.939'),(12,'9698','event','管制员报名成功：展翅黄浦江，一览首都情','您已成功以管制员身份报名「展翅黄浦江，一览首都情」。','/events',0,'2026-07-31 12:47:51.357'),(13,'7298','event','管制员报名成功：展翅黄浦江，一览首都情','您已成功以管制员身份报名「展翅黄浦江，一览首都情」。','/events',0,'2026-07-31 12:56:31.871'),(14,'7298','event','飞行员报名成功：展翅黄浦江，一览首都情','您已成功以飞行员身份报名「展翅黄浦江，一览首都情」。','/events',0,'2026-07-31 12:57:15.676'),(15,'5966','event','管制员报名成功：展翅黄浦江，一览首都情','您已成功以管制员身份报名「展翅黄浦江，一览首都情」。','/events',0,'2026-07-31 19:11:21.664'),(16,'0325','event','飞行员报名成功：展翅黄浦江，一览首都情','您已成功以飞行员身份报名「展翅黄浦江，一览首都情」。','/events',0,'2026-07-31 19:18:49.443'),(17,'5966','event','管制员报名成功：展翅黄浦江，一览首都情','您已成功以管制员身份报名「展翅黄浦江，一览首都情」。','/events',0,'2026-08-01 04:43:14.721'),(18,'0116','event','飞行员报名成功：展翅黄浦江，一览首都情','您已成功以飞行员身份报名「展翅黄浦江，一览首都情」。','/events',0,'2026-08-02 08:11:48.955'),(19,'9698','event','飞行员报名成功：展翅黄浦江，一览首都情','您已成功以飞行员身份报名「展翅黄浦江，一览首都情」。','/events',0,'2026-08-02 16:40:37.348'),(20,'0325','event','飞行员报名成功：展翅黄浦江，一览首都情','您已成功以飞行员身份报名「展翅黄浦江，一览首都情」。','/events',0,'2026-08-02 17:13:46.914'),(21,'2327','event','管制员报名成功：展翅黄浦江，一览首都情','您已成功以管制员身份报名「展翅黄浦江，一览首都情」。','/events',0,'2026-08-03 09:51:35.536'),(22,'1145','event','飞行员报名成功：展翅黄浦江，一览首都情','您已成功以飞行员身份报名「展翅黄浦江，一览首都情」。','/events',0,'2026-08-03 11:05:10.366');
/*!40000 ALTER TABLE `Notification` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Permission`
--

DROP TABLE IF EXISTS `Permission`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Permission` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  PRIMARY KEY (`id`),
  UNIQUE KEY `Permission_name_key` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Permission`
--

LOCK TABLES `Permission` WRITE;
/*!40000 ALTER TABLE `Permission` DISABLE KEYS */;
/*!40000 ALTER TABLE `Permission` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Role`
--

DROP TABLE IF EXISTS `Role`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Role` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  PRIMARY KEY (`id`),
  UNIQUE KEY `Role_name_key` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Role`
--

LOCK TABLES `Role` WRITE;
/*!40000 ALTER TABLE `Role` DISABLE KEYS */;
/*!40000 ALTER TABLE `Role` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `SecurityEvent`
--

DROP TABLE IF EXISTS `SecurityEvent`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `SecurityEvent` (
  `id` int NOT NULL AUTO_INCREMENT,
  `ip` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `userAgent` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `referrer` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `path` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `country` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `city` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `blocked` tinyint(1) NOT NULL DEFAULT '0',
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `SecurityEvent_createdAt_idx` (`createdAt`),
  KEY `SecurityEvent_ip_idx` (`ip`)
) ENGINE=InnoDB AUTO_INCREMENT=45 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `SecurityEvent`
--

LOCK TABLES `SecurityEvent` WRITE;
/*!40000 ALTER TABLE `SecurityEvent` DISABLE KEYS */;
/*!40000 ALTER TABLE `SecurityEvent` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Staff`
--

DROP TABLE IF EXISTS `Staff`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Staff` (
  `cid` int NOT NULL,
  `name` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `department` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `position` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `rating` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `online` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`cid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Staff`
--

LOCK TABLES `Staff` WRITE;
/*!40000 ALTER TABLE `Staff` DISABLE KEYS */;
INSERT INTO `Staff` VALUES (325,'龙云','管制部','塔台管制员','S1',1,0),(1234,'quanquan','区域管制','C1 T2','C1',1,0),(1618,'Kesol Liu','Control','塔台学员','S2',1,0),(1860,'SCHINA','培训部','I2教员','S3',1,0),(2325,'JiaqiZhang','Control','平台主任','ADM',1,0),(2327,'Eric He','培训部','主任教员','SUP',1,0),(5966,'yuanshen','培训部','技术','ADM',1,0),(6251,'6251','Control','Controller','S2',1,0),(7298,'HYA1729','技术部','Staff','',1,0);
/*!40000 ALTER TABLE `Staff` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `SystemConfig`
--

DROP TABLE IF EXISTS `SystemConfig`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `SystemConfig` (
  `id` int NOT NULL AUTO_INCREMENT,
  `key` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `value` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  PRIMARY KEY (`id`),
  UNIQUE KEY `SystemConfig_key_key` (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `SystemConfig`
--

LOCK TABLES `SystemConfig` WRITE;
/*!40000 ALTER TABLE `SystemConfig` DISABLE KEYS */;
/*!40000 ALTER TABLE `SystemConfig` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Ticket`
--

DROP TABLE IF EXISTS `Ticket`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Ticket` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `category` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'general',
  `priority` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'normal',
  `content` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'open',
  `assignee` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `reply` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `createdAt` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `updatedAt` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`),
  KEY `Ticket_userId_idx` (`userId`),
  KEY `Ticket_status_idx` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Ticket`
--

LOCK TABLES `Ticket` WRITE;
/*!40000 ALTER TABLE `Ticket` DISABLE KEYS */;
INSERT INTO `Ticket` VALUES (7,'0000','浏览器测试','technical','normal','测试工单提交','open','','','2026/8/3 22:18:59','2026/8/3 22:18:59'),(8,'9698','工单标题','general','normal','详细描述你的问题或建议','open','','','2026/8/4 03:48:29','2026/8/4 03:48:29');
/*!40000 ALTER TABLE `Ticket` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `TicketReply`
--

DROP TABLE IF EXISTS `TicketReply`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `TicketReply` (
  `id` int NOT NULL AUTO_INCREMENT,
  `ticketId` int NOT NULL,
  `userId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `content` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `attachment` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `TicketReply`
--

LOCK TABLES `TicketReply` WRITE;
/*!40000 ALTER TABLE `TicketReply` DISABLE KEYS */;
/*!40000 ALTER TABLE `TicketReply` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `TrainingCourse`
--

DROP TABLE IF EXISTS `TrainingCourse`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `TrainingCourse` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `category` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `content` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `TrainingCourse`
--

LOCK TABLES `TrainingCourse` WRITE;
/*!40000 ALTER TABLE `TrainingCourse` DISABLE KEYS */;
/*!40000 ALTER TABLE `TrainingCourse` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `TrainingExam`
--

DROP TABLE IF EXISTS `TrainingExam`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `TrainingExam` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `courseId` int NOT NULL DEFAULT '0',
  `questions` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '[]',
  `passingScore` int NOT NULL DEFAULT '60',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `TrainingExam`
--

LOCK TABLES `TrainingExam` WRITE;
/*!40000 ALTER TABLE `TrainingExam` DISABLE KEYS */;
/*!40000 ALTER TABLE `TrainingExam` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `TrainingRecord`
--

DROP TABLE IF EXISTS `TrainingRecord`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `TrainingRecord` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `courseId` int NOT NULL,
  `examId` int NOT NULL DEFAULT '0',
  `score` int NOT NULL DEFAULT '0',
  `passed` tinyint(1) NOT NULL DEFAULT '0',
  `completed` tinyint(1) NOT NULL DEFAULT '0',
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `TrainingRecord`
--

LOCK TABLES `TrainingRecord` WRITE;
/*!40000 ALTER TABLE `TrainingRecord` DISABLE KEYS */;
/*!40000 ALTER TABLE `TrainingRecord` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `User`
--

DROP TABLE IF EXISTS `User`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `User` (
  `id` int NOT NULL AUTO_INCREMENT,
  `cid` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `username` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `role` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'user',
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `avatar` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `email` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `fsdLevel` int NOT NULL DEFAULT '1',
  `qq` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `resetCode` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT '',
  `resetCodeExpires` datetime(3) DEFAULT NULL,
  `salt` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `rating` int NOT NULL DEFAULT '0',
  `permissions` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `fsdPasswordHash` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `bgImage` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  PRIMARY KEY (`id`),
  UNIQUE KEY `User_cid_key` (`cid`)
) ENGINE=InnoDB AUTO_INCREMENT=26 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `User`
--

LOCK TABLES `User` WRITE;
/*!40000 ALTER TABLE `User` DISABLE KEYS */;
INSERT INTO `User` VALUES (1,'0000','管理员','$2b$12$j2K2znOjt0tZOcmmhfncHu2p3EFFdMhHXT88C8s9NXiOuKNtOmWSO','admin','2026-07-26 05:36:28.374','','',12,'','',NULL,'',12,'user,flightplan,event,controller,staff,ticket,online','61674e4e18181ec6436ebbec359627edb1587ef3424ca53ce14169b5ad123fd9',''),(6,'5966','yuanshen','$2b$12$k72nllpdEbUKazDrR8R3buEGT7ySqvOECle/wDG1CvGj1L/thzYGS','admin','2026-07-26 09:58:01.083','https://q1.qlogo.cn/g?b=qq&nk=501827685&s=100','guichangyang@ccflysim.cn',12,'501827685','',NULL,'',12,'user,flightplan,event,controller,staff,ticket,online','9b8619ec42633ce66b1d9f3f5f2d64bf13ac6c53fdb7e1c2a26918814a4522e8','/uploads/backgrounds/bg_5966_1785409999354.png'),(7,'2325','JiaqiZhang','$2b$12$VDXmkPf018qSFIuEozd8weBv1J1XUB1jvi1fjOpNv6au5A626k8Yi','admin','2026-07-26 10:27:21.584','https://q1.qlogo.cn/g?b=qq&nk=3284715587&s=100','13621877532@163.com',12,'3284715587','',NULL,'',12,'user,flightplan,event,controller,staff,ticket,online','c2b2b812ac4eeb89f760abe888812600c8957fbade54c1d3fb0e630fa421fa84',''),(8,'0325','龙云','$2b$12$uhyfjRcddwC.1WYiTHAkUuY5rJzz1PwuJ5mtDzEcOohsyG6aKptB2','admin','2026-07-26 10:30:29.172','/uploads/avatars/0325_1785062145754.png','3677157374@qq.com',1,'','',NULL,'',11,'event','21fc2737c2749eff84029c5f41b9e4d63129e3054a0827a1913a44240e7e9c89',''),(9,'6737','hihaar','$2b$12$e43eb59AwhusEyP2pVBTVOTtjc3CBpBObtJUx3WEAlPa7nFTGNEBy','user','2026-07-26 10:34:27.795','https://q1.qlogo.cn/g?b=qq&nk=877692719&s=100','hihaar9@gmail.com',1,'877692719','942606','2026-07-28 08:05:19.091','',0,'','173ae97f560c91ba123984e8cc2de0b0e86dcffa36581cbd41c6b251047afa6f',''),(10,'1234','quanquan','$2b$12$CPNO5ugr3/sdSA3QYDxsiezHd29k1o1Ii1ncVV9Cy5ud6ODz02ryS','user','2026-07-26 10:37:16.428','/uploads/avatars/1234_1785169930067.jpg','255674717@qq.com',5,'','',NULL,'',12,'','bdf24963557bae7f47761407269102613be4848b00536ffaad74042beb82ef70',''),(11,'2327','Eric He','$2b$12$TyTt7EpEwe4IrV7SNUbTl.cCKd5MtakySKtC6WIgIekUxUgx0DfxG','admin','2026-07-26 11:45:58.234','','sn37313@163.com',12,'','',NULL,'',12,'user,flightplan,event,controller,staff,ticket,online','f566ecfd891f52f796ea1969a66f366c3bbd17297988e7f3b56b2580d9ddea1d',''),(12,'9999','test','$2b$12$R/YoRkCk9XJ5h0iutdILoODRg85AvXn/6OBrwF4kEdwBeGMufdMyS','user','2026-07-26 13:37:16.684','','test@test.com',1,'','',NULL,'',12,'user,flightplan,event,controller,staff,ticket,online','',''),(13,'7250','CTY7250','$2b$12$aJNRYJ2iknVBxZLM.zycReSSYJevigkTUN6xyCbESU7FIA9NlrmwS','user','2026-07-26 13:41:17.465','https://q1.qlogo.cn/g?b=qq&nk=1663867250&s=100','1663867250@qq.com',1,'1663867250','',NULL,'',0,'','',''),(14,'7298','HYA1729','$2b$12$SHSz4Gotz6B1dKsUiVxCPe7YOtf9LuEeeByD6ezC4D6.rstlDKv5i','admin','2026-07-27 08:33:59.109','/uploads/avatars/7298_1785245240503.jpg','cca_3327@qq.com',1,'3844137553','',NULL,'',12,'user,flightplan,event,controller,staff,ticket,online','cbe7422f22e0616d8b59e40addf50bb91031f2c3dc305c323e84ad6606a83845','/uploads/backgrounds/bg_7298_1785565959860.png'),(15,'6251','6251','$2b$12$JdP4LbrmUdOYjc7ablwHIO5hewTkdBgAdRLzDDiaFpRNjrQis8pe.','user','2026-07-30 05:10:20.030','','3841322452@qq.com',3,'','',NULL,'',0,'','8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92',''),(16,'9698','CES9698','$2b$12$3flR6.9pFEuDr9IuTQrWN.kaOZKwWKXFRsY5fVOu4m48eos83jxOu','user','2026-07-30 08:48:08.618','','2784808690@qq.com',1,'','',NULL,'',0,'','8132d333d6589bac6dae20ab92a6906fb88e4c6571da3e047fd2bdb39851d470',''),(17,'9697','CSH9697','$2b$12$rv3uXhhJO1TJP4Bh2r38iegRcJGrNKiipT9MzmtviK9s5CaAY50qC','user','2026-07-30 08:49:37.923','','3819525145@qq.com',1,'','',NULL,'',0,'','c486b285cf96dab7db45dd3c633f8b0cff876283809f9f6ee5ed8ab9815c4417',''),(18,'9699','CKK9699','$2b$12$LdmHQ6mB0Xj/Atq61UrUhOd/JAcJzSAosNnTlHPZXS4.MYoAsJlRa','user','2026-07-30 08:51:18.466','','2961431242@qq.com',1,'','',NULL,'',0,'','861f6eaf834f1399a4cba9783d337b5a7f7fca8713aa4f1738b9f11d6a3d66e8',''),(19,'0116','spentwing','$2b$12$5sedaWTGi6/Y3021VXj4pORs6i5z39N6mDivkxkYuFuk7j8EN/1Xq','user','2026-08-02 08:09:32.247','','3639023079@qq.com',1,'','',NULL,'',0,'','857d71459282c8c94bd2562cfa5b5bacea26d49b326f82907fd03811c2a7addd',''),(20,'1145','去有风的地方','$2b$12$W8f1Eh2wrqsXiCmvJdwAzOHqRW09y8phXuQmf3txpJXMirWsLgWnS','user','2026-08-03 10:39:07.129','','3430075144@qq.com',1,'','',NULL,'',0,'','81abb3d61a074a4ba48809f81a931857147220dc7f830079b8d5145074b91b66',''),(21,'1860','SCHINA','$2b$12$mWyZ0C94x4sdoQk8D6PWnOBH59/DdGlyjhOQgnPUaVmUiKtrjAbze','user','2026-08-03 10:41:27.341','','mnb1234567891@qq.com',9,'','',NULL,'',0,'controller,user,flightplan,ticket','8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92',''),(22,'2913','liuyiming2913','$2b$12$pdIcVRQFEeSL/3D9kdOk4e/JjxAQoCzXG1uhsIYDySwEWE6/f.50G','user','2026-08-03 11:46:00.198','','liuyiming2913@163.com',1,'','',NULL,'',0,'','3a1c683b9cc4b16ccd1055e9149c9d908528bd84dfd7e303fa2ed5c6394aa55a',''),(23,'1618','Kesol Liu','$2b$12$uB5y4VMrCUVSCjqZkGknCeqSysFYFLEkFosMA.wfACrGSiRsSPXiq','user','2026-08-03 11:58:04.655','','13678991138@163.com',3,'','',NULL,'',9,'event','2caef75c407af0f06f497d3e7281c412d25e7b07210a231a8f66c4314751bd06',''),(25,'1712','1712','$2b$12$.ilGQCdqpOEmSFSMZOvjlu7iWCbh/Htj.01edk/FKx.XQ3nZr72t.','user','2026-08-04 14:48:27.745','https://q1.qlogo.cn/g?b=qq&nk=3578146833&s=100','aviation1712@163.com',1,'3578146833','',NULL,'',0,'','b948670a2ad788312eab07fb9ddcb166e2c020b42342a8247e0c844eece1b240','');
/*!40000 ALTER TABLE `User` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `UserAchievement`
--

DROP TABLE IF EXISTS `UserAchievement`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `UserAchievement` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `achievementId` int NOT NULL,
  `earnedAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `UserAchievement`
--

LOCK TABLES `UserAchievement` WRITE;
/*!40000 ALTER TABLE `UserAchievement` DISABLE KEYS */;
/*!40000 ALTER TABLE `UserAchievement` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `UserFavorite`
--

DROP TABLE IF EXISTS `UserFavorite`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `UserFavorite` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `targetId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `label` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `UserFavorite`
--

LOCK TABLES `UserFavorite` WRITE;
/*!40000 ALTER TABLE `UserFavorite` DISABLE KEYS */;
/*!40000 ALTER TABLE `UserFavorite` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `UserPoint`
--

DROP TABLE IF EXISTS `UserPoint`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `UserPoint` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `points` int NOT NULL DEFAULT '0',
  `exp` int NOT NULL DEFAULT '0',
  `level` int NOT NULL DEFAULT '1',
  `flights` int NOT NULL DEFAULT '0',
  `hours` double NOT NULL DEFAULT '0',
  `updatedAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `UserPoint_userId_key` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `UserPoint`
--

LOCK TABLES `UserPoint` WRITE;
/*!40000 ALTER TABLE `UserPoint` DISABLE KEYS */;
/*!40000 ALTER TABLE `UserPoint` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `VerificationCode`
--

DROP TABLE IF EXISTS `VerificationCode`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `VerificationCode` (
  `id` int NOT NULL AUTO_INCREMENT,
  `email` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `code` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `expiresAt` datetime(3) NOT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `VerificationCode_email_idx` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `VerificationCode`
--

LOCK TABLES `VerificationCode` WRITE;
/*!40000 ALTER TABLE `VerificationCode` DISABLE KEYS */;
INSERT INTO `VerificationCode` VALUES (1,'1','274595','2026-07-26 13:45:03.576','2026-07-26 13:35:03.589'),(10,'mnb123456789@qq.com','657534','2026-08-03 10:49:34.455','2026-08-03 10:39:34.471');
/*!40000 ALTER TABLE `VerificationCode` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `_prisma_migrations`
--

DROP TABLE IF EXISTS `_prisma_migrations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `_prisma_migrations` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `checksum` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `finished_at` datetime(3) DEFAULT NULL,
  `migration_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `logs` text COLLATE utf8mb4_unicode_ci,
  `rolled_back_at` datetime(3) DEFAULT NULL,
  `started_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `applied_steps_count` int unsigned NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `_prisma_migrations`
--

LOCK TABLES `_prisma_migrations` WRITE;
/*!40000 ALTER TABLE `_prisma_migrations` DISABLE KEYS */;
INSERT INTO `_prisma_migrations` VALUES ('d6bf67e1-c79e-4d2c-90d0-5b70a32aadaa','44b3e838474a78be72f2fbf1ffef0e0a4e76fcee491b0ff6e2ed0a4c6f776409','2026-07-26 05:35:35.514','20260718164005_init',NULL,NULL,'2026-07-26 05:35:35.357',1),('e98538bc-4f8f-4c4b-ac26-5cb715fbbe5d','7fa8842b4694ff9aa39c09197273540d2553b94f2831372f1d35c93eced1b49a',NULL,'20260718170458_add_salt','A migration failed to apply. New migrations cannot be applied before the error is recovered from. Read more about how to resolve migration issues in a production database: https://pris.ly/d/migrate-resolve\n\nMigration name: 20260718170458_add_salt\n\nDatabase error code: 1146\n\nDatabase error:\nTable \'cwfly.user\' doesn\'t exist\n\nPlease check the query number 1 from the migration file.\n\n   0: sql_schema_connector::apply_migration::apply_script\n           with migration_name=\"20260718170458_add_salt\"\n             at schema-engine/connectors/sql-schema-connector/src/apply_migration.rs:113\n   1: schema_commands::commands::apply_migrations::Applying migration\n           with migration_name=\"20260718170458_add_salt\"\n             at schema-engine/commands/src/commands/apply_migrations.rs:95\n   2: schema_core::state::ApplyMigrations\n             at schema-engine/core/src/state.rs:255',NULL,'2026-07-26 05:35:35.517',0);
/*!40000 ALTER TABLE `_prisma_migrations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping routines for database 'cwfly'
--
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-08-05  0:20:30
