import {
  ConsoleLogger,
  Injectable,
  LogLevel,
  LoggerService,
} from '@nestjs/common';

type StructuredLogLevel = Exclude<LogLevel, 'fatal'> | 'fatal';

type StructuredLogRecord = {
  timestamp: string;
  level: StructuredLogLevel;
  message?: string;
  event?: string;
  context?: string;
  trace?: string;
  requestId?: string;
  orderId?: string;
  providerId?: string;
  runnerId?: string;
  path?: string;
  method?: string;
  statusCode?: number;
  durationMs?: number;
  userId?: string;
};

@Injectable()
export class AppLoggerService extends ConsoleLogger implements LoggerService {
  private static readonly SENSITIVE_KEY_PATTERN =
    /^(fiscalId|fiscalCountry|fiscalIdHash|fiscalIdLast4)$/i;

  private parseMessage(message: unknown) {
    if (typeof message !== 'string') {
      return { message: String(message) };
    }

    try {
      const parsed = JSON.parse(message);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // fall through to plain string logging
    }

    return { message };
  }

  private sanitizeString(value: string) {
    return value
      .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [redacted]')
      .replace(
        /(token|jwt|cookie|password|fiscalId|fiscalCountry|fiscalIdHash|fiscalIdLast4)=([^&\s]+)/gi,
        '$1=[redacted]',
      )
      .replace(
        /"(fiscalId|fiscalCountry|fiscalIdHash|fiscalIdLast4)"\s*:\s*"[^"]*"/gi,
        '"$1":"[redacted]"',
      );
  }

  private sanitizeDeep(value: unknown, key?: string): unknown {
    if (key && AppLoggerService.SENSITIVE_KEY_PATTERN.test(key)) {
      return '[redacted]';
    }

    if (typeof value === 'string') {
      return this.sanitizeString(value);
    }

    if (Array.isArray(value)) {
      return value.map((entry) => this.sanitizeDeep(entry));
    }

    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([entryKey, entryValue]) => [
          entryKey,
          this.sanitizeDeep(entryValue, entryKey),
        ]),
      );
    }

    return value;
  }

  private sanitize(value: unknown) {
    if (typeof value !== 'string') {
      return this.sanitizeDeep(value);
    }

    return this.sanitizeString(value);
  }

  private sanitizeRecordValue(key: string, value: unknown) {
    return this.sanitizeDeep(value, key);
  }

  private emit(
    level: StructuredLogLevel,
    message: unknown,
    context?: string,
    trace?: string,
  ) {
    const payload = this.parseMessage(message);
    const record: StructuredLogRecord = {
      timestamp: new Date().toISOString(),
      level,
      context,
      trace: trace ? String(this.sanitize(trace)) : undefined,
    };

    for (const [key, value] of Object.entries(payload)) {
      (record as Record<string, unknown>)[key] = this.sanitizeRecordValue(
        key,
        value,
      );
    }

    const serialized = JSON.stringify(record);

    if (level === 'error' || level === 'fatal') {
      process.stderr.write(`${serialized}\n`);
      return;
    }

    process.stdout.write(`${serialized}\n`);
  }

  override log(message: unknown, context?: string) {
    this.emit('log', message, context);
  }

  override error(message: unknown, trace?: string, context?: string) {
    this.emit('error', message, context, trace);
  }

  override warn(message: unknown, context?: string) {
    this.emit('warn', message, context);
  }

  override debug(message: unknown, context?: string) {
    this.emit('debug', message, context);
  }

  override verbose(message: unknown, context?: string) {
    this.emit('verbose', message, context);
  }
}
