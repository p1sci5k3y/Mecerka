import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtPayload, UserFromJwt } from '../interfaces/auth.interfaces';
import { PrismaService } from '../../prisma/prisma.service';
import * as jwt from 'jsonwebtoken';
import type { Request } from 'express';

type RequestWithCookies = Request & {
  cookies?: {
    access_token?: string;
  };
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: RequestWithCookies | undefined) =>
          request?.cookies?.access_token ?? null,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKeyProvider: (
        _request: unknown,
        rawJwtToken: string,
        done: (err: any, secret?: string) => void,
      ) => {
        const currentSecret =
          process.env.JWT_SECRET_CURRENT || process.env.JWT_SECRET;
        const previousSecret = process.env.JWT_SECRET_PREVIOUS;

        if (!currentSecret) {
          return done(
            new Error('JWT_SECRET configuration is missing'),
            undefined,
          );
        }

        try {
          jwt.verify(rawJwtToken, currentSecret);
          return done(null, currentSecret);
        } catch (error_) {
          if (previousSecret) {
            try {
              jwt.verify(rawJwtToken, previousSecret);
              return done(null, previousSecret);
            } catch (err) {
              return done(err);
            }
          }
          return done(error_);
        }
      },
    });
  }

  async validate(payload: JwtPayload): Promise<UserFromJwt> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        active: true,
        emailVerified: true,
        roles: true,
        tokenVersion: true,
        mfaEnabled: true,
        passwordChangedAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (!user.active) {
      throw new UnauthorizedException('User account is suspended');
    }

    if (
      payload.tokenVersion !== undefined &&
      payload.tokenVersion < user.tokenVersion
    ) {
      throw new UnauthorizedException('Token revoked');
    }

    if (user.passwordChangedAt && payload.iat) {
      // payload.iat is in seconds, passwordChangedAt is in ms
      if (payload.iat < Math.floor(user.passwordChangedAt.getTime() / 1000)) {
        throw new UnauthorizedException('Token expired due to password change');
      }
    }

    const mfaAuthenticated = payload.mfaAuthenticated ?? !user.mfaEnabled;

    return {
      userId: payload.sub,
      roles: user.roles,
      mfaEnabled: user.mfaEnabled,
      mfaAuthenticated,
    };
  }
}
