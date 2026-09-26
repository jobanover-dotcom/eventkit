/**
 * Regenerates src/types/database.types.ts from the live Supabase project.
 *
 * Replaces `supabase gen types typescript --local`, which needs the local
 * Docker stack, and avoids the personal access token that `--project-id` wants.
 *
 *   npm run supabase:types
 */
import { writeFileSync } from 'node:fs'
import { connectToDatabase } from './lib/database'

/**
 * `pg` returns a text[] column as a Postgres array literal such as
 * `{a,b,"c,d"}`, so it is decoded here rather than through a global parser.
 */
function parseArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value !== 'string') return []
  const inner = value.replace(/^\{|\}$/g, '')
  if (!inner) return []
  return inner.split(',').map((item) => item.trim().replace(/^"|"$/g, '').replace(/\\\\/g, '\\'))
}

const SCHEMA = 'public'
const OUTPUT = 'src/types/database.types.ts'

function tsType(sqlType: string): string {
  switch (sqlType) {
    case 'bool':
      return 'boolean'
    case 'int2':
    case 'int4':
    case 'int8':
    case 'float4':
    case 'float8':
    case 'numeric':
      return 'number'
    case 'json':
    case 'jsonb':
      return 'Json'
    default:
      return 'string'
  }
}

function splitTopLevel(input: string): string[] {
  const out: string[] = []
  let depth = 0
  let current = ''
  for (const ch of input) {
    if (ch === '(' || ch === '[') depth += 1
    if (ch === ')' || ch === ']') depth -= 1
    if (ch === ',' && depth === 0) {
      out.push(current)
      current = ''
      continue
    }
    current += ch
  }
  if (current.trim()) out.push(current)
  return out
}

type Field = { name: string; type: string }

/** `TABLE(id uuid, name text)` -> TS object type. */
function parseReturn(result: string): string {
  const trimmed = result.trim()
  const table = /^TABLE\(([\s\S]*)\)$/.exec(trimmed)
  if (!table) return /^SETOF\s/i.test(trimmed) ? 'Json' : 'unknown'

  const fields: Field[] = splitTopLevel(table[1] ?? '')
    .map((field) => {
      const [name = '', ...rest] = field.trim().split(/\s+/)
      return { name, type: tsType(rest.join(' ').replace(/\[\]$/, '')) }
    })
    .filter((field) => field.name)
  return `{ ${fields.map((field) => `${field.name}: ${field.type}`).join('; ')} }`
}

/** `p_event_id uuid, p_token text` -> TS record type. */
function parseArgs(args: string): string {
  const fields: Field[] = splitTopLevel(args)
    .map((field) => {
      const [name = '', ...rest] = field.trim().split(/\s+/)
      return { name, type: tsType(rest.join(' ').replace(/\[\]$/, '')) }
    })
    .filter((field) => field.name)
  if (fields.length === 0) return 'Record<PropertyKey, never>'
  return `{ ${fields.map((field) => `${field.name}: ${field.type}`).join('; ')} }`
}

