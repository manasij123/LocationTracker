-- CreateEnum
CREATE TYPE "ShareStatus" AS ENUM ('active', 'expired', 'revoked');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('share_created', 'link_opened', 'share_expired', 'share_revoked');

-- CreateEnum
CREATE TYPE "DeviceType" AS ENUM ('android', 'ios', 'desktop', 'other');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Share" (
    "id" TEXT NOT NULL,
    "publicToken" TEXT NOT NULL,
    "placeName" TEXT NOT NULL,
    "formattedAddress" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "providerPlaceId" TEXT,
    "note" TEXT,
    "status" "ShareStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "Share_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShareOpen" (
    "id" TEXT NOT NULL,
    "shareId" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "visitorHash" TEXT NOT NULL,
    "deviceType" "DeviceType" NOT NULL DEFAULT 'other',
    "userAgentCategory" TEXT,

    CONSTRAINT "ShareOpen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "shareId" TEXT,
    "type" "ActivityType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "ActivityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Place" (
    "id" TEXT NOT NULL,
    "providerPlaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "formattedAddress" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Place_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Share_publicToken_key" ON "Share"("publicToken");

-- CreateIndex
CREATE INDEX "Share_publicToken_idx" ON "Share"("publicToken");

-- CreateIndex
CREATE INDEX "Share_createdBy_idx" ON "Share"("createdBy");

-- CreateIndex
CREATE INDEX "Share_expiresAt_idx" ON "Share"("expiresAt");

-- CreateIndex
CREATE INDEX "Share_createdAt_idx" ON "Share"("createdAt");

-- CreateIndex
CREATE INDEX "Share_status_idx" ON "Share"("status");

-- CreateIndex
CREATE INDEX "ShareOpen_shareId_idx" ON "ShareOpen"("shareId");

-- CreateIndex
CREATE INDEX "ShareOpen_openedAt_idx" ON "ShareOpen"("openedAt");

-- CreateIndex
CREATE INDEX "ActivityEvent_userId_idx" ON "ActivityEvent"("userId");

-- CreateIndex
CREATE INDEX "ActivityEvent_shareId_idx" ON "ActivityEvent"("shareId");

-- CreateIndex
CREATE INDEX "ActivityEvent_createdAt_idx" ON "ActivityEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Place_providerPlaceId_key" ON "Place"("providerPlaceId");

-- AddForeignKey
ALTER TABLE "Share" ADD CONSTRAINT "Share_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareOpen" ADD CONSTRAINT "ShareOpen_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "Share"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "Share"("id") ON DELETE SET NULL ON UPDATE CASCADE;
