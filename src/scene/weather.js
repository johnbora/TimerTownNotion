// The night itself: sky gradient, moon, stars, ambient light, fog and weather.
// Rain, snow and leaves animate entirely in their vertex shaders (positions
// wrap with mod()), so particle count costs GPU only, never per-frame JS.

import * as THREE from 'three';
import { gsap } from 'gsap';
import { PALETTE, glowTexture } from './lineStyle.js';
import { isLowPower, reducedMotion } from '../state/settings.js';

// Time-of-night keyframes: 0 dusk, 0.5 midnight, 1 pre-dawn.
const KEYS = [
  { t: 0, top: 0x182321, horizon: 0x4d3c33, glow: 0x7a5440, fog: 0x1a1c16, ambient: 1.0, hemi: 1.1, stars: 0.3, moon: [-34, 9], moonLight: 0.35 },
  { t: 0.5, top: 0x070b08, horizon: 0x1a241c, glow: 0x24301f, fog: 0x10150f, ambient: 0.55, hemi: 0.55, stars: 1, moon: [-11, 16.5], moonLight: 0.45 },
  { t: 1, top: 0x0e1719, horizon: 0x2c3c3f, glow: 0x4a5a5c, fog: 0x141c1c, ambient: 0.8, hemi: 0.85, stars: 0.4, moon: [26, 13], moonLight: 0.3 },
];

function sampleKeys(t) {
  const a = t <= 0.5 ? KEYS[0] : KEYS[1];
  const b = t <= 0.5 ? KEYS[1] : KEYS[2];
  const k = (t <= 0.5 ? t : t - 0.5) / 0.5;
  const s = k * k * (3 - 2 * k);
  const col = (x, y) => new THREE.Color(x).lerp(new THREE.Color(y), s);
  const num = (x, y) => x + (y - x) * s;
  return {
    top: col(a.top, b.top),
    horizon: col(a.horizon, b.horizon),
    glow: col(a.glow, b.glow),
    fog: col(a.fog, b.fog),
    ambient: num(a.ambient, b.ambient),
    hemi: num(a.hemi, b.hemi),
    stars: num(a.stars, b.stars),
    moonAz: num(a.moon[0], b.moon[0]),
    moonEl: num(a.moon[1], b.moon[1]),
    moonLight: num(a.moonLight, b.moonLight),
    duskiness: t < 0.5 ? 1 - t * 2 : 0,
    dawniness: t > 0.5 ? (t - 0.5) * 2 : 0,
  };
}

const skyVertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const skyFragment = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uBottom;
  uniform vec3 uGlow;
  uniform vec3 uGlowDir;
  uniform vec3 uMoonDir;
  uniform float uMoonHaze;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 col = h > 0.0 ? mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.5)) : mix(uHorizon, uBottom, pow(clamp(-h, 0.0, 1.0), 0.35));
    float g = max(dot(d, uGlowDir), 0.0);
    col += uGlow * pow(g, 6.0) * smoothstep(-0.05, 0.25, 0.3 - h) * 0.55;
    float m = max(dot(d, uMoonDir), 0.0);
    col += vec3(0.85, 0.82, 0.72) * pow(m, 220.0) * 0.18 * uMoonHaze + vec3(0.55, 0.6, 0.55) * pow(m, 18.0) * 0.035 * uMoonHaze;
    gl_FragColor = vec4(col, 1.0);
  }`;

const starVertex = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  uniform float uTime;
  uniform float uPixelRatio;
  varying float vTwinkle;
  void main() {
    vTwinkle = 0.65 + 0.35 * sin(uTime * (0.6 + aPhase * 1.7) + aPhase * 40.0);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uPixelRatio;
    gl_Position = projectionMatrix * mv;
  }`;
const starFragment = /* glsl */ `
  uniform float uOpacity;
  varying float vTwinkle;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float a = smoothstep(0.5, 0.0, length(c));
    gl_FragColor = vec4(vec3(0.94, 0.9, 0.83), a * uOpacity * vTwinkle);
  }`;

// ---- particle shaders -----------------------------------------------------------------

const BOX = { x0: -30, x1: 26, y: 20, z0: -3, z1: 17 };

