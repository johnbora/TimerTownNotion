// Time and date formatting shared by the panel, the marquee and the characters.
// All times are whole seconds.

const MINUS = '−';

/** Split seconds into whole hours, minutes and seconds. */
export function hms(sec) {
  const s = Math.max(0, Math.round(Math.abs(sec)));
  return { h: Math.floor(s / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

/** Join hours, minutes and seconds back into seconds. Blank fields count as 0. */
export function toSeconds(h, m, s) {
  const n = (v) => {
    const x = parseInt(String(v ?? '').trim(), 10);
    return Number.isFinite(x) && x > 0 ? x : 0;
  };
  return n(h) * 3600 + n(m) * 60 + n(s);
}

const pad = (n) => String(n).padStart(2, '0');

/** 4545 → "1:15:45". Negative values get a typographic minus. */
export function clock(sec) {
  const { h, m, s } = hms(sec);
  return `${sec < 0 ? MINUS : ''}${h}:${pad(m)}:${pad(s)}`;
}

/** 5110 → "1 h 25 min 10 s". Zero parts are dropped; 0 → "0 s". */
export function words(sec) {
  const { h, m, s } = hms(sec);
  const parts = [];
  if (h) parts.push(`${h} h`);
  if (m) parts.push(`${m} min`);
  if (s || !parts.length) parts.push(`${s} s`);
  return parts.join(' ');
}

/** Signed deduction label for the speech bubble: 900 → "−0:15:00". */
export function minusClock(sec) {
  return MINUS + clock(Math.abs(sec));
}

// ---- dates -------------------------------------------------------------

/** Local calendar date as YYYY-MM-DD. */
export function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const todayKey = () => dateKey(new Date());

/** Parse a YYYY-MM-DD key as a local date (noon, so DST shifts never change the day). */
export function parseKey(key) {
  const [y, m, d] = String(key).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12);
}

export function isDateKey(key) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(key))) return false;
  return dateKey(parseKey(key)) === key;
}

export function addDays(key, n) {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

/** "Saturday, October 10" */
export function longDate(key) {
  return parseKey(key).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

/** "Oct 10" */
export function shortDate(key) {
  return parseKey(key).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
