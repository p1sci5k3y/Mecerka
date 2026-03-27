import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Role, RoleRequestStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RoleAssignmentService } from '../users/role-assignment.service';
import { AdminService } from './admin.service';

describe('AdminService role grants', () => {
  let service: AdminService;
  let roleAssignmentServiceMock: {
    withLockedUser: jest.Mock;
    assignRoleInTx: jest.Mock;
    revokeRoleInTx: jest.Mock;
  };

  beforeEach(async () => {
    roleAssignmentServiceMock = {
      withLockedUser: jest.fn(),
      assignRoleInTx: jest.fn(),
      revokeRoleInTx: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        {
          provide: PrismaService,
          useValue: {
            user: { count: jest.fn(), findMany: jest.fn(), update: jest.fn() },
            city: {
              findMany: jest.fn(),
              findUnique: jest.fn(),
              create: jest.fn(),
              findFirst: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
            },
            product: { count: jest.fn() },
            order: { count: jest.fn(), aggregate: jest.fn() },
            category: {
              findMany: jest.fn(),
              findUnique: jest.fn(),
              create: jest.fn(),
              findFirst: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
            },
            deliveryIncident: { findMany: jest.fn() },
            refundRequest: { findMany: jest.fn() },
          },
        },
        {
          provide: RoleAssignmentService,
          useValue: roleAssignmentServiceMock,
        },
      ],
    }).compile();

    service = module.get(AdminService);
  });

  it('routes generic RUNNER grants through the shared role assignment flow', async () => {
    roleAssignmentServiceMock.withLockedUser.mockImplementation(
      async (_userId, callback) =>
        callback(
          {},
          {
            id: 'runner-1',
            roles: [Role.CLIENT],
            requestedRole: null,
            roleStatus: null,
            requestedAt: null,
          },
        ),
    );
    roleAssignmentServiceMock.assignRoleInTx.mockResolvedValue({
      id: 'runner-1',
      roles: [Role.CLIENT, Role.RUNNER],
      requestedRole: Role.RUNNER,
      roleStatus: RoleRequestStatus.APPROVED,
      requestedAt: new Date('2026-03-17T00:00:00.000Z'),
    });

    await service.grantRole('runner-1', Role.RUNNER, 'admin-1');

    expect(roleAssignmentServiceMock.assignRoleInTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'runner-1' }),
      Role.RUNNER,
      expect.objectContaining({
        snapshot: expect.objectContaining({
          requestedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('routes revoke through the shared role revocation flow', async () => {
    roleAssignmentServiceMock.withLockedUser.mockImplementation(
      async (_userId, callback) =>
        callback(
          {},
          {
            id: 'provider-1',
            roles: [Role.CLIENT, Role.PROVIDER],
            requestedRole: Role.PROVIDER,
            roleStatus: RoleRequestStatus.APPROVED,
            requestedAt: new Date('2026-03-17T00:00:00.000Z'),
          },
        ),
    );
    roleAssignmentServiceMock.revokeRoleInTx.mockResolvedValue({
      id: 'provider-1',
      roles: [Role.CLIENT],
      requestedRole: null,
      roleStatus: null,
      requestedAt: null,
    });

    await service.revokeRole('provider-1', Role.PROVIDER, 'admin-1');

    expect(roleAssignmentServiceMock.revokeRoleInTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'provider-1' }),
      Role.PROVIDER,
    );
  });

  // ─── branch coverage additions ────────────────────────────────────────────

  describe('branch coverage', () => {
    let prismaMock: any;

    beforeEach(() => {
      prismaMock = (service as any).prisma;
    });

    describe('grantRole', () => {
      it('routes PROVIDER grant with snapshot options', async () => {
        roleAssignmentServiceMock.withLockedUser.mockImplementation(
          async (_userId, callback) =>
            callback({}, { id: 'user-1', roles: [Role.CLIENT] }),
        );
        roleAssignmentServiceMock.assignRoleInTx.mockResolvedValue({});

        await service.grantRole('user-1', Role.PROVIDER, 'admin-1');

        expect(roleAssignmentServiceMock.assignRoleInTx).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ id: 'user-1' }),
          Role.PROVIDER,
          expect.objectContaining({
            snapshot: expect.objectContaining({
              requestedAt: expect.any(Date),
            }),
          }),
        );
      });

      it('routes CLIENT grant without snapshot options', async () => {
        roleAssignmentServiceMock.withLockedUser.mockImplementation(
          async (_userId, callback) =>
            callback({}, { id: 'user-1', roles: [] }),
        );
        roleAssignmentServiceMock.assignRoleInTx.mockResolvedValue({});

        await service.grantRole('user-1', Role.CLIENT, 'admin-1');

        const callArgs =
          roleAssignmentServiceMock.assignRoleInTx.mock.calls[0][3];
        expect(callArgs).not.toHaveProperty('snapshot');
      });
    });

    describe('revokeRole', () => {
      it('throws ForbiddenException when admin revokes their own ADMIN role', async () => {
        await expect(
          service.revokeRole('admin-1', Role.ADMIN, 'admin-1'),
        ).rejects.toThrow(ForbiddenException);
      });
    });

    describe('activateUser', () => {
      it('throws ForbiddenException when admin tries to activate themselves', async () => {
        await expect(
          service.activateUser('admin-1', 'admin-1'),
        ).rejects.toThrow(ForbiddenException);
      });

      it('activates another user', async () => {
        prismaMock.user.update.mockResolvedValue({
          id: 'user-1',
          active: true,
        });

        const result = await service.activateUser('user-1', 'admin-1');
        expect(result.active).toBe(true);
      });
    });

    describe('blockUser', () => {
      it('throws ForbiddenException when admin tries to block themselves', async () => {
        await expect(service.blockUser('admin-1', 'admin-1')).rejects.toThrow(
          ForbiddenException,
        );
      });

      it('blocks another user', async () => {
        prismaMock.user.update.mockResolvedValue({
          id: 'user-1',
          active: false,
        });

        const result = await service.blockUser('user-1', 'admin-1');
        expect(result.active).toBe(false);
      });
    });

    describe('createCity', () => {
      it('throws ConflictException when slug already exists', async () => {
        prismaMock.city.findUnique.mockResolvedValue({
          id: 'city-1',
          slug: 'madrid',
        });

        await expect(
          service.createCity({ name: 'Madrid', slug: 'madrid' }),
        ).rejects.toThrow(ConflictException);
      });

      it('creates a new city when slug is unique', async () => {
        prismaMock.city.findUnique.mockResolvedValue(null);
        prismaMock.city.create.mockResolvedValue({
          id: 'city-new',
          name: 'Madrid',
          slug: 'madrid',
        });

        const result = await service.createCity({
          name: 'Madrid',
          slug: 'madrid',
        });
        expect(result.id).toBe('city-new');
      });
    });

    describe('updateCity', () => {
      it('throws ConflictException when new slug is already in use', async () => {
        prismaMock.city.findFirst.mockResolvedValue({ id: 'other-city' });

        await expect(
          service.updateCity('city-1', { slug: 'existing-slug' }),
        ).rejects.toThrow(ConflictException);
      });

      it('updates city without slug check when no slug is provided', async () => {
        prismaMock.city.update.mockResolvedValue({
          id: 'city-1',
          name: 'Updated',
        });

        const result = await service.updateCity('city-1', { name: 'Updated' });
        expect(prismaMock.city.findFirst).not.toHaveBeenCalled();
        expect(result.name).toBe('Updated');
      });

      it('updates city when new slug is unique', async () => {
        prismaMock.city.findFirst.mockResolvedValue(null);
        prismaMock.city.update.mockResolvedValue({
          id: 'city-1',
          slug: 'new-slug',
        });

        const result = await service.updateCity('city-1', { slug: 'new-slug' });
        expect(result.slug).toBe('new-slug');
      });
    });

    describe('deleteCity', () => {
      it('throws BadRequestException when city has associated products', async () => {
        prismaMock.product.count.mockResolvedValue(1);

        await expect(service.deleteCity('city-1')).rejects.toThrow(
          BadRequestException,
        );
      });

      it('throws BadRequestException when city has associated orders', async () => {
        prismaMock.product.count.mockResolvedValue(0);
        prismaMock.order.count.mockResolvedValue(2);

        await expect(service.deleteCity('city-1')).rejects.toThrow(
          BadRequestException,
        );
      });

      it('deletes city when no dependencies exist', async () => {
        prismaMock.product.count.mockResolvedValue(0);
        prismaMock.order.count.mockResolvedValue(0);
        prismaMock.city.delete.mockResolvedValue({ id: 'city-1' });

        const result = await service.deleteCity('city-1');
        expect(result.id).toBe('city-1');
      });
    });

    describe('createCategory', () => {
      it('throws ConflictException when slug already exists', async () => {
        prismaMock.category.findUnique.mockResolvedValue({ id: 'cat-1' });

        await expect(
          service.createCategory({ name: 'Furniture', slug: 'furniture' }),
        ).rejects.toThrow(ConflictException);
      });

      it('creates a new category when slug is unique', async () => {
        prismaMock.category.findUnique.mockResolvedValue(null);
        prismaMock.category.create.mockResolvedValue({
          id: 'cat-new',
          name: 'Furniture',
        });

        const result = await service.createCategory({
          name: 'Furniture',
          slug: 'furniture',
        });
        expect(result.id).toBe('cat-new');
      });
    });

    describe('getRecentRefunds', () => {
      it('returns normalized refund summaries with requester and reviewer metadata', async () => {
        prismaMock.refundRequest.findMany.mockResolvedValue([
          {
            id: 'refund-1',
            incidentId: null,
            providerOrderId: 'provider-order-1',
            deliveryOrderId: null,
            type: 'PROVIDER_PARTIAL',
            status: 'UNDER_REVIEW',
            amount: { toString: () => '18.5' },
            currency: 'EUR',
            requestedById: 'client-1',
            reviewedById: 'admin-1',
            externalRefundId: null,
            createdAt: new Date('2026-03-27T10:00:00.000Z'),
            reviewedAt: new Date('2026-03-27T11:00:00.000Z'),
            completedAt: null,
            requestedBy: { email: 'client@example.com', name: 'Client Demo' },
            reviewedBy: { email: 'admin@example.com', name: 'Admin Demo' },
          },
        ]);

        const result = await service.getRecentRefunds();

        expect(prismaMock.refundRequest.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            orderBy: { createdAt: 'desc' },
            take: 100,
          }),
        );
        expect(result).toEqual([
          expect.objectContaining({
            id: 'refund-1',
            amount: 18.5,
            requestedByEmail: 'client@example.com',
            reviewedByEmail: 'admin@example.com',
          }),
        ]);
      });
    });

    describe('getRecentIncidents', () => {
      it('returns normalized incident summaries with reporter metadata', async () => {
        prismaMock.deliveryIncident.findMany.mockResolvedValue([
          {
            id: 'incident-1',
            deliveryOrderId: 'delivery-order-1',
            reporterId: 'runner-1',
            reporterRole: 'RUNNER',
            type: 'FAILED_DELIVERY',
            status: 'UNDER_REVIEW',
            description: 'No pude completar la entrega',
            evidenceUrl: 'https://example.com/evidence.jpg',
            createdAt: new Date('2026-03-27T10:00:00.000Z'),
            resolvedAt: null,
            reporter: { email: 'runner@example.com', name: 'Runner Demo' },
          },
        ]);

        const result = await service.getRecentIncidents();

        expect(prismaMock.deliveryIncident.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            orderBy: { createdAt: 'desc' },
            take: 100,
          }),
        );
        expect(result).toEqual([
          expect.objectContaining({
            id: 'incident-1',
            reporterEmail: 'runner@example.com',
            reporterName: 'Runner Demo',
          }),
        ]);
      });
    });

    describe('updateCategory', () => {
      it('throws ConflictException when new slug is already in use', async () => {
        prismaMock.category.findFirst.mockResolvedValue({ id: 'other-cat' });

        await expect(
          service.updateCategory('cat-1', { slug: 'existing-slug' }),
        ).rejects.toThrow(ConflictException);
      });

      it('updates category without slug check when no slug is provided', async () => {
        prismaMock.category.update.mockResolvedValue({
          id: 'cat-1',
          name: 'Updated',
        });

        const result = await service.updateCategory('cat-1', {
          name: 'Updated',
        });
        expect(prismaMock.category.findFirst).not.toHaveBeenCalled();
        expect(result.name).toBe('Updated');
      });
    });

    describe('deleteCategory', () => {
      it('throws BadRequestException when category has associated products', async () => {
        prismaMock.product.count.mockResolvedValue(3);

        await expect(service.deleteCategory('cat-1')).rejects.toThrow(
          BadRequestException,
        );
      });

      it('deletes category when no dependencies exist', async () => {
        prismaMock.product.count.mockResolvedValue(0);
        prismaMock.category.delete.mockResolvedValue({ id: 'cat-1' });

        const result = await service.deleteCategory('cat-1');
        expect(result.id).toBe('cat-1');
      });
    });

    describe('getMetrics', () => {
      it('returns metrics with null revenue as 0', async () => {
        prismaMock.user.count.mockResolvedValue(10);
        prismaMock.order.count.mockResolvedValue(5);
        prismaMock.order.aggregate.mockResolvedValue({
          _sum: { totalPrice: null },
        });

        const result = await service.getMetrics();
        expect(result.totalRevenue).toBe(0);
      });

      it('returns metrics with actual revenue', async () => {
        prismaMock.user.count.mockResolvedValue(10);
        prismaMock.order.count.mockResolvedValue(5);
        prismaMock.order.aggregate.mockResolvedValue({
          _sum: { totalPrice: 1500 },
        });

        const result = await service.getMetrics();
        expect(result.totalRevenue).toBe(1500);
        expect(result.totalUsers).toBe(10);
        expect(result.totalOrders).toBe(5);
      });
    });

    describe('getAllUsers / getAllCities / getAllCategories', () => {
      it('returns all users', async () => {
        prismaMock.user.findMany.mockResolvedValue([{ id: 'u-1' }]);
        const result = await service.getAllUsers();
        expect(result).toHaveLength(1);
      });

      it('returns all cities', async () => {
        prismaMock.city.findMany.mockResolvedValue([{ id: 'c-1' }]);
        const result = await service.getAllCities();
        expect(result).toHaveLength(1);
      });

      it('returns all categories', async () => {
        prismaMock.category.findMany.mockResolvedValue([{ id: 'cat-1' }]);
        const result = await service.getAllCategories();
        expect(result).toHaveLength(1);
      });
    });
  });
});
