import { Logger } from '@nestjs/common';
import { BaseSeedService } from './base-seed.service';

describe('BaseSeedService', () => {
  let prismaMock: {
    city: { upsert: jest.Mock };
    category: { upsert: jest.Mock };
  };

  beforeEach(() => {
    prismaMock = {
      city: {
        upsert: jest.fn().mockResolvedValue(undefined),
      },
      category: {
        upsert: jest.fn().mockResolvedValue(undefined),
      },
    };
  });

  it('seeds structural cities and categories during application bootstrap', async () => {
    const service = new BaseSeedService(prismaMock as never);
    const loggerSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);

    await service.onApplicationBootstrap();

    expect(prismaMock.city.upsert).toHaveBeenCalledTimes(5);
    expect(prismaMock.category.upsert).toHaveBeenCalledTimes(11);
    expect(loggerSpy).toHaveBeenCalledWith('seed.base cities=5 categories=11');
  });

  it('reuses the in-flight seed promise for concurrent callers', async () => {
    let release!: () => void;
    const blocker = new Promise<void>((resolve) => {
      release = resolve;
    });
    prismaMock.city.upsert.mockImplementation(async () => blocker);
    const service = new BaseSeedService(prismaMock as never);

    const first = service.ensureBaseData();
    const second = service.ensureBaseData();

    expect(prismaMock.city.upsert).toHaveBeenCalledTimes(1);
    expect(prismaMock.category.upsert).not.toHaveBeenCalled();

    release();
    await Promise.all([first, second]);
    expect(prismaMock.city.upsert).toHaveBeenCalledTimes(5);
    expect(prismaMock.category.upsert).toHaveBeenCalledTimes(11);
  });

  it('resets the cached promise when seeding fails so later retries can succeed', async () => {
    const service = new BaseSeedService(prismaMock as never);
    const loggerSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);

    prismaMock.city.upsert.mockRejectedValueOnce(new Error('db unavailable'));

    await expect(service.ensureBaseData()).rejects.toThrow('db unavailable');

    prismaMock.city.upsert.mockResolvedValue(undefined);

    await expect(service.ensureBaseData()).resolves.toBeUndefined();
    expect(prismaMock.city.upsert).toHaveBeenCalledTimes(6);
    expect(prismaMock.category.upsert).toHaveBeenCalledTimes(11);
    expect(loggerSpy).toHaveBeenCalledWith('seed.base cities=5 categories=11');
  });
});
