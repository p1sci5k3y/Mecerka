import { Test, TestingModule } from '@nestjs/testing';
import { RunnerGateway } from './runner.gateway';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { WsException } from '@nestjs/websockets';
import { Role } from '@prisma/client';

describe('RunnerGateway Security & Auth', () => {
  let gateway: RunnerGateway;
  let jwtServiceMock: Partial<JwtService>;
  let prismaMock: any;
  let configServiceMock: Partial<ConfigService>;

  beforeEach(async () => {
    jwtServiceMock = {
      verifyAsync: jest.fn(),
    };

    prismaMock = {
      user: {
        findUnique: jest.fn(),
      } as any,
      order: {
        findUnique: jest.fn(),
      } as any,
    };

    configServiceMock = {
      get: jest.fn().mockReturnValue('test-secret'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RunnerGateway,
        { provide: JwtService, useValue: jwtServiceMock },
        { provide: PrismaService, useValue: prismaMock },
        { provide: ConfigService, useValue: configServiceMock },
      ],
    }).compile();

    gateway = module.get<RunnerGateway>(RunnerGateway);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Handshake Authentication', () => {
    it('Should reject invalid token by disconnecting immediately', async () => {
      const mockSocket = {
        id: 'socket-123',
        handshake: {
          headers: { authorization: 'Bearer invalid-token' },
        },
        disconnect: jest.fn(),
      } as any;

      (jwtServiceMock.verifyAsync as jest.Mock).mockRejectedValue(
        new Error('JWT Error'),
      );

      await gateway.handleConnection(mockSocket);

      expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
      expect(mockSocket.data).toBeUndefined();
    });

    it('Should accept valid token and populate socket.data', async () => {
      const mockSocket = {
        id: 'socket-123',
        handshake: {
          query: { token: 'valid-token' },
        },
        disconnect: jest.fn(),
      } as any;

      (jwtServiceMock.verifyAsync as jest.Mock).mockResolvedValue({
        sub: 'user-id-123',
        roles: [Role.CLIENT],
        tokenVersion: 1,
        mfaAuthenticated: true,
        iat: Math.floor(Date.now() / 1000),
      });
      (prismaMock.user!.findUnique as jest.Mock).mockResolvedValue({
        active: true,
        tokenVersion: 1,
        mfaEnabled: false,
        passwordChangedAt: null,
      });

      await gateway.handleConnection(mockSocket);

      expect(mockSocket.disconnect).not.toHaveBeenCalled();
      expect(mockSocket.data).toEqual({
        userId: 'user-id-123',
        roles: [Role.CLIENT],
      });

      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-id-123' },
        select: {
          active: true,
          tokenVersion: true,
          mfaEnabled: true,
          passwordChangedAt: true,
        },
      });
    });

    it('Should reject revoked or stale tokens even if the signature is valid', async () => {
      const mockSocket = {
        id: 'socket-123',
        handshake: {
          headers: { authorization: 'Bearer valid-but-stale-token' },
        },
        disconnect: jest.fn(),
      } as any;

      (jwtServiceMock.verifyAsync as jest.Mock).mockResolvedValue({
        sub: 'user-id-123',
        roles: [Role.CLIENT],
        tokenVersion: 1,
        mfaAuthenticated: true,
        iat: Math.floor(Date.now() / 1000),
      });
      (prismaMock.user!.findUnique as jest.Mock).mockResolvedValue({
        active: true,
        tokenVersion: 2,
        mfaEnabled: false,
        passwordChangedAt: null,
      });

      await gateway.handleConnection(mockSocket);

      expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
      expect(mockSocket.data).toBeUndefined();
    });
  });

  describe('Authorization Rules (joinOrder)', () => {
    it('Should reject if user has no relation to the order', async () => {
      const mockSocket = {
        id: 'socket-123',
        data: {
          userId: 'intruder-user',
          roles: [Role.CLIENT],
        },
        join: jest.fn(),
      } as any;

      (prismaMock.order!.findUnique as jest.Mock).mockResolvedValue({
        id: 'ord-123',
        clientId: 'real-client-uuid',
        runnerId: 'real-runner-uuid',
        providerOrders: [],
      });

      await expect(
        gateway.handleJoinOrder({ orderId: 'ord-123' }, mockSocket),
      ).rejects.toThrow(WsException);
      expect(mockSocket.join).not.toHaveBeenCalled();
    });

    it('Should allow assignment if user is the assigned Runner', async () => {
      const mockSocket = {
        id: 'socket-runner',
        data: {
          userId: 'real-runner-uuid',
          roles: [Role.RUNNER],
        },
        join: jest.fn(),
      } as any;

      (prismaMock.order!.findUnique as jest.Mock).mockResolvedValue({
        id: 'ord-123',
        clientId: 'real-client-uuid',
        runnerId: 'real-runner-uuid',
        providerOrders: [],
      });

      await gateway.handleJoinOrder({ orderId: 'ord-123' }, mockSocket);

      expect(mockSocket.join).toHaveBeenCalledWith('order:ord-123');
    });

    it('Should isolate client into a subset room (order:id:client)', async () => {
      const mockSocket = {
        id: 'socket-client',
        data: {
          userId: 'real-client-uuid',
          roles: [Role.CLIENT],
        },
        join: jest.fn(),
      } as any;

      (prismaMock.order!.findUnique as jest.Mock).mockResolvedValue({
        id: 'ord-123',
        clientId: 'real-client-uuid',
        runnerId: 'real-runner-uuid',
        providerOrders: [],
      });

      await gateway.handleJoinOrder({ orderId: 'ord-123' }, mockSocket);

      expect(mockSocket.join).toHaveBeenCalledWith('order:ord-123');
      expect(mockSocket.join).toHaveBeenCalledWith('order:ord-123:client');
    });
  });

  describe('additional branch coverage - RunnerGateway', () => {
    it('disconnects client when no token is provided', async () => {
      const mockSocket = {
        id: 'socket-no-token',
        handshake: { headers: {}, auth: {}, query: {} },
        disconnect: jest.fn(),
      } as any;

      await gateway.handleConnection(mockSocket);

      expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
    });

    it('disconnects when user is inactive', async () => {
      const mockSocket = {
        id: 'socket-inactive',
        handshake: { query: { token: 'valid-token' } },
        disconnect: jest.fn(),
      } as any;

      (jwtServiceMock.verifyAsync as jest.Mock).mockResolvedValue({
        sub: 'user-id',
        roles: [Role.RUNNER],
        tokenVersion: 1,
        mfaAuthenticated: true,
        iat: Math.floor(Date.now() / 1000),
      });
      (prismaMock.user!.findUnique as jest.Mock).mockResolvedValue({
        active: false,
        tokenVersion: 1,
        mfaEnabled: false,
        passwordChangedAt: null,
      });

      await gateway.handleConnection(mockSocket);

      expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
    });

    it('disconnects when token was issued before password change', async () => {
      const mockSocket = {
        id: 'socket-old-token',
        handshake: { query: { token: 'valid-token' } },
        disconnect: jest.fn(),
      } as any;

      const passwordChangedAt = new Date(Date.now() - 1000);
      const iatBefore = Math.floor((passwordChangedAt.getTime() - 5000) / 1000);

      (jwtServiceMock.verifyAsync as jest.Mock).mockResolvedValue({
        sub: 'user-id',
        roles: [Role.RUNNER],
        tokenVersion: 1,
        mfaAuthenticated: true,
        iat: iatBefore,
      });
      (prismaMock.user!.findUnique as jest.Mock).mockResolvedValue({
        active: true,
        tokenVersion: 1,
        mfaEnabled: false,
        passwordChangedAt,
      });

      await gateway.handleConnection(mockSocket);

      expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
    });

    it('disconnects when MFA is required but not authenticated', async () => {
      const mockSocket = {
        id: 'socket-no-mfa',
        handshake: { query: { token: 'valid-token' } },
        disconnect: jest.fn(),
      } as any;

      (jwtServiceMock.verifyAsync as jest.Mock).mockResolvedValue({
        sub: 'user-id',
        roles: [Role.RUNNER],
        tokenVersion: 1,
        mfaAuthenticated: false,
        iat: Math.floor(Date.now() / 1000),
      });
      (prismaMock.user!.findUnique as jest.Mock).mockResolvedValue({
        active: true,
        tokenVersion: 1,
        mfaEnabled: true,
        passwordChangedAt: null,
      });

      await gateway.handleConnection(mockSocket);

      expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
    });

    it('allows ADMIN to join any order room', async () => {
      const mockSocket = {
        id: 'socket-admin',
        data: {
          userId: 'admin-user',
          roles: [Role.ADMIN],
        },
        join: jest.fn(),
      } as any;

      (prismaMock.order!.findUnique as jest.Mock).mockResolvedValue({
        id: 'ord-999',
        clientId: 'client-1',
        runnerId: 'runner-1',
        providerOrders: [],
      });

      await gateway.handleJoinOrder({ orderId: 'ord-999' }, mockSocket);

      expect(mockSocket.join).toHaveBeenCalledWith('order:ord-999');
    });

    it('allows PROVIDER to join an order room', async () => {
      const mockSocket = {
        id: 'socket-provider',
        data: {
          userId: 'provider-user',
          roles: [Role.PROVIDER],
        },
        join: jest.fn(),
      } as any;

      (prismaMock.order!.findUnique as jest.Mock).mockResolvedValue({
        id: 'ord-456',
        clientId: 'client-1',
        runnerId: 'runner-1',
        providerOrders: [{ providerId: 'provider-user' }],
      });

      await gateway.handleJoinOrder({ orderId: 'ord-456' }, mockSocket);

      expect(mockSocket.join).toHaveBeenCalledWith('order:ord-456');
    });

    it('throws WsException when order is not found', async () => {
      const mockSocket = {
        id: 'socket-runner',
        data: { userId: 'runner-1', roles: [Role.RUNNER] },
        join: jest.fn(),
      } as any;

      (prismaMock.order!.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        gateway.handleJoinOrder({ orderId: 'nonexistent' }, mockSocket),
      ).rejects.toThrow(WsException);
    });

    it('throws WsException when joinOrder called without userId', async () => {
      const mockSocket = {
        id: 'socket-unauth',
        data: undefined,
        join: jest.fn(),
      } as any;

      await expect(
        gateway.handleJoinOrder({ orderId: 'ord-123' }, mockSocket),
      ).rejects.toThrow(WsException);
    });

    it('handleDisconnect cleans up rate limits for the disconnected user', () => {
      const mockSocket = {
        id: 'socket-disc',
        data: { userId: 'runner-disc' },
      } as any;

      // Should not throw even if no rate limits stored
      expect(() => gateway.handleDisconnect(mockSocket)).not.toThrow();
    });

    it('handleDisconnect works when socket has no data', () => {
      const mockSocket = { id: 'socket-no-data', data: undefined } as any;
      expect(() => gateway.handleDisconnect(mockSocket)).not.toThrow();
    });
  });
});
