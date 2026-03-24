import { ArgumentsHost, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaClientExceptionFilter } from './prisma-client-exception.filter';

describe('PrismaClientExceptionFilter', () => {
  const makeHost = () => {
    const response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
      }),
    } as unknown as ArgumentsHost;

    return { response, host };
  };

  const makeException = (code: string) =>
    new Prisma.PrismaClientKnownRequestError('prisma error', {
      code,
      clientVersion: 'test',
    });

  it('maps P2002 to conflict', () => {
    const { response, host } = makeHost();
    const filter = new PrismaClientExceptionFilter();

    filter.catch(makeException('P2002'), host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: HttpStatus.CONFLICT,
      message: 'Resource already exists or conflicts with an existing value',
    });
  });

  it('maps P2025 to not found', () => {
    const { response, host } = makeHost();
    const filter = new PrismaClientExceptionFilter();

    filter.catch(makeException('P2025'), host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: HttpStatus.NOT_FOUND,
      message: 'Record not found',
    });
  });

  it('falls back to the base filter for unknown Prisma codes', () => {
    const { host } = makeHost();
    const filter = new PrismaClientExceptionFilter();
    const baseCatchSpy = jest
      .spyOn(
        Object.getPrototypeOf(PrismaClientExceptionFilter.prototype),
        'catch',
      )
      .mockImplementation(() => undefined);

    filter.catch(makeException('P9999'), host);

    expect(baseCatchSpy).toHaveBeenCalled();
  });
});
