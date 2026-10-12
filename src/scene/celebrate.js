// Video and day completion: doors, friends, hat tips, confetti, fireworks.
//
// Celebrations play only on a transition to 100% — never when switching to a
// video or date that was already finished. Preview plays the same sequence
// without touching the ledger and then puts everything back.

import * as THREE from 'three';
import { gsap } from 'gsap';
import { PALETTE, glowTexture } from './lineStyle.js';
import { SIDEWALK_Y } from './town.js';
import { isLowPower, reducedMotion } from '../state/settings.js';

const CONFETTI_COLORS = [PALETTE.cream, PALETTE.gold, PALETTE.sage, PALETTE.rose];
const FIREWORK_COLORS = [PALETTE.gold, PALETTE.cream, PALETTE.rose, PALETTE.sage, PALETTE.lamp];

// ---- confetti: instanced quads, closed-form drag + gravity, GSAP-timed ---------------

function createConfetti(scene, count) {
  const geo = new THREE.PlaneGeometry(0.15, 0.085);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.frustumCulled = false;
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    mesh.setMatrixAt(i, zero);
    mesh.setColorAt(i, c.setHex(CONFETTI_COLORS[i % CONFETTI_COLORS.length]).multiplyScalar(1.05));
  }
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(mesh);

  const p = Array.from({ length: count }, () => ({
    o: new THREE.Vector3(), v: new THREE.Vector3(), axis: new THREE.Vector3(), spin: 0, phase: 0, life: 0, size: 1,
  }));
  let cursor = 0;
  const K = 1.7; // drag
  const G = -9.8;
  const vt = G / K; // terminal fall speed
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const pos = new THREE.Vector3();

  function burst(origin, n, { spread = 3.4, up = [3.8, 7.5], toward = [0.8, 3.4] } = {}) {
    const ids = [];
    for (let k = 0; k < n; k++) {
      const i = cursor;
      cursor = (cursor + 1) % count;
      ids.push(i);
      const P = p[i];
      P.o.set(origin.x + (Math.random() - 0.5) * spread * 1.6, origin.y, origin.z + Math.random() * 0.2);
      P.v.set((Math.random() - 0.5) * spread * 1.8, up[0] + Math.random() * (up[1] - up[0]), toward[0] + Math.random() * (toward[1] - toward[0]));
      P.axis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      P.spin = 5 + Math.random() * 9;
      P.phase = Math.random() * Math.PI * 2;
      P.life = 3.2 + Math.random() * 1.4;
      P.size = 0.75 + Math.random() * 0.6;
    }
    const clock = { t: 0 };
    return gsap.to(clock, {
      t: 4.8,
      duration: 4.8,
      ease: 'none',
      onUpdate: () => {
        const t = clock.t;
        const e = (1 - Math.exp(-K * t)) / K;
        for (const i of ids) {
          const P = p[i];
          pos.set(
            P.o.x + P.v.x * e + Math.sin(t * 3 + P.phase) * 0.12 * Math.min(1, t),
            P.o.y + vt * t + (P.v.y - vt) * e,
            P.o.z + P.v.z * e,
          );
          const grounded = pos.y < 0.03;
          if (grounded) pos.y = 0.03 + (pos.z < 2.5 ? SIDEWALK_Y : 0);
          const fade = t > P.life ? 0 : t > P.life - 0.8 ? (P.life - t) / 0.8 : 1;
          q.setFromAxisAngle(P.axis, grounded ? P.phase : t * P.spin + P.phase);
          s.setScalar(P.size * fade);
          m.compose(pos, q, s);
          mesh.setMatrixAt(i, m);
        }
        mesh.instanceMatrix.needsUpdate = true;
      },
      onComplete: () => {
        for (const i of ids) mesh.setMatrixAt(i, zero);
        mesh.instanceMatrix.needsUpdate = true;
      },
    });
  }

  return { burst, mesh };
}

// ---- fireworks: additive points, motion computed in the vertex shader ------------------

const fwVertex = /* glsl */ `
  attribute vec3 aOrigin;
  attribute vec3 aVel;
  attribute vec3 aColor;
  attribute float aStart;
  attribute float aLife;
  attribute float aKind;
  uniform float uTime;
  uniform float uPixelRatio;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float t = uTime - aStart;
    vColor = aColor;
    vec3 p;
    float size;
    if (t < 0.0 || t > aLife) {
      vAlpha = 0.0;
      p = aOrigin;
      size = 0.0;
    } else if (aKind > 0.5) {
      // Rising shell: aVel holds the burst point.
      float k = t / aLife;
      p = mix(aOrigin, aVel, 1.0 - (1.0 - k) * (1.0 - k));
      vAlpha = 0.9;
      size = 7.0;
    } else {
      float K = 1.3;
      float e = (1.0 - exp(-K * t)) / K;
      p = aOrigin + aVel * e + vec3(0.0, -1.4 * t * t, 0.0);
      float k = t / aLife;
      vAlpha = pow(clamp(1.0 - k, 0.0, 1.0), 1.6) * (0.75 + 0.25 * sin(t * 40.0 + aOrigin.x * 13.0));
      size = mix(9.0, 3.5, k);
    }
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = size * uPixelRatio * (30.0 / max(1.0, -mv.z));
  }`;
