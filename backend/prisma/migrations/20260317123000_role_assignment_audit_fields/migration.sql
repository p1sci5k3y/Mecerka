CREATE TYPE "RoleGrantSource" AS ENUM ('SELF_SERVICE', 'ADMIN');

ALTER TABLE "User"
ADD COLUMN "lastRoleGrantedById" UUID,
ADD COLUMN "lastRoleSource" "RoleGrantSource";

CREATE INDEX "User_lastRoleGrantedById_idx" ON "User"("lastRoleGrantedById");
