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

    private logger = new Logger('RunnerGateway');

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
        const user = (client as any).user as { sub: number; role: Role };
        if (!user) throw new WsException('Unauthorized');

        const order = await this.ordersService.findOne(data.orderId).catch(() => null);
        if (!order) throw new WsException('Order not found');

        // Authorization Logic
        let isAuthorized = false;

        if (user.role === Role.ADMIN) {
            isAuthorized = true;
        } else if (order.clientId === user.sub) {
            isAuthorized = true; // Client owns the order
        } else if (order.runnerId === user.sub) {
            isAuthorized = true; // Runner assigned to order
        } else if (user.role === Role.PROVIDER) {
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
    handleUpdateLocation(
        @MessageBody() data: { orderId: number; lat: number; lng: number },
        @ConnectedSocket() client: Socket,
    ) {
        // Ensure only the assigned runner can update location? 
        // For now, let's keep it simple, but ideally check user.sub === order.runnerId
        const room = `order_${data.orderId}`;
        this.logger.log(
            `Location update for ${room}: ${data.lat}, ${data.lng}`,
        );
        this.server.to(room).emit('locationUpdated', data);
    }
}
