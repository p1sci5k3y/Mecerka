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
import { Logger, UseGuards } from '@nestjs/common';
import { WsJwtAuthGuard } from '../auth/guards/ws-jwt-auth.guard';
import { OrdersService } from '../orders/orders.service';
import { Role } from '@prisma/client';

@WebSocketGateway({
    namespace: 'tracking',
    cors: {
        origin: '*', // Allow all for now, in prod restrict to frontend URL
    },
})
@UseGuards(WsJwtAuthGuard)
export class RunnerGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    private readonly logger = new Logger('RunnerGateway');

    constructor(private readonly ordersService: OrdersService) { }

    handleConnection(client: Socket) {
        this.logger.log(`Client connected: ${client.id}`);
    }

    handleDisconnect(client: Socket) {
        this.logger.log(`Client disconnected: ${client.id}`);
    }

    @SubscribeMessage('joinOrder')
    async handleJoinOrder(
        @MessageBody() data: { orderId: number },
        @ConnectedSocket() client: Socket,
    ) {
        // User attached by WsJwtAuthGuard
        const user = (client as any).user as { sub: number; roles: Role[] };
        if (!user || !Array.isArray(user.roles)) throw new WsException('Unauthorized');

        const order = await this.ordersService.findOne(data.orderId, user.sub, user.roles).catch(() => null);
        if (!order) throw new WsException('Order not found or access denied');

        // Authorization Logic
        let isAuthorized = false;

        if (user.roles.includes(Role.ADMIN)) {
            isAuthorized = true;
        } else if (order.clientId === user.sub) {
            isAuthorized = true; // Client owns the order
        } else if (order.runnerId === user.sub) {
            isAuthorized = true; // Runner assigned to order
        } else if (user.roles.includes(Role.PROVIDER)) {
            // Check if provider owns any product in the order
            const ownsProduct = order.items.some(
                (item) => item.product.providerId === user.sub,
            );
            if (ownsProduct) isAuthorized = true;
        }

        if (!isAuthorized) {
            this.logger.warn(`User ${user.sub} attempted to join unauthorized order ${data.orderId}`);
            throw new WsException('Forbidden');
        }

        const room = `order_${data.orderId}`;
        client.join(room);
        this.logger.log(`Client ${client.id} (User ${user.sub}) joined room ${room}`);
        return { event: 'joinedRoom', room };
    }

    @SubscribeMessage('updateLocation')
    async handleUpdateLocation(
        @MessageBody() data: { orderId: number; lat: number; lng: number },
        @ConnectedSocket() client: Socket,
    ) {
        if (typeof data.lat !== 'number' || typeof data.lng !== 'number' || typeof data.orderId !== 'number') {
            throw new WsException('Invalid location payload');
        }

        const user = (client as any).user as { sub: number; roles: Role[] };
        if (!user) throw new WsException('Unauthorized');

        // Verify order assignment securely before rebroadcasting
        const order = await this.ordersService.findOne(data.orderId, user.sub, user.roles).catch(() => null);

        if (!order || order.runnerId !== user.sub) {
            throw new WsException('Forbidden: Not the assigned runner for this order');
        }

        const room = `order_${data.orderId}`;
        this.logger.log(
            `Location update for ${room}: ${data.lat}, ${data.lng}`,
        );
        this.server.to(room).emit('locationUpdated', data);
    }
}
