import { TestingModule, Test } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { Reflector } from '@nestjs/core';
import { UsersService } from './users.service';

describe('UsersController (RBAC Audit)', () => {
  let controller: UsersController;
  let reflector: Reflector;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: {} }, Reflector],
    }).compile();

    controller = module.get<UsersController>(UsersController);
    reflector = module.get<Reflector>(Reflector);
  });

  it('Should exist', () => {
    expect(controller).toBeDefined();
  });
});
