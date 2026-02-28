import { Role } from '@prisma/client';

import { Request } from 'express';

// JwtPayload normalizing to roles: Role[]
export interface JwtPayload {
  sub: number;
  roles: Role[];
}

export interface UserFromJwt {
  userId: number;
  roles: Role[];
}

export interface AuthenticatedRequest extends Request {
  user: UserFromJwt;
}
