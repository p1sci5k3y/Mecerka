import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Role, RoleRequestStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';
import { RequestableRole } from './dto/request-role.dto';
import { RoleAssignmentService } from './role-assignment.service';

describe('UsersService.requestRole', () => {
  let service: UsersService;
  const originalFiscalPepper = process.env.FISCAL_PEPPER;
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
    process.env.FISCAL_PEPPER = 'test-fiscal-pepper';
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

  it('stores a hashed transaction pin', async () => {
    const result = await service.setTransactionPin('user-1', '1234');

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        pin: expect.any(String),
      },
    });
    const storedHash = prismaMock.user.update.mock.calls[0]?.[0]?.data
      ?.pin as string;
    expect(storedHash).not.toBe('1234');
    await expect(argon2.verify(storedHash, '1234')).resolves.toBe(true);
    expect(result).toEqual({
      message: 'PIN transaccional configurado correctamente',
    });
  });

  it('throws when FISCAL_PEPPER is missing or empty', () => {
    process.env.FISCAL_PEPPER = '   ';

    expect(
      () =>
        new UsersService(
          prismaMock as unknown as PrismaService,
          roleAssignmentServiceMock as unknown as RoleAssignmentService,
        ),
    ).toThrow('FISCAL_PEPPER is missing or empty');
  });

  it('rejects users that already have the requested role', async () => {
    roleAssignmentServiceMock.withLockedUser.mockImplementation(
      async (_userId, callback) =>
        callback(
          {},
          {
            id: 'user-1',
            roles: [Role.CLIENT, Role.RUNNER],
            requestedRole: null,
            roleStatus: null,
            requestedAt: null,
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

  it('rejects when the locked user cannot be found', async () => {
    roleAssignmentServiceMock.withLockedUser.mockImplementation(
      async (_userId, callback) => callback({}, null),
    );

    await expect(
      service.requestRole('user-1', {
        role: RequestableRole.PROVIDER,
        country: 'ES',
        fiscalId: '12345678Z',
      }),
    ).rejects.toThrow('User not found');
  });

  it('rejects when the role assignment callback returns no updated user', async () => {
    roleAssignmentServiceMock.withLockedUser.mockResolvedValue(null);

    await expect(
      service.requestRole('user-1', {
        role: RequestableRole.PROVIDER,
        country: 'ES',
        fiscalId: '12345678Z',
      }),
    ).rejects.toThrow('User not found');
  });

  afterAll(() => {
    process.env.FISCAL_PEPPER = originalFiscalPepper;
  });
});
