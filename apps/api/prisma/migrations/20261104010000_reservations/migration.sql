-- CreateTable
CREATE TABLE `bookings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `customerId` INTEGER NOT NULL,
    `equipmentTypeId` INTEGER NOT NULL,
    `startDate` DATE NOT NULL,
    `endDate` DATE NOT NULL,
    `status` ENUM('HELD', 'CONFIRMED', 'PICKED_UP', 'RETURNED', 'CANCELLED', 'EXPIRED') NOT NULL,
    `holdExpiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL,

    INDEX `bookings_equipmentTypeId_status_startDate_endDate_idx`(`equipmentTypeId`, `status`, `startDate`, `endDate`),
    INDEX `bookings_customerId_id_idx`(`customerId`, `id`),
    INDEX `bookings_status_holdExpiresAt_idx`(`status`, `holdExpiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `booking_allocations` (
    `bookingId` INTEGER NOT NULL,
    `unitId` INTEGER NOT NULL,

    INDEX `booking_allocations_unitId_bookingId_idx`(`unitId`, `bookingId`),
    PRIMARY KEY (`bookingId`, `unitId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `booking_events` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `bookingId` INTEGER NOT NULL,
    `actorId` INTEGER NULL,
    `fromStatus` ENUM('HELD', 'CONFIRMED', 'PICKED_UP', 'RETURNED', 'CANCELLED', 'EXPIRED') NULL,
    `toStatus` ENUM('HELD', 'CONFIRMED', 'PICKED_UP', 'RETURNED', 'CANCELLED', 'EXPIRED') NOT NULL,
    `occurredAt` DATETIME(3) NOT NULL,

    INDEX `booking_events_bookingId_id_idx`(`bookingId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `booking_requests` (
    `userId` INTEGER NOT NULL,
    `operation` ENUM('CREATE_HOLD', 'CONFIRM') NOT NULL,
    `keyHash` CHAR(64) NOT NULL,
    `fingerprint` CHAR(64) NOT NULL,
    `outcome` JSON NOT NULL,

    PRIMARY KEY (`userId`, `operation`, `keyHash`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_equipmentTypeId_fkey` FOREIGN KEY (`equipmentTypeId`) REFERENCES `equipment_types`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_allocations` ADD CONSTRAINT `booking_allocations_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `bookings`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_allocations` ADD CONSTRAINT `booking_allocations_unitId_fkey` FOREIGN KEY (`unitId`) REFERENCES `equipment_units`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_events` ADD CONSTRAINT `booking_events_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `bookings`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_events` ADD CONSTRAINT `booking_events_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_requests` ADD CONSTRAINT `booking_requests_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