const fwFragment = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    if (vAlpha <= 0.0) discard;
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vColor * 2.2, a * vAlpha);
  }`;

function createFireworks(scene, pixelRatio, perBurst) {
  const BURSTS = 8;
  const N = BURSTS * (perBurst + 1);
  const geo = new THREE.BufferGeometry();
  const attr = (n) => new THREE.BufferAttribute(new Float32Array(N * n), n).setUsage(THREE.DynamicDrawUsage);
  const A = { aOrigin: attr(3), aVel: attr(3), aColor: attr(3), aStart: attr(1), aLife: attr(1), aKind: attr(1) };
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  for (const [k, a] of Object.entries(A)) geo.setAttribute(k, a);
  A.aStart.array.fill(-1000);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPixelRatio: { value: pixelRatio } },
    vertexShader: fwVertex,
    fragmentShader: fwFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.visible = false;
  scene.add(points);

  let slot = 0;
  const color = new THREE.Color();
  let clockTween = null;

  function launch(at, { delay = 0 } = {}) {
    const base = slot * (perBurst + 1);
    slot = (slot + 1) % BURSTS;
    const t0 = mat.uniforms.uTime.value + delay;
    const rise = 0.75;
    const hue = FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)];
    // Shell.
    A.aOrigin.setXYZ(base, at.x + (Math.random() - 0.5), 0.2, at.z + 3);
    A.aVel.setXYZ(base, at.x, at.y, at.z);
    color.setHex(PALETTE.cream);
    A.aColor.setXYZ(base, color.r, color.g, color.b);
    A.aStart.setX(base, t0);
    A.aLife.setX(base, rise);
    A.aKind.setX(base, 1);
    // Sparks: a sphere of velocities, a few in a second color.
    for (let k = 1; k <= perBurst; k++) {
      const i = base + k;
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const speed = 5.2 + Math.random() * 1.6;
      A.aOrigin.setXYZ(i, at.x, at.y, at.z);
      A.aVel.setXYZ(i, r * Math.cos(a) * speed, u * speed, r * Math.sin(a) * speed * 0.7);
      color.setHex(k % 5 === 0 ? PALETTE.cream : hue);
      A.aColor.setXYZ(i, color.r, color.g, color.b);
      A.aStart.setX(i, t0 + rise);
      A.aLife.setX(i, 1.6 + Math.random() * 0.9);
      A.aKind.setX(i, 0);
    }
    for (const a of Object.values(A)) a.needsUpdate = true;
  }

  /** Run the fireworks clock for `seconds` (a GSAP tween of uTime). */
  function run(seconds) {
    points.visible = true;
    clockTween?.kill();
    clockTween = gsap.to(mat.uniforms.uTime, {
      value: `+=${seconds}`,
      duration: seconds,
      ease: 'none',
      onComplete: () => (points.visible = false),
    });
    return clockTween;
  }

  function stop() {
    clockTween?.kill();
    points.visible = false;
    A.aStart.array.fill(-1000);
    A.aStart.needsUpdate = true;
  }

  return { launch, run, stop };
}

// ---- the sequences ----------------------------------------------------------------------

export function createCelebrations({ scene, town, lamps, marquee, characters, panel, pixelRatio }) {
  const low = isLowPower();
  const confetti = createConfetti(scene, low ? 160 : 320);
  const fireworks = createFireworks(scene, pixelRatio, low ? 60 : 120);
  const A = town.anchors;

  // Reduced motion: one still, warm glow instead of confetti and fireworks.
  const stillGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: glowTexture(), color: PALETTE.gold, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  stillGlow.position.set(0, 6.4, 2.4);
  stillGlow.scale.set(12, 6, 1);
  scene.add(stillGlow);
  const skyGlow = stillGlow.clone();
  skyGlow.material = stillGlow.material.clone();
  skyGlow.position.set(-3, 16, -2);
  skyGlow.scale.set(30, 12, 1);
  scene.add(skyGlow);

  let tl = null;
  let playing = null; // { kind, preview }
  let restore = null;

  const marqueeTop = new THREE.Vector3(0, A.marquee.y1 + 0.1, A.marquee.z + 0.1);

  function videoSequence(t, { preview }) {
    t.call(() => {
      characters.setCelebrating(true);
      marquee.boost(5);
      lamps.flare(1.4);
    });
    t.add(town.setDoors(true), 0.05);
    t.add(characters.hopOut(['drip', 'reel', 'ticket'], 'gather'), 0.55);
    if (reducedMotion()) {
      t.to(stillGlow.material, { opacity: 0.55, duration: 0.01 }, 0.6);
      t.to(stillGlow.material, { opacity: 0, duration: 0.01 }, 5);
    } else {
      t.call(() => confetti.burst(marqueeTop, low ? 70 : 140), null, 0.7);
      t.call(() => confetti.burst(marqueeTop, low ? 45 : 90, { spread: 4.2, up: [5, 8.5] }), null, 1.5);
    }
    t.call(() => characters.say('Bravo!', { duration: 3 }), null, 0.9);
    t.add(characters.tipHat(3), 1.0);
    t.call(() => characters.partyHats(true), null, 1.9);
    t.add(characters.cheer(3), 2.0);
    return t;
  }

  function daySequence(t, opts) {
    videoSequence(t, opts);
    t.call(() => town.lightAll(true, { duration: 2.4 }), null, 3.0);
    t.add(characters.hopOut(['ticket', 'drip', 'reel', 'watcher'], 'lineup'), 3.6);
    t.call(() => characters.walkTo(characters.LINEUP.bart[0], { z: characters.LINEUP.bart[1] }), null, 3.7);
    t.call(() => characters.partyHats(true), null, 5.0);
    if (reducedMotion()) {
      t.to(skyGlow.material, { opacity: 0.4, duration: 0.01 }, 3.6);
      t.to(skyGlow.material, { opacity: 0, duration: 0.01 }, 9);
    } else {
      t.call(() => {
        fireworks.run(10);
        const spots = [[-9, 15.5, -3], [2, 17.5, -4], [10, 15, -2], [-3, 18.5, -5], [6, 16.5, -3], [-12, 17, -4], [0, 15.5, -2]];
        spots.forEach(([x, y, z], i) => fireworks.launch(new THREE.Vector3(x, y, z), { delay: i * 0.6 + Math.random() * 0.2 }));
      }, null, 3.4);
    }
    t.add(characters.tipHat(2), 5.2);
    t.add(characters.cheer(2), 5.4);
    if (!opts.preview) t.call(() => panel.revealEncore(), null, 4.4);
    else t.call(() => panel.previewEncore(opts.state), null, 4.4);
    return t;
  }

  /** Play a sequence. ctx: { sel, day, state } for settling afterward. */
  function play(kind, { preview = false, state, settle } = {}) {
    stop({ settle: false });
    playing = { kind, preview };
    restore = settle;
    // Wait for him to reach the doors first.
    let lead = characters.walkRemaining();
    if (preview) {
      const dx = Math.abs(characters.position.x - A.doorX);
      if (dx > 0.05 || characters.mode === 'sleep') lead = Math.max(lead, characters.walkTo(A.doorX, { z: A.walkZ }) || 0);
    }
    tl = gsap.timeline({
      delay: lead + 0.15,
      onComplete: () => finish(),
    });
    if (kind === 'day') daySequence(tl, { preview, state });
    else videoSequence(tl, { preview, state });
    tl.to({}, { duration: 1.5 });
    return tl;
  }

  function finish() {
    tl = null;
    const wasPreview = playing?.preview;
    playing = null;
    characters.partyHats(false);
    characters.setCelebrating(false);
    if (wasPreview) restore?.();
    else restore?.({ quiet: true });
  }

  /** Stop mid-sequence (data changed underneath us). */
  function stop({ settle = true } = {}) {
    if (!tl) return;
    tl.kill();
    tl = null;
    const wasPreview = playing?.preview;
    playing = null;
    fireworks.stop();
    gsap.set([stillGlow.material, skyGlow.material], { opacity: 0 });
    characters.partyHats(false, { animate: false });
    characters.setCelebrating(false);
    panel.revealEncore();
    if (settle && wasPreview) restore?.();
  }

  /**
   * Decide whether a store change is a transition to 100%.
   * Switching videos or dates never counts.
   */
  function detect(prev, now, action) {
    if (!prev || !['deduct', 'editVideo'].includes(action.type)) return null;
    if (prev.date !== now.date) return null;
    if (!prev.dayDone && now.dayDone && now.dayCount > 0) return 'day';
    if (now.selId && now.selId === prev.selId && !prev.selDone && now.selDone) return 'video';
    return null;
  }

  return {
    detect,
    play,
    stop,
    get playing() {
      return playing;
    },
  };
}
