import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { EmailService } from '../email/email.service';

describe('AuthService.register', () => {
  let service: AuthService;
  let prismaMock: {
    user: {
      findUnique: jest.Mock;
    };
  };

  beforeEach(async () => {
    prismaMock = {
      user: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: JwtService, useValue: { sign: jest.fn() } },
        {
          provide: EmailService,
          useValue: { sendVerificationEmail: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('rejects self-registration as ADMIN before touching persistence', async () => {
    await expect(
      service.register({
        email: 'attacker@example.com',
        password: 'StrongPassword#123',
        name: 'Mallory',
        role: Role.ADMIN,
      }),
    ).rejects.toThrow(ForbiddenException);

    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });
});
