// Device storage (localStorage). Local-first: everything works without an account.
// v1 ('sleep-advisor:v1', one row per night) is migrated once to v2 events; the v1 copy is
// left untouched as a backup.
import { emptyState, migrateV1, SCHEMA_VERSION } from '../core/repo.js';
import { deviceTimeZone } from '../core/time.js';

export const KEY = 'sleep-advisor:v2';
const V1 = 'sleep-advisor:v1';

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function load() {
  const v2 = read(KEY);
  if (v2?.schema_version === SCHEMA_VERSION) return v2;
  const v1 = read(V1);
  if (v1 && (v1.entries?.length || v1.profile?.onboarded)) {
    const migrated = migrateV1(v1, { tz: deviceTimeZone() });
    save(migrated);
    return migrated;
  }
  return emptyState(Date.now(), deviceTimeZone());
}

export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

/** Remove every local copy (v2 and the v1 backup). */
export function wipe() {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(V1);
    localStorage.removeItem('sleep-advisor:session');
  } catch { /* storage blocked */ }
}
