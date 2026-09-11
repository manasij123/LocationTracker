-- AlterTable
ALTER TABLE "Share" ADD COLUMN     "isLive" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "LiveTrackPoint" (
    "id" TEXT NOT NULL,
    "shareId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "waitPointLabel" INTEGER,

    CONSTRAINT "LiveTrackPoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LiveTrackPoint_shareId_idx" ON "LiveTrackPoint"("shareId");

-- CreateIndex
CREATE INDEX "LiveTrackPoint_recordedAt_idx" ON "LiveTrackPoint"("recordedAt");

-- AddForeignKey
ALTER TABLE "LiveTrackPoint" ADD CONSTRAINT "LiveTrackPoint_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "Share"("id") ON DELETE CASCADE ON UPDATE CASCADE;
