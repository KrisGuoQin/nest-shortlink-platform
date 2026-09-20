/*
  Warnings:

  - You are about to drop the column `originUrl` on the `ShortLink` table. All the data in the column will be lost.
  - Added the required column `originalUrl` to the `ShortLink` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ShortLink" DROP COLUMN "originUrl",
ADD COLUMN     "originalUrl" TEXT NOT NULL;
