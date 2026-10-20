-- CreateEnum
CREATE TYPE "BookingKind" AS ENUM ('BOOKING', 'BLOCK');

-- CreateEnum
CREATE TYPE "BookingAttendance" AS ENUM ('SCHEDULED', 'ATTENDED', 'NO_SHOW', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationKind" ADD VALUE 'COACHING_BOOKING_CREATED';
ALTER TYPE "NotificationKind" ADD VALUE 'COACHING_BOOKING_CHANGED';
ALTER TYPE "NotificationKind" ADD VALUE 'COACHING_BOOKING_CANCELLED';
ALTER TYPE "NotificationKind" ADD VALUE 'COACHING_WORKOUT_LOGGED';

-- AlterTable
ALTER TABLE "coaching_links" ADD COLUMN     "consentCopyVersion" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "workout_sessions" ADD COLUMN     "bookingId" TEXT,
ADD COLUMN     "loggedById" TEXT;

-- CreateTable
CREATE TABLE "booking_series" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startLocalTime" TEXT NOT NULL,
    "durationMin" INTEGER NOT NULL,
    "timeZone" TEXT NOT NULL,
    "startsOn" TEXT NOT NULL,
    "endsOn" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "seriesId" TEXT,
    "kind" "BookingKind" NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "durationMin" INTEGER NOT NULL,
    "timeZone" TEXT NOT NULL,
    "location" TEXT,
    "note" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_clients" (
    "bookingId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "workoutRef" JSONB,
    "attendance" "BookingAttendance" NOT NULL DEFAULT 'SCHEDULED',
    "attendanceAt" TIMESTAMP(3),
    "workoutSessionId" TEXT,

    CONSTRAINT "booking_clients_pkey" PRIMARY KEY ("bookingId","clientId")
);

-- CreateIndex
CREATE INDEX "booking_series_trainerId_idx" ON "booking_series"("trainerId");

-- CreateIndex
CREATE INDEX "bookings_trainerId_startsAt_idx" ON "bookings"("trainerId", "startsAt");

-- CreateIndex
CREATE INDEX "bookings_seriesId_idx" ON "bookings"("seriesId");

-- CreateIndex
CREATE INDEX "booking_clients_clientId_bookingId_idx" ON "booking_clients"("clientId", "bookingId");

-- AddForeignKey
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_loggedById_fkey" FOREIGN KEY ("loggedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_series" ADD CONSTRAINT "booking_series_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "booking_series"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_clients" ADD CONSTRAINT "booking_clients_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_clients" ADD CONSTRAINT "booking_clients_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

