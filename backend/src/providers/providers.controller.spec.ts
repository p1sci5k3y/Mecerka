import { ProvidersController } from './providers.controller';

describe('ProvidersController', () => {
  let controller: ProvidersController;
  let providersServiceMock: {
    getPublicProfile: jest.Mock;
    getOwnProfile: jest.Mock;
    upsertOwnProfile: jest.Mock;
    publishOwnProfile: jest.Mock;
  };

  beforeEach(() => {
    providersServiceMock = {
      getPublicProfile: jest.fn().mockResolvedValue({ slug: 'demo' }),
      getOwnProfile: jest.fn().mockResolvedValue({ id: 'provider-1' }),
      upsertOwnProfile: jest.fn().mockResolvedValue({ ok: true }),
      publishOwnProfile: jest.fn().mockResolvedValue({ isPublished: true }),
    };
    controller = new ProvidersController(providersServiceMock as never);
  });

  it('delegates public profile lookup by slug', async () => {
    const result = await controller.getPublicProfile('demo-slug');

    expect(providersServiceMock.getPublicProfile).toHaveBeenCalledWith(
      'demo-slug',
    );
    expect(result).toEqual({ slug: 'demo' });
  });

  it('delegates own profile lookup with authenticated provider id', async () => {
    const req = { user: { userId: 'provider-1' } };

    const result = await controller.getOwnProfile(req as never);

    expect(providersServiceMock.getOwnProfile).toHaveBeenCalledWith(
      'provider-1',
    );
    expect(result).toEqual({ id: 'provider-1' });
  });

  it('delegates provider profile upsert with dto payload', async () => {
    const req = { user: { userId: 'provider-1' } };
    const dto = { displayName: 'Demo Workshop' };

    const result = await controller.upsertOwnProfile(
      req as never,
      dto as never,
    );

    expect(providersServiceMock.upsertOwnProfile).toHaveBeenCalledWith(
      'provider-1',
      dto,
    );
    expect(result).toEqual({ ok: true });
  });

  it('delegates publish toggle with authenticated provider id', async () => {
    const req = { user: { userId: 'provider-1' } };

    const result = await controller.publishOwnProfile(req as never, false);

    expect(providersServiceMock.publishOwnProfile).toHaveBeenCalledWith(
      'provider-1',
      false,
    );
    expect(result).toEqual({ isPublished: true });
  });
});
