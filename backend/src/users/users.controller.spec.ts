import { TestingModule, Test } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { Reflector } from '@nestjs/core';

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

  it('Should exist', () => {
    expect(controller).toBeDefined();
  });
});
