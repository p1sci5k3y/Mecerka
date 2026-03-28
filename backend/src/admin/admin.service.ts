import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GovernanceAuditAction, Role, RoleGrantSource } from '@prisma/client';
import { RoleAssignmentService } from '../users/role-assignment.service';
import { recordGovernanceAudit } from '../users/governance-audit.util';
import {
  EmailSettingsService,
  SaveEmailSettingsInput,
} from '../email/email-settings.service';
import { EmailService } from '../email/email.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roleAssignmentService: RoleAssignmentService,
    private readonly emailSettingsService: EmailSettingsService,
    private readonly emailService: EmailService,
  ) {}

  // --- User Management ---
  async getAllUsers() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        roles: true,
        createdAt: true,
        mfaEnabled: true,
        active: true,
        requestedRole: true,
        roleStatus: true,
        requestedAt: true,
        lastRoleSource: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getUserById(id: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        roles: true,
        createdAt: true,
        mfaEnabled: true,
        active: true,
        requestedRole: true,
        roleStatus: true,
        requestedAt: true,
        lastRoleSource: true,
        lastRoleGrantedById: true,
      },
    });

    const lastRoleGrantedBy = user.lastRoleGrantedById
      ? await this.prisma.user.findUnique({
          where: { id: user.lastRoleGrantedById },
          select: { id: true, email: true, name: true },
        })
      : null;

    return {
      ...user,
      lastRoleGrantedBy,
    };
  }

  async getUserGovernanceHistory(userId: string) {
    const history = await this.prisma.governanceAuditEntry.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        actor: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    return history.map((entry) => ({
      id: entry.id,
      action: entry.action,
      role: entry.role ?? null,
      source: entry.source ?? null,
      metadata: entry.metadata ?? null,
      createdAt: entry.createdAt,
      actorId: entry.actor?.id ?? null,
      actorEmail: entry.actor?.email ?? null,
      actorName: entry.actor?.name ?? null,
    }));
  }

  async grantRole(id: string, role: Role, currentAdminId: string) {
    if (id === currentAdminId && role === Role.ADMIN) {
      // It's technically safe to grant admin to yourself if you already are, but we'll allow it or skip.
      // The real danger is removing your own admin role.
    }

    return this.roleAssignmentService.withLockedUser(id, async (tx, user) => {
      const updated = await this.roleAssignmentService.assignRoleInTx(
        tx,
        user,
        role,
        role === Role.PROVIDER || role === Role.RUNNER
          ? {
              snapshot: {
                requestedAt: new Date(),
              },
              audit: {
                source: RoleGrantSource.ADMIN,
                grantedById: currentAdminId,
              },
              onExisting: 'returnCurrent',
            }
          : {
              audit: {
                source: RoleGrantSource.ADMIN,
                grantedById: currentAdminId,
              },
              onExisting: 'returnCurrent',
            },
      );

      await recordGovernanceAudit(tx, {
        userId: updated.id,
        actorId: currentAdminId,
        action: GovernanceAuditAction.ROLE_GRANTED,
        role,
        source: RoleGrantSource.ADMIN,
      });

      return updated;
    });
  }

  async revokeRole(id: string, role: Role, currentAdminId: string) {
    if (id === currentAdminId && role === Role.ADMIN) {
      throw new ForbiddenException('Cannot revoke your own ADMIN role');
    }

    return this.roleAssignmentService.withLockedUser(id, async (tx, user) => {
      const updated = await this.roleAssignmentService.revokeRoleInTx(
        tx,
        user,
        role,
      );

      await recordGovernanceAudit(tx, {
        userId: updated.id,
        actorId: currentAdminId,
        action: GovernanceAuditAction.ROLE_REVOKED,
        role,
        source: RoleGrantSource.ADMIN,
      });

      return updated;
    });
  }

  async activateUser(id: string, currentAdminId: string) {
    if (id === currentAdminId) {
      throw new ForbiddenException('Cannot activate yourself');
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: { active: true },
        select: { id: true, active: true },
      });

      await recordGovernanceAudit(tx, {
        userId: id,
        actorId: currentAdminId,
        action: GovernanceAuditAction.USER_ACTIVATED,
      });

      return updated;
    });
  }

  async blockUser(id: string, currentAdminId: string) {
    if (id === currentAdminId) {
      throw new ForbiddenException('Cannot block yourself');
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: { active: false },
        select: { id: true, active: true },
      });

      await recordGovernanceAudit(tx, {
        userId: id,
        actorId: currentAdminId,
        action: GovernanceAuditAction.USER_BLOCKED,
      });

      return updated;
    });
  }

  async grantProvider(userId: string, currentAdminId: string) {
    return this.grantRole(userId, Role.PROVIDER, currentAdminId);
  }

  async grantRunner(userId: string, currentAdminId: string) {
    return this.grantRole(userId, Role.RUNNER, currentAdminId);
  }

  // --- Master Data: Cities ---
  async getAllCities() {
    return this.prisma.city.findMany({ orderBy: { name: 'asc' } });
  }

  async createCity(data: { name: string; slug: string; active?: boolean }) {
    const exists = await this.prisma.city.findUnique({
      where: { slug: data.slug },
    });
    if (exists) throw new ConflictException('City slug already exists');
    return this.prisma.city.create({ data });
  }

  async updateCity(
    id: string,
    data: Partial<{ name: string; slug: string; active: boolean }>,
  ) {
    if (data.slug) {
      const exists = await this.prisma.city.findFirst({
        where: { slug: data.slug, NOT: { id } },
      });
      if (exists) {
        throw new ConflictException('City slug already in use');
      }
    }
    return this.prisma.city.update({ where: { id }, data });
  }

  async deleteCity(id: string) {
    // Check for dependencies
    const products = await this.prisma.product.count({ where: { cityId: id } });
    if (products > 0)
      throw new BadRequestException(
        'Cannot delete city with associated products',
      );

    const orders = await this.prisma.order.count({ where: { cityId: id } });
    if (orders > 0)
      throw new BadRequestException(
        'Cannot delete city with associated orders',
      );

    return this.prisma.city.delete({ where: { id } });
  }

  // --- Master Data: Categories ---
  async getAllCategories() {
    return this.prisma.category.findMany({ orderBy: { name: 'asc' } });
  }

  async createCategory(data: {
    name: string;
    slug: string;
    image_url?: string;
  }) {
    const exists = await this.prisma.category.findUnique({
      where: { slug: data.slug },
    });
    if (exists) throw new ConflictException('Category slug already exists');
    return this.prisma.category.create({ data });
  }

  async updateCategory(
    id: string,
    data: Partial<{ name: string; slug: string; image_url: string }>,
  ) {
    if (data.slug) {
      const exists = await this.prisma.category.findFirst({
        where: { slug: data.slug, NOT: { id } },
      });
      if (exists) {
        throw new ConflictException('Category slug already in use');
      }
    }
    return this.prisma.category.update({ where: { id }, data });
  }

  async deleteCategory(id: string) {
    const products = await this.prisma.product.count({
      where: { categoryId: id },
    });
    if (products > 0)
      throw new BadRequestException(
        'Cannot delete category with associated products',
      );
    return this.prisma.category.delete({ where: { id } });
  }

  async getEmailSettings() {
    return this.emailSettingsService.getEffectiveSettings();
  }

  async updateEmailSettings(
    data: SaveEmailSettingsInput,
    currentAdminId: string,
  ) {
    return this.emailSettingsService.saveSettings(data, currentAdminId);
  }

  async sendEmailSettingsTest(recipient: string) {
    await this.emailService.sendEmail(
      recipient,
      'Prueba del conector de correo de Mecerka',
      `
        <h1>Conector de correo configurado correctamente</h1>
        <p>Este correo confirma que la configuración activa guardada en admin está funcionando.</p>
      `,
    );

    return { ok: true };
  }

  async getRecentRefunds() {
    const refunds = await this.prisma.refundRequest.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        incidentId: true,
        providerOrderId: true,
        deliveryOrderId: true,
        incident: {
          select: {
            deliveryOrder: {
              select: {
                orderId: true,
              },
            },
          },
        },
        providerOrder: {
          select: {
            orderId: true,
          },
        },
        deliveryOrder: {
          select: {
            orderId: true,
          },
        },
        type: true,
        status: true,
        amount: true,
        currency: true,
        requestedById: true,
        reviewedById: true,
        externalRefundId: true,
        createdAt: true,
        reviewedAt: true,
        completedAt: true,
        requestedBy: {
          select: {
            email: true,
            name: true,
          },
        },
        reviewedBy: {
          select: {
            email: true,
            name: true,
          },
        },
      },
    });

    return refunds.map((refund) => ({
      id: refund.id,
      incidentId: refund.incidentId ?? null,
      providerOrderId: refund.providerOrderId ?? null,
      deliveryOrderId: refund.deliveryOrderId ?? null,
      orderId:
        refund.providerOrder?.orderId ??
        refund.deliveryOrder?.orderId ??
        refund.incident?.deliveryOrder.orderId ??
        null,
      type: refund.type,
      status: refund.status,
      amount: Number(refund.amount),
      currency: refund.currency,
      requestedById: refund.requestedById,
      reviewedById: refund.reviewedById ?? null,
      externalRefundId: refund.externalRefundId ?? null,
      createdAt: refund.createdAt,
      reviewedAt: refund.reviewedAt ?? null,
      completedAt: refund.completedAt ?? null,
      requestedByEmail: refund.requestedBy.email,
      requestedByName: refund.requestedBy.name ?? null,
      reviewedByEmail: refund.reviewedBy?.email ?? null,
      reviewedByName: refund.reviewedBy?.name ?? null,
    }));
  }

  async getRecentIncidents() {
    const incidents = await this.prisma.deliveryIncident.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        deliveryOrderId: true,
        deliveryOrder: {
          select: {
            orderId: true,
          },
        },
        reporterId: true,
        reporterRole: true,
        type: true,
        status: true,
        description: true,
        evidenceUrl: true,
        createdAt: true,
        resolvedAt: true,
        reporter: {
          select: {
            email: true,
            name: true,
          },
        },
      },
    });

    return incidents.map((incident) => ({
      id: incident.id,
      deliveryOrderId: incident.deliveryOrderId,
      orderId: incident.deliveryOrder.orderId,
      reporterId: incident.reporterId,
      reporterRole: incident.reporterRole,
      type: incident.type,
      status: incident.status,
      description: incident.description,
      evidenceUrl: incident.evidenceUrl ?? null,
      createdAt: incident.createdAt,
      resolvedAt: incident.resolvedAt ?? null,
      reporterEmail: incident.reporter.email,
      reporterName: incident.reporter.name ?? null,
    }));
  }

  // --- Metrics ---
  // --- Metrics ---
  async getMetrics() {
    const [
      totalUsers,
      totalProviders,
      totalClients,
      totalOrders,
      revenueAggregate,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { roles: { has: Role.PROVIDER } } }),
      this.prisma.user.count({ where: { roles: { has: Role.CLIENT } } }),
      this.prisma.order.count(),
      this.prisma.order.aggregate({
        _sum: { totalPrice: true },
        where: {
          status: {
            in: [
              'CONFIRMED',
              'READY_FOR_ASSIGNMENT',
              'ASSIGNED',
              'IN_TRANSIT',
              'DELIVERED',
            ],
          },
        },
      }),
    ]);

    return {
      totalUsers,
      totalProviders,
      totalClients,
      totalOrders,
      totalRevenue: revenueAggregate._sum.totalPrice || 0,
    };
  }
}
