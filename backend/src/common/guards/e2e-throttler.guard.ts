import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class E2eAwareThrottlerGuard extends ThrottlerGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (process.env.E2E === 'true' || process.env.NODE_ENV === 'test') {
      return true;
    }

    return super.canActivate(context);
  }
}
