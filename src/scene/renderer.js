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

export function webglSupport() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return { ok: false, why: 'WebGL is turned off or unsupported' };
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return { ok: true };
  } catch (e) {
    return { ok: false, why: e?.message || 'WebGL failed to start' };
  }
}

export function createRenderer(container, { lowPower = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
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

  const camera = new THREE.PerspectiveCamera(38, w / h, 0.1, 900);

  // Multisampled HDR target: crisp hairlines and room for bloom above 1.0.
  const target = new THREE.WebGLRenderTarget(w * pixelRatio, h * pixelRatio, {
    type: THREE.HalfFloatType,
    samples: lowPower ? 2 : 4,
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
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    applyView();
    resizeFns.forEach((fn) => fn(w, h));
  }
  new ResizeObserver(resize).observe(container);
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

  renderer.domElement.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    stop();
  });
  renderer.domElement.addEventListener('webglcontextrestored', () => start());

  return {
    renderer,
    scene,
    camera,
    composer,
    bloom,
    pixelRatio,
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
