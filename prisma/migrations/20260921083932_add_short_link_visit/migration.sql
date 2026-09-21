-- CreateTable
CREATE TABLE "ShortLinkVisit" (
    "eventId" TEXT NOT NULL,
    "shortLinkId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "shortCode" VARCHAR(16) NOT NULL,
    "visitedAt" TIMESTAMP(3) NOT NULL,
    "ipHash" VARCHAR(64),
    "userAgent" VARCHAR(512),
    "referer" TEXT,
    "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShortLinkVisit_pkey" PRIMARY KEY ("eventId")
);

-- CreateIndex
CREATE INDEX "ShortLinkVisit_shortLinkId_visitedAt_idx" ON "ShortLinkVisit"("shortLinkId", "visitedAt");

-- CreateIndex
CREATE INDEX "ShortLinkVisit_workspaceId_visitedAt_idx" ON "ShortLinkVisit"("workspaceId", "visitedAt");

-- CreateIndex
CREATE INDEX "ShortLinkVisit_visitedAt_idx" ON "ShortLinkVisit"("visitedAt");
