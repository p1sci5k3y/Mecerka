import {
  ForbiddenException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import {
  DeliveryIncidentStatusValues,
  DeliveryIncidentTypeValues,
  IncidentReporterRoleValues,
} from './delivery-incident.constants';
import { DeliveryDomainPolicy } from './delivery-domain-policy';
import { DeliveryIncidentService } from './delivery-incident.service';

describe('DeliveryIncidentService', () => {
  let service: DeliveryIncidentService;
  let prismaMock: any;
  let emitRiskEvent: jest.Mock;
  let logger: { log: jest.Mock };

  beforeEach(() => {
    prismaMock = {
      deliveryOrder: {
        findUnique: jest.fn(),
      },
      deliveryIncident: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    emitRiskEvent = jest.fn().mockResolvedValue(undefined);
    logger = { log: jest.fn() };

    service = new DeliveryIncidentService(
      prismaMock,
      new DeliveryDomainPolicy(),
      logger as any,
      emitRiskEvent,
    );
  });

  it('emits the client incident abuse risk event after a valid client report', async () => {
    const tx = {
      deliveryOrder: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'delivery-1',
          order: {
            clientId: 'client-1',
            providerOrders: [],
          },
        }),
      },
      deliveryIncident: {
        count: jest.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(0),
        create: jest.fn().mockResolvedValue({
          id: 'incident-1',
          deliveryOrderId: 'delivery-1',
          reporterRole: IncidentReporterRoleValues.CLIENT,
          type: DeliveryIncidentTypeValues.OTHER,
          status: DeliveryIncidentStatusValues.OPEN,
          description: 'Issue',
          evidenceUrl: null,
          createdAt: new Date('2099-01-01T00:00:00.000Z'),
          resolvedAt: null,
        }),
      },
    };

    prismaMock.$transaction.mockImplementation(async (callback: any) => {
      return callback(tx);
    });

    await service.createIncident(
      {
        deliveryOrderId: 'delivery-1',
        type: DeliveryIncidentTypeValues.OTHER,
        description: 'Issue',
      },
      'client-1',
      [Role.CLIENT],
    );

    expect(emitRiskEvent).toHaveBeenCalledWith(
      'CLIENT',
      'client-1',
      'CLIENT_INCIDENT_ABUSE',
      10,
      'incident:incident-1',
      {
        incidentId: 'incident-1',
        deliveryOrderId: 'delivery-1',
      },
    );
  });

  it('rejects an unauthorized provider reading incident details', async () => {
    prismaMock.deliveryIncident.findUnique.mockResolvedValue({
      id: 'incident-1',
      reporterId: 'client-1',
      deliveryOrder: {
        order: {
          clientId: 'client-1',
          providerOrders: [{ providerId: 'provider-owner' }],
        },
      },
    });

    await expect(
      service.getIncident('incident-1', 'provider-other', [Role.PROVIDER]),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects incident creation when the delivery order does not exist', async () => {
    const tx = {
      deliveryOrder: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback(tx),
    );

    await expect(
      service.createIncident(
        {
          deliveryOrderId: 'delivery-1',
          type: DeliveryIncidentTypeValues.OTHER,
          description: 'Issue',
        },
        'client-1',
        [Role.CLIENT],
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects incident creation when the daily incident limit is exceeded', async () => {
    const tx = {
      deliveryOrder: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'delivery-1',
          order: {
            clientId: 'client-1',
            providerOrders: [],
          },
        }),
      },
      deliveryIncident: {
        count: jest.fn().mockResolvedValueOnce(10),
      },
    };
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback(tx),
    );

    await expect(
      service.createIncident(
        {
          deliveryOrderId: 'delivery-1',
          type: DeliveryIncidentTypeValues.OTHER,
          description: 'Issue',
        },
        'client-1',
        [Role.CLIENT],
      ),
    ).rejects.toThrow(new HttpException('Daily incident limit exceeded', 429));
  });

  it('rejects incident creation when the per-delivery incident limit is exceeded', async () => {
    const tx = {
      deliveryOrder: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'delivery-1',
          order: {
            clientId: 'client-1',
            providerOrders: [],
          },
        }),
      },
      deliveryIncident: {
        count: jest.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(3),
      },
    };
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback(tx),
    );

    await expect(
      service.createIncident(
        {
          deliveryOrderId: 'delivery-1',
          type: DeliveryIncidentTypeValues.OTHER,
          description: 'Issue',
        },
        'client-1',
        [Role.CLIENT],
      ),
    ).rejects.toThrow(
      new HttpException('Incident limit exceeded for this delivery order', 429),
    );
  });

  it('emits provider and runner risk events for non-client reporters and failed deliveries', async () => {
    const tx = {
      deliveryOrder: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'delivery-1',
            runnerId: 'runner-1',
            order: {
              clientId: 'client-1',
              providerOrders: [{ providerId: 'provider-1' }],
            },
          })
          .mockResolvedValueOnce({
            id: 'delivery-1',
            runnerId: 'runner-1',
            order: {
              clientId: 'client-1',
              providerOrders: [{ providerId: 'provider-1' }],
            },
          }),
      },
      deliveryIncident: {
        count: jest
          .fn()
          .mockResolvedValueOnce(0)
          .mockResolvedValueOnce(0)
          .mockResolvedValueOnce(0)
          .mockResolvedValueOnce(0),
        create: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'incident-provider',
            deliveryOrderId: 'delivery-1',
            reporterRole: IncidentReporterRoleValues.PROVIDER,
            type: DeliveryIncidentTypeValues.OTHER,
            status: DeliveryIncidentStatusValues.OPEN,
            description: 'Issue',
            evidenceUrl: null,
            createdAt: new Date('2099-01-01T00:00:00.000Z'),
            resolvedAt: null,
          })
          .mockResolvedValueOnce({
            id: 'incident-runner',
            deliveryOrderId: 'delivery-1',
            reporterRole: IncidentReporterRoleValues.RUNNER,
            type: DeliveryIncidentTypeValues.FAILED_DELIVERY,
            status: DeliveryIncidentStatusValues.OPEN,
            description: 'Issue',
            evidenceUrl: null,
            createdAt: new Date('2099-01-01T00:00:00.000Z'),
            resolvedAt: null,
          }),
      },
    };
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback(tx),
    );

    await service.createIncident(
      {
        deliveryOrderId: 'delivery-1',
        type: DeliveryIncidentTypeValues.OTHER,
        description: 'Issue',
      },
      'provider-1',
      [Role.PROVIDER],
    );

    await service.createIncident(
      {
        deliveryOrderId: 'delivery-1',
        type: DeliveryIncidentTypeValues.FAILED_DELIVERY,
        description: 'Issue',
      },
      'runner-1',
      [Role.RUNNER],
    );

    expect(emitRiskEvent).toHaveBeenNthCalledWith(
      1,
      'PROVIDER',
      'provider-1',
      'EXCESSIVE_INCIDENTS',
      8,
      'incident:incident-provider',
      {
        incidentId: 'incident-provider',
        deliveryOrderId: 'delivery-1',
      },
    );
    expect(emitRiskEvent).toHaveBeenNthCalledWith(
      2,
      'RUNNER',
      'runner-1',
      'EXCESSIVE_INCIDENTS',
      8,
      'incident:incident-runner',
      {
        incidentId: 'incident-runner',
        deliveryOrderId: 'delivery-1',
      },
    );
    expect(emitRiskEvent).toHaveBeenNthCalledWith(
      3,
      'RUNNER',
      'runner-1',
      'DELIVERY_FAILURE_PATTERN',
      15,
      'delivery-failure:incident-runner',
      {
        incidentId: 'incident-runner',
        deliveryOrderId: 'delivery-1',
      },
    );
  });

  it('lists sanitized incidents for an authorized reporter', async () => {
    prismaMock.deliveryOrder.findUnique.mockResolvedValue({
      id: 'delivery-1',
      order: {
        clientId: 'client-1',
        providerOrders: [],
      },
    });
    prismaMock.deliveryIncident.findMany.mockResolvedValue([
      {
        id: 'incident-2',
        deliveryOrderId: 'delivery-1',
        reporterRole: IncidentReporterRoleValues.CLIENT,
        type: DeliveryIncidentTypeValues.OTHER,
        status: DeliveryIncidentStatusValues.OPEN,
        description: 'Issue',
        evidenceUrl: null,
        createdAt: new Date('2099-01-01T00:00:00.000Z'),
        resolvedAt: null,
        internalNote: 'hidden',
      },
    ]);

    const result = await service.listDeliveryIncidents(
      'delivery-1',
      'client-1',
      [Role.CLIENT],
    );

    expect(result).toEqual([
      {
        id: 'incident-2',
        deliveryOrderId: 'delivery-1',
        reporterRole: IncidentReporterRoleValues.CLIENT,
        type: DeliveryIncidentTypeValues.OTHER,
        status: DeliveryIncidentStatusValues.OPEN,
        description: 'Issue',
        evidenceUrl: null,
        createdAt: new Date('2099-01-01T00:00:00.000Z'),
        resolvedAt: null,
      },
    ]);
  });

  it('fails with not found when the incident does not exist', async () => {
    prismaMock.deliveryIncident.findUnique.mockResolvedValue(null);

    await expect(
      service.getIncident('missing', 'client-1', [Role.CLIENT]),
    ).rejects.toThrow(NotFoundException);
  });

  it('fails when listing incidents for an unknown delivery order', async () => {
    prismaMock.deliveryOrder.findUnique.mockResolvedValue(null);

    await expect(
      service.listDeliveryIncidents('missing', 'client-1', [Role.CLIENT]),
    ).rejects.toThrow(NotFoundException);
  });

  it('transitions incidents through review, resolve, reject, and no-op same-status updates', async () => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      deliveryIncident: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'incident-1',
            deliveryOrderId: 'delivery-1',
            status: DeliveryIncidentStatusValues.OPEN,
            resolvedAt: null,
          })
          .mockResolvedValueOnce({
            id: 'incident-2',
            deliveryOrderId: 'delivery-1',
            status: DeliveryIncidentStatusValues.UNDER_REVIEW,
            resolvedAt: null,
          })
          .mockResolvedValueOnce({
            id: 'incident-3',
            deliveryOrderId: 'delivery-1',
            status: DeliveryIncidentStatusValues.UNDER_REVIEW,
            resolvedAt: null,
          })
          .mockResolvedValueOnce({
            id: 'incident-4',
            deliveryOrderId: 'delivery-1',
            status: DeliveryIncidentStatusValues.REJECTED,
            resolvedAt: null,
          })
          .mockResolvedValueOnce(null),
        update: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'incident-1',
            deliveryOrderId: 'delivery-1',
            status: DeliveryIncidentStatusValues.UNDER_REVIEW,
            resolvedAt: null,
          })
          .mockResolvedValueOnce({
            id: 'incident-2',
            deliveryOrderId: 'delivery-1',
            status: DeliveryIncidentStatusValues.RESOLVED,
            resolvedAt: new Date(),
          })
          .mockResolvedValueOnce({
            id: 'incident-3',
            deliveryOrderId: 'delivery-1',
            status: DeliveryIncidentStatusValues.REJECTED,
            resolvedAt: null,
          }),
      },
    };
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback(tx),
    );

    await expect(
      service.reviewIncident('incident-1', 'admin-1'),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'incident-1',
        status: DeliveryIncidentStatusValues.UNDER_REVIEW,
      }),
    );
    await expect(
      service.resolveIncident('incident-2', 'admin-1'),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'incident-2',
        status: DeliveryIncidentStatusValues.RESOLVED,
      }),
    );
    await expect(
      service.rejectIncident('incident-3', 'admin-1'),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'incident-3',
        status: DeliveryIncidentStatusValues.REJECTED,
      }),
    );
    await expect(
      service.rejectIncident('incident-4', 'admin-1'),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'incident-4',
        status: DeliveryIncidentStatusValues.REJECTED,
      }),
    );
    await expect(
      service.reviewIncident('missing-incident', 'admin-1'),
    ).rejects.toThrow(NotFoundException);

    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('incident.review_started'),
    );
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('incident.resolved'),
    );
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('incident.rejected'),
    );
  });
});
