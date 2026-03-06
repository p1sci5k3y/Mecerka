import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtPayload, UserFromJwt } from '../interfaces/auth.interfaces';
import { PrismaService } from '../../prisma/prisma.service';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKeyProvider: (request: any, rawJwtToken: any, done: any) => {
        const currentSecret =
          process.env.JWT_SECRET_CURRENT || process.env.JWT_SECRET;
        const previousSecret = process.env.JWT_SECRET_PREVIOUS;

        if (!currentSecret) {
          return done(new Error('JWT_SECRET configuration is missing'), null);
        }

        try {
          jwt.verify(rawJwtToken, currentSecret);
          return done(null, currentSecret);
        } catch (firstErr) {
          if (previousSecret) {
            try {
              jwt.verify(rawJwtToken, previousSecret);
              return done(null, previousSecret);
            } catch (fallbackError) {
              return done(firstErr, previousSecret);
            }
          }
          return done(firstErr, currentSecret);
        }
      },
    });
  }

  async validate(payload: JwtPayload): Promise<UserFromJwt> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { passwordChangedAt: true },
    });

    if (user?.passwordChangedAt && payload.iat) {
      // payload.iat is in seconds, passwordChangedAt is in ms
      if (payload.iat < Math.floor(user.passwordChangedAt.getTime() / 1000)) {
        throw new UnauthorizedException('Token expired due to password change');
      }
    }

    let roles: Role[] = [];
    if (Array.isArray(payload.roles)) {
      roles = payload.roles;
    }
    return { userId: payload.sub, roles };
  }
}
