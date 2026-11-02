// Optional cloud account + sync with Supabase (Postgres + Auth), over plain REST like
// Planner (no SDK). Local-first: the app works without it; sync is a copy of the local
// event tables into the user's own rows, protected by Row Level Security.
//
// Conflict rule: records are matched by id; the version with the later `updated_at` wins,
// and the loser's values stay in `revisions` on the winner when it was a correction made
// on this device. Predictions are append-only and never updated.

import { OBSERVATION_TABLES } from './schema.js';
import { toMs } from './time.js';

export const SYNCED_TABLES = [...OBSERVATION_TABLES, 'model_predictions'];

export function createCloud({ url, anonKey, fetchImpl = globalThis.fetch, storage = null, timeoutMs = 12_000 }) {
  const enabled = Boolean(url && anonKey);
  let session = storage?.get?.() ?? null; // { access_token, refresh_token, expires_at, user: { id, email } }

  async function call(path, { method = 'GET', body, auth = true, headers = {} } = {}) {
    if (!enabled) throw new Error('Cloud sync is not configured.');
    const h = { apikey: anonKey, 'Content-Type': 'application/json', ...headers };
    if (auth) {
      if (!session) throw new Error('Not signed in.');
      if (session.expires_at && session.expires_at * 1000 < Date.now() + 60_000) await refresh();
      h.Authorization = `Bearer ${session.access_token}`;
    }
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
    try {
      const res = await fetchImpl(url.replace(/\/$/, '') + path, { method, headers: h, body: body == null ? undefined : JSON.stringify(body), signal: ctrl?.signal });
      const text = await res.text();
      const data = text ? JSON.parse(text) : null;
      if (!res.ok) throw new Error(friendly(data, res.status));
      return data;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function keep(s) {
    session = s;
    storage?.set?.(s);
    return s;
  }

  async function signUp(email, password) {
    const data = await call('/auth/v1/signup', { method: 'POST', body: { email, password }, auth: false });
    return data?.access_token ? keep(data) : { confirmationSent: true };
  }

  async function signIn(email, password) {
    return keep(await call('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password }, auth: false }));
  }

  async function refresh() {
    const data = await call('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: session.refresh_token }, auth: false });
    return keep(data);
  }

  async function signOut() {
    try {
      if (session) await call('/auth/v1/logout', { method: 'POST' });
    } finally {
      keep(null);
    }
  }

  /** Upsert local rows of one table (rewritten to the signed-in user's id). */
  async function push(table, rows) {
    if (!rows.length) return 0;
    const uid = session.user.id;
    const body = rows.map((r) => ({ ...r, user_id: uid }));
    const prefer = table === 'model_predictions' ? 'resolution=ignore-duplicates' : 'resolution=merge-duplicates';
    await call(`/rest/v1/${table}?on_conflict=id`, { method: 'POST', body, headers: { Prefer: `${prefer},return=minimal` } });
    return rows.length;
  }

  async function pull(table) {
    return call(`/rest/v1/${table}?select=*&order=created_at.asc`);
  }

  /** Two-way sync of all synced tables. Returns the merged tables. */
  async function sync(localTables) {
    const merged = {};
    for (const t of SYNCED_TABLES) {
      const remote = await pull(t);
      merged[t] = mergeRecords(localTables[t] ?? [], remote ?? [], t);
      const toPush = merged[t].filter((r) => {
        const rem = remote.find((x) => x.id === r.id);
        return !rem || (t !== 'model_predictions' && toMs(r.updated_at) > toMs(rem.updated_at));
      });
      await push(t, toPush);
    }
    return merged;
  }

  async function deleteAccount() {
    await call('/rest/v1/rpc/delete_my_account', { method: 'POST', body: {} });
    keep(null);
  }

  return {
    enabled,
    get session() { return session; },
    signUp, signIn, signOut, refresh, push, pull, sync, deleteAccount,
  };
}

/** Merge by id; later updated_at wins (predictions: first stored copy wins). */
export function mergeRecords(local, remote, table) {
  const byId = new Map(remote.map((r) => [r.id, r]));
  for (const l of local) {
    const r = byId.get(l.id);
    if (!r) byId.set(l.id, l);
    else if (table !== 'model_predictions' && toMs(l.updated_at) > toMs(r.updated_at)) byId.set(l.id, l);
  }
  return [...byId.values()];
}

function friendly(data, status) {
  const code = data?.error_code || data?.code || data?.error;
  const map = {
    invalid_credentials: 'Email or password is incorrect.',
    user_already_exists: 'An account with this email already exists.',
    weak_password: 'Choose a longer password (at least 8 characters).',
    email_not_confirmed: 'Please confirm your email first.',
  };
  return map[code] || data?.msg || data?.message || data?.error_description || `Request failed (${status}).`;
}
