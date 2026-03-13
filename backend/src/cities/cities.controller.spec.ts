import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Role } from '@prisma/client';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MfaCompleteGuard } from '../auth/guards/mfa-complete.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CitiesController } from './cities.controller';

describe('CitiesController security metadata', () => {
  it('protects city creation behind admin-only guards', () => {
    const guards =
      Reflect.getMetadata(GUARDS_METADATA, CitiesController.prototype.create) ?? [];
    const roles =
      Reflect.getMetadata(ROLES_KEY, CitiesController.prototype.create) ?? [];

    expect(guards).toEqual([JwtAuthGuard, MfaCompleteGuard, RolesGuard]);
    expect(roles).toEqual([Role.ADMIN]);
  });
});
