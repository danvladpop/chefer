-- Lane K1 (market review 2026-10): a client opts in, per coaching, to share
-- their food log and / or body weight with their trainer. Both default off.

-- AlterTable
ALTER TABLE "coaching_links" ADD COLUMN     "shareFoodAt" TIMESTAMP(3),
ADD COLUMN     "shareWeightAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "coaching_requests" ADD COLUMN     "shareFood" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "shareWeight" BOOLEAN NOT NULL DEFAULT false;
