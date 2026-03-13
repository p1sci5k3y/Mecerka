import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Role, DeliveryStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OnEvent } from '@nestjs/event-emitter';
import { JwtPayload } from '../auth/interfaces/auth.interfaces';

interface SocketWithUser extends Socket {
  data: {
    userId: string;
    roles: Role[];
  };
}

@WebSocketGateway({
  namespace: 'tracking',
  cors: {
    origin: process.env.WS_CORS_ORIGIN || 'http://localhost:3000',
  },
})
export class RunnerGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RunnerGateway.name);
  private readonly jwtSecret: string;
  private readonly locationRateLimits: Map<string, number> = new Map();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.jwtSecret =
      this.configService.get<string>('JWT_SECRET_CURRENT') ||
      this.configService.get<string>('JWT_SECRET') ||
      '';
    if (!this.jwtSecret) {
      this.logger.error('JWT_SECRET configuration is missing');
      throw new Error('JWT_SECRET configuration is missing');
    }
  }

  async handleConnection(client: Socket) {
    try {
      const token = this.extractToken(client);
      if (!token) {
        this.logger.warn(
          `No token provided, disconnecting client ${client.id}`,
        );
        client.disconnect(true);
        return;
      }

      let payload;
      try {
        payload = await this.jwtService.verifyAsync(token, {
          secret: this.jwtSecret,
        });
      } catch (error) {
        const previousSecret = this.configService.get<string>(
          'JWT_SECRET_PREVIOUS',
        );
        if (previousSecret) {
          try {
            payload = await this.jwtService.verifyAsync(token, {
              secret: previousSecret,
            });
          } catch (fallbackError) {
            throw error;
          }
        } else {
          throw error;
        }
      }

      if (!payload.sub || typeof payload.sub !== 'string') {
        throw new Error('Invalid JWT: missing subject');
      }

      await this.validateSocketSession(payload as JwtPayload);

      // Associate user identity aggressively inside the socket object
      (client as SocketWithUser).data = {
        userId: payload.sub,
        roles: Array.isArray(payload.roles) ? payload.roles : [],
      };

      this.logger.log(
        `Client authenticated and connected: ${client.id} (User: ${payload.sub})`,
      );
    } catch (error) {
      this.logger.error(
        `Handshake authentication failed: ${error instanceof Error ? error.message : 'Unknown'} (Client ${client.id})`,
      );
      client.disconnect(true);
    }
  }

  private async validateSocketSession(payload: JwtPayload): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        active: true,
        tokenVersion: true,
        mfaEnabled: true,
        passwordChangedAt: true,
      },
    });

    if (!user?.active) {
      throw new Error('User is inactive or missing');
    }

    if (
      payload.tokenVersion !== undefined &&
      payload.tokenVersion < user.tokenVersion
    ) {
      throw new Error('Token revoked');
    }

    if (user.passwordChangedAt && payload.iat) {
      if (payload.iat < Math.floor(user.passwordChangedAt.getTime() / 1000)) {
        throw new Error('Token expired due to password change');
      }
    }

    if (user.mfaEnabled && !payload.mfaAuthenticated) {
      throw new Error('MFA verification is required');
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    // Clean up rate limits on disconnect to avoid memory leaks
    const userId = (client as SocketWithUser).data?.userId;
    if (userId) {
      // Remove any keys matching this userId pattern conceptually, or we can just rely on the TTL
      // Simple TTL cleanup might be better to avoid tracking all keys per user, but for now we iterate
      for (const key of this.locationRateLimits.keys()) {
        if (key.startsWith(`${userId}:`)) {
          this.locationRateLimits.delete(key);
        }
      }
    }
  }

  private extractToken(client: Socket): string | undefined {
    // Support standard Auth headers
    const [type, headerToken] =
      client.handshake.headers?.authorization?.split(' ') ?? [];
    if (type === 'Bearer' && headerToken) return headerToken;

    // Support standard Socket.IO auth object
    const authToken = client.handshake.auth?.token;
    if (typeof authToken === 'string') return authToken;

    // Fallback to query
    const queryToken = client.handshake.query.token;
    if (typeof queryToken === 'string') return queryToken;

    return undefined;
  }

  @SubscribeMessage('joinOrder')
  async handleJoinOrder(
    @MessageBody() data: { orderId: string },
    @ConnectedSocket() client: SocketWithUser,
  ) {
    if (!client.data?.userId) throw new WsException('Unauthorized');
    const { userId, roles } = client.data;

    // DB Strict check minimum fields to avoid exposing everything
    const order = await this.prisma.order.findUnique({
      where: { id: data.orderId },
      select: {
        id: true,
        status: true,
        clientId: true,
        runnerId: true,
        providerOrders: {
          select: { providerId: true },
        },
      },
    });

    if (!order) {
      this.logger.warn(
        `Join rejected: Order ${data.orderId} not found (User ${userId})`,
      );
      throw new WsException('Order not found or access denied');
    }

    let roleSegment = '';

    if (roles.includes(Role.ADMIN)) {
      roleSegment = 'admin';
    } else if (order.clientId === userId) {
      roleSegment = 'client';
    } else if (order.runnerId === userId) {
      roleSegment = 'runner';
    } else if (order.providerOrders.some((po) => po.providerId === userId)) {
      // If strict isolated provider events needed in the future:
      // roleSegment = `provider:${userId}`
      // Ignoring for now as per instructions (maximum 3 rooms, 'order:{id}' and 'order:{id}:client');
      // We just join the global order room.
      roleSegment = 'provider';
    }

    if (!roleSegment) {
      this.logger.warn(
        `User ${userId} attempted to join unauthorized order ${data.orderId}`,
      );
      throw new WsException('Forbidden');
    }

    const globalRoom = `order:${data.orderId}`;
    client.join(globalRoom);
    if (roleSegment === 'client') {
      client.join(`${globalRoom}:client`);
    }
    this.logger.log(
      `Client ${client.id} (User ${userId}) joined room ${globalRoom} [Role: ${roleSegment}]`,
    );
    return { event: 'joinedRoom', room: globalRoom };
  }

  @SubscribeMessage('updateLocation')
  async handleUpdateLocation(
    @MessageBody() data: { orderId: string; lat: number; lng: number },
    @ConnectedSocket() client: SocketWithUser,
  ) {
    if (
      typeof data.lat !== 'number' ||
      typeof data.lng !== 'number' ||
      typeof data.orderId !== 'string' ||
      data.lat < -90 ||
      data.lat > 90 ||
      data.lng < -180 ||
      data.lng > 180 ||
      !Number.isFinite(data.lat) ||
      !Number.isFinite(data.lng)
    ) {
      throw new WsException('Invalid location payload');
    }

    if (!client.data?.userId) {
      throw new WsException('Unauthorized');
    }
    const { userId, roles } = client.data;

    if (!roles.includes(Role.RUNNER)) {
      throw new WsException('Forbidden: Only RUNNER role can emit locations');
    }

    // Rate limit: 1 sec TTL sliding window
    const rateLimitKey = `${userId}:${data.orderId}`;
    const lastEmitted = this.locationRateLimits.get(rateLimitKey);
    const now = Date.now();
    if (lastEmitted && now - lastEmitted < 1000) {
      throw new WsException('Rate limit exceeded: 1 update per second allowed');
    }
    this.locationRateLimits.set(rateLimitKey, now);

    // Security check DB
    const order = await this.prisma.order.findUnique({
      where: { id: data.orderId },
      select: { runnerId: true, status: true },
    });

    if (!order || order.runnerId !== userId) {
      throw new WsException(
        'Forbidden: Not the assigned runner for this order',
      );
    }
    if (order.status !== DeliveryStatus.IN_TRANSIT) {
      throw new WsException(
        'Forbidden: Location can only be updated while IN_TRANSIT',
      );
    }

    const clientRoom = `order:${data.orderId}:client`;

    // Broadcast EXCLUSIVELY to the client's sub-room
    this.server.to(clientRoom).emit('locationUpdated', {
      orderId: data.orderId,
      lat: data.lat,
      lng: data.lng,
    });
  }

  // INTERNAL EVENT BUS LISTENERS (Post-DB Commits)

  @OnEvent('order.stateChanged')
  handleOrderStateChanged(payload: {
    orderId: string;
    status: DeliveryStatus;
  }) {
    // Emit to the general order room so clients, providers, and runners see the new status
    this.server.to(`order:${payload.orderId}`).emit('orderStatusChanged', {
      orderId: payload.orderId,
      status: payload.status,
    });
    this.logger.log(
      `Broadcasted state bypass order.stateChanged: order:${payload.orderId} -> ${payload.status}`,
    );
  }
}
