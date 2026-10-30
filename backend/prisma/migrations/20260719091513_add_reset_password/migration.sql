-- AlterTable
ALTER TABLE `user` ADD COLUMN `resetCode` VARCHAR(191) NULL DEFAULT '',
    ADD COLUMN `resetCodeExpires` DATETIME(3) NULL;
