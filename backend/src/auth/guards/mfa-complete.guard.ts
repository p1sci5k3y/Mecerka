import {
    Injectable,
    CanActivate,
    ExecutionContext,
    ForbiddenException,
} from '@nestjs/common';
import { UserFromJwt } from '../interfaces/auth.interfaces';

@Injectable()
export class MfaCompleteGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest();
        const user = request.user as UserFromJwt;

        if (!user) {
            return false; // Let internal strategy handle total 401
        }

        if (user.mfaEnabled && !user.mfaAuthenticated) {
            throw new ForbiddenException('MFA verification is required to access this resource');
        }

        return true;
    }
}
