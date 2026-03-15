import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DeliveryStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RunnerService } from './runner.service';

describe('RunnerService assignment invariants', () => {
  let service: RunnerService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      order: {
        findUnique: jest.fn(),
      },
      runnerProfile: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RunnerService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<RunnerService>(RunnerService);
  });

  it('rejects assigning a runner that has not completed Stripe onboarding', async () => {
    prismaMock.order.findUnique.mockResolvedValue({
      id: 'order-1',
      status: DeliveryStatus.READY_FOR_ASSIGNMENT,
      clientId: 'client-1',
      city: { id: 'city-1' },
    });
    prismaMock.runnerProfile.findUnique.mockResolvedValue({
      userId: 'runner-1',
      isActive: true,
      user: {
        active: true,
        stripeAccountId: null,
      },
    });

    await expect(
      service.selectRunner('order-1', { runnerId: 'runner-1' }, 'client-1', [
        Role.CLIENT,
      ]),
    ).rejects.toThrow(BadRequestException);
  });

  it('lists only active runners that are operationally eligible for assignment', async () => {
    prismaMock.runnerProfile.findMany.mockResolvedValue([
      {
        userId: 'runner-1',
        baseLat: 40.4,
        baseLng: -3.7,
        maxDistanceKm: 10,
        priceBase: 2,
        pricePerKm: 0.5,
        minFee: 3,
        ratingAvg: 4.8,
        user: { id: 'runner-1', name: 'Runner One' },
      },
    ]);

    const result = await service.previewDelivery({ lat: 40.41, lng: -3.71 });

    expect(prismaMock.runnerProfile.findMany).toHaveBeenCalledWith({
      where: {
        isActive: true,
        user: {
          active: true,
          stripeAccountId: { not: null },
        },
      },
      include: { user: { select: { name: true, id: true } } },
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({ runnerId: 'runner-1', name: 'Runner One' }),
    );
  });
});
