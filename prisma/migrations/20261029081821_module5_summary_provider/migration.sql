-- AlterTable
ALTER TABLE "DocumentSummary" ADD COLUMN     "model" TEXT,
ADD COLUMN     "provider" TEXT NOT NULL DEFAULT 'local';
