// Ten cast-iron street lamps: the main progress readout.
//
// Each lamp has one proxy { v } (0 = off, 1 = fully on). A single apply() writes
// the PointLight intensity, the lantern's emissiveIntensity, the glow sprite's
// opacity, the light cone and the wet-street reflection from that one value, so
// they can never drift apart. Global multipliers (brightness, pulse, breathing)
// scale the output without touching which lamps progress has lit.

import * as THREE from 'three';
import { gsap } from 'gsap';
import { outlined, flat, PALETTE, glowTexture, mergeStatic, mergeStaticMeshes } from './lineStyle.js';
import { SIDEWALK_Y, CURB_Z } from './town.js';
import { reducedMotion, warmthColor } from '../state/settings.js';

export const LAMP_COUNT = 10;
const X_START = -17; // left end of the block = 0%
const X_END = 2.8; // just past the theater doors = 100%
const Z = CURB_Z - 0.2;
const LANTERN_Y = 2.85; // above the sidewalk

const LIGHT_MAX = 46;
const EMISSIVE_MAX = 3.2;
const GLOW_MAX = 0.9;
const CONE_MAX = 0.11;
const IDLE_LEVEL = 0.32;

const coneVertex = /* glsl */ `
  varying float vH;
  varying float vFacing;
  void main() {
    vH = uv.y;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 n = normalize(normalMatrix * normal);
    vFacing = abs(dot(n, normalize(-mv.xyz)));
    gl_Position = projectionMatrix * mv;
  }`;
const coneFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vH;
  varying float vFacing;
  void main() {
    // Clamp before pow(): with MSAA, varyings at a triangle's edge can land a hair
    // outside 0..1, and pow() of a negative number is NaN on real GPUs.
    float a = uOpacity * pow(clamp(vH, 0.0, 1.0), 1.7) * pow(clamp(vFacing, 0.0, 1.0), 1.4);
    gl_FragColor = vec4(uColor, a);
  }`;

function streakTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const g = c.getContext('2d');
  const grdY = g.createLinearGradient(0, 0, 0, 256);
  grdY.addColorStop(0, 'rgba(255,255,255,0.0)');
  grdY.addColorStop(0.08, 'rgba(255,255,255,0.9)');
  grdY.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  grdY.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grdY;
  g.fillRect(0, 0, 64, 256);
  g.globalCompositeOperation = 'destination-in';
  const grdX = g.createLinearGradient(0, 0, 64, 0);
  grdX.addColorStop(0, 'rgba(0,0,0,0)');
  grdX.addColorStop(0.5, 'rgba(0,0,0,1)');
  grdX.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grdX;
  g.fillRect(0, 0, 64, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createLamps(scene) {
  const group = new THREE.Group();
  group.name = 'lamps';
  scene.add(group);

  const lampColor = new THREE.Color(PALETTE.lamp);
  const iron = flat(0x1f281f, { emissive: 0.5 });
  const coneGeo = new THREE.ConeGeometry(1.35, LANTERN_Y + SIDEWALK_Y - 0.05, 28, 1, true);
  const streakGeo = new THREE.PlaneGeometry(0.8, 6.5);
  streakGeo.rotateX(-Math.PI / 2);
  streakGeo.translate(0, 0, 3.25);
  const streakTex = streakTexture();
  const glow = glowTexture();

  const lamps = [];
  for (let i = 0; i < LAMP_COUNT; i++) {
    const x = X_START + ((X_END - X_START) * i) / (LAMP_COUNT - 1);
    const lamp = new THREE.Group();
    lamp.position.set(x, SIDEWALK_Y, Z);
    group.add(lamp);
    const part = (geo, y, mat = iron, opts) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.y = y;
      lamp.add(m);
      outlined(m, { opacity: 0.8, thresholdAngle: 30, ...opts });
      return m;
    };
    part(new THREE.CylinderGeometry(0.12, 0.17, 0.3, 8), 0.15);
    part(new THREE.CylinderGeometry(0.075, 0.1, 0.14, 8), 0.37);
    part(new THREE.CylinderGeometry(0.045, 0.06, 2.1, 6), 0.44 + 1.05);
    part(new THREE.CylinderGeometry(0.075, 0.075, 0.07, 8), 2.0);
    part(new THREE.BoxGeometry(0.62, 0.04, 0.04), 2.32); // the arm (ladder rest)
    part(new THREE.SphereGeometry(0.04, 6, 4), 2.32).position.x = -0.32;
    part(new THREE.SphereGeometry(0.04, 6, 4), 2.32).position.x = 0.32;
    part(new THREE.CylinderGeometry(0.11, 0.06, 0.1, 6), 2.6);
    const glassMat = new THREE.MeshLambertMaterial({ color: 0x1b221a, emissive: lampColor.clone(), emissiveIntensity: 0 });
    const glass = part(new THREE.CylinderGeometry(0.19, 0.13, 0.42, 6), LANTERN_Y, glassMat, { opacity: 0.9 });
    glass.userData.keep = true; // its own material: emissive per lamp
    part(new THREE.ConeGeometry(0.27, 0.2, 6), LANTERN_Y + 0.31);
    part(new THREE.SphereGeometry(0.045, 6, 4), LANTERN_Y + 0.45);

    const light = new THREE.PointLight(lampColor.clone(), 0, 6, 2);
    light.position.set(0, LANTERN_Y, 0);
    lamp.add(light);

    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glow, color: lampColor.clone(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    sprite.position.set(0, LANTERN_Y, 0);
    sprite.scale.setScalar(1.9);
    lamp.add(sprite);

    const cone = new THREE.Mesh(
      coneGeo,
      new THREE.ShaderMaterial({
        uniforms: { uColor: { value: lampColor.clone() }, uOpacity: { value: 0 } },
        vertexShader: coneVertex,
        fragmentShader: coneFragment,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
    cone.position.set(0, (LANTERN_Y - 0.05) / 2 - SIDEWALK_Y / 2, 0);
    lamp.add(cone);

    const streak = new THREE.Mesh(
      streakGeo,
      new THREE.MeshBasicMaterial({ map: streakTex, color: lampColor.clone(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    streak.position.set(0, -SIDEWALK_Y + 0.006, 0.25);
    streak.visible = false;
    lamp.add(streak);

    lamps.push({ x, group: lamp, light, glassMat, sprite, cone, streak, proxy: { v: 0 } });
  }
  mergeStatic(group);
  mergeStaticMeshes(group);

  // ---- output -------------------------------------------------------------------

  const mul = { brightness: 1, pulse: 1, breath: 1, wet: 0 };

  function apply(i) {
    const l = lamps[i];
    const v = Math.max(0, l.proxy.v * mul.pulse * mul.breath);
    const b = mul.brightness;
    l.light.intensity = v * LIGHT_MAX * b;
    l.glassMat.emissiveIntensity = v * EMISSIVE_MAX * (0.55 + 0.45 * b);
    l.sprite.material.opacity = Math.min(1, v * GLOW_MAX * (0.6 + 0.4 * b));
    l.sprite.scale.setScalar(1.6 + 0.5 * Math.min(1.6, v * b));
    l.cone.material.uniforms.uOpacity.value = v * CONE_MAX * b;
    l.cone.visible = v > 0.002;
    l.streak.material.opacity = Math.min(1, v * b) * mul.wet * 0.55;
    l.streak.visible = mul.wet > 0.01 && v > 0.002;
  }
  const applyAll = () => lamps.forEach((_, i) => apply(i));

  // ---- progress ------------------------------------------------------------------

  let tl = null;
  let breathTween = null;
  let lastProgress = null;
  let isFull = false;
  let testing = null;

  function targetsFor(p) {
    if (p == null) return lamps.map((_, i) => (i === LAMP_COUNT - 1 ? IDLE_LEVEL : 0));
    const lit = Math.min(1, Math.max(0, p)) * LAMP_COUNT;
    const whole = Math.floor(lit);
    const frac = lit - whole;
    return lamps.map((_, i) => (i < whole ? 1 : i === whole ? frac : 0));
  }

  /** Two or three quick dips before settling: the gas catching. */
  function flicker(to) {
    return [
      { v: to * 0.8, duration: 0.06, ease: 'power1.out' },
      { v: to * 0.1, duration: 0.05, ease: 'none' },
      { v: to * 0.95, duration: 0.07, ease: 'power1.out' },
      { v: to * 0.3, duration: 0.06, ease: 'none' },
      { v: to * 1.05, duration: 0.06, ease: 'power1.out' },
      { v: to * 0.6, duration: 0.05, ease: 'none' },
      { v: to, duration: 0.3, ease: 'power2.out' },
    ];
  }

  function stopBreathing() {
    breathTween?.kill();
    breathTween = null;
    if (mul.breath !== 1) gsap.to(mul, { breath: 1, duration: 0.4, onUpdate: applyAll, overwrite: 'auto' });
  }
  function startBreathing() {
    if (breathTween || reducedMotion()) return;
    breathTween = gsap.fromTo(mul, { breath: 1 }, { breath: 0.8, duration: 2.8, ease: 'sine.inOut', yoyo: true, repeat: -1, onUpdate: applyAll });
  }

  function pulse() {
    return gsap
      .timeline()
      .to(mul, { pulse: 1.85, duration: 0.28, ease: 'power2.out', onUpdate: applyAll })
      .to(mul, { pulse: 1, duration: 1.1, ease: 'power2.inOut', onUpdate: applyAll });
  }

  /**
   * p in 0..1 lights floor(p·10) lamps fully and the next one at the remainder.
   * p == null means no video is loaded: one dim lamp by the theater doors.
   */
  function setProgress(p, { animate = true } = {}) {
    lastProgress = p;
    if (testing) return; // the lights test restores this when it ends
    const next = targetsFor(p);
    const full = p != null && p >= 1;
    const wasFull = isFull;
    isFull = full;
    tl?.kill();
    if (!full) stopBreathing();

    if (!animate || reducedMotion()) {
      gsap.killTweensOf(mul, 'pulse');
      mul.pulse = 1;
      lamps.forEach((l, i) => (l.proxy.v = next[i]));
      applyAll();
      if (full) startBreathing();
      return;
    }

    tl = gsap.timeline();
    const ups = [];
    const downs = [];
    next.forEach((t, i) => {
      const cur = lamps[i].proxy.v;
      if (t > cur + 0.001) ups.push(i);
      else if (t < cur - 0.001) downs.push(i);
    });
    // Going dark: the furthest lamp first, back toward the start of the street.
    downs
      .sort((a, b) => b - a)
      .forEach((i, k) => {
        tl.to(lamps[i].proxy, { v: next[i], duration: 0.45, ease: 'power2.in', onUpdate: () => apply(i) }, k * 0.08);
      });
    const upAt = downs.length ? downs.length * 0.08 + 0.15 : 0;
    ups
      .sort((a, b) => a - b)
      .forEach((i, k) => {
        const l = lamps[i];
        const newlyLit = l.proxy.v < 0.05;
        const vars = newlyLit
          ? { keyframes: flicker(next[i]), onUpdate: () => apply(i) }
          : { v: next[i], duration: 0.5, ease: 'power2.out', onUpdate: () => apply(i) };
        tl.to(l.proxy, vars, upAt + k * 0.08);
      });
    if (full && !wasFull) tl.add(pulse(), '>-0.05');
    if (full) tl.call(startBreathing);
  }

  /** Sweep every lamp on and back off, then return to the real progress. */
  function lightsTest() {
    testing?.kill();
    tl?.kill();
    stopBreathing();
    const reduced = reducedMotion();
    const t = gsap.timeline({
      onComplete: () => {
        testing = null;
        setProgress(lastProgress);
      },
    });
    testing = t;
    if (reduced) {
      t.call(() => {
        lamps.forEach((l) => (l.proxy.v = 1));
        applyAll();
      }).to({}, { duration: 1.2 });
      return t;
    }
    lamps.forEach((l, i) => t.to(l.proxy, { keyframes: flicker(1), onUpdate: () => apply(i) }, i * 0.11));
    t.add(pulse(), '>');
    lamps
      .slice()
      .reverse()
      .forEach((l, k) => {
        const i = LAMP_COUNT - 1 - k;
        t.to(l.proxy, { v: 0, duration: 0.4, ease: 'power2.in', onUpdate: () => apply(i) }, `>-${k === 0 ? 0 : 0.32}`);
      });
    t.to({}, { duration: 0.35 });
    return t;
  }

  /** Every lamp at full for celebrations, without changing which progress says are lit. */
  function flare(duration = 1.4) {
    if (reducedMotion()) return gsap.timeline();
    return pulse().duration(duration);
  }

  // ---- environment ------------------------------------------------------------

  function setBrightness(b, { animate = true } = {}) {
    gsap.to(mul, { brightness: b, duration: animate ? 0.6 : 0, ease: 'power2.out', onUpdate: applyAll, overwrite: 'auto' });
  }

  const colorProxy = { r: lampColor.r, g: lampColor.g, b: lampColor.b };
  function paintColor() {
    lampColor.setRGB(colorProxy.r, colorProxy.g, colorProxy.b);
    for (const l of lamps) {
      l.light.color.copy(lampColor);
      l.glassMat.emissive.copy(lampColor);
      l.sprite.material.color.copy(lampColor);
      l.cone.material.uniforms.uColor.value.copy(lampColor);
      l.streak.material.color.copy(lampColor);
    }
  }
  function setWarmth(kelvin, { animate = true } = {}) {
    const c = new THREE.Color(warmthColor(kelvin));
    gsap.to(colorProxy, { r: c.r, g: c.g, b: c.b, duration: animate ? 0.6 : 0, ease: 'power2.out', onUpdate: paintColor, overwrite: true });
  }

  function setWet(w, { animate = true } = {}) {
    gsap.to(mul, { wet: w, duration: animate ? 1.6 : 0, ease: 'sine.inOut', onUpdate: applyAll, overwrite: 'auto' });
  }

  applyAll();

  return {
    group,
    lamps,
    setProgress,
    lightsTest,
    flare,
    setBrightness,
    setWarmth,
    setWet,
    get litCount() {
      return lamps.filter((l) => l.proxy.v > 0.5).length;
    },
    /** World x of the lamp for a progress value (used by the camera and characters). */
    xAt: (p) => X_START + (X_END - X_START) * p,
  };
}
