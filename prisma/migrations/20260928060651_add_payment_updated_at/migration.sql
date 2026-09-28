-- AlterTable
-- Temporary default lets this run on tables that already have rows;
-- it is dropped right after to match schema.prisma (@updatedAt has no DB default).
ALTER TABLE "Payment" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Payment" ALTER COLUMN "updatedAt" DROP DEFAULT;