const fogHead = /* glsl */ `
  #include <fog_pars_vertex>
`;

const rainVertex = /* glsl */ `
  attribute vec3 aBase;
  attribute float aEnd;
  attribute float aRand;
  uniform float uTime;
  uniform float uSpeed;
  uniform float uCount;
  uniform float uLen;
  uniform float uWind;
  varying float vAlpha;
  ${fogHead}
  void main() {
    float fall = uTime * uSpeed * (0.85 + aRand * 0.3);
    vec3 p = aBase;
    p.y = mod(aBase.y - fall, ${BOX.y.toFixed(1)});
    p.x += uWind * p.y * 0.12;
    vec3 dir = normalize(vec3(uWind * 0.12, -1.0, 0.0));
    p -= dir * aEnd * uLen * (0.7 + aRand * 0.6);
    vAlpha = (aRand < uCount ? 1.0 : 0.0) * (1.0 - aEnd * 0.9);
    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;
const rainFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vAlpha;
  #include <fog_pars_fragment>
  void main() {
    if (vAlpha <= 0.0) discard;
    gl_FragColor = vec4(uColor, vAlpha * uOpacity);
    #include <fog_fragment>
  }`;

const flakeVertex = /* glsl */ `
  attribute vec3 aBase;
  attribute float aRand;
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uSpeed;
  uniform float uCount;
  uniform float uSize;
  uniform float uSway;
  uniform float uPixelRatio;
  varying float vAlpha;
  varying float vAngle;
  varying vec3 vColor;
  ${fogHead}
  void main() {
    float t = uTime * uSpeed * (0.6 + aRand * 0.8);
    vec3 p = aBase;
    p.y = mod(aBase.y - t, ${BOX.y.toFixed(1)});
    float w = uTime * (0.5 + aRand) + aRand * 6.2831;
    p.x += sin(w) * uSway + uTime * uSpeed * 0.18 * uSway;
    p.x = ${BOX.x0.toFixed(1)} + mod(p.x - ${BOX.x0.toFixed(1)}, ${(BOX.x1 - BOX.x0).toFixed(1)});
    p.z += cos(w * 0.7) * uSway * 0.6;
    vAngle = uTime * (0.8 + aRand * 2.2) * (aRand > 0.5 ? 1.0 : -1.0) + aRand * 10.0;
    vAlpha = aRand < uCount ? 1.0 : 0.0;
    vColor = aColor;
    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = uSize * (0.6 + aRand * 0.8) * uPixelRatio * (40.0 / max(1.0, -mvPosition.z));
    #include <fog_vertex>
  }`;
const flakeFragment = /* glsl */ `
  uniform float uOpacity;
  uniform sampler2D uMap;
  uniform float uUseMap;
  varying float vAlpha;
  varying float vAngle;
  varying vec3 vColor;
  #include <fog_pars_fragment>
  void main() {
    if (vAlpha <= 0.0) discard;
    vec2 c = gl_PointCoord - 0.5;
    float a;
    if (uUseMap > 0.5) {
      float s = sin(vAngle), co = cos(vAngle);
      vec2 r = vec2(co * c.x - s * c.y, s * c.x + co * c.y) + 0.5;
      if (r.x < 0.0 || r.x > 1.0 || r.y < 0.0 || r.y > 1.0) discard;
      a = texture2D(uMap, r).a;
    } else {
      a = smoothstep(0.5, 0.15, length(c));
    }
    if (a < 0.02) discard;
    gl_FragColor = vec4(vColor, a * uOpacity);
    #include <fog_fragment>
  }`;

function leafTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.translate(32, 32);
  g.rotate(-0.6);
  g.fillStyle = '#fff';
  g.beginPath();
  g.moveTo(0, -26);
  g.bezierCurveTo(18, -14, 16, 12, 0, 24);
  g.bezierCurveTo(-16, 12, -18, -14, 0, -26);
  g.fill();
  g.globalCompositeOperation = 'destination-out';
  g.strokeStyle = 'rgba(0,0,0,0.6)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(0, -20);
  g.lineTo(0, 22);
  for (let i = -1; i <= 1; i++) {
    g.moveTo(0, i * 8);
    g.lineTo(9, i * 8 - 7);
    g.moveTo(0, i * 8);
    g.lineTo(-9, i * 8 - 7);
  }
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  return t;
}

