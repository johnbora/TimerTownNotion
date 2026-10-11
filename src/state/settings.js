// Environment settings: everything on the Environment tab. Persisted separately
// from the ledger under its own key, and safe when storage is blocked.

export const SETTINGS_KEY = 'watch-town-settings-v1';

export const DEFAULTS = Object.freeze({
  timeOfNight: 0.5,   // 0 dusk · 0.5 midnight · 1 pre-dawn
  fog: 0.35,          // 0–1
  lampBrightness: 1,  // 0.2–2, scales the maximum lamp output
  lampWarmth: 3000,   // kelvin, 2200–5000; 3000 K is the house #ffd9a0
  lampMode: 'video',  // 'video' | 'day'
  bulbSpeed: 1,       // marquee chase timeScale, 0–3
  bloom: 0.9,         // UnrealBloomPass.strength, 0–2.5
  lineWeight: 1,      // outline width in CSS px; 1 = hairline LineBasicMaterial
  weather: 'clear',   // 'clear' | 'rain' | 'snow' | 'leaves'
  weatherIntensity: 0.5,
  autoOrbit: 0,       // OrbitControls.autoRotateSpeed; 0 = off
});

const RANGES = {
  timeOfNight: [0, 1], fog: [0, 1], lampBrightness: [0.2, 2], lampWarmth: [2200, 5000],
  bulbSpeed: [0, 3], bloom: [0, 2.5], lineWeight: [1, 4], weatherIntensity: [0.1, 1], autoOrbit: [0, 3],
};
const CHOICES = { lampMode: ['video', 'day'], weather: ['clear', 'rain', 'snow', 'leaves'] };

function clean(key, value) {
  if (RANGES[key]) {
    const n = Number(value);
    if (!Number.isFinite(n)) return DEFAULTS[key];
    return Math.min(RANGES[key][1], Math.max(RANGES[key][0], n));
  }
  if (CHOICES[key]) return CHOICES[key].includes(value) ? value : DEFAULTS[key];
  return DEFAULTS[key];
}

function load() {
  const out = { ...DEFAULTS };
  try {
    const raw = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) || 'null');
    if (raw && typeof raw === 'object') for (const k of Object.keys(DEFAULTS)) if (k in raw) out[k] = clean(k, raw[k]);
  } catch {
    /* storage blocked or corrupt: defaults */
  }
  return out;
}

function save(values) {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(values));
  } catch {
    /* keep working in memory */
  }
}

const listeners = [];
const values = load();

export const settings = {
  values,
  get(key) {
    return values[key];
  },
  /** Set one value. Listeners get (key, value, opts); opts.instant skips easing. */
  set(key, value, opts = {}) {
    if (!(key in DEFAULTS)) return;
    const v = clean(key, value);
    if (values[key] === v && !opts.force) return;
    values[key] = v;
    save(values);
    listeners.forEach((fn) => fn(key, v, opts));
  },
  reset() {
    for (const k of Object.keys(DEFAULTS)) this.set(k, DEFAULTS[k], { reset: true });
  },
  on(fn) {
    listeners.push(fn);
  },
  /** Replay every value to listeners (first paint). */
  applyAll(opts = { instant: true }) {
    for (const k of Object.keys(DEFAULTS)) listeners.forEach((fn) => fn(k, values[k], opts));
  },
  range: (key) => RANGES[key],
};

// ---- motion preference --------------------------------------------------

const motionQuery = (() => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)');
  } catch {
    return null;
  }
})();

export const reducedMotion = () => !!motionQuery?.matches;
export function onMotionChange(fn) {
  motionQuery?.addEventListener?.('change', () => fn(reducedMotion()));
}

/** Phones and other coarse-pointer devices get about half the particle load. */
export const isLowPower = () => {
  try {
    return window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 760;
  } catch {
    return false;
  }
};

/** Lamp warmth in kelvin → color. 3000 K lands exactly on the house lamp color #ffd9a0. */
const WARMTH_STOPS = [
  [2200, [0xff, 0xa8, 0x5c]],
  [2600, [0xff, 0xc0, 0x7c]],
  [3000, [0xff, 0xd9, 0xa0]],
  [3800, [0xff, 0xe8, 0xc8]],
  [5000, [0xf2, 0xf0, 0xf4]],
];
export function warmthColor(k) {
  const kk = Math.min(5000, Math.max(2200, k));
  for (let i = 1; i < WARMTH_STOPS.length; i++) {
    const [k1, c1] = WARMTH_STOPS[i];
    const [k0, c0] = WARMTH_STOPS[i - 1];
    if (kk <= k1) {
      const t = (kk - k0) / (k1 - k0);
      const c = c0.map((v, j) => Math.round(v + (c1[j] - v) * t));
      return (c[0] << 16) | (c[1] << 8) | c[2];
    }
  }
  return 0xf2f0f4;
}
