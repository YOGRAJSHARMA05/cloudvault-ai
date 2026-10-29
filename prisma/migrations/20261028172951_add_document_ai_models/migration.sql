-- CreateTable
CREATE TABLE "DocumentSummary" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "executiveSummary" TEXT NOT NULL,
    "keyPoints" JSONB NOT NULL,
    "importantTechnologies" JSONB NOT NULL,
    "importantDates" JSONB NOT NULL,
    "actionItems" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentSummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentSummary_fileId_key" ON "DocumentSummary"("fileId");

-- CreateIndex
CREATE INDEX "DocumentSummary_userId_fileId_idx" ON "DocumentSummary"("userId", "fileId");

-- CreateTable
CREATE TABLE "DocumentMetadata" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "author" TEXT,
    "pageCount" INTEGER,
    "wordCount" INTEGER,
    "characterCount" INTEGER,
    "readingTimeMinutes" INTEGER,
    "language" TEXT,
    "headingsCount" INTEGER,
    "paragraphsCount" INTEGER,
    "fileSize" TEXT,
    "fileType" TEXT,
    "extra" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentMetadata_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentMetadata_fileId_key" ON "DocumentMetadata"("fileId");

-- CreateIndex
CREATE INDEX "DocumentMetadata_userId_fileId_idx" ON "DocumentMetadata"("userId", "fileId");
