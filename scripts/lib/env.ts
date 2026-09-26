import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Loads `.env.local` into `process.env` without overwriting values that are
 * already set, so CI can pass real environment variables instead.
 */
export function loadLocalEnv(): void {
  const file = resolve(process.cwd(), '.env.local')
  if (!existsSync(file)) return

  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line)
    if (!match) continue
    const [, key, rawValue = ''] = match
    if (process.env[key] !== undefined) continue
    process.env[key] = rawValue.replace(/^["'](.*)["']$/, '$1')
  }
}

export function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `${name} is not set. Add it to .env.local — see .env.example. ` +
        'It is a server-side connection string and must never be exposed to the browser.'
    )
  }
  return value
}
