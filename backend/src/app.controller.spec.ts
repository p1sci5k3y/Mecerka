import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;
  let appService: {
    getHello: jest.Mock;
    getHealth: jest.Mock;
    getMetrics: jest.Mock;
  };

  beforeEach(async () => {
    appService = {
      getHello: jest.fn().mockReturnValue('Hello World!'),
      getHealth: jest.fn().mockResolvedValue({
        status: 'ok',
        uptime: 1,
        timestamp: '2026-03-16T00:00:00.000Z',
        services: {
          database: 'ok',
          api: 'ok',
        },
      }),
      getMetrics: jest.fn().mockResolvedValue({
        users: 4,
        providers: 2,
        orders: {
          total: 3,
          pending: 1,
          delivering: 1,
          delivered: 1,
        },
        deliveriesActive: 1,
        products: 6,
      }),
    };

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [{ provide: AppService, useValue: appService }],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });

  describe('health', () => {
    it('should return the health payload', async () => {
      await expect(appController.getHealth()).resolves.toEqual({
        status: 'ok',
        uptime: 1,
        timestamp: '2026-03-16T00:00:00.000Z',
        services: {
          database: 'ok',
          api: 'ok',
        },
      });
    });
  });

  describe('metrics', () => {
    it('should return the public metrics payload', async () => {
      await expect(appController.getMetrics()).resolves.toEqual({
        users: 4,
        providers: 2,
        orders: {
          total: 3,
          pending: 1,
          delivering: 1,
          delivered: 1,
        },
        deliveriesActive: 1,
        products: 6,
      });
    });
  });
});
