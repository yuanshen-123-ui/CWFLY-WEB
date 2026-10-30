-- AlterTable
ALTER TABLE `achievement` ADD COLUMN `condition` VARCHAR(191) NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE `application` ADD COLUMN `reviewComment` VARCHAR(191) NOT NULL DEFAULT '',
    ADD COLUMN `reviewedBy` VARCHAR(191) NOT NULL DEFAULT '';
