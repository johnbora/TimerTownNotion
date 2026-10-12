// Renderer, post-processing, resizing and the render loop.
// The loop rides on gsap.ticker so every tween has already been applied when a
// frame is drawn, and it stops completely while the page is hidden.

import * as THREE from 'three';
import { gsap } from 'gsap';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { PALETTE, setLinePixelRatio } from './lineStyle.js';

const CONTEXT_ATTRS = { alpha: false, antialias: false, depth: true, stencil: false, premultipliedAlpha: true, preserveDrawingBuffer: false };

/**
 * Ask for the one WebGL 2 context the street will use (three.js r163+ cannot
 * draw with WebGL 1). Returns { ok, canvas, context } or { ok: false, why, detail }
 * with a reason a person can act on.
 */
export function webglSupport() {
  let detail = '';
  try {
    const canvas = document.createElement('canvas');
    canvas.addEventListener('webglcontextcreationerror', (e) => (detail = e.statusMessage || detail), { once: true });
    const context =
      canvas.getContext('webgl2', { ...CONTEXT_ATTRS, powerPreference: 'high-performance' }) ||
      canvas.getContext('webgl2', CONTEXT_ATTRS);
    if (context && !context.isContextLost()) return { ok: true, canvas, context };
    const probe = document.createElement('canvas');
    const gl1 = probe.getContext('webgl') || probe.getContext('experimental-webgl');
    if (gl1) {
      return { ok: false, why: 'this browser only offers WebGL 1, and the street needs WebGL 2', detail };
    }
    return { ok: false, why: 'the browser refused to start WebGL (it may be blocked or switched off)', detail };
  } catch (e) {
    return { ok: false, why: 'WebGL failed to start', detail: e?.message || String(e) };
  }
}

export function createRenderer(container, { lowPower = false, canvas, context } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, context, antialias: false, stencil: false, powerPreference: 'high-performance' });
  // Resolution: the device's pixel ratio, capped (1.5× on phones, 2× elsewhere) and
  // kept within a pixel budget so very large or high-density screens don't ask the
  // GPU for more than it can comfortably fill every frame.
  const MAX_PIXELS = lowPower ? 2.2e6 : 4.2e6;
  const ratioFor = (cw, ch) =>
    Math.max(lowPower ? 1 : 0.75, Math.min(window.devicePixelRatio || 1, lowPower ? 1.5 : 2, Math.sqrt(MAX_PIXELS / Math.max(1, cw * ch))));
  let pixelRatio = ratioFor(container.clientWidth || 1, container.clientHeight || 1);
  renderer.setPixelRatio(pixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = false;
  renderer.info.autoReset = false; // count every pass of a frame together
  container.appendChild(renderer.domElement);
  setLinePixelRatio(pixelRatio);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.bg);

  const size = () => ({ w: Math.max(1, container.clientWidth), h: Math.max(1, container.clientHeight) });
  let { w, h } = size();

  // Near plane at 0.6 (nothing gets closer) keeps depth precision high enough that
  // decals a centimetre off a wall don't flicker on phone GPUs at long distances.
  const camera = new THREE.PerspectiveCamera(38, w / h, 0.6, 1000);

  // Multisampled HDR target: crisp hairlines and room for bloom above 1.0.
  const target = new THREE.WebGLRenderTarget(w * pixelRatio, h * pixelRatio, {
    type: THREE.HalfFloatType,
    // Multisampled half-float targets glitch on some phone GPUs; phones skip MSAA.
    samples: lowPower ? 0 : 4,
  });
  const composer = new EffectComposer(renderer, target);
  composer.setPixelRatio(pixelRatio);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.9, 0.55, 0.8);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // Insets: the panel covers part of the stage; shift the projection so the
  // town stays centered in what is visible.
  const insets = { right: 0, bottom: 0 };
  function applyView() {
    camera.aspect = w / h;
    if (insets.right || insets.bottom) camera.setViewOffset(w, h, insets.right / 2, insets.bottom / 2, w, h);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }

  const resizeFns = new Set();
  function resize() {
    ({ w, h } = size());
    // Window resized, browser zoom changed, or moved to a screen with another density.
    const pr = ratioFor(w, h);
    if (Math.abs(pr - pixelRatio) > 0.01) {
      pixelRatio = pr;
      renderer.setPixelRatio(pr);
      composer.setPixelRatio(pr);
      setLinePixelRatio(pr);
    }
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    applyView();
    resizeFns.forEach((fn) => fn(w, h));
  }
  new ResizeObserver(resize).observe(container);
  window.addEventListener('resize', resize);
  resize();

  const frameFns = new Set();
  let running = false;
  let last = performance.now();
  function tick() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    for (const fn of frameFns) fn(dt, now / 1000);
    renderer.info.reset();
    composer.render(dt);
  }
  function start() {
    if (running) return;
    running = true;
    last = performance.now();
    gsap.ticker.add(tick);
  }
  function stop() {
    if (!running) return;
    running = false;
    gsap.ticker.remove(tick);
  }
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));

  const lossFns = new Set();
  renderer.domElement.addEventListener('webglcontextlost', (e) => {
    e.preventDefault(); // lets the browser try to restore it
    stop();
    lossFns.forEach((fn) => fn(true));
  });
  renderer.domElement.addEventListener('webglcontextrestored', () => {
    lossFns.forEach((fn) => fn(false));
    start();
  });

  return {
    renderer,
    scene,
    camera,
    composer,
    bloom,
    get pixelRatio() {
      return pixelRatio;
    },
    get size() {
      return { w, h };
    },
    get insets() {
      return { ...insets };
    },
    /** Visible-area insets in CSS px (panel on the right, sheet at the bottom). */
    setInsets({ right = 0, bottom = 0 }) {
      insets.right = right;
      insets.bottom = bottom;
      applyView();
      resizeFns.forEach((fn) => fn(w, h));
    },
    onFrame(fn) {
      frameFns.add(fn);
      return () => frameFns.delete(fn);
    },
    onResize(fn) {
      resizeFns.add(fn);
      fn(w, h);
    },
    /** fn(true) when the GPU drops the context, fn(false) when it comes back. */
    onContextLoss(fn) {
      lossFns.add(fn);
    },
    start,
    stop,
    /**
     * Grab one frame as a PNG. Rendering and reading back in the same task means
     * the drawing buffer is still intact, so preserveDrawingBuffer never has to
     * be switched on for normal frames.
     */
    capture() {
      composer.render(0);
      return renderer.domElement.toDataURL('image/png');
    },
  };
}