async function main(): Promise<void> {
  const { client, projectRef } = await connectToDatabase()

  const { rows: columns } = await client.query(
    `select table_name, column_name, udt_name, is_nullable, column_default, ordinal_position
     from information_schema.columns
     where table_schema = $1
     order by table_name, ordinal_position`,
    [SCHEMA]
  )

  const { rows: primaryKeys } = await client.query(
    `select tc.table_name, kcu.column_name
     from information_schema.table_constraints tc
     join information_schema.key_column_usage kcu
       on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
     where tc.table_schema = $1 and tc.constraint_type = 'PRIMARY KEY'
     order by tc.table_name, kcu.ordinal_position`,
    [SCHEMA]
  )

  // Read pg_constraint directly: joining key_column_usage with
  // constraint_column_usage duplicates the columns of a composite foreign key.
  const { rows: foreignKeys } = await client.query(
    `select
       con.conname as constraint_name,
       con.conrelid::regclass::text as table_name,
       con.confrelid::regclass::text as foreign_table_name,
       (select array_agg(a.attname::text order by u.ord)
          from unnest(con.conkey) with ordinality as u(attnum, ord)
          join pg_attribute a on a.attrelid = con.conrelid and a.attnum = u.attnum) as columns,
       (select array_agg(a.attname::text order by u.ord)
          from unnest(con.confkey) with ordinality as u(attnum, ord)
          join pg_attribute a on a.attrelid = con.confrelid and a.attnum = u.attnum) as foreign_columns
     from pg_constraint con
     where con.contype = 'f' and con.connamespace = $1::regnamespace
     order by con.conrelid::regclass::text, con.conname`,
    [SCHEMA]
  )

  const { rows: functions } = await client.query(
    `select p.proname,
            pg_get_function_arguments(p.oid) as args,
            pg_get_function_result(p.oid) as result
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = $1 and p.prokind = 'f' and p.proname not like 'handle\\_%'
     order by p.proname`,
    [SCHEMA]
  )

  const pkByTable = new Map<string, string[]>()
  for (const row of primaryKeys) {
    const list = pkByTable.get(row.table_name as string) ?? []
    list.push(row.column_name as string)
    pkByTable.set(row.table_name as string, list)
  }

  const tableNames = [...new Set(columns.map((column) => column.table_name))].sort() as string[]

  const tableBlocks = tableNames.map((table) => {
    const cols = columns.filter((column) => column.table_name === table)
    const typeOf = (name: string) => tsType(cols.find((c) => c.column_name === name)!.udt_name)
    const nullable = (col: (typeof cols)[number]) => col.is_nullable === 'YES'
    const hasDefault = (col: (typeof cols)[number]) => col.column_default !== null

    const row = cols
      .map(
        (col) => `${col.column_name}: ${typeOf(col.column_name)}${nullable(col) ? ' | null' : ''}`
      )
      .join('; ')
    const insert = cols
      .map(
        (col) =>
          `${col.column_name}${nullable(col) || hasDefault(col) ? '?' : ''}: ${typeOf(col.column_name)}${nullable(col) ? ' | null' : ''}`
      )
      .join('; ')
    const update = cols
      .map(
        (col) => `${col.column_name}?: ${typeOf(col.column_name)}${nullable(col) ? ' | null' : ''}`
      )
      .join('; ')

    const ownPk = pkByTable.get(table) ?? []
    const relationships = foreignKeys
      .filter((fk) => fk.table_name === table)
      .map((fk) => {
        const fkColumns = parseArray(fk.columns)
        const isOneToOne =
          fkColumns.length === ownPk.length &&
          [...fkColumns].sort().join() === [...ownPk].sort().join()
        return [
          '        {',
          `          foreignKeyName: ${JSON.stringify(fk.constraint_name)};`,
          `          columns: [${fkColumns.map((c) => JSON.stringify(c)).join(', ')}];`,
          `          isOneToOne: ${isOneToOne};`,
          `          referencedRelation: ${JSON.stringify(fk.foreign_table_name)};`,
          `          referencedColumns: [${parseArray(fk.foreign_columns)
            .map((c) => JSON.stringify(c))
            .join(', ')}];`,
          '        }',
        ].join('\n')
      })

    const relationshipBlock = relationships.length ? `\n${relationships.join(',\n')}\n      ` : ''

    return [
      `      ${table}: {`,
      `        Row: { ${row} }`,
      `        Insert: { ${insert} }`,
      `        Update: { ${update} }`,
      `        Relationships: [${relationshipBlock}]`,
      '      }',
    ].join('\n')
  })

  const functionBlocks = functions.map((fn) =>
    [
      `      ${fn.proname}: {`,
      `        Args: ${parseArgs(fn.args as string)}`,
      `        Returns: ${parseReturn(fn.result as string)}[]`,
      '      }',
    ].join('\n')
  )

  const output = `// Generated from the live Supabase project by scripts/generate-types.ts.
// Do not edit by hand — re-run \`npm run supabase:types\` instead.
//
// Mirrors supabase/migrations/*.sql. The Supabase CLI equivalent needs a
// personal access token: npx supabase gen types typescript --project-id ${projectRef}

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  ${SCHEMA}: {
    Tables: {
${tableBlocks.join(',\n')},
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
${functionBlocks.join(',\n')},
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database['${SCHEMA}']

export type Tables<
  PublicTableName extends keyof (PublicSchema['Tables'] & PublicSchema['Views']),
> =
  (PublicSchema['Tables'] & PublicSchema['Views'])[PublicTableName] extends { Row: infer Row }
    ? Row
    : never

export type TablesInsert<PublicTableName extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][PublicTableName]['Insert']

export type TablesUpdate<PublicTableName extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][PublicTableName]['Update']

export type Enums<PublicEnumName extends keyof PublicSchema['Enums']> =
  PublicSchema['Enums'][PublicEnumName]

export type CompositeTypes<PublicCompositeTypeName extends keyof PublicSchema['CompositeTypes']> =
  PublicSchema['CompositeTypes'][PublicCompositeTypeName]
`

  writeFileSync(OUTPUT, output, 'utf8')
  console.log(`Wrote ${OUTPUT}`)
  console.log(`  ${tableNames.length} tables: ${tableNames.join(', ')}`)
  console.log(`  ${functions.length} functions: ${functions.map((f) => f.proname).join(', ')}`)

  await client.end()
}

void main()
