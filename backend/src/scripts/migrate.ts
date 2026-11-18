import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const databaseUrl = process.env.DATABASE_URL;
const adminUrl = process.env.ADMIN_DATABASE_URL || databaseUrl;
if (!adminUrl) throw new Error('ADMIN_DATABASE_URL 또는 DATABASE_URL 이 필요합니다.');

const client = new pg.Client({ connectionString: adminUrl });
await client.connect();
const auth = await client.query<{ exists: string | null }>("select to_regprocedure('auth.uid()') as exists");
if (!auth.rows[0]?.exists) {
  const stub = await readFile(path.join(root, 'supabase/testing/auth-stub.sql'), 'utf8');
  await client.query(stub);
  console.log('applied auth stub');
}
await client.query(`
  create table if not exists public.invife_schema_migrations (
    version text primary key,
    applied_at timestamptz not null default now()
  )
`);
const dir = path.join(root, 'supabase/migrations');
const files = (await readdir(dir)).filter((name) => name.endsWith('.sql')).sort();
for (const file of files) {
  const version = file.replace(/\.sql$/, '');
  const done = await client.query('select 1 from public.invife_schema_migrations where version = $1', [version]);
  if (done.rowCount) continue;
  const sql = await readFile(path.join(dir, file), 'utf8');
  await client.query('begin');
  try {
    await client.query(sql);
    await client.query('insert into public.invife_schema_migrations (version) values ($1)', [version]);
    await client.query('commit');
    console.log(`applied ${file}`);
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}
await client.end();
