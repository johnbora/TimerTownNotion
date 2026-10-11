// The side panel: the ledger (mirrors the 2D widget) and the environment controls.
// Docked on the right on desktop; a draggable bottom sheet under 760px.

import { gsap } from 'gsap';
import { clock, words, longDate, shortDate, toSeconds, hms, plural, addDays, todayKey } from './format.js';
import { selected, dayTotals } from '../state/store.js';
import { reducedMotion } from '../state/settings.js';

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const pct = (v) => `${Math.round(v * 100)}%`;

/** 0 → 7:00 pm (dusk), 0.5 → midnight, 1 → 5:00 am (pre-dawn). */
export function nightLabel(t) {
  const mins = Math.round((19 * 60 + t * 600) / 5) * 5;
  const h24 = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  if (h24 === 0 && m === 0) return 'Midnight';
  const h12 = h24 % 12 || 12;
  const time = `${h12}:${String(m).padStart(2, '0')} ${h24 >= 12 ? 'pm' : 'am'}`;
  if (t < 0.12) return `${time} · dusk`;
  if (t > 0.88) return `${time} · pre-dawn`;
  return time;
}

const SLIDERS = {
  timeOfNight: { label: 'Time of night', min: 0, max: 1, step: 0.01, fmt: nightLabel },
  fog: { label: 'Fog', min: 0, max: 1, step: 0.01, fmt: (v) => (v === 0 ? 'None' : pct(v)) },
  weatherIntensity: { label: 'Weather intensity', min: 0.1, max: 1, step: 0.05, fmt: pct },
  lampBrightness: { label: 'Lamp brightness', min: 0.2, max: 2, step: 0.05, fmt: pct },
  lampWarmth: { label: 'Lamp warmth', min: 2200, max: 5000, step: 50, fmt: (v) => `${v} K` },
  bulbSpeed: { label: 'Marquee bulb speed', min: 0, max: 3, step: 0.1, fmt: (v) => (v === 0 ? 'Still' : `${v.toFixed(1)}×`) },
  bloom: { label: 'Bloom', min: 0, max: 2.5, step: 0.05, fmt: (v) => (v === 0 ? 'Off' : v.toFixed(2)) },
  lineWeight: { label: 'Line weight', min: 1, max: 4, step: 0.25, fmt: (v) => (v === 1 ? 'Hairline' : `${v} px`) },
  autoOrbit: { label: 'Auto-orbit', min: 0, max: 3, step: 0.1, fmt: (v) => (v === 0 ? 'Off' : `${v.toFixed(1)}`) },
};

const SEGMENTS = {
  lampMode: { label: 'Lamp mode', options: [['video', 'Video'], ['day', 'Day']] },
  weather: { label: 'Weather', options: [['clear', 'Clear'], ['rain', 'Rain'], ['snow', 'Snow'], ['leaves', 'Leaves']] },
};

const CAMERAS = [['street', 'Street'], ['marquee', 'Marquee'], ['bird', 'Bird’s-eye'], ['follow', 'Follow Bartholomew']];

const hmsFields = (prefix, legend) => `
  <fieldset class="hms">
    <legend class="visually-hidden">${legend}</legend>
    <label><span>Hours</span><input class="text-in" name="h" id="${prefix}-h" inputmode="numeric" autocomplete="off" placeholder="0" data-max="99" aria-describedby="${prefix}-hint"></label>
    <label><span>Minutes</span><input class="text-in" name="m" id="${prefix}-m" inputmode="numeric" autocomplete="off" placeholder="00" data-max="59" aria-describedby="${prefix}-hint"></label>
    <label><span>Seconds</span><input class="text-in" name="s" id="${prefix}-s" inputmode="numeric" autocomplete="off" placeholder="00" data-max="59" aria-describedby="${prefix}-hint"></label>
  </fieldset>
  <span class="visually-hidden" id="${prefix}-hint">Up and down arrow keys step the value; hold Shift for steps of ten.</span>`;

function sliderHTML(key, value) {
  const d = SLIDERS[key];
  const fill = ((value - d.min) / (d.max - d.min)) * 100;
  return `<div class="ctl">
    <div class="ctl-head"><label for="s-${key}">${d.label}</label><output id="o-${key}" for="s-${key}">${esc(d.fmt(value))}</output></div>
    <input type="range" id="s-${key}" data-setting="${key}" min="${d.min}" max="${d.max}" step="${d.step}" value="${value}"
      aria-valuetext="${esc(d.fmt(value))}" style="--fill:${fill}%">
  </div>`;
}

function segHTML(key, value) {
  const d = SEGMENTS[key];
  return `<div class="ctl">
    <div class="ctl-head"><span class="ctl-name" id="l-${key}">${d.label}</span></div>
    <div class="seg" role="radiogroup" aria-labelledby="l-${key}">
      ${d.options.map(([v, t]) => `<label><input type="radio" name="${key}" value="${v}" data-setting="${key}" ${v === value ? 'checked' : ''}><span>${t}</span></label>`).join('')}
    </div>
  </div>`;
}

