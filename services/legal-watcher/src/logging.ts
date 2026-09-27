/**
 * Structured JSON logging (repository precedent: services/malware-scanner).
 *
 * Rules: useful operational event codes, no tokens, no legal text, no full
 * response bodies, no sensitive environment configuration. Field values are
 * restricted to primitive scalar types so a response can never be dumped.
 */
export type LogLevel = 'info' | 'warn' | 'error';

export type LogFieldValue = string | number | boolean | null | undefined;

export interface LogFields {
  [key: string]: LogFieldValue;
}

export interface Logger {
  info(code: string, message: string, fields?: LogFields): void;
  warn(code: string, message: string, fields?: LogFields): void;
  error(code: string, message: string, fields?: LogFields): void;
}

export function createJsonLogger(
  sink: (line: string) => void,
  base: LogFields = {},
): Logger {
  function emit(level: LogLevel, code: string, message: string, fields?: LogFields): void {
    const record: Record<string, unknown> = {
      ts: new Date().toISOString(),
      level,
      code,
      msg: message,
      ...base,
      ...fields,
    };
    sink(JSON.stringify(record));
  }
  return {
    info: (code, message, fields) => emit('info', code, message, fields),
    warn: (code, message, fields) => emit('warn', code, message, fields),
    error: (code, message, fields) => emit('error', code, message, fields),
  };
}

export const silentLogger: Logger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

export function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max)}…`;
}
