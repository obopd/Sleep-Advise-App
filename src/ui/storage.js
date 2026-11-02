// Local-only persistence. Sleep and health data never leave the device unless the user
// exports it themselves.

const KEY = 'sleep-advisor:v1';

const EMPTY = () => ({ profile: {}, entries: [], measured: [], lightLog: {}, settings: { theme: 'auto' } });

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY();
    const data = JSON.parse(raw);
    return { ...EMPTY(), ...data };
  } catch {
    return EMPTY();
  }
}

export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export const emptyState = EMPTY;

export function upsertEntry(state, entry) {
  const entries = state.entries.filter((e) => e.date !== entry.date);
  entries.push(entry);
  entries.sort((a, b) => a.date.localeCompare(b.date));
  return { ...state, entries };
}

export function removeEntry(state, date) {
  return { ...state, entries: state.entries.filter((e) => e.date !== date) };
}

export function exportJson(state) {
  return JSON.stringify({ app: 'sleep-advisor', version: 1, exportedAt: new Date().toISOString(), ...state }, null, 2);
}

export function importJson(text) {
  const data = JSON.parse(text);
  if (!data || !Array.isArray(data.entries)) throw new Error('Not a Sleep Advisor export file');
  return { profile: data.profile || {}, entries: data.entries, measured: data.measured || [], lightLog: data.lightLog || {}, settings: data.settings || { theme: 'auto' } };
}