function template(s) {
  return `
  <button class="sheet-handle" type="button" aria-label="Resize panel" data-action="sheet-cycle"></button>
  <header class="panel-head">
    <h1 class="wordmark">Watch Town</h1>
    <p class="tagline">a watch-time ledger</p>
    <p class="peek-status" data-region="peek"></p>
    <button class="icon-btn" type="button" data-action="collapse" aria-label="Collapse panel" aria-expanded="true">
      <span aria-hidden="true">›</span>
    </button>
  </header>
  <div class="tabs" role="tablist" aria-label="Panel sections">
    <button class="tab" role="tab" id="tab-ledger" aria-selected="true" aria-controls="pane-ledger" data-tab="ledger">Ledger</button>
    <button class="tab" role="tab" id="tab-env" aria-selected="false" aria-controls="pane-env" data-tab="env" tabindex="-1">Environment</button>
  </div>
  <div class="panel-scroll">
    <div class="pane" id="pane-ledger" role="tabpanel" aria-labelledby="tab-ledger">
      <section aria-label="Date">
        <div class="datebar">
          <button class="nav" type="button" data-action="prev-day" aria-label="Previous day">‹ Prev</button>
          <button class="date-btn" type="button" data-action="pick-date" data-region="date"></button>
          <button class="nav" type="button" data-action="next-day" aria-label="Next day">Next ›</button>
          <input class="date-input" type="date" aria-label="Choose a date" tabindex="-1">
        </div>
        <div class="chips" data-region="chips" role="group" aria-label="Saved days"></div>
        <div data-region="example"></div>
      </section>

      <section aria-labelledby="h-program">
        <h2 class="label" id="h-program">Program</h2>
        <div class="program" data-region="program"></div>
        <form class="video-form" hidden novalidate aria-labelledby="h-video-form">
          <h3 class="label" id="h-video-form">Add a video</h3>
          <label class="field"><span>Title</span><input class="text-in" name="title" maxlength="120" autocomplete="off" placeholder="Module 4 lecture"></label>
          ${hmsFields('vf', 'Runtime')}
          <p class="runtime-line" data-runtime aria-live="polite"></p>
          <div class="row">
            <button class="btn primary" type="submit" data-submit>Add to program</button>
            <button class="link" type="button" data-action="cancel-video">Cancel</button>
          </div>
          <p class="form-error" role="alert"></p>
        </form>
      </section>

      <section aria-labelledby="h-deduct">
        <h2 class="label" id="h-deduct">Deduct a watched section</h2>
        <p class="deduct-for" data-region="deduct-for"></p>
        <form class="deduct-form" novalidate>
          ${hmsFields('dd', 'Length of the section')}
          <label class="field"><span>Section note</span><input class="text-in" name="note" maxlength="200" autocomplete="off" placeholder="What did this part cover?"></label>
          <div class="row">
            <button class="btn primary" type="submit">Deduct</button>
            <div class="quick" role="group" aria-label="Quick deduct, in minutes">
              ${[5, 10, 15, 30].map((m) => `<button type="button" class="btn small ghost" data-quick="${m * 60}" aria-label="Deduct ${m} minutes">−${m}</button>`).join('')}
            </div>
          </div>
          <p class="form-error" role="alert"></p>
        </form>
      </section>

      <section aria-labelledby="h-log">
        <h2 class="label" id="h-log">Sections watched</h2>
        <div data-region="log"></div>
      </section>

      <section aria-label="Summary">
        <div data-region="summary"></div>
        <div data-preview-encore></div>
      </section>
    </div>

    <div class="pane" id="pane-env" role="tabpanel" aria-labelledby="tab-env" hidden>
      <section aria-labelledby="h-night">
        <h2 class="label" id="h-night">The night</h2>
        ${sliderHTML('timeOfNight', s.timeOfNight)}
        ${sliderHTML('fog', s.fog)}
        ${segHTML('weather', s.weather)}
        ${sliderHTML('weatherIntensity', s.weatherIntensity)}
      </section>
      <section aria-labelledby="h-lamps">
        <h2 class="label" id="h-lamps">The lamps</h2>
        ${segHTML('lampMode', s.lampMode)}
        <p class="env-note" id="lampmode-note">Video follows the selected video; Day follows everything on the date.</p>
        ${sliderHTML('lampBrightness', s.lampBrightness)}
        ${sliderHTML('lampWarmth', s.lampWarmth)}
        <button class="btn ghost" type="button" data-scene data-action="lights-test">Lights test</button>
      </section>
      <section aria-labelledby="h-house">
        <h2 class="label" id="h-house">The picture house</h2>
        ${sliderHTML('bulbSpeed', s.bulbSpeed)}
        ${sliderHTML('bloom', s.bloom)}
        ${sliderHTML('lineWeight', s.lineWeight)}
      </section>
      <section aria-labelledby="h-camera">
        <h2 class="label" id="h-camera">The camera</h2>
        <div class="btn-grid" role="group" aria-label="Camera position" style="margin-bottom:14px">
          ${CAMERAS.map(([k, t]) => `<button class="btn ghost small" type="button" data-scene data-camera="${k}" aria-pressed="${k === 'street'}">${t}</button>`).join('')}
        </div>
        ${sliderHTML('autoOrbit', s.autoOrbit)}
        <p class="env-note" data-region="orbit-note"></p>
        <button class="btn ghost" type="button" data-scene data-action="screenshot">Screenshot</button>
      </section>
      <section aria-labelledby="h-preview">
        <h2 class="label" id="h-preview">Preview celebration</h2>
        <div class="row" role="group" aria-labelledby="h-preview">
          <button class="btn ghost" type="button" data-scene data-action="preview-video">Video</button>
          <button class="btn ghost" type="button" data-scene data-action="preview-day">Day</button>
        </div>
        <p class="env-note">Plays the sequence without changing your ledger.</p>
      </section>
      <section>
        <button class="link" type="button" data-action="reset-env">Reset environment</button>
        <p class="env-note" data-region="scene-note"></p>
      </section>
    </div>
  </div>`;
}

