import { BadRequestException } from '@nestjs/common';
import { RiskActorType } from '@prisma/client';
import { RiskController } from './risk.controller';

describe('RiskController', () => {
  let controller: RiskController;
  let riskServiceMock: {
    getActorRiskScore: jest.Mock;
    listActorRiskEvents: jest.Mock;
    listHighRiskActors: jest.Mock;
  };

  beforeEach(() => {
    riskServiceMock = {
      getActorRiskScore: jest.fn().mockResolvedValue({
        snapshot: {
          score: 91,
          level: 'HIGH',
          updatedAt: new Date('2026-03-24T00:00:00.000Z'),
        },
        breakdown: [{ category: 'PAYMENT', score: 91 }],
      }),
      listActorRiskEvents: jest
        .fn()
        .mockResolvedValue([{ id: 'risk-event-1' }]),
      listHighRiskActors: jest.fn().mockResolvedValue([
        {
          actorType: RiskActorType.CLIENT,
          actorId: '4f99868d-6954-4980-8ad1-1cb42fd64080',
        },
      ]),
    };
    controller = new RiskController(riskServiceMock as never);
  });

  it('builds actor risk responses for valid actor types', async () => {
    const result = await controller.getActorRisk(
      RiskActorType.CLIENT,
      '4f99868d-6954-4980-8ad1-1cb42fd64080',
    );

    expect(riskServiceMock.getActorRiskScore).toHaveBeenCalledWith(
      RiskActorType.CLIENT,
      '4f99868d-6954-4980-8ad1-1cb42fd64080',
    );
    expect(riskServiceMock.listActorRiskEvents).toHaveBeenCalledWith(
      RiskActorType.CLIENT,
      '4f99868d-6954-4980-8ad1-1cb42fd64080',
      { limit: 10 },
    );
    expect(result.score).toBe(91);
    expect(result.level).toBe('HIGH');
  });

  it('rejects invalid actor types', async () => {
    await expect(
      controller.getActorRisk(
        'NOT_A_REAL_ACTOR',
        '4f99868d-6954-4980-8ad1-1cb42fd64080',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('falls back to LOW/0/null when the risk snapshot is absent', async () => {
    riskServiceMock.getActorRiskScore.mockResolvedValueOnce({
      snapshot: null,
      breakdown: [],
    });

    const result = await controller.getActorRisk(
      RiskActorType.CLIENT,
      '4f99868d-6954-4980-8ad1-1cb42fd64080',
    );

    expect(result).toEqual({
      actorId: '4f99868d-6954-4980-8ad1-1cb42fd64080',
      actorType: RiskActorType.CLIENT,
      score: 0,
      level: 'LOW',
      updatedAt: null,
      recentEvents: [{ id: 'risk-event-1' }],
      breakdown: [],
    });
  });

  it('builds responses for every listed high-risk actor', async () => {
    const result = await controller.listHighRiskActors();

    expect(riskServiceMock.listHighRiskActors).toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0]?.actorType).toBe(RiskActorType.CLIENT);
  });
});
