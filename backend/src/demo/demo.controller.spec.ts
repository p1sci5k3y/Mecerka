import { DemoController } from './demo.controller';

describe('DemoController', () => {
  let controller: DemoController;
  let demoServiceMock: {
    seed: jest.Mock;
    reset: jest.Mock;
  };

  beforeEach(() => {
    demoServiceMock = {
      seed: jest.fn().mockResolvedValue({ ok: true, mode: 'seed' }),
      reset: jest.fn().mockResolvedValue({ ok: true, mode: 'reset' }),
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
});
