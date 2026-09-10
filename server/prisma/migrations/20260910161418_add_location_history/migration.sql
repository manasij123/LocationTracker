-- CreateTable
CREATE TABLE "LocationHistory" (
    "id" TEXT NOT NULL,
    "shareId" TEXT NOT NULL,
    "placeName" TEXT NOT NULL,
    "formattedAddress" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocationHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LocationHistory_shareId_idx" ON "LocationHistory"("shareId");

-- CreateIndex
CREATE INDEX "LocationHistory_createdAt_idx" ON "LocationHistory"("createdAt");

-- AddForeignKey
ALTER TABLE "LocationHistory" ADD CONSTRAINT "LocationHistory_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "Share"("id") ON DELETE CASCADE ON UPDATE CASCADE;
