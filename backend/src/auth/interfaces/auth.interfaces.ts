import { Role } from '@prisma/client';

export interface JwtPayload {
  sub: number;
  roles: Role[];
}

export interface UserFromJwt {
  userId: number;
  roles: Role[];
}

export interface AuthenticatedRequest {
  user: UserFromJwt;
}
