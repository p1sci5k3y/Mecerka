import { TestingModule, Test } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';

import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';

describe('UsersController (RBAC Audit)', () => {
  let controller: UsersController;
  let reflector: Reflector;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: PrismaService, useValue: {} },
        { provide: JwtService, useValue: {} },
        Reflector,
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
    reflector = module.get<Reflector>(Reflector);
  });

  it('Should be decorated to require ADMIN role for /users/roles/provider to enforce 403 for CLIENTs', () => {
    const roles = reflector.get<Role[]>(ROLES_KEY, controller.becomeProvider);
    expect(roles).toBeDefined();
    expect(roles).toContain(Role.ADMIN);
    expect(roles).not.toContain(Role.CLIENT);
  });

  it('Should be decorated to require ADMIN role for /users/roles/runner to enforce 403 for CLIENTs', () => {
    const roles = reflector.get<Role[]>(ROLES_KEY, controller.becomeRunner);
    expect(roles).toBeDefined();
    expect(roles).toContain(Role.ADMIN);
    expect(roles).not.toContain(Role.CLIENT);
  });
});
