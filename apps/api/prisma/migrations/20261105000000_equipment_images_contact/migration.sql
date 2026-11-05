-- CreateTable
CREATE TABLE `equipment_images` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `equipmentTypeId` INTEGER NOT NULL,
    `contentType` VARCHAR(16) NOT NULL,
    `data` MEDIUMBLOB NOT NULL,

    INDEX `equipment_images_equipmentTypeId_id_idx`(`equipmentTypeId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contact_messages` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `email` VARCHAR(254) NOT NULL,
    `message` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `equipment_images` ADD CONSTRAINT `equipment_images_equipmentTypeId_fkey` FOREIGN KEY (`equipmentTypeId`) REFERENCES `equipment_types`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

