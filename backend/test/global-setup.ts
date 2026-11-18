import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export default async function setup() {
  const admin = new pg.Client({ host: '/var/run/postgresql', user: 'ubuntu', database: 'postgres' });
  await admin.connect();
  await admin.query('alter role invife_app with login password \'invife_app\'');
  await admin.query(`
    select pg_terminate_backend(pid)
    from pg_stat_activity
    where datname = 'invife_test' and pid <> pg_backend_pid()
  `);
  await admin.query('drop database if exists invife_test');
  await admin.query('create database invife_test');
  await admin.end();

  const db = new pg.Client({ host: '/var/run/postgresql', user: 'ubuntu', database: 'invife_test' });
  await db.connect();
  const stub = await readFile(path.join(root, 'supabase/testing/auth-stub.sql'), 'utf8');
  const migration = await readFile(path.join(root, 'supabase/migrations/20261117143000_init.sql'), 'utf8');
  await db.query(stub);
  await db.query(migration);
  await db.end();

  const databaseUrl = 'postgres://invife_app:invife_app@127.0.0.1:5432/invife_test';
  await writeFile(
    path.join(root, 'test/env.json'),
    JSON.stringify({
      DATABASE_URL: databaseUrl,
      ADMIN_DATABASE_URL: 'postgres://ubuntu@/invife_test?host=/var/run/postgresql',
      SUPABASE_JWT_SECRET: 'test-jwt-secret-0123456789abcdef',
      INVIFE_LINK_SECRET: 'test-link-secret',
      DATA_DIR: path.join(root, '.data-test'),
    }),
  );
}
