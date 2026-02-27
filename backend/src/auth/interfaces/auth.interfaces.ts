import { Role } from '@prisma/client';

import { Request } from 'express';

export interface JwtPayload {
  sub: number;
  roles?: Role[];
  role?: Role;
}

export interface UserFromJwt {
  userId: number;
  roles: Role[];
}

export interface AuthenticatedRequest extends Request {
  user: UserFromJwt;
}
