import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  GovernanceAuditAction,
  Role,
  RoleGrantSource,
  RoleRequestStatus,
} from '@prisma/client';
import * as argon2 from 'argon2';
import * as crypto from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RequestRoleDto, RequestableRole } from './dto/request-role.dto';
import { RoleAssignmentService } from './role-assignment.service';
import { recordGovernanceAudit } from './governance-audit.util';
import {
  isValidSpanishFiscalId,
  normalizeSpanishFiscalId,
} from './validators/is-spanish-fiscal-id.validator';

@Injectable()
export class UsersService {
  private static readonly ROLE_REQUEST_COOLDOWN_MS = 24 * 60 * 60 * 1000;
  private readonly fiscalPepper: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly roleAssignmentService: RoleAssignmentService,
  ) {
    const configuredPepper = process.env.FISCAL_PEPPER?.trim();
    if (!configuredPepper) {
      throw new Error('FISCAL_PEPPER is missing or empty');
    }

    this.fiscalPepper = configuredPepper;
  }

  private hashFiscalId(value: string) {
    return crypto
      .createHmac('sha256', this.fiscalPepper)
      .update(value)
      .digest('hex');
  }

  private getFiscalIdLast4(value: string) {
    return value.slice(-4);
  }

  async setTransactionPin(userId: string, pin: string) {
    const hashedPin = await argon2.hash(pin);

    await this.prisma.user.update({
      where: { id: userId },
      data: { pin: hashedPin },
    });

    return { message: 'PIN transaccional configurado correctamente' };
  }

  async requestRole(userId: string, dto: RequestRoleDto) {
    const requestedRole =
      dto.role === RequestableRole.PROVIDER ? Role.PROVIDER : Role.RUNNER;
    const country = dto.country.toUpperCase();

    if (country !== 'ES') {
      throw new BadRequestException(
        'Only ES fiscal IDs are currently supported',
      );
    }

    if (!isValidSpanishFiscalId(dto.fiscalId, country)) {
      throw new BadRequestException(
        'fiscalId must be a valid NIF, NIE, or CIF',
      );
    }

    const fiscalId = normalizeSpanishFiscalId(dto.fiscalId);
    const requestedAt = new Date();
    const cooldownStartedAt = new Date(
      requestedAt.getTime() - UsersService.ROLE_REQUEST_COOLDOWN_MS,
    );

    const updated = await this.roleAssignmentService.withLockedUser(
      userId,
      async (tx, user) => {
        if (!user) {
          throw new NotFoundException('User not found');
        }

        if (user.roles.includes(requestedRole)) {
          throw new ConflictException('Role already assigned to this user');
        }

        if (user.roleStatus === RoleRequestStatus.PENDING) {
          throw new ConflictException(
            'There is already a pending privileged role request',
          );
        }

        if (
          user.requestedAt &&
          user.requestedAt.getTime() > cooldownStartedAt.getTime()
        ) {
          throw new ConflictException(
            'Please wait before submitting another privileged role request',
          );
        }

        const updated = await this.roleAssignmentService.assignRoleInTx(
          tx,
          user,
          requestedRole,
          {
            snapshot: {
              requestedAt,
              fiscalCountry: country,
              fiscalIdHash: this.hashFiscalId(fiscalId),
              fiscalIdLast4: this.getFiscalIdLast4(fiscalId),
            },
            audit: {
              source: RoleGrantSource.SELF_SERVICE,
              grantedById: null,
            },
          },
        );

        await recordGovernanceAudit(tx, {
          userId: user.id,
          actorId: user.id,
          action: GovernanceAuditAction.ROLE_REQUESTED,
          role: requestedRole,
          source: RoleGrantSource.SELF_SERVICE,
          metadata: {
            roleStatus: RoleRequestStatus.APPROVED,
          },
        });

        return updated;
      },
    );

    if (!updated) {
      throw new NotFoundException('User not found');
    }

    return {
      message: 'Role request accepted',
      userId: updated.id,
      requestedRole: updated.requestedRole,
      roleStatus: updated.roleStatus,
      requestedAt: updated.requestedAt,
      roles: updated.roles,
    };
  }
}
