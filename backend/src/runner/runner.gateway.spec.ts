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
  let emitMock: jest.Mock;
  let toMock: jest.Mock;

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
    emitMock = jest.fn();
    toMock = jest.fn().mockReturnValue({ emit: emitMock });
    gateway.server = { to: toMock } as any;
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

    it('falls back to JWT_SECRET_PREVIOUS when the current secret fails', async () => {
      const mockSocket = {
        id: 'socket-fallback-secret',
        handshake: { headers: { authorization: 'Bearer rotated-token' } },
        disconnect: jest.fn(),
      } as any;

      (configServiceMock.get as jest.Mock).mockImplementation((key: string) => {
        if (key === 'JWT_SECRET_CURRENT') return 'current-secret';
        if (key === 'JWT_SECRET_PREVIOUS') return 'previous-secret';
        if (key === 'JWT_SECRET') return 'fallback-secret';
        return undefined;
      });

      const retryModule: TestingModule = await Test.createTestingModule({
        providers: [
          RunnerGateway,
          { provide: JwtService, useValue: jwtServiceMock },
          { provide: PrismaService, useValue: prismaMock },
          { provide: ConfigService, useValue: configServiceMock },
        ],
      }).compile();

      gateway = retryModule.get<RunnerGateway>(RunnerGateway);
      gateway.server = {
        to: jest.fn().mockReturnValue({ emit: jest.fn() }),
      } as any;

      (jwtServiceMock.verifyAsync as jest.Mock)
        .mockRejectedValueOnce(new Error('JWT Error'))
        .mockResolvedValueOnce({
          sub: 'user-fallback',
          roles: [Role.RUNNER],
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

      expect(jwtServiceMock.verifyAsync).toHaveBeenNthCalledWith(
        1,
        'rotated-token',
        { secret: 'current-secret' },
      );
      expect(jwtServiceMock.verifyAsync).toHaveBeenNthCalledWith(
        2,
        'rotated-token',
        { secret: 'previous-secret' },
      );
      expect(mockSocket.disconnect).not.toHaveBeenCalled();
      expect(mockSocket.data).toEqual({
        userId: 'user-fallback',
        roles: [Role.RUNNER],
      });
    });

    it('disconnects when the JWT payload has no subject', async () => {
      const mockSocket = {
        id: 'socket-no-sub',
        handshake: { auth: { token: 'auth-token' } },
        disconnect: jest.fn(),
      } as any;

      (jwtServiceMock.verifyAsync as jest.Mock).mockResolvedValue({
        roles: [Role.RUNNER],
        tokenVersion: 1,
        mfaAuthenticated: true,
        iat: Math.floor(Date.now() / 1000),
      });

      await gateway.handleConnection(mockSocket);

      expect(jwtServiceMock.verifyAsync).toHaveBeenCalledWith('auth-token', {
        secret: 'test-secret',
      });
      expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
    });

    it('extracts the access token from the cookie before auth and query fallbacks', async () => {
      const mockSocket = {
        id: 'socket-cookie-token',
        handshake: {
          headers: { cookie: 'foo=bar; access_token=cookie-token%20123' },
          auth: { token: 'auth-token' },
          query: { token: 'query-token' },
        },
        disconnect: jest.fn(),
      } as any;

      (jwtServiceMock.verifyAsync as jest.Mock).mockResolvedValue({
        sub: 'user-cookie',
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

      expect(jwtServiceMock.verifyAsync).toHaveBeenCalledWith(
        'cookie-token 123',
        { secret: 'test-secret' },
      );
      expect(mockSocket.disconnect).not.toHaveBeenCalled();
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

    it('constructor rejects missing JWT secrets', async () => {
      (configServiceMock.get as jest.Mock).mockReturnValue('');

      await expect(
        Test.createTestingModule({
          providers: [
            RunnerGateway,
            { provide: JwtService, useValue: jwtServiceMock },
            { provide: PrismaService, useValue: prismaMock },
            { provide: ConfigService, useValue: configServiceMock },
          ],
        }).compile(),
      ).rejects.toThrow('JWT_SECRET configuration is missing');
    });

    it('rejects invalid location payloads', async () => {
      await expect(
        gateway.handleUpdateLocation(
          { orderId: 'order-1', lat: 120, lng: -3.7 },
          { data: { userId: 'runner-1', roles: [Role.RUNNER] } } as any,
        ),
      ).rejects.toThrow(WsException);
    });

    it('rejects location updates from unauthenticated sockets', async () => {
      await expect(
        gateway.handleUpdateLocation(
          { orderId: 'order-1', lat: 40.4, lng: -3.7 },
          { data: undefined } as any,
        ),
      ).rejects.toThrow(WsException);
    });

    it('rejects location updates from non-runners', async () => {
      await expect(
        gateway.handleUpdateLocation(
          { orderId: 'order-1', lat: 40.4, lng: -3.7 },
          { data: { userId: 'client-1', roles: [Role.CLIENT] } } as any,
        ),
      ).rejects.toThrow(WsException);
    });

    it('rejects location updates from a socket that is not the assigned runner', async () => {
      (prismaMock.order!.findUnique as jest.Mock).mockResolvedValue({
        runnerId: 'runner-2',
        status: 'IN_TRANSIT',
      });

      await expect(
        gateway.handleUpdateLocation(
          { orderId: 'order-1', lat: 40.4, lng: -3.7 },
          { data: { userId: 'runner-1', roles: [Role.RUNNER] } } as any,
        ),
      ).rejects.toThrow(WsException);
    });

    it('rejects location updates unless the order is IN_TRANSIT', async () => {
      (prismaMock.order!.findUnique as jest.Mock).mockResolvedValue({
        runnerId: 'runner-1',
        status: 'ASSIGNED',
      });

      await expect(
        gateway.handleUpdateLocation(
          { orderId: 'order-1', lat: 40.4, lng: -3.7 },
          { data: { userId: 'runner-1', roles: [Role.RUNNER] } } as any,
        ),
      ).rejects.toThrow(WsException);
    });

    it('rate limits repeated location updates for the same runner and order', async () => {
      (prismaMock.order!.findUnique as jest.Mock).mockResolvedValue({
        runnerId: 'runner-1',
        status: 'IN_TRANSIT',
      });

      const socket = {
        data: { userId: 'runner-1', roles: [Role.RUNNER] },
      } as any;

      await gateway.handleUpdateLocation(
        { orderId: 'order-1', lat: 40.4, lng: -3.7 },
        socket,
      );

      await expect(
        gateway.handleUpdateLocation(
          { orderId: 'order-1', lat: 40.41, lng: -3.71 },
          socket,
        ),
      ).rejects.toThrow(WsException);
    });

    it('broadcasts a valid location update only to the client room', async () => {
      (prismaMock.order!.findUnique as jest.Mock).mockResolvedValue({
        runnerId: 'runner-1',
        status: 'IN_TRANSIT',
      });

      await gateway.handleUpdateLocation(
        { orderId: 'order-1', lat: 40.4, lng: -3.7 },
        { data: { userId: 'runner-1', roles: [Role.RUNNER] } } as any,
      );

      expect(toMock).toHaveBeenCalledWith('order:order-1:client');
      expect(emitMock).toHaveBeenCalledWith('locationUpdated', {
        orderId: 'order-1',
        lat: 40.4,
        lng: -3.7,
      });
    });

    it('broadcasts order state changes to the general order room', () => {
      gateway.handleOrderStateChanged({
        orderId: 'order-1',
        status: 'DELIVERED' as any,
      });

      expect(toMock).toHaveBeenCalledWith('order:order-1');
      expect(emitMock).toHaveBeenCalledWith('orderStatusChanged', {
        orderId: 'order-1',
        status: 'DELIVERED',
      });
    });
  });
});
