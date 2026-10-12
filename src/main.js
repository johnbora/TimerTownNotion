// Boot: the ledger store, the side panel, and (when WebGL is available) the street.

import { gsap } from 'gsap';
import { store, selected, dayTotals } from './state/store.js';
import { settings, isLowPower, reducedMotion, onMotionChange } from './state/settings.js';
import { createPanel } from './ui/panel.js';
import { clock, minusClock, longDate } from './ui/format.js';
import { webglSupport, createRenderer } from './scene/renderer.js';
import { createTown } from './scene/town.js';
import { createLamps, LAMP_COUNT } from './scene/lamps.js';
import { createWeather } from './scene/weather.js';
import { createCameraRig } from './scene/camera.js';
import { createMarquee } from './scene/marquee.js';
import { createCharacters } from './scene/characters.js';
import { createCelebrations } from './scene/celebrate.js';
import { setLineWeight } from './scene/lineStyle.js';

const stage = document.getElementById('stage');
const sceneEl = document.getElementById('scene');
const panel = createPanel({
  root: document.getElementById('panel'),
  reopen: document.getElementById('panel-reopen'),
  live: document.getElementById('live'),
  store,
  settings,
});

let scene = null;

// ---- no WebGL: a styled message, the ledger keeps working ----------------------------

const escapeHtml = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
let fallbackWired = false;

/** No street: say exactly why, offer a retry, keep the ledger working. */
function showFallback(why, detail = '', { lede } = {}) {
  const fb = document.getElementById('fallback');
  fb.hidden = false;
  panel.setSceneAvailable(false, why);
  if (lede) document.getElementById('fallback-lede').textContent = lede;
  document.getElementById('fallback-why').innerHTML =
    `Reason: ${escapeHtml(why)}.` + (detail ? `<br><code>${escapeHtml(detail).slice(0, 240)}</code>` : '');
  if (fallbackWired) return;
  fallbackWired = true;
  document.getElementById('fallback-retry').addEventListener('click', () => window.location.reload());
  const update = (state) => {
    const sel = selected(state);
    document.getElementById('fallback-status').textContent = sel
      ? sel.done ? `${sel.title} — Bravo!` : `${clock(sel.left)} left on ${sel.title}`
      : 'Nothing on the program yet.';
  };
  store.on('change', update);
  update(store.state);
}

// ---- the street ------------------------------------------------------------------------

function buildScene(gl) {
  const r = createRenderer(sceneEl, { lowPower: isLowPower(), canvas: gl.canvas, context: gl.context });
  const town = createTown(r.scene);
  const lamps = createLamps(r.scene);
  const weather = createWeather({ scene: r.scene, camera: r.camera, pixelRatio: r.pixelRatio });
  const marquee = createMarquee(r.scene, town);
  const characters = createCharacters({ scene: r.scene, camera: r.camera, town, stage, bubble: document.getElementById('bubble') });
  const celebrate = createCelebrations({ scene: r.scene, town, lamps, marquee, characters, panel, pixelRatio: r.pixelRatio });
  const rig = createCameraRig({
    camera: r.camera,
    dom: r.renderer.domElement,
    getStage: () => ({ ...r.size, ...r.insets }),
    getFollowTarget: () => characters.position.clone(),
  });
  const canvas = r.renderer.domElement;
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-roledescription', 'interactive street view');

  panel.onLayout((l) => {
    r.setInsets(l);
    rig.refit();
  });
  r.onResize(() => rig.refit());
  r.onFrame((dt, t) => {
    weather.update(dt, t);
    rig.update(dt);
    weather.setViewDistance(rig.viewDistance());
    characters.frame();
    marquee.tick();
  });

  settings.on((key, value, opts) => {
    const animate = !opts.instant;
    switch (key) {
      case 'timeOfNight': return weather.setTimeOfNight(value, { animate });
      case 'fog': return weather.setFog(value, { animate });
      case 'lampBrightness': return lamps.setBrightness(value, { animate });
      case 'lampWarmth': return lamps.setWarmth(value, { animate });
      case 'lampMode': return syncLamps(store.state);
      case 'bulbSpeed': return marquee.setSpeed(value);
      case 'bloom':
        return gsap.to(r.bloom, { strength: value, duration: animate ? 0.5 : 0, ease: 'power2.out', overwrite: true });
      case 'lineWeight': {
        const proxy = scene?.lineProxy || { w: value };
        return gsap.to(proxy, { w: value, duration: animate ? 0.35 : 0, ease: 'power1.out', overwrite: true, onUpdate: () => setLineWeight(proxy.w) });
      }
      case 'weather': {
        const wet = value === 'rain' ? 1 : 0;
        town.setWet(wet, { animate });
        lamps.setWet(wet, { animate });
        return weather.setWeather(value, { animate });
      }
      case 'weatherIntensity': return weather.setIntensity(value, { animate });
      case 'autoOrbit': return rig.setAutoOrbit(value);
    }
  });

  const settle = () => {
    const s = store.state;
    const sel = selected(s);
    const day = dayTotals(s);
    characters.update(sel, day);
    if (town.doorsOpen !== !!sel?.done) town.setDoors(!!sel?.done);
    town.setLitWindows(day.doneCount, day.allDone, { force: true });
  };

  panel.setHooks({
    camera: (name) => rig.goTo(name),
    lightsTest: () => {
      lamps.lightsTest();
      panel.announce('Lights test: every lamp on, then back to your progress.');
    },
    preview: (kind) => {
      celebrate.play(kind, { preview: true, state: store.state, settle });
      panel.announce(kind === 'day' ? 'Previewing the day celebration.' : 'Previewing the video celebration.');
    },
    screenshot: () => saveScreenshot(r),
  });
  rig.onMode((m) => panel.setCameraMode(m));
  // If the phone's GPU drops the context, say so; three.js rebuilds it if the browser restores it.
  r.onContextLoss((lost) => {
    if (lost) {
      showFallback('the graphics processor stopped the street (WebGL context lost)', '', {
        lede: 'The street paused because this device’s graphics stopped responding.',
      });
    } else {
      document.getElementById('fallback').hidden = true;
      panel.setSceneAvailable(true);
    }
  });
  onMotionChange(() => {
    rig.setAutoOrbit(settings.get('autoOrbit'));
    marquee.setSpeed(settings.get('bulbSpeed'));
  });

  return { r, town, lamps, weather, rig, marquee, characters, celebrate, settle, lineProxy: { w: settings.get('lineWeight') } };
}

