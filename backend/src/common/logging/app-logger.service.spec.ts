import { AppLoggerService } from './app-logger.service';

describe('AppLoggerService', () => {
  let service: AppLoggerService;
  let stdoutSpy: jest.SpyInstance;

  beforeEach(() => {
    service = new AppLoggerService();
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockReturnValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('redacts fiscal fields in structured logs', () => {
    service.log(
      JSON.stringify({
        event: 'role.request',
        fiscalId: '12345678Z',
        fiscalCountry: 'ES',
        fiscalIdHash: 'abc123',
        fiscalIdLast4: '678Z',
        nested: {
          fiscalIdHash: 'nested-hash',
          fiscalIdLast4: '1234',
        },
      }),
    );

    expect(stdoutSpy).toHaveBeenCalledWith(
      expect.stringContaining('"fiscalId":"[redacted]"'),
    );
    expect(stdoutSpy).toHaveBeenCalledWith(
      expect.stringContaining('"fiscalCountry":"[redacted]"'),
    );
    expect(stdoutSpy).toHaveBeenCalledWith(
      expect.stringContaining('"fiscalIdHash":"[redacted]"'),
    );
    expect(stdoutSpy).toHaveBeenCalledWith(
      expect.stringContaining('"fiscalIdLast4":"[redacted]"'),
    );
    expect(stdoutSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        '"nested":{"fiscalIdHash":"[redacted]","fiscalIdLast4":"[redacted]"}',
      ),
    );
  });
});
