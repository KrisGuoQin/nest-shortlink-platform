-- CreateEnum
CREATE TYPE "ShortLinkStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "ShortLinkVisibility" AS ENUM ('PUBLIC', 'WORKSPACE', 'PRIVATE');

-- CreateTable
CREATE TABLE "ShortLink" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "code" VARCHAR(16) NOT NULL,
    "originUrl" TEXT NOT NULL,
    "title" VARCHAR(200),
    "visibility" "ShortLinkVisibility" NOT NULL DEFAULT 'PUBLIC',
    "status" "ShortLinkStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3),
    "maxVisits" INTEGER,
    "visitCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShortLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShortLink_code_key" ON "ShortLink"("code");

-- CreateIndex
CREATE INDEX "ShortLink_workspaceId_createdAt_idx" ON "ShortLink"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "ShortLink_workspaceId_status_idx" ON "ShortLink"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "ShortLink_createdById_idx" ON "ShortLink"("createdById");

-- AddForeignKey
ALTER TABLE "ShortLink" ADD CONSTRAINT "ShortLink_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShortLink" ADD CONSTRAINT "ShortLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
