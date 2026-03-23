import { DeliveryOrderStatus, Role } from '@prisma/client';
import {
  DeliveryIncidentStatusValues,
  IncidentReporterRoleValues,
} from './delivery-incident.constants';
import { DeliveryDomainPolicy } from './delivery-domain-policy';

describe('DeliveryDomainPolicy', () => {
  const policy = new DeliveryDomainPolicy();

  it('builds customer-safe tracking coordinates with rounded precision', () => {
    const tracking = policy.buildTrackingResponse(
      {
        id: 'delivery-1',
        status: DeliveryOrderStatus.IN_TRANSIT,
        pickupAt: null,
        transitAt: null,
        deliveredAt: null,
        lastLocationUpdateAt: null,
        lastRunnerLocationLat: 40.416775,
        lastRunnerLocationLng: -3.70379,
        runnerId: 'runner-1',
        order: { clientId: 'client-1' },
      },
      'client-1',
      [Role.CLIENT],
    );

    expect(tracking.currentLocation).toEqual({
      latitude: 40.417,
      longitude: -3.704,
    });
  });

  it('rejects invalid incident transitions', () => {
    expect(() =>
      policy.validateIncidentTransition(
        DeliveryIncidentStatusValues.OPEN,
        DeliveryIncidentStatusValues.RESOLVED,
      ),
    ).toThrow('Invalid incident transition');
  });

  it('resolves provider incident ownership inside a delivery order', async () => {
    await expect(
      policy.resolveIncidentReporterRole(
        {
          order: {
            clientId: 'client-1',
            providerOrders: [{ providerId: 'provider-1' }],
          },
          runnerId: 'runner-1',
        },
        'provider-1',
        [Role.PROVIDER],
      ),
    ).resolves.toBe(IncidentReporterRoleValues.PROVIDER);
  });
});
