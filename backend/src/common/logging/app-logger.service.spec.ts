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

  it('redacts common secrets in structured logs and traces', () => {
    const stderrSpy = jest.spyOn(process.stderr, 'write').mockReturnValue(true);

    service.error(
      JSON.stringify({
        event: 'auth.failure',
        authorization: 'Bearer abc123',
        password: 'super-secret',
        nested: {
          token: 'jwt-token',
          apiKey: 'key-123',
        },
      }),
      'Authorization=Bearer abc123 password=super-secret token=jwt-token',
    );

    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('"authorization":"[redacted]"'),
    );
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('"password":"[redacted]"'),
    );
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        '"nested":{"token":"[redacted]","apiKey":"[redacted]"}',
      ),
    );
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('"trace":"Authorization=[redacted]'),
    );
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('password=[redacted]'),
    );
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('token=[redacted]"'),
    );
  });
});
