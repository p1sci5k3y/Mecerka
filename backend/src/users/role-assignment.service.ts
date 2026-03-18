import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import {
  Prisma,
  Role,
  RoleGrantSource,
  RoleRequestStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type LockedUser = {
  id: string;
  roles: Role[];
  requestedRole: Role | null;
  roleStatus: RoleRequestStatus | null;
  requestedAt: Date | null;
};

type RoleAssignmentSnapshot = {
  requestedAt: Date;
  fiscalCountry?: string | null;
  fiscalIdHash?: string | null;
  fiscalIdLast4?: string | null;
};

type AssignRoleOptions = {
  snapshot?: RoleAssignmentSnapshot;
  audit?: {
    source: RoleGrantSource;
    grantedById?: string | null;
  };
  onExisting?: 'conflict' | 'returnCurrent';
};

@Injectable()
export class RoleAssignmentService {
  constructor(private readonly prisma: PrismaService) {}

  async withLockedUser<T>(
    userId: string,
    callback: (tx: Prisma.TransactionClient, user: LockedUser) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id
        FROM "User"
        WHERE id = ${userId}::uuid
        FOR UPDATE
      `;

      const user = await tx.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          roles: true,
          requestedRole: true,
          roleStatus: true,
          requestedAt: true,
        },
      });

      if (!user) {
        throw new BadRequestException('User not found');
      }

      return callback(tx, user);
    });
  }

  async assignRoleInTx(
    tx: Prisma.TransactionClient,
    user: LockedUser,
    role: Role,
    options?: AssignRoleOptions,
  ) {
    const rolesSet = new Set(user.roles);
    if (rolesSet.has(role)) {
      if (options?.onExisting === 'returnCurrent') {
        return tx.user.findUniqueOrThrow({
          where: { id: user.id },
          select: {
            id: true,
            roles: true,
            requestedRole: true,
            roleStatus: true,
            requestedAt: true,
          },
        });
      }
      throw new ConflictException('Role already assigned to this user');
    }

    if (role === Role.RUNNER) {
      await tx.runnerProfile.upsert({
        where: { userId: user.id },
        update: {},
        create: {
          userId: user.id,
        },
      });
    }

    rolesSet.add(role);

    const data: Prisma.UserUpdateInput = {
      roles: Array.from(rolesSet),
    };

    if (options?.audit) {
      data.lastRoleSource = options.audit.source;
      data.lastRoleGrantedById = options.audit.grantedById ?? null;
    }

    if (role === Role.PROVIDER || role === Role.RUNNER) {
      data.requestedRole = role;
      data.roleStatus = RoleRequestStatus.APPROVED;
      data.requestedAt = options?.snapshot?.requestedAt ?? new Date();
      data.fiscalCountry = options?.snapshot?.fiscalCountry ?? null;
      data.fiscalIdHash = options?.snapshot?.fiscalIdHash ?? null;
      data.fiscalIdLast4 = options?.snapshot?.fiscalIdLast4 ?? null;
    }

    return tx.user.update({
      where: { id: user.id },
      data,
      select: {
        id: true,
        roles: true,
        requestedRole: true,
        roleStatus: true,
        requestedAt: true,
      },
    });
  }

  async revokeRoleInTx(
    tx: Prisma.TransactionClient,
    user: LockedUser,
    role: Role,
  ) {
    const rolesSet = new Set(user.roles);
    if (!rolesSet.has(role)) {
      return tx.user.findUniqueOrThrow({
        where: { id: user.id },
        select: {
          id: true,
          roles: true,
          requestedRole: true,
          roleStatus: true,
          requestedAt: true,
        },
      });
    }

    rolesSet.delete(role);

    if (rolesSet.size === 0) {
      throw new BadRequestException('User must have at least one role');
    }

    const data: Prisma.UserUpdateInput = {
      roles: Array.from(rolesSet),
    };

    if (
      (role === Role.PROVIDER || role === Role.RUNNER) &&
      user.requestedRole === role &&
      user.roleStatus === RoleRequestStatus.APPROVED
    ) {
      data.requestedRole = null;
      data.roleStatus = null;
      data.requestedAt = null;
      data.fiscalCountry = null;
      data.fiscalIdHash = null;
      data.fiscalIdLast4 = null;
    }

    return tx.user.update({
      where: { id: user.id },
      data,
      select: {
        id: true,
        roles: true,
        requestedRole: true,
        roleStatus: true,
        requestedAt: true,
      },
    });
  }
}