function saveScreenshot(r) {
  let url;
  try {
    url = r.capture();
  } catch {
    panel.announce('The screenshot could not be taken here.');
    return;
  }
  const name = `watch-town-${store.state.date}.png`;
  // Try a download; embeds often block it, so also show the image to save by hand.
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch {
    /* fall through to the preview */
  }
  const shot = document.getElementById('shot');
  shot.innerHTML = `<figure><img alt="Screenshot of Watch Town" src="${url}"><figcaption>Saved as ${name}. If nothing downloaded, right-click or long-press the picture to save it. <button class="link" type="button">Close</button></figcaption></figure>`;
  shot.hidden = false;
  const close = () => (shot.hidden = true);
  shot.querySelector('button').addEventListener('click', close);
  shot.addEventListener('click', (e) => e.target === shot && close(), { once: true });
  shot.querySelector('button').focus();
  panel.announce('Screenshot taken.');
}

// ---- data → scene ------------------------------------------------------------------------

function lampProgress(state) {
  const sel = selected(state);
  const day = dayTotals(state);
  if (!day.count) return null;
  if (settings.get('lampMode') === 'day') return day.progress;
  return sel ? sel.progress : null;
}

function syncLamps(state, opts) {
  if (!scene) return;
  scene.lamps.setProgress(lampProgress(state), opts);
}

function describeScene(state) {
  const sel = selected(state);
  const day = dayTotals(state);
  const p = lampProgress(state);
  const lit = p == null ? 0 : Math.floor(Math.min(1, p) * LAMP_COUNT);
  let text = `Night street on ${longDate(state.date)}. `;
  if (!day.count) text += 'No videos on the program; Bartholomew is dozing on the bench and one lamp glows by the doors.';
  else {
    text += `${lit} of ${LAMP_COUNT} street lamps lit. `;
    if (sel) text += sel.done ? `The marquee reads ${sel.title}: Bravo. ` : `The marquee reads ${sel.title}, ${clock(sel.left)} left. `;
    if (day.allDone) text += 'Every window on the block is lit.';
  }
  scene?.r.renderer.domElement.setAttribute('aria-label', `${text} Drag to look around, scroll or pinch to zoom, arrow keys to pan.`);
}

let prev = null;
const summarize = (state) => {
  const sel = selected(state);
  const day = dayTotals(state);
  return { date: state.date, selId: sel?.id ?? null, selDone: !!sel?.done, dayDone: day.allDone, dayCount: day.count };
};

function onChange(state, action) {
  const sel = selected(state);
  const day = dayTotals(state);
  const now = summarize(state);
  const first = action.type === 'init';
  const trans = scene ? scene.celebrate.detect(prev, now, action) : null;
  prev = now;

  if (trans === 'day') panel.holdEncore(state.date);
  panel.render(state);
  describeScene(state);
  if (!scene) return;

  if (scene.celebrate.playing) scene.celebrate.stop();
  syncLamps(state, { animate: !first || !reducedMotion() });
  scene.marquee.update(sel, day, { animate: !first });
  scene.characters.update(sel, day, { animate: !first, holdFriends: !!trans });
  if (!trans && scene.town.doorsOpen !== !!sel?.done) scene.town.setDoors(!!sel?.done, { animate: !first });
  scene.town.setLitWindows(day.doneCount, day.allDone && trans !== 'day', { animate: !first });

  if (action.type === 'deduct' && sel) scene.characters.say(minusClock(action.sec));
  if (trans) scene.celebrate.play(trans, { state, settle: scene.settle });
}

// ---- boot ----------------------------------------------------------------------------------

const support = webglSupport();
if (support.ok) {
  try {
    scene = buildScene(support);
  } catch (err) {
    console.error(err);
    scene = null;
    sceneEl.replaceChildren();
    showFallback('the 3D street failed while starting', err?.message || String(err));
  }
} else {
  showFallback(support.why, support.detail);
}

store.on('change', onChange);
store.refresh();
if (scene) {
  settings.applyAll({ instant: true });
  scene.r.start();
}

window.__watchTown = { store, settings, panel, scene, gsap };
