import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TABLES } from '../src/core/schema.js';

const sql = readFileSync(new URL('../supabase/migrations/0001_init.sql', import.meta.url), 'utf8');

function sqlColumns(table) {
  const m = new RegExp(`create table if not exists public\\.${table} \\(([\\s\\S]*?)\\n\\);`).exec(sql);
  assert.ok(m, `table ${table} missing from SQL`);
  return m[1].split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('--') && !l.startsWith('constraint'))
    .map((l) => l.split(/\s+/)[0].replace(/"/g, ''));
}

test('every column in src/core/schema.js exists in the SQL migration', () => {
  for (const [table, def] of Object.entries(TABLES)) {
    const cols = sqlColumns(table);
    for (const f of def.fields) {
      if (table === 'laboratory_measurements' && f.name === 'user_id') continue;
      assert.ok(cols.includes(f.name), `${table}.${f.name} missing in SQL`);
    }
  }
});

test('every user table has row level security enabled', () => {
  for (const t of Object.keys(TABLES)) {
    const inLoop = new RegExp(`array\\[[^\\]]*'${t}'`).test(sql);
    const direct = sql.includes(`alter table public.${t} enable row level security`);
    assert.ok(inLoop || direct, `${t} has no RLS`);
  }
});

test('the browser never needs a service-role key', () => {
  assert.ok(!/service_role/i.test(readFileSync(new URL('../src/ui/config.js', import.meta.url), 'utf8')));
});