export function createWeather({ scene, camera, pixelRatio = 1 }) {
  const low = isLowPower();

  // ---- lights ----------------------------------------------------------------------
  const ambient = new THREE.AmbientLight(0x8d978a, 0.5);
  const hemi = new THREE.HemisphereLight(0x51625c, 0x10150f, 0.5);
  const moonLight = new THREE.DirectionalLight(0xc9d3dc, 0.4);
  scene.add(ambient, hemi, moonLight, moonLight.target);

  // ---- sky -------------------------------------------------------------------------
  const skyUniforms = {
    uTop: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uBottom: { value: new THREE.Color(PALETTE.bg) },
    uGlow: { value: new THREE.Color() },
    uGlowDir: { value: new THREE.Vector3(-0.6, 0.05, -0.8).normalize() },
    uMoonDir: { value: new THREE.Vector3(0, 0.3, -1).normalize() },
    uMoonHaze: { value: 1 },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(600, 32, 16),
    new THREE.ShaderMaterial({ uniforms: skyUniforms, vertexShader: skyVertex, fragmentShader: skyFragment, side: THREE.BackSide, depthWrite: false, fog: false }),
  );
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  scene.add(sky);

  // Stars.
  const STAR_N = low ? 500 : 1100;
  const starPos = new Float32Array(STAR_N * 3);
  const starSize = new Float32Array(STAR_N);
  const starPhase = new Float32Array(STAR_N);
  for (let i = 0; i < STAR_N; i++) {
    const az = Math.random() * Math.PI * 2;
    const el = Math.asin(0.06 + Math.random() * 0.94);
    const r = 500;
    starPos.set([Math.cos(el) * Math.sin(az) * r, Math.sin(el) * r, -Math.cos(el) * Math.cos(az) * r], i * 3);
    starSize[i] = Math.random() < 0.08 ? 2.6 + Math.random() * 1.6 : 1.0 + Math.random() * 1.3;
    starPhase[i] = Math.random();
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute('aSize', new THREE.BufferAttribute(starSize, 1));
  starGeo.setAttribute('aPhase', new THREE.BufferAttribute(starPhase, 1));
  const starMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 1 }, uPixelRatio: { value: pixelRatio } },
    vertexShader: starVertex,
    fragmentShader: starFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  const stars = new THREE.Points(starGeo, starMat);
  stars.renderOrder = -9;
  stars.frustumCulled = false;
  scene.add(stars);

  // Moon: a cream disc with faint line-drawn craters and a soft halo.
  const moonTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(118, 112, 10, 128, 128, 126);
    grd.addColorStop(0, '#fffaf0');
    grd.addColorStop(0.85, '#efe7d4');
    grd.addColorStop(1, '#d9cfb8');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(128, 128, 126, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(120,112,92,0.45)';
    g.lineWidth = 3;
    [[90, 96, 22], [160, 150, 30], [150, 80, 12], [100, 170, 16], [185, 110, 9]].forEach(([x, y, r]) => {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.stroke();
    });
    g.fillStyle = 'rgba(150,140,115,0.18)';
    g.beginPath();
    g.ellipse(120, 140, 50, 34, 0.4, 0, Math.PI * 2);
    g.fill();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const moon = new THREE.Group();
  const moonDisc = new THREE.Mesh(
    new THREE.CircleGeometry(6.5, 48),
    new THREE.MeshBasicMaterial({ map: moonTex, color: new THREE.Color(1.3, 1.26, 1.15), transparent: true, fog: false, depthWrite: false }),
  );
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: glowTexture(), color: 0xd8d6c4, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
  );
  halo.scale.setScalar(40);
  moon.add(halo, moonDisc);
  moon.renderOrder = -8;
  moonDisc.renderOrder = -7;
  scene.add(moon);

  // ---- weather particles ---------------------------------------------------------------
  const fogUniforms = THREE.UniformsLib.fog;
  const weatherScale = low ? 0.5 : 1;

  function rainSystem() {
    const N = Math.round(2600 * weatherScale);
    const base = new Float32Array(N * 2 * 3);
    const end = new Float32Array(N * 2);
    const rnd = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      const x = BOX.x0 + Math.random() * (BOX.x1 - BOX.x0);
      const y = Math.random() * BOX.y;
      const z = BOX.z0 + Math.random() * (BOX.z1 - BOX.z0);
      const r = Math.random();
      for (let k = 0; k < 2; k++) {
        base.set([x, y, z], (i * 2 + k) * 3);
        end[i * 2 + k] = k;
        rnd[i * 2 + k] = r;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(base.slice(), 3));
    geo.setAttribute('aBase', new THREE.BufferAttribute(base, 3));
    geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    geo.setAttribute('aRand', new THREE.BufferAttribute(rnd, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([
        fogUniforms,
        {
          uTime: { value: 0 }, uSpeed: { value: 16 }, uCount: { value: 0.5 }, uLen: { value: 0.55 }, uWind: { value: 0.6 },
          uColor: { value: new THREE.Color(0xcfd6cc) }, uOpacity: { value: 0 },
        },
      ]),
      vertexShader: rainVertex,
      fragmentShader: rainFragment,
      transparent: true,
      depthWrite: false,
      fog: true,
    });
    const obj = new THREE.LineSegments(geo, mat);
    obj.frustumCulled = false;
    obj.visible = false;
    return obj;
  }

  function flakeSystem(kind) {
    const isLeaf = kind === 'leaves';
    const N = Math.round((isLeaf ? 420 : 2200) * weatherScale);
    const base = new Float32Array(N * 3);
    const rnd = new Float32Array(N);
    const col = new Float32Array(N * 3);
    const leafCols = [PALETTE.gold, PALETTE.rose, PALETTE.sage, 0xb07a4a, PALETTE.gold].map((h) => new THREE.Color(h));
    const snow = new THREE.Color(PALETTE.cream);
    for (let i = 0; i < N; i++) {
      base.set([BOX.x0 + Math.random() * (BOX.x1 - BOX.x0), Math.random() * BOX.y, BOX.z0 + Math.random() * (BOX.z1 - BOX.z0)], i * 3);
      rnd[i] = Math.random();
      const c = isLeaf ? leafCols[i % leafCols.length] : snow;
      col.set([c.r, c.g, c.b], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(base.slice(), 3));
    geo.setAttribute('aBase', new THREE.BufferAttribute(base, 3));
    geo.setAttribute('aRand', new THREE.BufferAttribute(rnd, 1));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([
        fogUniforms,
        {
          uTime: { value: 0 }, uSpeed: { value: isLeaf ? 1.1 : 1.4 }, uCount: { value: 0.5 }, uSize: { value: isLeaf ? 9 : 4.2 },
          uSway: { value: isLeaf ? 1.4 : 0.5 }, uPixelRatio: { value: pixelRatio }, uOpacity: { value: 0 },
          uMap: { value: isLeaf ? leafTexture() : null }, uUseMap: { value: isLeaf ? 1 : 0 },
        },
      ]),
      vertexShader: flakeVertex,
      fragmentShader: flakeFragment,
      transparent: true,
      depthWrite: false,
      fog: true,
    });
    const obj = new THREE.Points(geo, mat);
    obj.frustumCulled = false;
    obj.visible = false;
    return obj;
  }

  const systems = { rain: rainSystem(), snow: flakeSystem('snow'), leaves: flakeSystem('leaves') };
  Object.values(systems).forEach((s) => scene.add(s));
  const SPEEDS = { rain: [11, 22], snow: [0.8, 2.0], leaves: [0.7, 1.6] };
  const OPACITY = { rain: 0.32, snow: 0.85, leaves: 0.95 };
  let current = 'clear';
  let intensity = 0.5;
  const listeners = [];

  function applyIntensity(animate = true) {
    for (const [name, sys] of Object.entries(systems)) {
      const [s0, s1] = SPEEDS[name];
      const speed = (s0 + (s1 - s0) * intensity) * (reducedMotion() ? 0.5 : 1);
      gsap.to(sys.material.uniforms.uCount, { value: intensity, duration: animate ? 0.6 : 0, overwrite: 'auto' });
      sys.material.uniforms.uSpeed.value = speed;
    }
  }

  function setWeather(name, { animate = true } = {}) {
    current = name;
    for (const [n, sys] of Object.entries(systems)) {
      const on = n === name;
      const u = sys.material.uniforms.uOpacity;
      if (on) sys.visible = true;
      gsap.to(u, {
        value: on ? OPACITY[n] : 0,
        duration: animate ? 1.2 : 0,
        ease: 'sine.inOut',
        overwrite: true,
        onComplete: () => {
          if (!on) sys.visible = false;
        },
      });
    }
    listeners.forEach((fn) => fn(name));
  }

  function setIntensity(v, { animate = true } = {}) {
    intensity = v;
    applyIntensity(animate);
  }

  // ---- time of night + fog ----------------------------------------------------------------

  scene.fog = new THREE.FogExp2(PALETTE.bg, 0.012);
  const night = { t: 0.5 };
  const fogState = { amount: 0.35 };
  let nightLook = sampleKeys(0.5);

  function applyNight() {
    const k = sampleKeys(night.t);
    nightLook = k;
    skyUniforms.uTop.value.copy(k.top);
    skyUniforms.uHorizon.value.copy(k.horizon);
    skyUniforms.uGlow.value.copy(k.glow);
    // Dusk glows in the west (left), pre-dawn in the east (right).
    skyUniforms.uGlowDir.value.set(k.duskiness > 0 ? -0.75 : 0.75, 0.02, -0.66).normalize();
    ambient.intensity = k.ambient;
    hemi.intensity = k.hemi;
    starMat.uniforms.uOpacity.value = k.stars;
    const az = THREE.MathUtils.degToRad(k.moonAz);
    const el = THREE.MathUtils.degToRad(k.moonEl);
    const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
    skyUniforms.uMoonDir.value.copy(dir);
    moon.position.copy(dir).multiplyScalar(420);
    moon.lookAt(0, 0, 0);
    moonLight.position.copy(dir).multiplyScalar(60);
    moonLight.intensity = k.moonLight;
    applyFog();
  }

  function applyFog() {
    const f = fogState.amount;
    baseDensity = 0.002 + Math.pow(f, 1.4) * 0.055;
    scene.fog.density = baseDensity * fogScale;
    scene.fog.color.copy(nightLook.fog);
    skyUniforms.uMoonHaze.value = 1 + f * 2;
    halo.material.opacity = 0.15 + f * 0.17;
    // Fog dims the sky toward the fog color.
    skyUniforms.uTop.value.lerp(nightLook.fog, f * 0.6);
    skyUniforms.uHorizon.value.lerp(nightLook.fog, f * 0.35);
    starMat.uniforms.uOpacity.value = nightLook.stars * (1 - f * 0.85);
  }

  // Fog is tuned for the desktop street view (~26 units back). When the camera
  // sits farther away (narrow phone screens, zoomed out) thin it out so the
  // town isn't washed over.
  let baseDensity = 0.012;
  let fogScale = 1;
  function setViewDistance(d) {
    const s = Math.min(1, Math.max(0.3, 26 / Math.max(1, d)));
    if (Math.abs(s - fogScale) < 0.01) return;
    fogScale = s;
    scene.fog.density = baseDensity * fogScale;
  }

  function setTimeOfNight(t, { animate = true } = {}) {
    gsap.to(night, { t, duration: animate ? 0.9 : 0, ease: 'power2.out', onUpdate: applyNight, overwrite: true });
  }
  function setFog(amount, { animate = true } = {}) {
    gsap.to(fogState, { amount, duration: animate ? 0.9 : 0, ease: 'power2.out', onUpdate: applyNight, overwrite: true });
  }

  applyNight();
  applyIntensity(false);

  function update(dt, time) {
    sky.position.copy(camera.position);
    stars.position.copy(camera.position);
    starMat.uniforms.uTime.value = time;
    for (const sys of Object.values(systems)) if (sys.visible) sys.material.uniforms.uTime.value = time;
  }

  return {
    update,
    setTimeOfNight,
    setFog,
    setViewDistance,
    setWeather,
    setIntensity,
    onWeather: (fn) => listeners.push(fn),
    get weather() {
      return current;
    },
    moon,
  };
}
