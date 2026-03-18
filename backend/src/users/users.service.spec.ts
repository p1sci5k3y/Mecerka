import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Role, RoleRequestStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';
import { RequestableRole } from './dto/request-role.dto';
import { RoleAssignmentService } from './role-assignment.service';

describe('UsersService.requestRole', () => {
  let service: UsersService;
  let prismaMock: {
    user: {
      update: jest.Mock;
    };
  };
  let roleAssignmentServiceMock: {
    withLockedUser: jest.Mock;
    assignRoleInTx: jest.Mock;
  };

  beforeEach(async () => {
    prismaMock = {
      user: {
        update: jest.fn(),
      },
    };
    roleAssignmentServiceMock = {
      withLockedUser: jest.fn(),
      assignRoleInTx: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prismaMock },
        {
          provide: RoleAssignmentService,
          useValue: roleAssignmentServiceMock,
        },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  it('rejects invalid fiscal ids', async () => {
    await expect(
      service.requestRole('user-1', {
        role: RequestableRole.PROVIDER,
        country: 'ES',
        fiscalId: '12345678A',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects unsupported countries', async () => {
    await expect(
      service.requestRole('user-1', {
        role: RequestableRole.RUNNER,
        country: 'FR',
        fiscalId: '12345678Z',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a pending privileged request inside the locked transaction', async () => {
    roleAssignmentServiceMock.withLockedUser.mockImplementation(
      async (_userId, callback) =>
        callback(
          {},
          {
            id: 'user-1',
            roles: [Role.CLIENT],
            requestedRole: Role.PROVIDER,
            roleStatus: RoleRequestStatus.PENDING,
            requestedAt: new Date('2026-03-17T00:00:00.000Z'),
          },
        ),
    );

    await expect(
      service.requestRole('user-1', {
        role: RequestableRole.RUNNER,
        country: 'ES',
        fiscalId: '12345678Z',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects requests inside the cooldown window', async () => {
    roleAssignmentServiceMock.withLockedUser.mockImplementation(
      async (_userId, callback) =>
        callback(
          {},
          {
            id: 'user-1',
            roles: [Role.CLIENT],
            requestedRole: Role.PROVIDER,
            roleStatus: RoleRequestStatus.APPROVED,
            requestedAt: new Date(),
          },
        ),
    );

    await expect(
      service.requestRole('user-1', {
        role: RequestableRole.RUNNER,
        country: 'ES',
        fiscalId: '12345678Z',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('hashes fiscal data and stores only last4 in the approval snapshot', async () => {
    roleAssignmentServiceMock.withLockedUser.mockImplementation(
      async (_userId, callback) =>
        callback(
          { user: { update: jest.fn() } },
          {
            id: 'user-1',
            roles: [Role.CLIENT],
            requestedRole: null,
            roleStatus: null,
            requestedAt: null,
          },
        ),
    );
    roleAssignmentServiceMock.assignRoleInTx.mockResolvedValue({
      id: 'user-1',
      roles: [Role.CLIENT, Role.PROVIDER],
      requestedRole: Role.PROVIDER,
      roleStatus: RoleRequestStatus.APPROVED,
      requestedAt: new Date('2026-03-17T00:00:00.000Z'),
    });

    const result = await service.requestRole('user-1', {
      role: RequestableRole.PROVIDER,
      country: 'es',
      fiscalId: '12345678Z',
    });

    expect(roleAssignmentServiceMock.assignRoleInTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'user-1' }),
      Role.PROVIDER,
      expect.objectContaining({
        snapshot: expect.objectContaining({
          fiscalCountry: 'ES',
          fiscalIdHash: expect.stringMatching(/^[a-f0-9]{64}$/),
          fiscalIdLast4: '678Z',
        }),
        audit: expect.objectContaining({
          source: 'SELF_SERVICE',
          grantedById: null,
        }),
      }),
    );
    expect(result).toEqual({
      message: 'Role request accepted',
      userId: 'user-1',
      requestedRole: Role.PROVIDER,
      roleStatus: RoleRequestStatus.APPROVED,
      requestedAt: new Date('2026-03-17T00:00:00.000Z'),
      roles: [Role.CLIENT, Role.PROVIDER],
    });
  });
});
