import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Role, RoleGrantSource, RoleRequestStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RoleAssignmentService } from './role-assignment.service';

describe('RoleAssignmentService', () => {
  let service: RoleAssignmentService;
  let txMock: any;
  let prismaMock: any;

  beforeEach(async () => {
    txMock = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      user: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
      },
      runnerProfile: {
        upsert: jest.fn(),
      },
    };

    prismaMock = {
      $transaction: jest.fn((cb: any) => cb(txMock)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoleAssignmentService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<RoleAssignmentService>(RoleAssignmentService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('additional branch coverage - withLockedUser', () => {
    it('throws BadRequestException when user is not found', async () => {
      txMock.user.findUnique.mockResolvedValue(null);

      await expect(
        service.withLockedUser('missing-id', async () => 'ok'),
      ).rejects.toThrow(BadRequestException);
    });

    it('calls callback with the found user', async () => {
      const fakeUser = {
        id: 'user-1',
        roles: [Role.CLIENT],
        requestedRole: null,
        roleStatus: null,
        requestedAt: null,
      };
      txMock.user.findUnique.mockResolvedValue(fakeUser);
      const callback = jest.fn().mockResolvedValue('result');

      const result = await service.withLockedUser('user-1', callback);

      expect(callback).toHaveBeenCalledWith(txMock, fakeUser);
      expect(result).toBe('result');
    });
  });

  describe('additional branch coverage - assignRoleInTx', () => {
    const baseUser = {
      id: 'user-1',
      roles: [Role.CLIENT],
      requestedRole: null,
      roleStatus: null,
      requestedAt: null,
    };

    it('returns current user when role already exists and onExisting is returnCurrent', async () => {
      const currentUser = {
        id: 'user-1',
        roles: [Role.CLIENT],
        requestedRole: null,
        roleStatus: null,
        requestedAt: null,
      };
      txMock.user.findUniqueOrThrow.mockResolvedValue(currentUser);

      const result = await service.assignRoleInTx(
        txMock,
        baseUser,
        Role.CLIENT,
        {
          onExisting: 'returnCurrent',
        },
      );

      expect(txMock.user.findUniqueOrThrow).toHaveBeenCalled();
      expect(result).toEqual(currentUser);
    });

    it('throws ConflictException when role already assigned and no onExisting option', async () => {
      await expect(
        service.assignRoleInTx(txMock, baseUser, Role.CLIENT),
      ).rejects.toThrow(ConflictException);
    });

    it('creates runnerProfile when assigning RUNNER role', async () => {
      const userWithoutRunner = { ...baseUser, roles: [Role.CLIENT] };
      const updatedUser = {
        id: 'user-1',
        roles: [Role.CLIENT, Role.RUNNER],
        requestedRole: Role.RUNNER,
        roleStatus: RoleRequestStatus.APPROVED,
        requestedAt: new Date(),
      };
      txMock.user.update.mockResolvedValue(updatedUser);

      await service.assignRoleInTx(txMock, userWithoutRunner, Role.RUNNER);

      expect(txMock.runnerProfile.upsert).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        update: {},
        create: { userId: 'user-1' },
      });
    });

    it('sets audit fields when audit option is provided', async () => {
      const updatedUser = {
        id: 'user-1',
        roles: [Role.CLIENT, Role.ADMIN],
        requestedRole: null,
        roleStatus: null,
        requestedAt: null,
      };
      txMock.user.update.mockResolvedValue(updatedUser);

      await service.assignRoleInTx(txMock, baseUser, Role.ADMIN, {
        audit: { source: RoleGrantSource.ADMIN, grantedById: 'admin-1' },
      });

      expect(txMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            lastRoleSource: RoleGrantSource.ADMIN,
            lastRoleGrantedById: 'admin-1',
          }),
        }),
      );
    });

    it('sets fiscal fields when assigning PROVIDER role', async () => {
      const snapshot = {
        requestedAt: new Date('2026-01-01'),
        fiscalCountry: 'ES',
        fiscalIdHash: 'hash123',
        fiscalIdLast4: '1234',
      };
      const updatedUser = {
        id: 'user-1',
        roles: [Role.CLIENT, Role.PROVIDER],
        requestedRole: Role.PROVIDER,
        roleStatus: RoleRequestStatus.APPROVED,
        requestedAt: snapshot.requestedAt,
      };
      txMock.user.update.mockResolvedValue(updatedUser);

      await service.assignRoleInTx(txMock, baseUser, Role.PROVIDER, {
        snapshot,
      });

      expect(txMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            requestedRole: Role.PROVIDER,
            roleStatus: RoleRequestStatus.APPROVED,
            fiscalCountry: 'ES',
            fiscalIdHash: 'hash123',
            fiscalIdLast4: '1234',
          }),
        }),
      );
    });

    it('sets null audit grantedById when not provided', async () => {
      const updatedUser = {
        id: 'user-1',
        roles: [Role.CLIENT, Role.ADMIN],
        requestedRole: null,
        roleStatus: null,
        requestedAt: null,
      };
      txMock.user.update.mockResolvedValue(updatedUser);

      await service.assignRoleInTx(txMock, baseUser, Role.ADMIN, {
        audit: { source: RoleGrantSource.ADMIN },
      });

      expect(txMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ lastRoleGrantedById: null }),
        }),
      );
    });
  });

  describe('additional branch coverage - revokeRoleInTx', () => {
    const userWithMultipleRoles = {
      id: 'user-1',
      roles: [Role.CLIENT, Role.PROVIDER],
      requestedRole: Role.PROVIDER,
      roleStatus: RoleRequestStatus.APPROVED,
      requestedAt: new Date(),
    };

    it('returns current user when role is not in the set', async () => {
      const currentUser = {
        id: 'user-1',
        roles: [Role.CLIENT],
        requestedRole: null,
        roleStatus: null,
        requestedAt: null,
      };
      txMock.user.findUniqueOrThrow.mockResolvedValue(currentUser);
      const userWithoutRunner = {
        ...userWithMultipleRoles,
        roles: [Role.CLIENT],
      };

      const result = await service.revokeRoleInTx(
        txMock,
        userWithoutRunner,
        Role.RUNNER,
      );

      expect(txMock.user.findUniqueOrThrow).toHaveBeenCalled();
      expect(result).toEqual(currentUser);
    });

    it('throws BadRequestException when revoking the only role', async () => {
      const userWithOneRole = {
        id: 'user-1',
        roles: [Role.CLIENT],
        requestedRole: null,
        roleStatus: null,
        requestedAt: null,
      };

      await expect(
        service.revokeRoleInTx(txMock, userWithOneRole, Role.CLIENT),
      ).rejects.toThrow(BadRequestException);
    });

    it('clears fiscal and role status fields when revoking PROVIDER role that was approved', async () => {
      const updatedUser = {
        id: 'user-1',
        roles: [Role.CLIENT],
        requestedRole: null,
        roleStatus: null,
        requestedAt: null,
      };
      txMock.user.update.mockResolvedValue(updatedUser);

      await service.revokeRoleInTx(
        txMock,
        userWithMultipleRoles,
        Role.PROVIDER,
      );

      expect(txMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            requestedRole: null,
            roleStatus: null,
            requestedAt: null,
            fiscalCountry: null,
            fiscalIdHash: null,
            fiscalIdLast4: null,
          }),
        }),
      );
    });

    it('does not clear fiscal fields when revoking PROVIDER but requestedRole does not match', async () => {
      const user = {
        id: 'user-1',
        roles: [Role.CLIENT, Role.PROVIDER],
        requestedRole: Role.RUNNER, // mismatch
        roleStatus: RoleRequestStatus.APPROVED,
        requestedAt: new Date(),
      };
      const updatedUser = {
        id: 'user-1',
        roles: [Role.CLIENT],
        requestedRole: Role.RUNNER,
        roleStatus: RoleRequestStatus.APPROVED,
        requestedAt: null,
      };
      txMock.user.update.mockResolvedValue(updatedUser);

      await service.revokeRoleInTx(txMock, user, Role.PROVIDER);

      expect(txMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({ requestedRole: null }),
        }),
      );
    });
  });
});
