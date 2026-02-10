import { Role } from '@prisma/client';

export interface JwtPayload {
  sub: number;
  role: Role;
}

export interface UserFromJwt {
  userId: number;
  role: Role;
}

export interface AuthenticatedRequest extends Request {
  user: UserFromJwt;
}
