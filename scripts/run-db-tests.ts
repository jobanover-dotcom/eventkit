/**
 * Runs supabase/tests/*.test.sql against the hosted project.
 *
 * Replaces `supabase test db`, which requires the local Docker stack. pgTAP is
 * installed once, outside the per-file transaction, so the test files can
 * `set local role` and roll back cleanly.
 *
 *   npm run supabase:test
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Client } from 'pg'
import { connectToDatabase } from './lib/database'

const TESTS_DIR = 'supabase/tests'
const TAP_LINE = /^(not )?ok\b/

type Result = { rows: { [key: string]: unknown }[] }

async function ensurePgtap(client: Client): Promise<void> {
  const { rows } = await client.query(`select 1 from pg_extension where extname = 'pgtap'`)
  if (rows.length > 0) return

  // Installed permanently: each test file wraps itself in begin/rollback, so an
  // extension created inside that transaction would vanish before the run ends.
  await client.query('begin')
  try {
    await client.query(`create extension if not exists pgtap with schema extensions`)
    await client.query('commit')
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  }
  console.log('Installed the pgtap extension on the project (one time).\n')
}

function collectTaps(result: unknown): string[] {
  const results = Array.isArray(result) ? result : [result]
  const lines: string[] = []
  for (const item of results) {
    const rows = (item as Result | undefined)?.rows ?? []
    for (const row of rows) {
      const value = Object.values(row)[0]
      if (typeof value === 'string' && TAP_LINE.test(value.trim())) {
        lines.push(value.trim())
      }
    }
  }
  return lines
}

async function main(): Promise<void> {
  const { client, projectRef } = await connectToDatabase()
  await ensurePgtap(client)

  const dir = resolve(process.cwd(), TESTS_DIR)
  const files = readdirSync(dir)
    .filter((file) => file.endsWith('.sql'))
    .sort()

  if (files.length === 0) {
    console.log(`No .sql files in ${TESTS_DIR}.`)
    await client.end()
    return
  }

  let totalFailed = 0
  let totalRun = 0

  for (const file of files) {
    const sql = readFileSync(join(dir, file), 'utf8')
    console.log(`\n=== ${file} ===`)

    let taps: string[] = []
    try {
      taps = collectTaps(await client.query(sql))
    } catch (error) {
      console.error(`  aborted: ${(error as Error).message}`)
      totalFailed += 1
      // The transaction is aborted; clear it before the next file.
      await client.query('rollback').catch(() => {})
      continue
    }

    let failed = 0
    for (const line of taps) {
      totalRun += 1
      if (line.startsWith('not ok')) {
        failed += 1
        totalFailed += 1
        console.log(`  ${line}`)
      }
    }
    const passed = taps.length - failed
    console.log(`  ${passed}/${taps.length} assertions passed`)
  }

  await client.end()
  console.log(
    `\n${totalRun - totalFailed}/${totalRun} assertions passed against ${projectRef}` +
      (totalFailed ? ` — ${totalFailed} failure(s)` : '')
  )
  process.exit(totalFailed === 0 ? 0 : 1)
}

void main().catch((error: unknown) => {
  console.error(`\n${(error as Error).message}`)
  process.exit(1)
})
