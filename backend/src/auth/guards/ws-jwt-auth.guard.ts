import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';

@Injectable()
export class WsJwtAuthGuard implements CanActivate {
    private logger = new Logger('WsJwtAuthGuard');

    constructor(
        private jwtService: JwtService,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        try {
            const client: Socket = context.switchToWs().getClient<Socket>();
            // Extract token from handshake query or headers
            // Standard practice: client connects with ?token=... or Authorization header
            const token =
                this.extractTokenFromHeader(client) ||
                this.extractTokenFromQuery(client);

            if (!token) {
                this.logger.warn('Missing token in WS connection');
                throw new WsException('Unauthorized');
            }

            const payload = await this.jwtService.verifyAsync(token, {
                secret: process.env.JWT_SECRET || 'secretKey',
            });

            // Attach user to socket object so it can be accessed in Gateway
            (client as any).user = payload;

            return true;
        } catch (err) {
            this.logger.error('WS Auth failed', err);
            throw new WsException('Unauthorized');
        }
    }

    private extractTokenFromHeader(client: Socket): string | undefined {
        const [type, token] = client.handshake.headers.authorization?.split(' ') ?? [];
        return type === 'Bearer' ? token : undefined;
    }

    private extractTokenFromQuery(client: Socket): string | undefined {
        const token = client.handshake.query.token;
        return typeof token === 'string' ? token : undefined;
    }
}
