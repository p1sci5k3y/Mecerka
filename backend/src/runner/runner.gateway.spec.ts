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
      });

      await gateway.handleConnection(mockSocket);

      expect(mockSocket.disconnect).not.toHaveBeenCalled();
      expect(mockSocket.data).toEqual({
        userId: 'user-id-123',
        roles: [Role.CLIENT],
      });
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
});
