-- CreateTable
CREATE TABLE `notifications` (
    `eventId` INTEGER NOT NULL,

    PRIMARY KEY (`eventId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `bookings_status_startDate_id_idx` ON `bookings`(`status`, `startDate`, `id`);

-- CreateIndex
CREATE INDEX `bookings_status_endDate_id_idx` ON `bookings`(`status`, `endDate`, `id`);

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `booking_events`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill in-app messages for booking events recorded before notifications existed.
INSERT INTO notifications (eventId)
SELECT id FROM booking_events WHERE toStatus IN ('CONFIRMED', 'EXPIRED');
