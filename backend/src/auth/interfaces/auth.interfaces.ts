import { Role } from '@prisma/client';

import { Request } from 'express';

// JwtPayload normalizing to roles: Role[]
export interface JwtPayload {
  sub: string;
  roles: Role[];
  iat?: number;
}

export interface UserFromJwt {
  userId: string;
  roles: Role[];
}

export interface AuthenticatedRequest extends Request {
  user: UserFromJwt;
}
