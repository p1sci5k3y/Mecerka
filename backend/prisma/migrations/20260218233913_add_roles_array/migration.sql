/*
  Warnings:

  - You are about to drop the column `role` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "User" ADD COLUMN "roles" "Role"[] DEFAULT ARRAY['CLIENT']::"Role"[];

-- Migrate Data
UPDATE "User" SET "roles" = ARRAY["role"] WHERE "role" IS NOT NULL;

-- Drop original column
ALTER TABLE "User" DROP COLUMN "role";
