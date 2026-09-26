import 'server-only'
import { z } from 'zod'
import { ACTION_ERROR_CODES, AppError } from '@/lib/errors'

/**
 * Privileged configuration. This module must never be imported by a Client
 * Component — `server-only` turns an accidental import into a build error.
 *
 * The service-role key bypasses Row Level Security entirely, so it is used only
 * by the offline demo seed script and never by request handling.
 */
const serverEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
})

export function getSupabaseServiceRoleKey(): string {
  const parsed = serverEnvSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  })

  if (!parsed.success) {
    throw new AppError(
      ACTION_ERROR_CODES.CONFIG_MISSING,
      'SUPABASE_SERVICE_ROLE_KEY is not configured. It is required only for the offline demo seed script.',
      { cause: parsed.error }
    )
  }

  return parsed.data.SUPABASE_SERVICE_ROLE_KEY
}
