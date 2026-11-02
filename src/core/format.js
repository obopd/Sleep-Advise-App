// Plain formatting used inside engine text (UI re-formats clock times to the phone's 12/24 h setting).
export function fmtMin(min) {
  if (min == null || Number.isNaN(min)) return '–';
  const a = Math.round(Math.abs(min));
  const h = Math.floor(a / 60);
  const m = a % 60;
  const s = h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
  return min < 0 ? `−${s}` : s;
}

export function fmtClock(clockMin) {
  if (clockMin == null) return '–';
  const m = ((Math.round(clockMin) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
