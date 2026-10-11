// The ledger: same data model and storage key as the 2D "Marquee Watch Ledger".
//
//   { days: { "YYYY-MM-DD": { example?: true, videos: [{ id, title, total, entries: [{ sec, note }] }] } },
//     sel:  { "YYYY-MM-DD": videoId } }
//
// All times are whole seconds. Every action saves, then emits 'change' exactly once.
// The date being viewed is session state and is not persisted.

import { todayKey, isDateKey } from '../ui/format.js';

export const STORAGE_KEY = 'watch-time-budget-v3';

// ---- persistence (storage may be blocked inside an embed) ---------------

function readStorage() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeStorage(data) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

const wholeSec = (v) => Math.max(0, Math.round(Number(v) || 0));

export const newId = () =>
  (Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 6)).padEnd(8, '0');

/** Accept whatever is in storage, keep only well-formed parts. */
function sanitize(raw) {
  const out = { days: {}, sel: {} };
  if (!raw || typeof raw !== 'object') return out;
  for (const [key, day] of Object.entries(raw.days || {})) {
    if (!isDateKey(key) || !day || !Array.isArray(day.videos)) continue;
    const videos = day.videos
      .filter((v) => v && typeof v === 'object')
      .map((v) => ({
        id: String(v.id || newId()),
        title: String(v.title ?? 'Untitled video'),
        total: wholeSec(v.total),
        entries: (Array.isArray(v.entries) ? v.entries : [])
          .filter((e) => e && wholeSec(e.sec) > 0)
          .map((e) => ({ sec: wholeSec(e.sec), note: String(e.note ?? '') })),
      }));
    out.days[key] = day.example ? { example: true, videos } : { videos };
  }
  for (const [key, id] of Object.entries(raw.sel || {})) {
    if (isDateKey(key) && typeof id === 'string') out.sel[key] = id;
  }
  return out;
}

function seed(key) {
  const ids = [newId(), newId(), newId()];
  return {
    days: {
      [key]: {
        example: true,
        videos: [
          {
            id: ids[0], title: 'Module 3 lecture', total: 7200,
            entries: [{ sec: 900, note: 'Intro and course overview' }, { sec: 1215, note: 'Core concepts, part 1' }],
          },
          {
            id: ids[1], title: 'Case study walkthrough', total: 2730,
            entries: [{ sec: 1530, note: 'Setting up the case' }, { sec: 1200, note: 'Findings and wrap-up' }],
          },
          { id: ids[2], title: 'Live Q&A recording', total: 1845, entries: [] },
        ],
      },
    },
    sel: { [key]: ids[0] },
  };
}

// ---- derived values ------------------------------------------------------

export function deriveVideo(v) {
  if (!v) return null;
  const watched = v.entries.reduce((a, e) => a + e.sec, 0);
  const left = Math.max(0, v.total - watched);
  const progress = v.total > 0 ? Math.min(1, watched / v.total) : 0;
  return { ...v, watched, left, progress, done: v.total > 0 && progress >= 1 };
}

export function dayOf(state, key = state.date) {
  return state.days[key] || { videos: [] };
}

/** The selected video on the viewed date, with derived values (or null). */
export function selected(state, key = state.date) {
  const day = dayOf(state, key);
  const v = day.videos.find((x) => x.id === state.sel[key]) || day.videos[0];
  return deriveVideo(v);
}

/** Day-level totals: watched is summed per video and capped at each runtime. */
export function dayTotals(state, key = state.date) {
  const videos = dayOf(state, key).videos.map(deriveVideo);
  const total = videos.reduce((a, v) => a + v.total, 0);
  const watched = videos.reduce((a, v) => a + Math.min(v.watched, v.total), 0);
  const doneCount = videos.filter((v) => v.done).length;
  return {
    key,
    videos,
    count: videos.length,
    total,
    watched,
    left: Math.max(0, total - watched),
    progress: total > 0 ? Math.min(1, watched / total) : 0,
    doneCount,
    allDone: videos.length > 0 && doneCount === videos.length,
  };
}

// ---- the store -------------------------------------------------------------

