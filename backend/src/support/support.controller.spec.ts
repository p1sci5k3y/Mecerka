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
        .mockResolvedValue({ clientSecret: 'secret' }),
      getDonation: jest.fn().mockResolvedValue({ id: 'donation-1' }),
    };
    controller = new SupportController(supportServiceMock as never);
  });

  it('delegates donation creation with authenticated user id', async () => {
    const req = { user: { userId: 'client-1' } };
    const dto = { amount: 15, currency: 'EUR' };

    const result = await controller.createDonation(dto as never, req as never);

    expect(supportServiceMock.createDonation).toHaveBeenCalledWith(
      15,
      'EUR',
      'client-1',
    );
    expect(result).toEqual({ id: 'donation-1' });
  });

  it('delegates donation payment preparation', async () => {
    const req = { user: { userId: 'client-1' } };

    const result = await controller.prepareDonationPayment(
      '4f99868d-6954-4980-8ad1-1cb42fd64080',
      req as never,
    );

    expect(supportServiceMock.prepareDonationPayment).toHaveBeenCalledWith(
      '4f99868d-6954-4980-8ad1-1cb42fd64080',
      'client-1',
    );
    expect(result).toEqual({ clientSecret: 'secret' });
  });

  it('delegates donation reads', async () => {
    const req = { user: { userId: 'client-1' } };

    const result = await controller.getDonation(
      '4f99868d-6954-4980-8ad1-1cb42fd64080',
      req as never,
    );

    expect(supportServiceMock.getDonation).toHaveBeenCalledWith(
      '4f99868d-6954-4980-8ad1-1cb42fd64080',
      'client-1',
    );
    expect(result).toEqual({ id: 'donation-1' });
  });
});
