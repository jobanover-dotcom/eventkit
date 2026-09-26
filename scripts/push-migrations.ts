/**
 * Applies pending migrations to the hosted Supabase project.
 *
 * Replaces `supabase db push`, which needs a personal access token to link a
 * project. This talks to Postgres directly, so it needs only SUPABASE_DB_URL and
 * runs without Docker.
 *
 *   npm run supabase:push              apply everything pending
 *   npm run supabase:push -- --dry-run list pending migrations and exit
 */
import { connectToDatabase } from './lib/database'
import {
  applyMigration,
  getPendingMigrations,
  readAppliedVersions,
  readMigrations,
} from './lib/migrations'

const DRY_RUN = process.argv.includes('--dry-run')

async function main(): Promise<void> {
  const { client, projectRef } = await connectToDatabase()
  const migrations = readMigrations()
  const applied = await readAppliedVersions(client)
  const pending = getPendingMigrations(migrations, applied)

  console.log(`Project ${projectRef}`)
  console.log(`${migrations.length} migration file(s), ${applied.size} already applied\n`)

  if (pending.length === 0) {
    console.log('Nothing to apply. The live database matches supabase/migrations.')
    await client.end()
    return
  }

  for (const migration of pending) {
    console.log(`  ${migration.version}_${migration.name}`)
  }

  if (DRY_RUN) {
    console.log(`\n--dry-run: ${pending.length} migration(s) would be applied.`)
    await client.end()
    return
  }

  console.log('')
  for (const migration of pending) {
    process.stdout.write(`Applying ${migration.version}_${migration.name} ... `)
    try {
      await applyMigration(client, migration)
      console.log('done')
    } catch (error) {
      console.log('FAILED')
      console.error(`\n${(error as Error).message}`)
      console.error(
        `\nNothing was committed. Fix the migration and re-run. ` +
          `If a previous attempt left objects behind, restore from a Supabase point-in-time backup first.`
      )
      await client.end()
      process.exit(1)
    }
  }

  const remaining = await readAppliedVersions(client)
  console.log(`\nApplied. ${remaining.size} migration(s) now recorded.`)
  await client.end()
}

void main()
