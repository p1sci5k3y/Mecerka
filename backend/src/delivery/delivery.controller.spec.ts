import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '@prisma/client';
import { DeliveryController } from './delivery.controller';
import { DeliveryService } from './delivery.service';

describe('DeliveryController', () => {
  let controller: DeliveryController;
  let deliveryServiceMock: any;

  const clientUser = {
    userId: 'client-1',
    roles: [Role.CLIENT],
    mfaEnabled: false,
    mfaAuthenticated: true,
  };
  const runnerUser = {
    userId: 'runner-1',
    roles: [Role.RUNNER],
    mfaEnabled: false,
    mfaAuthenticated: true,
  };
  const adminUser = {
    userId: 'admin-1',
    roles: [Role.ADMIN],
    mfaEnabled: false,
    mfaAuthenticated: true,
  };

  beforeEach(async () => {
    deliveryServiceMock = {
      createDeliveryOrder: jest.fn().mockResolvedValue({ id: 'order-1' }),
      assignRunner: jest.fn().mockResolvedValue({ id: 'order-1' }),
      prepareRunnerPayment: jest
        .fn()
        .mockResolvedValue({ clientSecret: 'cs_test' }),
      getDeliveryOrder: jest.fn().mockResolvedValue({ id: 'order-1' }),
      listAvailableJobs: jest.fn().mockResolvedValue([]),
      acceptDeliveryJob: jest.fn().mockResolvedValue({ id: 'job-1' }),
      expireDeliveryJobs: jest.fn().mockResolvedValue({ count: 0 }),
      markPickupPending: jest.fn().mockResolvedValue({ id: 'order-1' }),
      confirmPickup: jest.fn().mockResolvedValue({ id: 'order-1' }),
      startTransit: jest.fn().mockResolvedValue({ id: 'order-1' }),
      confirmDelivery: jest.fn().mockResolvedValue({ id: 'order-1' }),
      updateRunnerLocation: jest.fn().mockResolvedValue({}),
      getDeliveryTracking: jest.fn().mockResolvedValue({}),
      getDeliveryLocationHistory: jest.fn().mockResolvedValue([]),
      createIncident: jest.fn().mockResolvedValue({ id: 'incident-1' }),
      listMyIncidents: jest.fn().mockResolvedValue([]),
      getIncident: jest.fn().mockResolvedValue({ id: 'incident-1' }),
      listDeliveryIncidents: jest.fn().mockResolvedValue([]),
      reviewIncident: jest.fn().mockResolvedValue({ id: 'incident-1' }),
      resolveIncident: jest.fn().mockResolvedValue({ id: 'incident-1' }),
      rejectIncident: jest.fn().mockResolvedValue({ id: 'incident-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DeliveryController],
      providers: [{ provide: DeliveryService, useValue: deliveryServiceMock }],
    }).compile();

    controller = module.get<DeliveryController>(DeliveryController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('createDeliveryOrder', () => {
    it('delegates to deliveryService with userId and roles', async () => {
      const dto = { orderId: 'order-1' } as any;
      const result = await controller.createDeliveryOrder(dto, {
        user: clientUser,
      });
      expect(deliveryServiceMock.createDeliveryOrder).toHaveBeenCalledWith(
        dto,
        'client-1',
        [Role.CLIENT],
      );
      expect(result).toEqual({ id: 'order-1' });
    });
  });

  describe('assignRunner', () => {
    it('delegates to deliveryService', async () => {
      const dto = { runnerId: 'runner-1' } as any;
      await controller.assignRunner('order-1', dto, { user: clientUser });
      expect(deliveryServiceMock.assignRunner).toHaveBeenCalledWith(
        'order-1',
        dto,
        'client-1',
        [Role.CLIENT],
      );
    });
  });

  describe('prepareRunnerPayment', () => {
    it('delegates to deliveryService with userId and roles', async () => {
      await controller.prepareRunnerPayment('order-1', { user: clientUser });
      expect(deliveryServiceMock.prepareRunnerPayment).toHaveBeenCalledWith(
        'order-1',
        'client-1',
        [Role.CLIENT],
      );
    });
  });

  describe('getDeliveryOrder', () => {
    it('delegates to deliveryService', async () => {
      await controller.getDeliveryOrder('order-1', { user: clientUser });
      expect(deliveryServiceMock.getDeliveryOrder).toHaveBeenCalledWith(
        'order-1',
        'client-1',
        [Role.CLIENT],
      );
    });
  });

  describe('listAvailableJobs', () => {
    it('passes runnerId when user has RUNNER role', async () => {
      await controller.listAvailableJobs({ user: runnerUser });
      expect(deliveryServiceMock.listAvailableJobs).toHaveBeenCalledWith(
        'runner-1',
      );
    });

    it('passes undefined runnerId when user does not have RUNNER role (admin)', async () => {
      await controller.listAvailableJobs({ user: adminUser });
      expect(deliveryServiceMock.listAvailableJobs).toHaveBeenCalledWith(
        undefined,
      );
    });
  });

  describe('acceptDeliveryJob', () => {
    it('delegates with jobId and userId', async () => {
      await controller.acceptDeliveryJob('job-1', { user: runnerUser });
      expect(deliveryServiceMock.acceptDeliveryJob).toHaveBeenCalledWith(
        'job-1',
        'runner-1',
      );
    });
  });

  describe('expireDeliveryJobs', () => {
    it('delegates to deliveryService', async () => {
      await controller.expireDeliveryJobs();
      expect(deliveryServiceMock.expireDeliveryJobs).toHaveBeenCalled();
    });
  });

  describe('lifecycle transitions', () => {
    it('markPickupPending delegates correctly', async () => {
      await controller.markPickupPending('order-1', { user: runnerUser });
      expect(deliveryServiceMock.markPickupPending).toHaveBeenCalledWith(
        'order-1',
        'runner-1',
        [Role.RUNNER],
      );
    });

    it('confirmPickup delegates correctly', async () => {
      await controller.confirmPickup('order-1', { user: runnerUser });
      expect(deliveryServiceMock.confirmPickup).toHaveBeenCalledWith(
        'order-1',
        'runner-1',
        [Role.RUNNER],
      );
    });

    it('startTransit delegates correctly', async () => {
      await controller.startTransit('order-1', { user: runnerUser });
      expect(deliveryServiceMock.startTransit).toHaveBeenCalledWith(
        'order-1',
        'runner-1',
        [Role.RUNNER],
      );
    });

    it('confirmDelivery delegates correctly', async () => {
      const dto = { signature: 'signed' } as any;
      await controller.confirmDelivery('order-1', dto, { user: runnerUser });
      expect(deliveryServiceMock.confirmDelivery).toHaveBeenCalledWith(
        'order-1',
        'runner-1',
        [Role.RUNNER],
        dto,
      );
    });
  });

  describe('location and tracking', () => {
    it('updateRunnerLocation delegates correctly', async () => {
      const dto = { latitude: 40.4, longitude: -3.7 } as any;
      await controller.updateRunnerLocation('order-1', dto, {
        user: runnerUser,
      });
      expect(deliveryServiceMock.updateRunnerLocation).toHaveBeenCalledWith(
        'order-1',
        'runner-1',
        [Role.RUNNER],
        dto,
      );
    });

    it('getDeliveryTracking delegates correctly', async () => {
      await controller.getDeliveryTracking('order-1', { user: clientUser });
      expect(deliveryServiceMock.getDeliveryTracking).toHaveBeenCalledWith(
        'order-1',
        'client-1',
        [Role.CLIENT],
      );
    });

    it('getDeliveryLocationHistory delegates correctly', async () => {
      await controller.getDeliveryLocationHistory('order-1');
      expect(
        deliveryServiceMock.getDeliveryLocationHistory,
      ).toHaveBeenCalledWith('order-1');
    });
  });

  describe('incidents', () => {
    it('createIncident delegates correctly', async () => {
      const dto = { type: 'DAMAGE', description: 'broken' } as any;
      await controller.createIncident(dto, { user: clientUser });
      expect(deliveryServiceMock.createIncident).toHaveBeenCalledWith(
        dto,
        'client-1',
        [Role.CLIENT],
      );
    });

    it('getIncident delegates correctly', async () => {
      await controller.getIncident('incident-1', { user: clientUser });
      expect(deliveryServiceMock.getIncident).toHaveBeenCalledWith(
        'incident-1',
        'client-1',
        [Role.CLIENT],
      );
    });

    it('listMyIncidents delegates correctly', async () => {
      await controller.listMyIncidents({ user: clientUser });
      expect(deliveryServiceMock.listMyIncidents).toHaveBeenCalledWith(
        'client-1',
      );
    });

    it('listDeliveryIncidents delegates correctly', async () => {
      await controller.listDeliveryIncidents('order-1', { user: clientUser });
      expect(deliveryServiceMock.listDeliveryIncidents).toHaveBeenCalledWith(
        'order-1',
        'client-1',
        [Role.CLIENT],
      );
    });

    it('reviewIncident delegates correctly', async () => {
      await controller.reviewIncident('incident-1', { user: adminUser });
      expect(deliveryServiceMock.reviewIncident).toHaveBeenCalledWith(
        'incident-1',
        'admin-1',
      );
    });

    it('resolveIncident delegates correctly', async () => {
      await controller.resolveIncident('incident-1', { user: adminUser });
      expect(deliveryServiceMock.resolveIncident).toHaveBeenCalledWith(
        'incident-1',
        'admin-1',
      );
    });

    it('rejectIncident delegates correctly', async () => {
      await controller.rejectIncident('incident-1', { user: adminUser });
      expect(deliveryServiceMock.rejectIncident).toHaveBeenCalledWith(
        'incident-1',
        'admin-1',
      );
    });
  });
});
