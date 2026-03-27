CREATE TYPE "GovernanceAuditAction" AS ENUM (
  'ACCOUNT_CREATED',
  'ROLE_REQUESTED',
  'ROLE_GRANTED',
  'ROLE_REVOKED',
  'USER_ACTIVATED',
  'USER_BLOCKED'
);

CREATE TABLE "GovernanceAuditEntry" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "actorId" UUID,
  "action" "GovernanceAuditAction" NOT NULL,
  "role" "Role",
  "source" "RoleGrantSource",
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "GovernanceAuditEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GovernanceAuditEntry_userId_createdAt_idx"
ON "GovernanceAuditEntry"("userId", "createdAt");

CREATE INDEX "GovernanceAuditEntry_actorId_idx"
ON "GovernanceAuditEntry"("actorId");

CREATE INDEX "GovernanceAuditEntry_action_idx"
ON "GovernanceAuditEntry"("action");

ALTER TABLE "GovernanceAuditEntry"
ADD CONSTRAINT "GovernanceAuditEntry_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GovernanceAuditEntry"
ADD CONSTRAINT "GovernanceAuditEntry_actorId_fkey"
FOREIGN KEY ("actorId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
