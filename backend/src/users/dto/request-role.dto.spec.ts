import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RequestRoleDto, RequestableRole } from './request-role.dto';

describe('RequestRoleDto', () => {
  it('normalizes and validates a correct Spanish fiscal request', async () => {
    const dto = plainToInstance(RequestRoleDto, {
      role: RequestableRole.PROVIDER,
      country: ' es ',
      fiscalId: ' 12345678z ',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.country).toBe('ES');
    expect(dto.fiscalId).toBe('12345678z');
  });

  it('rejects non-string country values after transform', async () => {
    const dto = plainToInstance(RequestRoleDto, {
      role: RequestableRole.RUNNER,
      country: 34,
      fiscalId: '12345678Z',
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'country')).toBe(true);
  });

  it('rejects invalid fiscal ids for ES requests', async () => {
    const dto = plainToInstance(RequestRoleDto, {
      role: RequestableRole.PROVIDER,
      country: 'ES',
      fiscalId: 'INVALID',
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'fiscalId')).toBe(true);
  });
});
