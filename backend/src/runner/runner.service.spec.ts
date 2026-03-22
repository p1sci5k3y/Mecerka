import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
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

  // ─── branch coverage additions ────────────────────────────────────────────

  describe('branch coverage', () => {
    describe('previewDelivery', () => {
      it('excludes runners without location (baseLat/baseLng null)', async () => {
        prismaMock.runnerProfile.findMany.mockResolvedValue([
          {
            userId: 'runner-noloc',
            baseLat: null, // no location
            baseLng: null,
            maxDistanceKm: 10,
            priceBase: 2,
            pricePerKm: 0.5,
            minFee: 3,
            ratingAvg: 4.5,
            user: { id: 'runner-noloc', name: 'No Location Runner' },
          },
        ]);

        const result = await service.previewDelivery({ lat: 40.0, lng: -3.0 });

        expect(result).toHaveLength(0);
      });

      it('excludes runners outside maxDistanceKm', async () => {
        prismaMock.runnerProfile.findMany.mockResolvedValue([
          {
            userId: 'runner-far',
            baseLat: 0, // Very far away
            baseLng: 0,
            maxDistanceKm: 1, // Max 1km but will be 4500+ km away
            priceBase: 2,
            pricePerKm: 0.5,
            minFee: 3,
            ratingAvg: 4.5,
            user: { id: 'runner-far', name: 'Far Runner' },
          },
        ]);

        const result = await service.previewDelivery({ lat: 40.0, lng: -3.0 });

        expect(result).toHaveLength(0);
      });

      it('applies minFee when computed fee is below minimum', async () => {
        prismaMock.runnerProfile.findMany.mockResolvedValue([
          {
            userId: 'runner-min',
            baseLat: 40.41,
            baseLng: -3.71,
            maxDistanceKm: 20,
            priceBase: 0, // Very low base
            pricePerKm: 0, // No per-km charge
            minFee: 5, // But minFee is 5
            ratingAvg: 4.0,
            user: { id: 'runner-min', name: 'Min Fee Runner' },
          },
        ]);

        const result = await service.previewDelivery({
          lat: 40.4168,
          lng: -3.7038,
        });

        expect(result).toHaveLength(1);
        expect(result[0]!.estimatedFee).toBe(5); // minFee applied
      });

      it('sorts runners by distanceKm then rating', async () => {
        prismaMock.runnerProfile.findMany.mockResolvedValue([
          {
            userId: 'runner-b',
            baseLat: 40.4,
            baseLng: -3.7,
            maxDistanceKm: 20,
            priceBase: 2,
            pricePerKm: 0.5,
            minFee: 1,
            ratingAvg: 4.0,
            user: { id: 'runner-b', name: 'Runner B' },
          },
          {
            userId: 'runner-a',
            baseLat: 40.41,
            baseLng: -3.71,
            maxDistanceKm: 20,
            priceBase: 2,
            pricePerKm: 0.5,
            minFee: 1,
            ratingAvg: 4.8,
            user: { id: 'runner-a', name: 'Runner A' },
          },
        ]);

        const result = await service.previewDelivery({
          lat: 40.415,
          lng: -3.71,
        });

        // Runner A is closer (same location as delivery point), should appear first
        expect(result[0]!.runnerId).toBe('runner-a');
      });
    });

    describe('selectRunner', () => {
      it('throws NotFoundException when order is not found', async () => {
        prismaMock.order.findUnique.mockResolvedValue(null);

        await expect(
          service.selectRunner(
            'missing-order',
            { runnerId: 'runner-1' },
            'client-1',
            [Role.CLIENT],
          ),
        ).rejects.toThrow(NotFoundException);
      });

      it('throws BadRequestException when order is not READY_FOR_ASSIGNMENT', async () => {
        prismaMock.order.findUnique.mockResolvedValue({
          id: 'order-1',
          status: DeliveryStatus.PENDING,
          clientId: 'client-1',
          city: {},
        });

        await expect(
          service.selectRunner(
            'order-1',
            { runnerId: 'runner-1' },
            'client-1',
            [Role.CLIENT],
          ),
        ).rejects.toThrow(BadRequestException);
      });

      it('throws UnauthorizedException for non-admin/non-owner', async () => {
        prismaMock.order.findUnique.mockResolvedValue({
          id: 'order-1',
          status: DeliveryStatus.READY_FOR_ASSIGNMENT,
          clientId: 'other-client',
          city: {},
        });

        await expect(
          service.selectRunner(
            'order-1',
            { runnerId: 'runner-1' },
            'client-1',
            [Role.CLIENT],
          ),
        ).rejects.toThrow(UnauthorizedException);
      });

      it('allows ADMIN to assign runner to any order', async () => {
        prismaMock.order.findUnique.mockResolvedValue({
          id: 'order-1',
          status: DeliveryStatus.READY_FOR_ASSIGNMENT,
          clientId: 'other-client',
          city: {},
        });
        prismaMock.runnerProfile.findUnique.mockResolvedValue({
          userId: 'runner-1',
          isActive: true,
          priceBase: 5,
          pricePerKm: 0.5,
          user: { active: true, stripeAccountId: 'acct_123' },
        });

        const txMock = {
          order: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            findUnique: jest.fn().mockResolvedValue({
              id: 'order-1',
              status: DeliveryStatus.ASSIGNED,
            }),
          },
        };
        prismaMock.$transaction.mockImplementation((cb: any) => cb(txMock));

        const result = await service.selectRunner(
          'order-1',
          { runnerId: 'runner-1' },
          'admin-user',
          [Role.ADMIN],
        );

        expect(result).toHaveProperty('id', 'order-1');
      });

      it('throws NotFoundException when runner profile does not exist', async () => {
        prismaMock.order.findUnique.mockResolvedValue({
          id: 'order-1',
          status: DeliveryStatus.READY_FOR_ASSIGNMENT,
          clientId: 'client-1',
          city: {},
        });
        prismaMock.runnerProfile.findUnique.mockResolvedValue(null);

        await expect(
          service.selectRunner(
            'order-1',
            { runnerId: 'missing-runner' },
            'client-1',
            [Role.CLIENT],
          ),
        ).rejects.toThrow(NotFoundException);
      });

      it('throws BadRequestException when runner is not active', async () => {
        prismaMock.order.findUnique.mockResolvedValue({
          id: 'order-1',
          status: DeliveryStatus.READY_FOR_ASSIGNMENT,
          clientId: 'client-1',
          city: {},
        });
        prismaMock.runnerProfile.findUnique.mockResolvedValue({
          userId: 'runner-1',
          isActive: false,
          user: { active: true, stripeAccountId: 'acct_123' },
        });

        await expect(
          service.selectRunner(
            'order-1',
            { runnerId: 'runner-1' },
            'client-1',
            [Role.CLIENT],
          ),
        ).rejects.toThrow(BadRequestException);
      });

      it('throws BadRequestException when runner account is not active', async () => {
        prismaMock.order.findUnique.mockResolvedValue({
          id: 'order-1',
          status: DeliveryStatus.READY_FOR_ASSIGNMENT,
          clientId: 'client-1',
          city: {},
        });
        prismaMock.runnerProfile.findUnique.mockResolvedValue({
          userId: 'runner-1',
          isActive: true,
          user: { active: false, stripeAccountId: 'acct_123' },
        });

        await expect(
          service.selectRunner(
            'order-1',
            { runnerId: 'runner-1' },
            'client-1',
            [Role.CLIENT],
          ),
        ).rejects.toThrow(BadRequestException);
      });

      it('throws BadRequestException when order is no longer available in transaction', async () => {
        prismaMock.order.findUnique.mockResolvedValue({
          id: 'order-1',
          status: DeliveryStatus.READY_FOR_ASSIGNMENT,
          clientId: 'client-1',
          city: {},
        });
        prismaMock.runnerProfile.findUnique.mockResolvedValue({
          userId: 'runner-1',
          isActive: true,
          priceBase: 5,
          pricePerKm: 0.5,
          user: { active: true, stripeAccountId: 'acct_123' },
        });

        const txMock = {
          order: {
            updateMany: jest.fn().mockResolvedValue({ count: 0 }), // race condition
            findUnique: jest.fn(),
          },
        };
        prismaMock.$transaction.mockImplementation((cb: any) => cb(txMock));

        await expect(
          service.selectRunner(
            'order-1',
            { runnerId: 'runner-1' },
            'client-1',
            [Role.CLIENT],
          ),
        ).rejects.toThrow(BadRequestException);
      });
    });
  });
});
