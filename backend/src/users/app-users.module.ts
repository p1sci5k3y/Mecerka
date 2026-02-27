import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { PrismaModule } from '../prisma/prisma.module';

import { JwtModule } from '@nestjs/jwt';

@Module({
    imports: [
        PrismaModule,
        JwtModule.registerAsync({
            useFactory: () => {
                const secret = process.env.JWT_SECRET;
                if (!secret) {
                    throw new Error('JWT_SECRET configuration is missing');
                }
                return {
                    secret,
                    signOptions: { expiresIn: '1d' },
                };
            },
        }),
    ],
    controllers: [UsersController],
    providers: [],
    exports: [],
})
export class UsersModule { }
