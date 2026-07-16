type LogMeta = Record<string, unknown>

function write(level: 'debug' | 'info' | 'warn' | 'error', message: string, meta?: LogMeta) {
  const payload = meta ? ` ${JSON.stringify(meta)}` : ''
  const line = `[travel] ${message}${payload}`
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

export const logger = {
  debug: (message: string, meta?: LogMeta) => write('debug', message, meta),
  info: (message: string, meta?: LogMeta) => write('info', message, meta),
  warn: (message: string, meta?: LogMeta) => write('warn', message, meta),
  error: (message: string, meta?: LogMeta) => write('error', message, meta),
}
