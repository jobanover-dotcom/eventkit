type LogLevel = 'info' | 'warn' | 'error'

export type LogContext = Record<string, string | number | boolean | undefined>

/**
 * Structured event logging. Payloads are key/value pairs of non-sensitive
 * identifiers only — never credentials, cookies, tokens, or full personal
 * objects. Anything not listed here is dropped rather than serialized.
 */
export const logger = {
  info(event: string, context?: LogContext): void {
    write('info', event, context)
  },
  warn(event: string, context?: LogContext): void {
    write('warn', event, context)
  },
  error(event: string, context?: LogContext): void {
    write('error', event, context)
  },
}

function write(level: LogLevel, event: string, context?: LogContext): void {
  const entry = JSON.stringify({ level, event, ...sanitize(context) })
  if (level === 'error') console.error(entry)
  else if (level === 'warn') console.warn(entry)
  else console.info(entry)
}

const BLOCKED_KEY = /^(authorization|cookie|token|secret|password|key)$/i

function sanitize(context?: LogContext): LogContext {
  if (!context) return {}
  const safe: LogContext = {}
  for (const [key, value] of Object.entries(context)) {
    if (value === undefined) continue
    if (BLOCKED_KEY.test(key)) continue
    safe[key] = value
  }
  return safe
}
