import { Controller, Post, UseGuards, Request, ConflictException, NotFoundException, Body } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Role } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { SetPinDto } from './dto/set-pin.dto';
import * as argon2 from 'argon2';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
    constructor(
        private readonly prisma: PrismaService,
        private readonly jwtService: JwtService
    ) { }

    @Post('pin')
    async setTransactionPin(@Request() req: any, @Body() dto: SetPinDto) {
        const userId = req.user.userId;
        const hashedPin = await argon2.hash(dto.pin);

        await this.prisma.user.update({
            where: { id: userId },
            data: { pin: hashedPin },
        });

        return { message: 'PIN transaccional configurado correctamente' };
    }

    @Post('roles/provider')
    async becomeProvider(@Request() req: any) {
        console.log('Becoming provider for user:', req.user);
        const userId = req.user.userId;
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        console.log('User found:', user);

        if (!user) {
            throw new NotFoundException('User not found');
        }

        if (user.roles.includes(Role.PROVIDER)) {
            throw new ConflictException('User is already a provider');
        }

        console.log('Updating user roles...');
        const updatedUser = await this.prisma.user.update({
            where: { id: userId },
            data: {
                roles: {
                    push: Role.PROVIDER,
                },
            },
        });
        console.log('User updated:', updatedUser);

        // Generate fresh token with updated roles
        const payload = { sub: updatedUser.id, email: updatedUser.email, roles: updatedUser.roles };
        const accessToken = this.jwtService.sign(payload);

        return {
            message: 'Provider role added',
            roles: updatedUser.roles,
            access_token: accessToken
        };
    }

    @Post('roles/runner')
    async becomeRunner(@Request() req: any) {
        const userId = req.user.userId;

        const updatedUser = await this.prisma.$transaction(async (tx) => {
            const user = await tx.user.findUnique({ where: { id: userId } });
            if (!user) {
                throw new NotFoundException('User not found');
            }
            if (user.roles.includes(Role.RUNNER)) {
                throw new ConflictException('User is already a runner (role exists)');
            }

            const runnerProfile = await tx.runnerProfile.findUnique({
                where: { userId },
            });

            if (!runnerProfile) {
                // Create default runner profile
                await tx.runnerProfile.create({
                    data: {
                        userId,
                        baseLat: null, // Should be updated by user later
                        baseLng: null,
                    }
                });
            }

            return tx.user.update({
                where: { id: userId },
                data: {
                    roles: {
                        push: Role.RUNNER,
                    },
                },
            });
        });

        // Generate fresh token with updated roles
        const payload = { sub: updatedUser.id, email: updatedUser.email, roles: updatedUser.roles };
        const accessToken = this.jwtService.sign(payload);

        return {
            message: 'Runner role added',
            roles: updatedUser.roles,
            access_token: accessToken
        };
    }
}
