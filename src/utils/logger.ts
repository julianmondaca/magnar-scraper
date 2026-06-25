type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

const colors: Record<LogLevel, string> = {
  INFO: '\x1b[36m',
  WARN: '\x1b[33m',
  ERROR: '\x1b[31m',
  DEBUG: '\x1b[90m',
};

const reset = '\x1b[0m';

function timestamp(): string {
  return new Date().toISOString();
}

function log(level: LogLevel, msg: string, data?: unknown): void {
  const prefix = `${colors[level]}[${timestamp()}] [${level}]${reset}`;
  const parts = [`${prefix} ${msg}`];
  if (data !== undefined) {
    parts.push(typeof data === 'string' ? data : JSON.stringify(data, null, 2));
  }
  console.log(parts.join('\n'));
}

export const logger = {
  info: (msg: string, data?: unknown) => log('INFO', msg, data),
  warn: (msg: string, data?: unknown) => log('WARN', msg, data),
  error: (msg: string, data?: unknown) => log('ERROR', msg, data),
  debug: (msg: string, data?: unknown) => log('DEBUG', msg, data),
};
