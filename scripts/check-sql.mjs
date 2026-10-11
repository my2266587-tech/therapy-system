/**
 * npm run check:sql
 *
 * Builds the whole database from supabase/*.sql on a throwaway in-process
 * Postgres (PGlite), in the documented order (supabase/README.md), TWICE —
 * then checks the access rules. Catches, before anything reaches Supabase:
 *   • a file that fails on a clean database (wrong order, missing dependency)
 *   • a file that fails when re-run (not idempotent)
 *   • a policy that lets any signed-in account in (`using (true)`)
 *   • the expected access matrix: anon / outsider / staff / admin
 *
 * Supabase-only pieces (auth.jwt(), storage schema, roles, the realtime
 * publication, pgcrypto) are stubbed minimally.
 */

import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SQL_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'supabase');

// Run order — keep in sync with supabase/README.md.
const FILES = [
  'schema.sql',
  'app-settings.sql',
  'tasks.sql',
  'trips.sql',
  'hour-bank.sql',
  'intake-forms.sql',
  'session-reminders.sql',
  'shirel-summary-payment.sql',
  'rls-policies.sql',
];

const SUPABASE_STUBS = `
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth; create schema storage;
  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  create table storage.buckets (id text primary key, name text, public boolean,
                                file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id serial primary key, bucket_id text, name text);
  alter table storage.objects enable row level security;
  create publication supabase_realtime;
`;

// PGlite ships without pgcrypto; gen_random_uuid() is built in since PG 13.
const load = f => readFileSync(path.join(SQL_DIR, f), 'utf8').replace(/create extension[^;]*;/gi, '');

let failed = false;
const fail = msg => { console.error('  ✗', msg); failed = true; };

const db = new PGlite();
await db.exec(SUPABASE_STUBS);

for (const round of [1, 2]) {
  console.log(round === 1 ? 'Clean install:' : 'Re-run (idempotency):');
  for (const f of FILES) {
    try { await db.exec(load(f)); console.log('  ✓', f); }
    catch (e) { fail(`${f}: ${e.message}`); }
  }
}

console.log('Policies:');
const open = await db.query(`
  select schemaname || '.' || tablename || ' → ' || policyname as p
  from pg_policies
  where schemaname in ('public', 'storage') and (qual = 'true' or with_check = 'true')`);
if (open.rows.length) open.rows.forEach(r => fail(`open to every signed-in account: ${r.p}`));
else console.log('  ✓ no policy is open to every signed-in account');

const noRls = await db.query(`
  select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`);
if (noRls.rows.length) noRls.rows.forEach(r => fail(`RLS disabled on public.${r.relname}`));
else console.log('  ✓ RLS enabled on every public table');

// ── Access matrix ───────────────────────────────────────────────────────────
await db.exec(`
  grant usage on schema public, storage to anon, authenticated;
  grant all on all tables in schema public, storage to anon, authenticated;
  insert into authorized_users (email, role, is_active) values
    ('admin@test.local', 'admin', true), ('staff@test.local', 'staff', true),
    ('gone@test.local', 'staff', false);
  insert into patients (full_name) values ('בדיקה');
  insert into private_expenses (patient_id, date, treatment_type)
    select id, current_date, 'בדיקה' from patients limit 1;
  insert into storage.objects (bucket_id, name) values ('patient-documents', 'a.pdf');
`);

async function count(role, email, sql) {
  const claims = email ? JSON.stringify({ email }) : '';
  await db.exec(`reset role; select set_config('request.jwt.claims', '${claims}', false); set role ${role};`);
  try { return (await db.query(sql)).rows.length; }
  catch { return 0; }
  finally { await db.exec('reset role'); }
}

const expect = [
  // who,                 role,            email,                  patients, private_expenses, storage, authorized_users
  ['not signed in',      'anon',          null,                   0, 0, 0, 0],
  ['outside Google acct', 'authenticated', 'someone@gmail.com',    0, 0, 0, 0],
  ['deactivated user',   'authenticated', 'gone@test.local',      0, 0, 0, 0],
  ['staff',              'authenticated', 'staff@test.local',     1, 0, 1, 0],
  ['admin (odd casing)', 'authenticated', ' Admin@Test.Local ',   1, 1, 1, 0],
];
console.log('Access matrix:');
for (const [who, role, email, ...want] of expect) {
  const got = [
    await count(role, email, 'select 1 from patients'),
    await count(role, email, 'select 1 from private_expenses'),
    await count(role, email, 'select 1 from storage.objects'),
    await count(role, email, 'select 1 from authorized_users'),
  ];
  if (got.join() === want.join()) console.log(`  ✓ ${who}`);
  else fail(`${who}: expected [patients, private_expenses, storage, authorized_users] = [${want}], got [${got}]`);
}

await db.close();
if (failed) { console.error('\ncheck:sql FAILED'); process.exit(1); }
console.log('\ncheck:sql passed');
