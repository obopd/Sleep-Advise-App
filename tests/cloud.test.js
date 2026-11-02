import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCloud, mergeRecords } from '../src/core/cloud.js';

function fakeServer() {
  const calls = [];
  const db = { sleep_episodes: [] };
  const fetchImpl = async (url, opts) => {
    calls.push({ url, ...opts, body: opts.body ? JSON.parse(opts.body) : null });
    const path = url.replace('https://x.supabase.co', '');
    const ok = (data) => ({ ok: true, status: 200, text: async () => (data == null ? '' : JSON.stringify(data)) });
    if (path.startsWith('/auth/v1/token?grant_type=password')) {
      const b = JSON.parse(opts.body);
      if (b.password !== 'right-password') return { ok: false, status: 400, text: async () => JSON.stringify({ error_code: 'invalid_credentials' }) };
      return ok({ access_token: 'T', refresh_token: 'R', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'U1', email: b.email } });
    }
    if (!opts.headers.Authorization) return { ok: false, status: 401, text: async () => '{"message":"JWT required"}' };
    const m = /^\/rest\/v1\/(\w+)/.exec(path);
    if (m && opts.method === 'GET') return ok(db[m[1]] ?? []);
    if (m && opts.method === 'POST') { (db[m[1]] ??= []).push(...JSON.parse(opts.body)); return ok(null); }
    return ok(null);
  };
  return { calls, db, fetchImpl };
}

test('cloud: disabled without configuration (local-only mode)', async () => {
  const c = createCloud({ url: '', anonKey: '' });
  assert.equal(c.enabled, false);
  await assert.rejects(() => c.signIn('a@x', 'p'), /not configured/);
});

test('cloud: friendly error on wrong password; no token stored', async () => {
  const s = fakeServer();
  const c = createCloud({ url: 'https://x.supabase.co', anonKey: 'anon', fetchImpl: s.fetchImpl });
  await assert.rejects(() => c.signIn('a@x', 'wrong'), /incorrect/);
  assert.equal(c.session, null);
});

test('cloud: requests send only the anon key + user token; rows rewritten to the user id', async () => {
  const s = fakeServer();
  const c = createCloud({ url: 'https://x.supabase.co', anonKey: 'anon', fetchImpl: s.fetchImpl });
  await c.signIn('a@x', 'right-password');
  await c.push('sleep_episodes', [{ id: 'e1', user_id: 'local-id', updated_at: '2026-01-01T00:00:00Z' }]);
  const post = s.calls.at(-1);
  assert.equal(post.headers.apikey, 'anon');
  assert.equal(post.headers.Authorization, 'Bearer T');
  assert.equal(post.body[0].user_id, 'U1');
  assert.ok(!JSON.stringify(s.calls).includes('service_role'));
});

test('cloud: unauthenticated table access is refused before any request', async () => {
  const s = fakeServer();
  const c = createCloud({ url: 'https://x.supabase.co', anonKey: 'anon', fetchImpl: s.fetchImpl });
  await assert.rejects(() => c.pull('sleep_episodes'), /Not signed in/);
  assert.equal(s.calls.length, 0);
});

test('merge: later updated_at wins; predictions are never replaced', () => {
  const local = [{ id: 'a', updated_at: '2026-01-02T00:00:00Z', v: 'local' }, { id: 'b', updated_at: '2026-01-01T00:00:00Z', v: 'local' }];
  const remote = [{ id: 'a', updated_at: '2026-01-01T00:00:00Z', v: 'remote' }, { id: 'b', updated_at: '2026-01-03T00:00:00Z', v: 'remote' }, { id: 'c', v: 'remote' }];
  const m = Object.fromEntries(mergeRecords(local, remote, 'sleep_episodes').map((r) => [r.id, r.v]));
  assert.deepEqual(m, { a: 'local', b: 'remote', c: 'remote' });
  const p = mergeRecords([{ id: 'p', updated_at: '2030-01-01T00:00:00Z', v: 'local' }], [{ id: 'p', v: 'remote' }], 'model_predictions');
  assert.equal(p[0].v, 'remote');
});
