import { SupportController } from './support.controller';

describe('SupportController', () => {
  let controller: SupportController;
  let supportServiceMock: {
    createDonation: jest.Mock;
    prepareDonationPayment: jest.Mock;
    getDonation: jest.Mock;
  };

  beforeEach(() => {
    supportServiceMock = {
      createDonation: jest.fn().mockResolvedValue({ id: 'donation-1' }),
      prepareDonationPayment: jest
        .fn()
        .mockResolvedValue({ url: 'https://pay.test' }),
      getDonation: jest
        .fn()
        .mockResolvedValue({ id: 'donation-1', amount: 10 }),
    };
    controller = new SupportController(supportServiceMock as never);
  });

  it('delegates donation creation with the authenticated client id', async () => {
    const req = { user: { userId: 'client-1' } };
    const dto = { amount: 10, currency: 'EUR' };

    const result = await controller.createDonation(dto as never, req as never);

    expect(supportServiceMock.createDonation).toHaveBeenCalledWith(
      10,
      'EUR',
      'client-1',
    );
    expect(result).toEqual({ id: 'donation-1' });
  });

  it('delegates payment preparation and donation lookup with request context', async () => {
    const req = { user: { userId: 'client-1' } };

    await controller.prepareDonationPayment(
      '9c1fc56f-d632-4cb0-b01e-e907c3e54eb4',
      req as never,
    );
    await controller.getDonation(
      '9c1fc56f-d632-4cb0-b01e-e907c3e54eb4',
      req as never,
    );

    expect(supportServiceMock.prepareDonationPayment).toHaveBeenCalledWith(
      '9c1fc56f-d632-4cb0-b01e-e907c3e54eb4',
      'client-1',
    );
    expect(supportServiceMock.getDonation).toHaveBeenCalledWith(
      '9c1fc56f-d632-4cb0-b01e-e907c3e54eb4',
      'client-1',
    );
  });
});
