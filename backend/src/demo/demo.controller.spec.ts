import { DemoController } from './demo.controller';

describe('DemoController', () => {
  let controller: DemoController;
  let demoServiceMock: {
    seed: jest.Mock;
    reset: jest.Mock;
    confirmDemoProviderOrderPayment: jest.Mock;
    confirmDemoRunnerPayment: jest.Mock;
  };

  beforeEach(() => {
    demoServiceMock = {
      seed: jest.fn().mockResolvedValue({ ok: true, mode: 'seed' }),
      reset: jest.fn().mockResolvedValue({ ok: true, mode: 'reset' }),
      confirmDemoProviderOrderPayment: jest
        .fn()
        .mockResolvedValue({ ok: true, mode: 'provider-payment' }),
      confirmDemoRunnerPayment: jest
        .fn()
        .mockResolvedValue({ ok: true, mode: 'runner-payment' }),
    };
    controller = new DemoController(demoServiceMock as never);
  });

  it('delegates seed to the demo service with the authenticated admin id', async () => {
    const req = { user: { userId: 'admin-1' } };

    const result = await controller.seed(req as never);

    expect(demoServiceMock.seed).toHaveBeenCalledWith('admin-1');
    expect(result).toEqual({ ok: true, mode: 'seed' });
  });

  it('delegates reset to the demo service with the authenticated admin id', async () => {
    const req = { user: { userId: 'admin-1' } };

    const result = await controller.reset(req as never);

    expect(demoServiceMock.reset).toHaveBeenCalledWith('admin-1');
    expect(result).toEqual({ ok: true, mode: 'reset' });
  });

  it('delegates provider payment confirmation to the demo service with user context', async () => {
    const req = { user: { userId: 'client-1', roles: ['CLIENT'] } };

    const result = await controller.confirmProviderOrderPayment(
      'provider-order-1',
      req as never,
    );

    expect(
      demoServiceMock.confirmDemoProviderOrderPayment,
    ).toHaveBeenCalledWith('provider-order-1', 'client-1', ['CLIENT']);
    expect(result).toEqual({ ok: true, mode: 'provider-payment' });
  });

  it('delegates runner payment confirmation to the demo service with user context', async () => {
    const req = { user: { userId: 'client-1', roles: ['CLIENT'] } };

    const result = await controller.confirmRunnerPayment(
      'delivery-order-1',
      req as never,
    );

    expect(demoServiceMock.confirmDemoRunnerPayment).toHaveBeenCalledWith(
      'delivery-order-1',
      'client-1',
      ['CLIENT'],
    );
    expect(result).toEqual({ ok: true, mode: 'runner-payment' });
  });
});
