-- AlterEnum
ALTER TYPE "ShortLinkVisibility" ADD VALUE 'PASSWORD';

-- AlterTable
ALTER TABLE "ShortLink" ADD COLUMN     "accessVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "passwordHash" TEXT;

-- CreateTable
CREATE TABLE "ShortLinkShareUser" (
    "shortLinkId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShortLinkShareUser_pkey" PRIMARY KEY ("shortLinkId","userId")
);

-- CreateIndex
CREATE INDEX "ShortLinkShareUser_userId_idx" ON "ShortLinkShareUser"("userId");

-- AddForeignKey
ALTER TABLE "ShortLinkShareUser" ADD CONSTRAINT "ShortLinkShareUser_shortLinkId_fkey" FOREIGN KEY ("shortLinkId") REFERENCES "ShortLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShortLinkShareUser" ADD CONSTRAINT "ShortLinkShareUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
