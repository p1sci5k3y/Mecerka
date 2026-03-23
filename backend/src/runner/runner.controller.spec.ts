import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MfaCompleteGuard } from '../auth/guards/mfa-complete.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RunnerController } from './runner.controller';
import { RunnerService } from './runner.service';

describe('RunnerController', () => {
  let controller: RunnerController;
  let runnerServiceMock: jest.Mocked<Partial<RunnerService>>;

  beforeEach(async () => {
    runnerServiceMock = {
      previewDelivery: jest.fn(),
      selectRunner: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RunnerController],
      providers: [{ provide: RunnerService, useValue: runnerServiceMock }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(MfaCompleteGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<RunnerController>(RunnerController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('previewDelivery', () => {
    it('delegates to runnerService.previewDelivery and returns result', async () => {
      const dto = { cityId: 'city-1', deliveryAddress: 'Calle Mayor 1' } as any;
      const preview = { fee: 3.5, estimatedDuration: 20 };
      (runnerServiceMock.previewDelivery as jest.Mock).mockResolvedValue(
        preview,
      );

      const result = await controller.previewDelivery(dto);

      expect(runnerServiceMock.previewDelivery).toHaveBeenCalledWith(dto);
      expect(result).toEqual(preview);
    });
  });

  describe('selectRunner', () => {
    it('delegates to runnerService.selectRunner with userId and roles from request', async () => {
      const dto = { runnerId: 'runner-1' } as any;
      const selected = { id: 'runner-1', name: 'Runner' };
      (runnerServiceMock.selectRunner as jest.Mock).mockResolvedValue(selected);
      const req = {
        user: { userId: 'client-1', roles: [Role.CLIENT] },
      };

      const result = await controller.selectRunner(
        'order-uuid-1',
        dto,
        req as any,
      );

      expect(runnerServiceMock.selectRunner).toHaveBeenCalledWith(
        'order-uuid-1',
        dto,
        'client-1',
        [Role.CLIENT],
      );
      expect(result).toEqual(selected);
    });
  });
});