export function createPanel({ root, reopen, live, store, settings }) {
  const hooks = {};
  const layoutListeners = [];
  const mobileQuery = window.matchMedia('(max-width: 759px)');
  let isMobile = mobileQuery.matches;
  let formMode = null; // 'add' | 'edit' | null
  let editId = null;
  let confirmRemove = false;
  let encoreHeldFor = null; // date key whose Encore card waits for the celebration
  let collapsed = false;
  let sceneAvailable = true;
  const drawnProgress = new Map(); // video id → progress last drawn on its card

  root.innerHTML = template(settings.values);
  const $ = (sel) => root.querySelector(sel);
  const regions = {};
  root.querySelectorAll('[data-region]').forEach((el) => (regions[el.dataset.region] = el));
  const videoForm = $('.video-form');
  const deductForm = $('.deduct-form');
  const dateInput = $('.date-input');
  const scroller = $('.panel-scroll');

  // ---- region rendering with focus kept in place ------------------------

  function setRegion(name, html, fallbackFocus) {
    const el = regions[name];
    if (el._html === html) return false;
    const active = document.activeElement;
    const key = active && el.contains(active) ? active.dataset.focus || '' : null;
    el.innerHTML = html;
    el._html = html;
    if (key !== null) {
      const target = (key && el.querySelector(`[data-focus="${CSS.escape(key)}"]`)) || fallbackFocus?.();
      target?.focus({ preventScroll: true });
    }
    return true;
  }

  const ago = (key) => {
    const t = todayKey();
    if (key === t) return 'tonight';
    if (key === addDays(t, -1)) return 'last night';
    if (key === addDays(t, 1)) return 'tomorrow night';
    return key.slice(0, 4);
  };

  function renderDate(state) {
    const el = regions.date;
    el.innerHTML = `${esc(longDate(state.date))}<small>${ago(state.date)}</small>`;
    el.setAttribute('aria-label', `${longDate(state.date)}. Choose another date`);
  }

  function renderChips(state) {
    const keys = new Set(Object.keys(state.days));
    keys.add(state.date);
    const html =
      [...keys]
        .sort()
        .map((k) => {
          const n = state.days[k]?.videos.length || 0;
          const cur = k === state.date;
          return `<button class="chip" type="button" data-action="go-date" data-key="${k}" data-focus="chip-${k}" ${cur ? 'aria-current="date"' : ''}
            aria-label="${esc(longDate(k))}, ${n ? plural(n, 'video') : 'no videos'}"><b>${esc(shortDate(k))}</b><span>${n ? plural(n, 'video') : 'empty'}</span></button>`;
        })
        .join('') + `<button class="chip add" type="button" data-action="add-date" data-focus="chip-add">+ Add date</button>`;
    if (setRegion('chips', html)) {
      const cur = regions.chips.querySelector('[aria-current]');
      if (cur) regions.chips.scrollLeft = Math.max(0, cur.offsetLeft - regions.chips.clientWidth / 2 + cur.offsetWidth / 2);
    }
  }

  function renderExample(state) {
    const ex = state.days[state.date]?.example;
    setRegion(
      'example',
      ex
        ? `<p class="example-note">These are example videos. <button class="link" type="button" data-action="clear-example" data-focus="clear-example">Clear and start my day</button></p>`
        : '',
      () => regions.program.querySelector('.card'),
    );
  }

  function renderProgram(state, sel, day) {
    const cards = day.videos.map((v) => {
      const isSel = sel && v.id === sel.id;
      const cls = ['card', isSel && 'is-selected', v.done && 'is-done'].filter(Boolean).join(' ');
      const status = v.done ? 'finished' : `${words(v.left)} left of ${words(v.total)}`;
      const body = v.done
        ? `<span class="card-bravo">Bravo</span><span class="card-meta">${clock(v.total)} · watched</span>`
        : `<span class="card-left"><em>${clock(v.left)}</em> left</span><span class="card-meta">of ${clock(v.total)} · ${Math.floor(v.progress * 100)}%</span>`;
      return `<button class="${cls}" type="button" data-action="select" data-id="${esc(v.id)}" data-focus="card-${esc(v.id)}"
          aria-pressed="${isSel}" aria-label="${esc(v.title)}, ${status}">
        <svg class="card-border" aria-hidden="true" focusable="false">
          <rect class="track" x="0" y="0" width="100%" height="100%" rx="8" pathLength="100"/>
          <rect class="prog" data-prog="${v.progress}" x="0" y="0" width="100%" height="100%" rx="8" pathLength="100"
            stroke-dasharray="${(v.progress * 100).toFixed(2)} 100" ${v.progress > 0 ? '' : 'opacity="0"'}/>
          <rect class="run" x="0" y="0" width="100%" height="100%" rx="8" pathLength="100"/>
        </svg>
        <span class="card-title">${esc(v.title)}</span>
        ${body}
      </button>`;
    });
    const empty = day.videos.length
      ? ''
      : `<p class="empty-day">Nothing on the program for ${esc(longDate(state.date))}. Add a video to begin.</p>`;
    const html =
      empty +
      cards.join('') +
      `<button class="card add" type="button" data-action="add-video" data-focus="add-video" aria-expanded="${formMode === 'add'}"><span class="plus" aria-hidden="true">+</span>Add video</button>`;
    setRegion('program', html, () => regions.program.querySelector('.card'));

    // Draw each progress border from where it was to where it is now.
    regions.program.querySelectorAll('rect.prog').forEach((rect) => {
      const id = rect.closest('.card').dataset.id;
      const now = Number(rect.dataset.prog);
      const was = drawnProgress.has(id) ? drawnProgress.get(id) : now;
      drawnProgress.set(id, now);
      if (was === now || reducedMotion()) return;
      rect.removeAttribute('opacity');
      gsap.fromTo(
        rect,
        { attr: { 'stroke-dasharray': `${(was * 100).toFixed(2)} 100` } },
        {
          attr: { 'stroke-dasharray': `${(now * 100).toFixed(2)} 100` },
          duration: 0.9 + Math.abs(now - was) * 1.2,
          ease: 'power2.inOut',
          onComplete: () => now <= 0 && rect.setAttribute('opacity', '0'),
        },
      );
    });
  }

  function renderDeduct(sel) {
    let html;
    if (!sel) html = 'Add a video to the program to start deducting.';
    else if (sel.done) html = `<em>${esc(sel.title)}</em> is finished — nothing left to deduct.`;
    else html = `From <em>${esc(sel.title)}</em> · <em>${clock(sel.left)}</em> left`;
    setRegion('deduct-for', html);
    const off = !sel || sel.done;
    deductForm.querySelectorAll('input, button').forEach((el) => (el.disabled = off));
  }

  function renderLog(sel) {
    if (!sel) {
      setRegion('log', `<p class="note-line">Pick or add a video to see its sections.</p>`);
      return;
    }
    let at = 0;
    const items = sel.entries.map((e, i) => {
      const from = at;
      at += e.sec;
      return `<li>
        <span class="range">${clock(from)} → ${clock(at)}</span>
        <span class="len">${words(e.sec)}</span>
        <span class="note">${e.note ? esc(e.note) : '<span aria-hidden="true">—</span><span class="visually-hidden">No note</span>'}</span>
        <button class="x" type="button" data-action="remove-entry" data-index="${i}" data-focus="x-${i}"
          aria-label="Remove section ${i + 1}, ${clock(from)} to ${clock(at)}">×</button>
      </li>`;
    });
    const list = items.length
      ? `<ol class="sections">${items.join('')}</ol>`
      : `<p class="note-line">Nothing watched yet on <em>${esc(sel.title)}</em>.</p>`;
    const confirm = confirmRemove
      ? `<div class="confirm" role="group" aria-labelledby="confirm-q">
          <p id="confirm-q">Remove <em>${esc(sel.title)}</em>${sel.entries.length ? ` and its ${plural(sel.entries.length, 'section')}` : ''}? This can’t be undone.</p>
          <div class="row">
            <button class="btn danger small" type="button" data-action="confirm-remove" data-focus="confirm-remove">Remove video</button>
            <button class="link" type="button" data-action="cancel-remove" data-focus="cancel-remove">Keep it</button>
          </div>
        </div>`
      : '';
    setRegion(
      'log',
      `${list}
      <div class="log-links">
        <button class="link" type="button" data-action="undo" data-focus="undo" ${sel.entries.length ? '' : 'disabled'}>Undo last</button>
        <button class="link" type="button" data-action="edit-video" data-focus="edit-video">Edit video</button>
        <button class="link danger" type="button" data-action="remove-video" data-focus="remove-video" aria-expanded="${confirmRemove}">Remove video</button>
      </div>${confirm}`,
      () => regions.log.querySelector('.x, [data-action="undo"]:not([disabled]), [data-action="edit-video"]'),
    );
  }

  function encoreHTML(state, day, { hidden = false, preview = false } = {}) {
    return `<div class="encore" role="status" ${hidden ? 'style="opacity:0;transform:translateX(48px)"' : ''}>
      <p class="encore-script">Encore</p>
      <p>Every video on ${esc(longDate(state.date))} is watched — ${plural(day.count, 'video')}, ${clock(day.total)} in all.</p>
      ${preview ? '<span class="preview-tag">A preview — your ledger is unchanged</span>' : ''}
    </div>`;
  }

  function renderSummary(state, day) {
    const when = state.date === todayKey() ? 'tonight' : `on ${shortDate(state.date)}`;
    let html;
    if (!day.count) {
      html = `<p class="summary-line">No videos on the program ${when}.</p>`;
    } else {
      html = `<p class="summary-line"><em>${clock(day.left)}</em> left ${when}</p>
        <p class="summary-sub">${day.doneCount} of ${plural(day.count, 'video')} complete · ${words(day.watched)} watched of ${clock(day.total)}</p>`;
      if (day.allDone) html += encoreHTML(state, day, { hidden: encoreHeldFor === state.date });
    }
    setRegion('summary', html);
  }

  function renderPeek(sel, day) {
    regions.peek.innerHTML = sel
      ? sel.done
        ? `<em>${esc(sel.title)}</em> · Bravo${day.allDone ? ' · every video watched' : ''}`
        : `<em>${clock(sel.left)}</em> left · ${esc(sel.title)}`
      : 'Nothing on the program';
  }

  function render(state) {
    const sel = selected(state);
    const day = dayTotals(state);
    if (confirmRemove && !sel) confirmRemove = false;
    if (formMode === 'edit' && (!sel || sel.id !== editId)) closeForm(false);
    renderDate(state);
    renderChips(state);
    renderExample(state);
    renderProgram(state, sel, day);
    renderDeduct(sel);
    renderLog(sel);
    renderSummary(state, day);
    renderPeek(sel, day);
  }

  // ---- encore ----------------------------------------------------------------

  function holdEncore(key) {
    encoreHeldFor = key;
  }

  function revealEncore() {
    const key = encoreHeldFor;
    encoreHeldFor = null;
    const card = regions.summary.querySelector('.encore');
    regions.summary._html = null; // the next render should drop the inline hidden style
    if (!card || !key) return;
    if (reducedMotion()) {
      gsap.set(card, { opacity: 1, x: 0, clearProps: 'transform' });
      return;
    }
    gsap.fromTo(card, { opacity: 0, x: 48 }, { opacity: 1, x: 0, duration: 0.9, ease: 'back.out(1.4)', clearProps: 'transform' });
  }

  let previewTimer;
  function previewEncore(state) {
    const slot = $('[data-preview-encore]');
    const day = dayTotals(state);
    if (!day.count) return;
    slot.innerHTML = encoreHTML(state, day, { preview: true });
    const card = slot.firstElementChild;
    if (!reducedMotion()) gsap.fromTo(card, { opacity: 0, x: 48 }, { opacity: 1, x: 0, duration: 0.9, ease: 'back.out(1.4)' });
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      if (reducedMotion()) slot.innerHTML = '';
      else gsap.to(card, { opacity: 0, x: 30, duration: 0.5, onComplete: () => (slot.innerHTML = '') });
    }, 7000);
  }

  // ---- add / edit video form -----------------------------------------------

  function fieldsOf(form) {
    return ['h', 'm', 's'].map((n) => form.elements[n]);
  }

  function updateRuntimeLine() {
    const [h, m, s] = fieldsOf(videoForm).map((el) => el.value);
    const sec = toSeconds(h, m, s);
    videoForm.querySelector('[data-runtime]').innerHTML = sec
      ? `Runtime <em>${clock(sec)}</em> · ${words(sec)}`
      : 'Runtime —';
  }

  function openForm(mode) {
    const state = store.state;
    const sel = selected(state);
    formMode = mode;
    editId = mode === 'edit' ? sel?.id : null;
    const heading = videoForm.querySelector('#h-video-form');
    heading.textContent = mode === 'edit' ? 'Edit video' : 'Add a video';
    videoForm.querySelector('[data-submit]').textContent = mode === 'edit' ? 'Save changes' : 'Add to program';
    videoForm.querySelector('.form-error').textContent = '';
    const [h, m, s] = fieldsOf(videoForm);
    if (mode === 'edit' && sel) {
      const t = hms(sel.total);
      videoForm.elements.title.value = sel.title;
      h.value = t.h || '';
      m.value = t.m ? String(t.m).padStart(2, '0') : '';
      s.value = t.s ? String(t.s).padStart(2, '0') : '';
    } else {
      videoForm.reset();
    }
    updateRuntimeLine();
    videoForm.hidden = false;
    regions.program.querySelector('[data-action="add-video"]')?.setAttribute('aria-expanded', String(mode === 'add'));
    videoForm.elements.title.focus();
    videoForm.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
    if (!reducedMotion()) gsap.fromTo(videoForm, { opacity: 0, y: -8 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' });
  }

  function closeForm(restoreFocus = true) {
    const was = formMode;
    formMode = null;
    editId = null;
    videoForm.hidden = true;
    regions.program.querySelector('[data-action="add-video"]')?.setAttribute('aria-expanded', 'false');
    if (restoreFocus) {
      const target = was === 'edit' ? regions.log.querySelector('[data-action="edit-video"]') : regions.program.querySelector('[data-action="add-video"]');
      target?.focus();
    }
  }

  videoForm.addEventListener('input', (e) => {
    if (e.target.closest('.hms')) updateRuntimeLine();
  });

  videoForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const err = videoForm.querySelector('.form-error');
    const [h, m, s] = fieldsOf(videoForm).map((el) => el.value);
    const total = toSeconds(h, m, s);
    const title = videoForm.elements.title.value.trim();
    if (!total) {
      err.textContent = 'Give the runtime at least one second.';
      fieldsOf(videoForm)[0].focus();
      return;
    }
    if (formMode === 'edit') {
      const sel = selected(store.state);
      if (sel && total < sel.watched) {
        err.textContent = `The runtime can’t be shorter than the ${clock(sel.watched)} already watched.`;
        return;
      }
      store.editVideo(editId, { title, total });
      announce(`Saved. ${words(Math.max(0, total - (sel?.watched || 0)))} left.`);
      closeForm();
    } else {
      const res = store.addVideo({ title, total });
      closeForm(false);
      announce(`Added ${title || 'Untitled video'}, ${words(total)}.`);
      regions.program.querySelector(`[data-id="${CSS.escape(res.id)}"]`)?.focus();
    }
  });

  // ---- deduct form -------------------------------------------------------------

  function afterDeduct(res) {
    const err = deductForm.querySelector('.form-error');
    if (!res) return;
    const state = store.state;
    const sel = selected(state);
    const day = dayTotals(state);
    err.textContent = res.requested > res.sec ? `Only ${clock(res.sec)} was left, so that’s what was logged.` : '';
    if (sel?.done) announce(`${sel.title} is finished. Bravo! ${day.allDone ? 'Every video tonight is watched.' : `${words(day.left)} left on the program.`}`);
    else if (sel) announce(`${words(sel.left)} left`);
  }

  deductForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const err = deductForm.querySelector('.form-error');
    const [h, m, s] = fieldsOf(deductForm).map((el) => el.value);
    const sec = toSeconds(h, m, s);
    if (!sec) {
      err.textContent = 'Enter how long the section was.';
      fieldsOf(deductForm)[1].focus();
      return;
    }
    const res = store.deduct(sec, deductForm.elements.note.value);
    if (res) {
      fieldsOf(deductForm).forEach((el) => (el.value = ''));
      deductForm.elements.note.value = '';
    }
    afterDeduct(res);
  });

  deductForm.addEventListener('click', (e) => {
    const q = e.target.closest('[data-quick]');
    if (!q) return;
    const res = store.deduct(Number(q.dataset.quick), deductForm.elements.note.value);
    if (res) deductForm.elements.note.value = '';
    afterDeduct(res);
  });

  // Arrow keys step H / M / S; fields only take digits.
  root.addEventListener('keydown', (e) => {
    const el = e.target;
    if (!el.closest?.('.hms') || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    const max = Number(el.dataset.max);
    const step = (e.shiftKey ? 10 : 1) * (e.key === 'ArrowUp' ? 1 : -1);
    const next = Math.min(max, Math.max(0, (parseInt(el.value, 10) || 0) + step));
    el.value = el.name === 'h' ? String(next) : String(next).padStart(2, '0');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  root.addEventListener('input', (e) => {
    const el = e.target;
    if (!el.closest?.('.hms')) return;
    const digits = el.value.replace(/\D/g, '').slice(0, 2);
    if (digits !== el.value) el.value = digits;
    if (Number(el.value) > Number(el.dataset.max)) el.value = el.dataset.max;
  });

  // ---- date picking --------------------------------------------------------------

  function openDatePicker() {
    dateInput.value = store.state.date;
    try {
      if (typeof dateInput.showPicker !== 'function') throw new Error('no picker');
      dateInput.showPicker();
    } catch {
      // Cross-origin embeds (Notion) refuse showPicker(): show the field instead.
      dateInput.classList.add('revealed');
      dateInput.tabIndex = 0;
      dateInput.focus();
    }
  }
  dateInput.addEventListener('change', () => {
    if (dateInput.value) store.goToDate(dateInput.value);
    if (dateInput.classList.contains('revealed')) {
      dateInput.classList.remove('revealed');
      dateInput.tabIndex = -1;
      regions.date.focus();
    }
  });
  dateInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && dateInput.classList.contains('revealed')) {
      dateInput.classList.remove('revealed');
      dateInput.tabIndex = -1;
      regions.date.focus();
    }
  });

  // ---- one click handler for every [data-action] -------------------------------

  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action], [data-tab], [data-camera]');
    if (!btn || btn.disabled || !root.contains(btn)) return;
    if (btn.dataset.tab) return selectTab(btn.dataset.tab, true);
    if (btn.dataset.camera) return hooks.camera?.(btn.dataset.camera);
    const state = store.state;
    switch (btn.dataset.action) {
      case 'prev-day':
        return store.goToDate(addDays(state.date, -1));
      case 'next-day':
        return store.goToDate(addDays(state.date, 1));
      case 'pick-date':
      case 'add-date':
        return openDatePicker();
      case 'go-date':
        return store.goToDate(btn.dataset.key);
      case 'clear-example':
        store.clearExample();
        announce('Examples cleared. Add your first video.');
        return regions.program.querySelector('[data-action="add-video"]')?.focus();
      case 'select':
        confirmRemove = false;
        return store.selectVideo(btn.dataset.id);
      case 'add-video':
        return formMode === 'add' ? closeForm() : openForm('add');
      case 'edit-video':
        return openForm('edit');
      case 'cancel-video':
        return closeForm();
      case 'remove-entry': {
        const res = store.removeEntry(Number(btn.dataset.index));
        const sel = selected(store.state);
        if (res && sel) announce(`Section removed. ${words(sel.left)} left.`);
        return;
      }
      case 'undo': {
        const res = store.undo();
        const sel = selected(store.state);
        if (res && sel) announce(`Took back ${words(res.sec)}. ${words(sel.left)} left.`);
        return;
      }
      case 'remove-video':
        confirmRemove = !confirmRemove;
        renderLog(selected(state));
        regions.log.querySelector(confirmRemove ? '[data-action="cancel-remove"]' : '[data-action="remove-video"]')?.focus();
        return;
      case 'cancel-remove':
        confirmRemove = false;
        renderLog(selected(state));
        return regions.log.querySelector('[data-action="remove-video"]')?.focus();
      case 'confirm-remove': {
        const sel = selected(state);
        confirmRemove = false;
        if (!sel) return;
        store.removeVideo(sel.id);
        announce(`Removed ${sel.title}.`);
        return (regions.program.querySelector('.card.is-selected') || regions.program.querySelector('.card'))?.focus();
      }
      case 'collapse':
        return setCollapsed(!collapsed);
      case 'sheet-cycle':
        return cycleSheet();
      case 'lights-test':
        return hooks.lightsTest?.();
      case 'preview-video':
        return hooks.preview?.('video');
      case 'preview-day':
        return hooks.preview?.('day');
      case 'screenshot':
        return hooks.screenshot?.();
      case 'reset-env':
        settings.reset();
        return announce('Environment reset to the house defaults.');
    }
  });

  // ---- environment controls ------------------------------------------------------

  root.addEventListener('input', (e) => {
    const el = e.target;
    if (el.type !== 'range' || !el.dataset.setting) return;
    settings.set(el.dataset.setting, Number(el.value));
  });
  root.addEventListener('change', (e) => {
    const el = e.target;
    if (el.type !== 'radio' || !el.dataset.setting) return;
    settings.set(el.dataset.setting, el.value);
  });

  function syncSetting(key, value) {
    if (SLIDERS[key]) {
      const d = SLIDERS[key];
      const input = root.querySelector(`#s-${key}`);
      const out = root.querySelector(`#o-${key}`);
      if (Number(input.value) !== value) input.value = value;
      out.textContent = d.fmt(value);
      input.setAttribute('aria-valuetext', d.fmt(value));
      input.style.setProperty('--fill', `${((value - d.min) / (d.max - d.min)) * 100}%`);
    } else if (SEGMENTS[key]) {
      const r = root.querySelector(`input[name="${key}"][value="${value}"]`);
      if (r && !r.checked) r.checked = true;
    }
  }
  settings.on((key, value) => syncSetting(key, value));

  function syncMotion() {
    const reduced = reducedMotion();
    const orbit = root.querySelector('#s-autoOrbit');
    orbit.disabled = reduced || !sceneAvailable;
    regions['orbit-note'].textContent = reduced ? 'Auto-orbit stays off while your system asks for reduced motion.' : '';
  }
  syncMotion();
  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', syncMotion);

  function setCameraMode(name) {
    root.querySelectorAll('[data-camera]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.camera === name)));
  }

  function setSceneAvailable(ok, why = '') {
    sceneAvailable = ok;
    root.querySelectorAll('[data-scene]').forEach((b) => (b.disabled = !ok));
    regions['scene-note'].textContent = ok ? '' : `The street isn’t running here${why ? ` (${why})` : ''}, but these settings are saved for next time.`;
    syncMotion();
  }

  // ---- tabs ----------------------------------------------------------------------

  const tabs = [...root.querySelectorAll('[role="tab"]')];
  function selectTab(name, focus = false) {
    tabs.forEach((t) => {
      const on = t.dataset.tab === name;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
    });
    $('#pane-ledger').hidden = name !== 'ledger';
    $('#pane-env').hidden = name !== 'env';
    scroller.scrollTop = 0;
    if (isMobile && sheet.at === 'peek') snapSheet('half');
  }
  root.querySelector('.tabs').addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const i = tabs.indexOf(document.activeElement);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    selectTab(tabs[next].dataset.tab, true);
  });

  // ---- layout: desktop collapse + mobile bottom sheet ---------------------------

  const collapseBtn = $('[data-action="collapse"]');
  const slide = { x: 0 }; // 0 docked, 1 tucked away
  const sheet = { y: 0, at: 'peek' };

  function layout() {
    if (isMobile) return { right: 0, bottom: Math.max(0, root.offsetHeight - sheet.y) };
    return { right: Math.max(0, root.offsetWidth * (1 - slide.x)), bottom: 0 };
  }
  function emitLayout() {
    const l = layout();
    layoutListeners.forEach((fn) => fn(l));
  }

  function setCollapsed(on, { instant = false } = {}) {
    if (isMobile) {
      snapSheet(sheet.at === 'peek' ? 'half' : 'peek');
      return;
    }
    collapsed = on;
    collapseBtn.setAttribute('aria-expanded', String(!on));
    collapseBtn.setAttribute('aria-label', on ? 'Expand panel' : 'Collapse panel');
    root.inert = on;
    reopen.hidden = !on;
    const dur = instant || reducedMotion() ? 0 : 0.55;
    gsap.to(slide, {
      x: on ? 1 : 0,
      duration: dur,
      ease: 'power3.inOut',
      onUpdate: () => {
        root.style.transform = slide.x ? `translate3d(${slide.x * 100}%,0,0)` : '';
        emitLayout();
      },
    });
    if (!instant) (on ? reopen : collapseBtn).focus({ preventScroll: true });
  }
  reopen.addEventListener('click', () => setCollapsed(false));

  function sheetSnaps() {
    const H = root.offsetHeight;
    const top = root.getBoundingClientRect().top;
    const peekH = Math.round(root.querySelector('.tabs').getBoundingClientRect().bottom - top + 10);
    return { peek: Math.max(0, H - peekH), half: Math.max(0, H - Math.round(window.innerHeight * 0.5)), full: 0 };
  }
  function applySheet() {
    root.style.transform = `translate3d(0,${sheet.y}px,0)`;
    emitLayout();
  }
  function snapSheet(name, instant = false) {
    sheet.at = name;
    const target = sheetSnaps()[name];
    collapseBtn.setAttribute('aria-label', name === 'peek' ? 'Expand panel' : 'Lower panel');
    collapseBtn.setAttribute('aria-expanded', String(name !== 'peek'));
    $('.sheet-handle').setAttribute('aria-label', `Resize panel (now ${name === 'peek' ? 'peeking' : name === 'half' ? 'half height' : 'full height'})`);
    gsap.to(sheet, { y: target, duration: instant || reducedMotion() ? 0 : 0.45, ease: 'power3.out', onUpdate: applySheet, overwrite: true });
  }
  function cycleSheet() {
    snapSheet({ peek: 'half', half: 'full', full: 'peek' }[sheet.at]);
  }

  // Drag the handle or the header to resize the sheet.
  let drag = null;
  function onDown(e) {
    if (!isMobile || e.button > 0 || (e.target.closest('button') && !e.target.closest('.sheet-handle'))) return;
    gsap.killTweensOf(sheet);
    drag = { y0: e.clientY, s0: sheet.y, t: performance.now(), last: e.clientY, v: 0, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onMove(e) {
    if (!drag) return;
    const now = performance.now();
    drag.v = (e.clientY - drag.last) / Math.max(1, now - drag.t);
    drag.last = e.clientY;
    drag.t = now;
    if (Math.abs(e.clientY - drag.y0) > 4) drag.moved = true;
    sheet.y = Math.min(sheetSnaps().peek, Math.max(0, drag.s0 + e.clientY - drag.y0));
    applySheet();
  }
  function onUp(e) {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (!d.moved) return; // a tap: the click handler decides
    e.preventDefault();
    const snaps = sheetSnaps();
    const aim = sheet.y + d.v * 180;
    const best = Object.entries(snaps).sort((a, b) => Math.abs(a[1] - aim) - Math.abs(b[1] - aim))[0][0];
    snapSheet(best);
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 50);
  }
  let suppressClick = false;
  root.addEventListener('click', (e) => {
    if (suppressClick) {
      e.stopPropagation();
      e.preventDefault();
    }
  }, true);
  for (const el of [$('.sheet-handle'), $('.panel-head')]) {
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
  }
  $('.sheet-handle').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp') snapSheet(sheet.at === 'peek' ? 'half' : 'full');
    else if (e.key === 'ArrowDown') snapSheet(sheet.at === 'full' ? 'half' : 'peek');
    else return;
    e.preventDefault();
  });

  function applyMode() {
    isMobile = mobileQuery.matches;
    gsap.killTweensOf(sheet);
    gsap.killTweensOf(slide);
    root.style.transform = '';
    root.inert = false;
    if (isMobile) {
      reopen.hidden = true;
      collapsed = false;
      snapSheet(sheet.at, true);
    } else {
      slide.x = collapsed ? 1 : 0;
      setCollapsed(collapsed, { instant: true });
    }
  }
  mobileQuery.addEventListener?.('change', applyMode);
  window.addEventListener('resize', () => {
    if (isMobile && !drag) snapSheet(sheet.at, true);
    else emitLayout();
  });

  // ---- live region ---------------------------------------------------------------

  let liveTimer;
  function announce(text) {
    clearTimeout(liveTimer);
    live.textContent = '';
    liveTimer = setTimeout(() => (live.textContent = text), 60);
  }

  applyMode();

  return {
    render,
    announce,
    holdEncore,
    revealEncore,
    previewEncore,
    setCameraMode,
    setSceneAvailable,
    get hooks() {
      return hooks;
    },
    setHooks(h) {
      Object.assign(hooks, h);
    },
    onLayout(fn) {
      layoutListeners.push(fn);
      fn(layout());
    },
    layout,
  };
}
