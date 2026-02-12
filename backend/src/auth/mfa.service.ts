import { Injectable } from '@nestjs/common';
import { toDataURL } from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { authenticator } = require('otplib');

@Injectable()
export class MfaService {
    constructor(private prisma: PrismaService) { }

    async generateMfaSecret(userId: number, email: string) {
        const secret = authenticator.generateSecret();
        const otpauthUrl = authenticator.keyuri(email, 'Mecerka (Startup)', secret);

        // Save secret to user but keep MFA disabled until verified
        await this.prisma.user.update({
            where: { id: userId },
            data: { mfaSecret: secret, mfaEnabled: false },
        });

        const qrCode = await toDataURL(otpauthUrl);

        return {
            secret,
            otpauthUrl,
            qrCode, // Sending Data URL instead of raw SVG for easier frontend handling
        };
    }

    async verifyMfaToken(userId: number, token: string) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user || !user.mfaSecret) {
            return false;
        }

        const isValid = authenticator.verify({
            token,
            secret: user.mfaSecret,
        });

        if (isValid) {
            await this.prisma.user.update({
                where: { id: userId },
                data: { mfaEnabled: true },
            });
        }

        return isValid;
    }
}
