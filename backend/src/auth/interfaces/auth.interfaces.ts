import { Role } from '@prisma/client';

import { Request } from 'express';

// JwtPayload normalizing to roles: Role[]
export interface JwtPayload {
  sub: string;
  roles: Role[];
  iat?: number;
  exp?: number;
  mfaAuthenticated?: boolean;
  tokenVersion?: number;
}

export interface UserFromJwt {
  userId: string;
  roles: Role[];
  mfaEnabled: boolean;
  mfaAuthenticated: boolean;
}

export interface RequestWithUser extends Request {
  user: UserFromJwt;
}
