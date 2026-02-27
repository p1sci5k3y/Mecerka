import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { JwtPayload, UserFromJwt } from '../interfaces/auth.interfaces';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'secretKey',
    });
  }

  validate(payload: JwtPayload): UserFromJwt {
    let roles: string[] = [];
    if (Array.isArray(payload.roles)) {
      roles = payload.roles;
    } else if (payload.role) {
      roles = [payload.role];
    }
    return { userId: payload.sub, roles };
  }
}
