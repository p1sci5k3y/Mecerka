import { Test, TestingModule } from '@nestjs/testing';
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
    $transaction: jest.Mock;
  };
  let emailServiceMock: { sendVerificationEmail: jest.Mock };

  beforeEach(async () => {
    prismaMock = {
      user: {
        findUnique: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    emailServiceMock = { sendVerificationEmail: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: JwtService, useValue: { sign: jest.fn() } },
        { provide: EmailService, useValue: emailServiceMock },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('always creates CLIENT users at registration', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        user: {
          create: jest.fn().mockResolvedValue({
            id: 'user-1',
            email: 'user@example.test',
          }),
        },
      }),
    );
    emailServiceMock.sendVerificationEmail.mockResolvedValue(undefined);

    await expect(
      service.register({
        email: 'user@example.test',
        password: 'StrongPassword#123',
        name: 'Alice',
      }),
    ).resolves.toEqual({
      message:
        'Cuenta creada. Por favor, revisa tu correo para verificar tu cuenta.',
    });

    const txArg = prismaMock.$transaction.mock.calls[0]![0];
    const createMock = jest.fn().mockResolvedValue({
      id: 'user-1',
      email: 'user@example.test',
    });
    await txArg({ user: { create: createMock } });
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          roles: [Role.CLIENT],
        }),
      }),
    );
  });

  it('does not allow role escalation through register payload', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        user: {
          create: jest.fn().mockResolvedValue({
            id: 'user-2',
            email: 'attacker@example.test',
          }),
        },
      }),
    );
    emailServiceMock.sendVerificationEmail.mockResolvedValue(undefined);

    const payload = {
      email: 'attacker@example.test',
      password: 'StrongPassword#123',
      name: 'Mallory',
      role: Role.ADMIN,
    };

    await expect(service.register(payload as any)).resolves.toEqual({
      message:
        'Cuenta creada. Por favor, revisa tu correo para verificar tu cuenta.',
    });
  });
});