function createStore() {
  const listeners = new Map();
  const loaded = readStorage();
  const today = todayKey();
  const data = loaded ? sanitize(loaded) : seed(today);
  const state = { days: data.days, sel: data.sel, date: today };
  let persisted = writeStorage({ days: state.days, sel: state.sel });

  const emit = (type, ...args) => (listeners.get(type) || []).forEach((fn) => fn(...args));

  function commit(action) {
    // Days left with no videos are dropped so the saved-day chips stay meaningful.
    for (const [key, day] of Object.entries(state.days)) {
      if (!day.videos.length) {
        delete state.days[key];
        delete state.sel[key];
      }
    }
    persisted = writeStorage({ days: state.days, sel: state.sel });
    emit('change', state, action);
    return action;
  }

  const day = () => (state.days[state.date] ||= { videos: [] });
  const realEdit = () => {
    if (state.days[state.date]) delete state.days[state.date].example;
  };
  const selVideo = () => {
    const d = state.days[state.date];
    if (!d) return null;
    return d.videos.find((v) => v.id === state.sel[state.date]) || d.videos[0] || null;
  };

  return {
    state,
    get persisted() {
      return persisted;
    },
    on(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
      return () => listeners.set(type, listeners.get(type).filter((f) => f !== fn));
    },
    /** Emit without changing anything (first paint). */
    refresh() {
      emit('change', state, { type: 'init' });
    },

    addVideo({ title, total }) {
      const v = { id: newId(), title: String(title || '').trim() || 'Untitled video', total: wholeSec(total), entries: [] };
      day().videos.push(v);
      state.sel[state.date] = v.id;
      realEdit();
      return commit({ type: 'addVideo', id: v.id });
    },

    editVideo(id, { title, total }) {
      const v = day().videos.find((x) => x.id === id);
      if (!v) return null;
      if (title !== undefined) v.title = String(title).trim() || v.title;
      if (total !== undefined) v.total = wholeSec(total);
      realEdit();
      return commit({ type: 'editVideo', id });
    },

    removeVideo(id) {
      const d = day();
      const i = d.videos.findIndex((x) => x.id === id);
      if (i < 0) return null;
      const [gone] = d.videos.splice(i, 1);
      if (state.sel[state.date] === id) {
        const next = d.videos[i] || d.videos[i - 1];
        if (next) state.sel[state.date] = next.id;
        else delete state.sel[state.date];
      }
      realEdit();
      return commit({ type: 'removeVideo', id, title: gone.title });
    },

    selectVideo(id) {
      if (!day().videos.some((x) => x.id === id)) return null;
      state.sel[state.date] = id;
      return commit({ type: 'selectVideo', id });
    },

    /** Log a watched section on the selected video. Clamped to the time left. */
    deduct(sec, note = '') {
      const v = selVideo();
      if (!v) return null;
      const d = deriveVideo(v);
      const amount = Math.min(wholeSec(sec), d.left);
      if (amount <= 0) return null;
      v.entries.push({ sec: amount, note: String(note || '').trim() });
      realEdit();
      return commit({ type: 'deduct', id: v.id, sec: amount, requested: wholeSec(sec) });
    },

    removeEntry(i) {
      const v = selVideo();
      if (!v || !v.entries[i]) return null;
      const [e] = v.entries.splice(i, 1);
      realEdit();
      return commit({ type: 'removeEntry', id: v.id, sec: e.sec });
    },

    /** Take back the last section logged on the selected video. */
    undo() {
      const v = selVideo();
      if (!v || !v.entries.length) return null;
      const e = v.entries.pop();
      realEdit();
      return commit({ type: 'undo', id: v.id, sec: e.sec });
    },

    goToDate(key) {
      if (!isDateKey(key)) return null;
      state.date = key;
      return commit({ type: 'goToDate', key });
    },

    clearExample() {
      const d = state.days[state.date];
      if (!d || !d.example) return null;
      delete state.days[state.date];
      delete state.sel[state.date];
      return commit({ type: 'clearExample' });
    },

    /** Another tab wrote the ledger: adopt its data and repaint. */
    reload() {
      const fresh = sanitize(readStorage());
      state.days = fresh.days;
      state.sel = fresh.sel;
      emit('change', state, { type: 'sync' });
    },
  };
}

export const store = createStore();

try {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) store.reload();
  });
} catch {
  /* no storage events in this context */
}
