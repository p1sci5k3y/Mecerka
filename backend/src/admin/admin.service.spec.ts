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
});
