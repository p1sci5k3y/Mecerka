import {
  GovernanceAuditAction,
  Prisma,
  Role,
  RoleGrantSource,
} from '@prisma/client';

type GovernanceAuditClient = {
  governanceAuditEntry: {
    create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
  };
};

export async function recordGovernanceAudit(
  client: GovernanceAuditClient,
  data: {
    userId: string;
    actorId?: string | null;
    action: GovernanceAuditAction;
    role?: Role | null;
    source?: RoleGrantSource | null;
    metadata?: Prisma.InputJsonValue | null;
  },
) {
  const payload: Record<string, unknown> = {
    userId: data.userId,
    actorId: data.actorId ?? null,
    action: data.action,
  };

  if (data.role !== undefined) {
    payload.role = data.role;
  }

  if (data.source !== undefined) {
    payload.source = data.source;
  }

  if (data.metadata !== undefined) {
    payload.metadata = data.metadata === null ? Prisma.JsonNull : data.metadata;
  }

  return client.governanceAuditEntry.create({
    data: payload,
  });
}
