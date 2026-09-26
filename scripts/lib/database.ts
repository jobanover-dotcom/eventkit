import { Client } from 'pg'
import { loadLocalEnv, requireEnv } from './env'

export type Database = {
  client: Client
  projectRef: string
}

/**
 * The project ref is encoded in the pooler username: `postgres.<ref>`.
 * Supabase keeps the password in the URL, so only the ref is parsed back out.
 */
export function getProjectRef(connectionString: string): string {
  const username = decodeURIComponent(new URL(connectionString).username)
  const ref = username.includes('.') ? username.split('.').pop() : username
  if (!ref || !/^[a-z]{20}$/.test(ref)) {
    throw new Error(
      `Could not read the Supabase project ref from the database URL username "${username}". ` +
        'Expected "postgres.<project-ref>".'
    )
  }
  return ref
}

/**
 * The Supabase pooler presents a certificate chain that is not in Node's default
 * trust store, so tooling verifies the transport is encrypted but not the
 * certificate identity — the same trade-off `sslmode=require` makes in libpq.
 * Set SUPABASE_DB_SSL_VERIFY=true to enforce full verification.
 */
function connectionOptions(connectionString: string) {
  const url = new URL(connectionString)
  url.searchParams.delete('sslmode')
  return {
    connectionString: url.toString(),
    ssl: { rejectUnauthorized: process.env.SUPABASE_DB_SSL_VERIFY === 'true' },
  }
}

/**
 * Connects straight to the hosted project over the session pooler. No Docker and
 * no personal access token are involved, which is why the migration and database
 * test workflows run against the live project instead of the local stack.
 *
 * The session pooler (port 5432) is required rather than the transaction pooler,
 * because migrations and pgTAP need session state.
 */
export async function connectToDatabase(): Promise<Database> {
  loadLocalEnv()
  const connectionString = requireEnv('SUPABASE_DB_URL')
  const projectRef = getProjectRef(connectionString)

  const client = new Client({
    ...connectionOptions(connectionString),
    connectionTimeoutMillis: 15_000,
    application_name: 'eventkit-tooling',
  })
  await client.connect()
  return { client, projectRef }
}
