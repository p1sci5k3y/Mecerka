import { ForbiddenException, NotFoundException } from '@nestjs/common';
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
});
