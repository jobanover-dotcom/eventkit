import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Client } from 'pg'

export type Migration = {
  version: string
  name: string
  path: string
  sql: string
}

const MIGRATIONS_DIR = 'supabase/migrations'
const FILENAME_PATTERN = /^(\d{14})_([\w-]+)\.sql$/

/** Reads every migration in version order, the same ordering the Supabase CLI uses. */
export function readMigrations(directory = MIGRATIONS_DIR): Migration[] {
  const dir = resolve(process.cwd(), directory)
  return readdirSync(dir)
    .map((filename) => {
      const match = FILENAME_PATTERN.exec(filename)
      if (!match) return null
      const [, version = '', name = ''] = match
      const path = join(dir, filename)
      return { version, name, path, sql: readFileSync(path, 'utf8') }
    })
    .filter((migration): migration is Migration => migration !== null)
    .sort((a, b) => a.version.localeCompare(b.version))
}

export async function readAppliedVersions(client: Client): Promise<Set<string>> {
  const exists = await client.query(
    `select to_regclass('supabase_migrations.schema_migrations') is not null as present`
  )
  if (!exists.rows[0]?.present) return new Set()

  const applied = await client.query(`select version from supabase_migrations.schema_migrations`)
  return new Set<string>(applied.rows.map((row) => row.version as string))
}

export function getPendingMigrations(
  migrations: Migration[],
  applied: ReadonlySet<string>
): Migration[] {
  return migrations.filter((migration) => !applied.has(migration.version))
}

async function ensureHistoryTable(client: Client): Promise<void> {
  await client.query(`create schema if not exists supabase_migrations`)
  await client.query(`
    create table if not exists supabase_migrations.schema_migrations (
      version text primary key,
      statements text[] not null,
      name text not null
    )`)
}

/**
 * Applies one migration inside a transaction and records it exactly the way
 * `supabase db push` would, so the Supabase CLI keeps treating its history as
 * authoritative afterwards.
 */
export async function applyMigration(client: Client, migration: Migration): Promise<void> {
  await ensureHistoryTable(client)

  await client.query('begin')
  try {
    await client.query(migration.sql)
    await client.query(
      `insert into supabase_migrations.schema_migrations (version, statements, name)
       values ($1, $2, $3)`,
      [migration.version, splitStatements(migration.sql), migration.name]
    )
    await client.query('commit')
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  }
}

function splitStatements(sql: string): string[] {
  return sql
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean)
}
