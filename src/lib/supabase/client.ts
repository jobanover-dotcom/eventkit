'use client'

import { createBrowserClient } from '@supabase/ssr'
import { getSupabasePublicConfig } from '@/config/env'
import type { Database } from '@/types/database.types'

export function createClient() {
  const { url, publishableKey } = getSupabasePublicConfig()
  return createBrowserClient<Database>(url, publishableKey)
}
