import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtPayload, UserFromJwt } from '../interfaces/auth.interfaces';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
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

  validate(payload: JwtPayload): UserFromJwt {
    let roles: Role[] = [];
    if (Array.isArray(payload.roles)) {
      roles = payload.roles;
    }
    return { userId: payload.sub, roles };
  }
}
