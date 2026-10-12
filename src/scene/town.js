// One street block at night, seen from across the road.
// Buildings front onto z = 0; the sidewalk runs z 0 → 2.5 (top at y = 0.15);
// the road runs z 2.5 → 12.5. The picture house sits at x = 0.

import * as THREE from 'three';
import { gsap } from 'gsap';
import { outlined, segments, rectSegs, mergeStatic, mergeStaticMeshes, flat, FILL, PALETTE } from './lineStyle.js';
import { reducedMotion } from '../state/settings.js';

export const SIDEWALK_Y = 0.15;
export const CURB_Z = 2.5;

/** Seeded random so the block looks the same on every visit. */
function rng(seed = 7) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Wait for the web fonts (with a timeout so a blocked font CDN never hangs us). */
let fontsPromise = null;
export function fontsReady() {
  if (fontsPromise) return fontsPromise;
  const loads = ['400 64px "EB Garamond"', 'italic 400 64px "EB Garamond"', '500 64px "EB Garamond"', '64px "Pinyon Script"'].map((f) =>
    document.fonts?.load(f).catch(() => null),
  );
  fontsPromise = Promise.race([
    Promise.all(loads).then(() => document.fonts?.ready),
    new Promise((r) => setTimeout(r, 4000)),
  ]).catch(() => null);
  return fontsPromise;
}

export function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const redraw = () => {
    const g = c.getContext('2d');
    g.clearRect(0, 0, w, h);
    draw(g, w, h);
    tex.needsUpdate = true;
  };
  redraw();
  tex.userData.redraw = redraw;
  return tex;
}

const SERIF = '"EB Garamond", Garamond, Georgia, serif';
const SCRIPT = '"Pinyon Script", "Snell Roundhand", cursive';

function spaced(g, text, x, y, spacing) {
  // Letter-spaced text centered on x (canvas letterSpacing isn't everywhere yet).
  const chars = [...text];
  const widths = chars.map((ch) => g.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  let cx = x - total / 2;
  g.textAlign = 'left';
  chars.forEach((ch, i) => {
    g.fillText(ch, cx, y);
    cx += widths[i] + spacing;
  });
}

export function createTown(scene) {
  const root = new THREE.Group();
  root.name = 'town';
  scene.add(root);
  const statics = new THREE.Group();
  root.add(statics);
  const rand = rng(1010);

  const segBuckets = new Map();
  const addSegs = (arr, opacity = 0.5) => {
    const key = opacity.toFixed(2);
    if (!segBuckets.has(key)) segBuckets.set(key, { opacity, data: [] });
    segBuckets.get(key).data.push(...arr);
  };

  function block(x0, x1, y0, y1, z0, z1, mat = flat(FILL.mid), { opacity = 0.72, parent = statics, outline = true } = {}) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    parent.add(m);
    if (outline) outlined(m, { opacity });
    return m;
  }

  // ---- windows (instanced quads) -----------------------------------------------

  const windows = []; // { x0, y0, x1, y1, z, kind }
  function windowAt(x0, y0, x1, y1, z = 0.025, { kind = 'upper', frame = 0.5, cross = true, sill = true } = {}) {
    windows.push({ x0, y0, x1, y1, z, kind });
    addSegs(rectSegs(x0, y0, x1, y1, z + 0.012, { cross }), frame);
    if (sill) block(x0 - 0.08, x1 + 0.08, y0 - 0.08, y0, z - 0.012, z + 0.12, flat(FILL.trim), { opacity: 0.55 });
  }

  // ---- ground ----------------------------------------------------------------------

  const streetMat = new THREE.MeshPhongMaterial({
    color: 0x151b14,
    emissive: 0x0d120c,
    specular: 0x000000,
    shininess: 18,
  });
  const street = new THREE.Mesh(new THREE.PlaneGeometry(220, 140), streetMat);
  street.rotation.x = -Math.PI / 2;
  street.position.set(0, 0, 10);
  root.add(street);

  // Puddle map for the wet street: brighter = wetter (used as specularMap).
  const puddles = canvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = '#5a5a5a';
    g.fillRect(0, 0, w, h);
    const r = rng(42);
    for (let i = 0; i < 60; i++) {
      const x = r() * w;
      const y = r() * h;
      const rad = 12 + r() * 60;
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      grd.addColorStop(0, 'rgba(255,255,255,0.95)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.beginPath();
      g.ellipse(x, y, rad * (1.2 + r()), rad, r() * Math.PI, 0, Math.PI * 2);
      g.fill();
    }
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(0,0,0,${0.15 + r() * 0.25})`;
      g.beginPath();
      g.ellipse(r() * w, r() * h, 10 + r() * 50, 8 + r() * 30, r() * Math.PI, 0, Math.PI * 2);
      g.fill();
    }
  });
  puddles.colorSpace = THREE.NoColorSpace;
  puddles.wrapS = puddles.wrapT = THREE.RepeatWrapping;
  puddles.repeat.set(10, 6);
  streetMat.specularMap = puddles;

  const walkMat = flat(0x20281f, { emissive: 0.45 });
  const sidewalk = block(-34, 34, 0, SIDEWALK_Y, 0, CURB_Z, walkMat, { opacity: 0.6 });
  sidewalk.name = 'sidewalk';
  const farWalk = block(-60, 60, 0, SIDEWALK_Y, 12.5, 16, walkMat, { opacity: 0.4 });
  farWalk.name = 'far-sidewalk';
  // Slab joints.
  for (let x = -33; x <= 33; x += 1.6) addSegs([x, SIDEWALK_Y + 0.002, 0, x, SIDEWALK_Y + 0.002, CURB_Z], 0.16);
  addSegs([-34, SIDEWALK_Y + 0.002, CURB_Z - 0.18, 34, SIDEWALK_Y + 0.002, CURB_Z - 0.18], 0.22);

  // Dashed center line.
  {
    const dashGeo = [];
    for (let x = -60; x < 60; x += 2.6) {
      const g = new THREE.PlaneGeometry(1.2, 0.1);
      g.rotateX(-Math.PI / 2);
      g.translate(x, 0.004, 7.5);
      dashGeo.push(g);
    }
    const merged = mergeGeometries(dashGeo);
    const dashes = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ color: PALETTE.cream, transparent: true, opacity: 0.2, depthWrite: false }));
    root.add(dashes);
  }

  // ---- far left: a corner shop -----------------------------------------------------

  const D = -9; // building depth
  block(-20.5, -15.2, 0, 6.2, D, 0, flat(FILL.dark));
  block(-20.7, -15.0, 6.2, 6.55, -0.3, 0.25, flat(FILL.trim)); // cornice
  windowAt(-19.9, 0.6, -17.3, 2.5, 0.025, { kind: 'ground', cross: false, sill: false });
  addSegs(rectSegs(-16.7, SIDEWALK_Y, -15.8, 2.35, 0.012, { hbars: 1 }), 0.55);
  [-19.35, -17.85, -16.35].forEach((cx) => windowAt(cx - 0.45, 3.4, cx + 0.45, 5.0));
  block(-19.6, -19.0, 6.55, 7.6, -6, -5.2, flat(FILL.mid), { opacity: 0.5 }); // chimney
  // Awning
  {
    const aw = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.06, 0.9), flat(FILL.trim));
    aw.position.set(-18.6, 2.85, 0.42);
    aw.rotation.x = 0.28;
    statics.add(aw);
    outlined(aw, { opacity: 0.6 });
  }

  // ---- left: brick block with two upper floors ------------------------------------

  block(-15.2, -9.8, 0, 8.6, D, 0, flat(FILL.mid));
  block(-15.4, -9.6, 8.6, 9.0, -0.3, 0.28, flat(FILL.trim));
  for (let y = 0.6; y < 8.5; y += 0.42) addSegs([-15.2, y, 0.006, -9.8, y, 0.006], 0.1);
  windowAt(-14.7, 0.6, -11.7, 2.6, 0.025, { kind: 'ground', cross: false, sill: false });
  addSegs(rectSegs(-11.1, SIDEWALK_Y, -10.2, 2.4, 0.012, { hbars: 1 }), 0.55);
  for (const y of [3.4, 6.0]) [-14.1, -12.5, -10.9].forEach((cx) => windowAt(cx - 0.5, y, cx + 0.5, y + 1.6));
  block(-11.2, -10.4, 9.0, 10.2, -5, -4.2, flat(FILL.dark), { opacity: 0.5 });

  // ---- left neighbor: low, vertical siding, one window ---------------------------

  block(-9.8, -4.6, 0, 4.4, D, 0, flat(FILL.light));
  block(-9.9, -4.6, 4.4, 4.62, -0.25, 0.14, flat(FILL.trim));
  for (let x = -9.62; x < -4.7; x += 0.3) addSegs([x, SIDEWALK_Y, 0.006, x, 4.36, 0.006], 0.2);
  windowAt(-7.9, 1.35, -6.5, 2.95, 0.02, { kind: 'neighbor', cross: true });
  block(-8.05, -6.35, 2.95, 3.08, 0, 0.14, flat(FILL.trim), { opacity: 0.55 }); // lintel
  block(-6.2, -5.7, 4.62, 5.3, -3, -2.5, flat(FILL.mid), { opacity: 0.45 }); // vent

  // ---- the picture house ------------------------------------------------------------

  const theater = new THREE.Group();
  theater.name = 'picture-house';
  statics.add(theater);
  const T = (x0, x1, y0, y1, z0, z1, mat, opts) => block(x0, x1, y0, y1, z0, z1, mat, { parent: theater, ...opts });

  T(-4.6, 4.6, 0, 9.0, -10, 0, flat(FILL.deep));
  T(-4.62, -4.22, 0, 9.0, 0, 0.2, flat(FILL.light)); // pilasters
  T(4.22, 4.62, 0, 9.0, 0, 0.2, flat(FILL.light));
  T(-4.8, 4.8, 8.8, 9.15, -0.2, 0.32, flat(FILL.trim)); // cornice
  // Stepped parapet.
  T(-4.6, 4.6, 9.15, 9.75, -0.4, 0.05, flat(FILL.mid));
  T(-3.3, 3.3, 9.75, 10.45, -0.4, 0.05, flat(FILL.mid));
  T(-1.55, 1.55, 10.45, 12.05, -0.4, 0.05, flat(FILL.mid));
  T(-1.7, 1.7, 12.05, 12.18, -0.5, 0.15, flat(FILL.trim));

  // Clock face.
  const clockCenter = new THREE.Vector3(0, 11.2, 0.07);
  {
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.66, 48), flat(0x232b21, { emissive: 0.9 }));
    face.position.copy(clockCenter);
    theater.add(face);
    outlined(face, { opacity: 0.85 });
    const ring = [];
    for (let i = 0; i < 64; i++) {
      const a0 = (i / 64) * Math.PI * 2;
      const a1 = ((i + 1) / 64) * Math.PI * 2;
      ring.push(Math.cos(a0) * 0.55, 11.2 + Math.sin(a0) * 0.55, 0.075, Math.cos(a1) * 0.55, 11.2 + Math.sin(a1) * 0.55, 0.075);
    }
    addSegs(ring, 0.35);
    const ticks = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const r0 = i % 3 === 0 ? 0.4 : 0.47;
      ticks.push(Math.sin(a) * r0, 11.2 + Math.cos(a) * r0, 0.076, Math.sin(a) * 0.55, 11.2 + Math.cos(a) * 0.55, 0.076);
    }
    addSegs(ticks, 0.8);
  }

  // Sign band above the marquee.
  const signTex = canvasTexture(1024, 128, (g, w, h) => {
    g.fillStyle = '#efe7d4';
    g.font = `500 64px ${SERIF}`;
    g.textBaseline = 'middle';
    spaced(g, 'THE PICTURE HOUSE', w / 2, h / 2 + 4, 14);
  });
  {
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(5.6, 0.7),
      new THREE.MeshBasicMaterial({ map: signTex, transparent: true, color: new THREE.Color(0.78, 0.76, 0.7) }),
    );
    sign.position.set(0, 5.42, 0.035);
    theater.add(sign);
    addSegs(rectSegs(-3.05, 5.07, 3.05, 5.77, 0.015), 0.5);
  }

  // Three arched upper windows, softly lit from inside.
  const archMats = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.lamp).multiplyScalar(0.62), map: windowTexture() });
  for (const cx of [-2.6, 0, 2.6]) {
    const w = 1.3;
    const s = new THREE.Shape();
    s.moveTo(-w / 2, 0);
    s.lineTo(w / 2, 0);
    s.lineTo(w / 2, 1.8);
    s.absarc(0, 1.8, w / 2, 0, Math.PI, false);
    s.lineTo(-w / 2, 0);
    const geo = new THREE.ShapeGeometry(s, 16);
    const uv = geo.attributes.uv;
    const top = 1.8 + w / 2;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) / w + 0.5, uv.getY(k) / top);
    const win = new THREE.Mesh(geo, archMats);
    win.position.set(cx, 6.0, 0.025);
    theater.add(win);
    outlined(win, { opacity: 0.8 });
    addSegs([cx, 6.0, 0.04, cx, 6.0 + 1.8 + w / 2, 0.04, cx - w / 2, 7.8, 0.04, cx + w / 2, 7.8, 0.04], 0.55);
    block(cx - 0.8, cx + 0.8, 5.88, 6.0, -0.02, 0.16, flat(FILL.trim), { parent: theater, opacity: 0.6 });
  }

  // Marquee box (the lettered face, bulbs and the clock's hands belong to marquee.js).
  const MQ = { x0: -4.25, x1: 4.25, y0: 3.45, y1: 5.0, z: 2.1 };
  T(MQ.x0, MQ.x1, MQ.y0, MQ.y1, 0, MQ.z, flat(FILL.mid));
  T(MQ.x0 - 0.06, MQ.x1 + 0.06, MQ.y1, MQ.y1 + 0.1, -0.02, MQ.z + 0.06, flat(FILL.trim), { opacity: 0.6 });
  // Scalloped canopy edge under the marquee.
  {
    const n = 17;
    const width = MQ.x1 - MQ.x0;
    const r = width / n / 2;
    const s = new THREE.Shape();
    s.moveTo(MQ.x0, 0);
    s.lineTo(MQ.x1, 0);
    s.lineTo(MQ.x1, -0.06);
    for (let i = n - 1; i >= 0; i--) {
      const cx = MQ.x0 + r + i * 2 * r;
      s.absarc(cx, -0.06, r, 0, Math.PI, true);
    }
    s.lineTo(MQ.x0, 0);
    const scallop = new THREE.Mesh(new THREE.ShapeGeometry(s, 6), flat(FILL.trim, { side: THREE.DoubleSide }));
    scallop.position.set(0, MQ.y0, MQ.z + 0.012);
    theater.add(scallop);
    outlined(scallop, { opacity: 0.75 });
  }

  // Entrance: steps, three double doors, transoms, poster frames.
  T(-2.75, 2.75, SIDEWALK_Y, 0.27, 0, 0.78, flat(FILL.light), { opacity: 0.6 });
  T(-2.55, 2.55, 0.27, 0.39, 0, 0.4, flat(FILL.light), { opacity: 0.6 });

  const lobbyMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.lamp).multiplyScalar(0.9) });
  const doorLeaves = [];
  const leafMat = flat(0x1f281e, { emissive: 0.6 });
  const DOOR = { w: 1.3, y0: 0.39, h: 2.42 };
  for (const cx of [-1.6, 0, 1.6]) {
    // Warm lobby light behind the doors; hidden until they swing open.
    const lobby = new THREE.Mesh(new THREE.PlaneGeometry(DOOR.w, DOOR.h), lobbyMat);
    lobby.position.set(cx, DOOR.y0 + DOOR.h / 2, 0.014);
    theater.add(lobby);
    addSegs(rectSegs(cx - DOOR.w / 2 - 0.05, DOOR.y0, cx + DOOR.w / 2 + 0.05, DOOR.y0 + DOOR.h + 0.05, 0.01), 0.75);
    // Transom.
    windowAt(cx - DOOR.w / 2, 2.95, cx + DOOR.w / 2, 3.32, 0.025, { kind: 'transom', cross: false, sill: false, frame: 0.6 });
    addSegs([cx - 0.22, 2.95, 0.02, cx - 0.22, 3.32, 0.02, cx + 0.22, 2.95, 0.02, cx + 0.22, 3.32, 0.02], 0.5);

    for (const side of [-1, 1]) {
      const hinge = new THREE.Group();
      hinge.userData.dynamic = true;
      hinge.position.set(cx + side * (DOOR.w / 2), DOOR.y0, 0.05);
      theater.add(hinge);
      const lw = DOOR.w / 2 - 0.01;
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(lw, DOOR.h, 0.06), leafMat);
      leaf.position.set(-side * (lw / 2), DOOR.h / 2, 0);
      hinge.add(leaf);
      outlined(leaf, { opacity: 0.8, dynamic: true });
      // Small panes in the upper part of each leaf, and a push plate.
      const panes = [];
      const px0 = -lw / 2 + 0.09;
      const px1 = lw / 2 - 0.09;
      for (let r = 0; r < 3; r++) {
        const y0 = 0.25 + r * 0.32;
        panes.push(...rectSegs(px0, y0, px1, y0 + 0.26, 0.032, { vbars: 1 }));
      }
      const plate = [0, -0.35, 0.032, 0, -0.05, 0.032];
      plate[0] = plate[3] = side * (lw / 2 - 0.1);
      segments(leaf, [...panes, ...plate], { opacity: 0.6, dynamic: true });
      hinge.userData.openAngle = side * -1.3; // left leaves swing to +z with a negative turn
      doorLeaves.push(hinge);
    }
  }
  // Door pilasters between the double doors.
  for (const x of [-2.32, -0.8, 0.8, 2.32]) T(x - 0.07, x + 0.07, DOOR.y0, 3.38, 0, 0.12, flat(FILL.light), { opacity: 0.55 });
  T(-2.45, 2.45, 2.83, 2.95, 0, 0.14, flat(FILL.trim), { opacity: 0.55 });

  // Poster frames.
  const posterTex = [
    canvasTexture(256, 512, (g, w, h) => drawPoster(g, w, h, 'left')),
    canvasTexture(256, 512, (g, w, h) => drawPoster(g, w, h, 'right')),
  ];
  [-3.45, 3.45].forEach((cx, i) => {
    T(cx - 0.52, cx + 0.52, 0.75, 2.85, 0, 0.08, flat(FILL.trim), { opacity: 0.75 });
    const poster = new THREE.Mesh(
      new THREE.PlaneGeometry(0.86, 1.92),
      new THREE.MeshBasicMaterial({ map: posterTex[i], color: new THREE.Color(0.85, 0.83, 0.78) }),
    );
    poster.position.set(cx, 1.8, 0.1);
    theater.add(poster);
    addSegs(rectSegs(cx - 0.43, 0.84, cx + 0.43, 2.76, 0.115), 0.6);
  });

  // ---- right neighbor: tall, with a zig-zag fire escape ---------------------------

  block(4.6, 9.8, 0, 12.6, D, 0, flat(FILL.mid));
  block(4.5, 9.95, 12.6, 13.0, -0.3, 0.3, flat(FILL.trim));
  windowAt(5.2, 0.6, 8.0, 2.75, 0.025, { kind: 'ground', cross: false, sill: false });
  addSegs(rectSegs(8.4, SIDEWALK_Y, 9.3, 2.55, 0.012, { hbars: 1 }), 0.55);
  const floors = [3.6, 6.6, 9.6];
  for (const y of floors) [5.7, 7.2, 8.7].forEach((cx) => windowAt(cx - 0.42, y, cx + 0.42, y + 1.45));
  {
    const fe = [];
    const landings = [3.3, 6.3, 9.3];
    const fx0 = 5.05;
    const fx1 = 9.35;
    const fz = 0.95;
    landings.forEach((y, k) => {
      block(fx0, fx1, y - 0.06, y, 0, fz, flat(FILL.trim), { opacity: 0.7 });
      const top = y + 0.85;
      fe.push(fx0, top, fz, fx1, top, fz, fx0, top, 0, fx0, top, fz, fx1, top, 0, fx1, top, fz);
      fe.push(fx0, y + 0.42, fz, fx1, y + 0.42, fz);
      for (let x = fx0; x <= fx1 + 0.01; x += 0.36) fe.push(x, y, fz, x, top, fz);
      fe.push(fx0, y, 0, fx0, top, 0, fx1, y, 0, fx1, top, 0);
      // Stairs up to the next landing, alternating direction.
      const next = landings[k + 1] ?? 12.4;
      const goingLeft = k % 2 === 0;
      const sx0 = goingLeft ? 8.9 : 5.5;
      const sx1 = goingLeft ? 5.5 : 8.9;
      for (const z of [0.28, 0.72]) fe.push(sx0, y, z, sx1, next, z);
      const steps = 11;
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        const x = sx0 + (sx1 - sx0) * t;
        const yy = y + (next - y) * t;
        fe.push(x, yy, 0.28, x, yy, 0.72);
      }
      // Handrail.
      fe.push(sx0, y + 0.8, 0.72, sx1, next + 0.8, 0.72);
    });
    // Drop ladder below the first landing.
    fe.push(8.65, 1.9, fz, 8.65, 3.24, fz, 9.05, 1.9, fz, 9.05, 3.24, fz);
    for (let y = 2.0; y < 3.2; y += 0.24) fe.push(8.65, y, fz, 9.05, y, fz);
    addSegs(fe, 0.62);
  }

  // ---- right: gabled house ------------------------------------------------------------

  block(9.8, 14.8, 0, 7.0, D, 0, flat(FILL.dark));
  {
    const s = new THREE.Shape();
    s.moveTo(9.6, 7.0);
    s.lineTo(15.0, 7.0);
    s.lineTo(12.3, 9.5);
    s.lineTo(9.6, 7.0);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 9.2, bevelEnabled: false });
    geo.translate(0, 0, -9.1);
    const roof = new THREE.Mesh(geo, flat(FILL.mid));
    statics.add(roof);
    outlined(roof, { opacity: 0.72 });
    const ring = [];
    for (let i = 0; i < 40; i++) {
      const a0 = (i / 40) * Math.PI * 2;
      const a1 = ((i + 1) / 40) * Math.PI * 2;
      ring.push(12.3 + Math.cos(a0) * 0.42, 8.05 + Math.sin(a0) * 0.42, 0.13, 12.3 + Math.cos(a1) * 0.42, 8.05 + Math.sin(a1) * 0.42, 0.13);
    }
    ring.push(11.88, 8.05, 0.13, 12.72, 8.05, 0.13, 12.3, 7.63, 0.13, 12.3, 8.47, 0.13);
    addSegs(ring, 0.65);
  }
  windowAt(10.4, 0.7, 12.6, 2.6, 0.025, { kind: 'ground', cross: false, sill: false });
  addSegs(rectSegs(13.2, SIDEWALK_Y, 14.1, 2.4, 0.012, { hbars: 1 }), 0.55);
  [11.0, 13.6].forEach((cx) => windowAt(cx - 0.55, 3.8, cx + 0.55, 5.5));

  // ---- far right: tall corner block with a water tower -----------------------------

  block(14.8, 20.5, 0, 10.0, D, 0, flat(FILL.light));
  block(14.7, 20.6, 10.0, 10.35, -0.3, 0.25, flat(FILL.trim));
  windowAt(15.4, 0.6, 18.6, 2.6, 0.025, { kind: 'ground', cross: false, sill: false });
  addSegs(rectSegs(19.0, SIDEWALK_Y, 19.9, 2.4, 0.012, { hbars: 1 }), 0.55);
  for (const y of [3.4, 5.6, 7.8]) [15.9, 17.65, 19.4].forEach((cx) => windowAt(cx - 0.45, y, cx + 0.45, y + 1.4));
  {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 1.7, 10), flat(FILL.mid));
    tank.position.set(17.8, 11.95, -4.5);
    statics.add(tank);
    outlined(tank, { opacity: 0.55 });
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.1, 0.7, 10), flat(FILL.trim));
    cap.position.set(17.8, 13.15, -4.5);
    statics.add(cap);
    outlined(cap, { opacity: 0.55 });
    const legs = [];
    for (const [dx, dz] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) legs.push(17.8 + dx, 10.35, -4.5 + dz, 17.8 + dx, 11.1, -4.5 + dz);
    addSegs(legs, 0.5);
  }

  // ---- the rest of the street, fading into the fog --------------------------------

  const far = [
    [-34, -20.5, 7.5], [20.5, 33, 8.5], [-46, -34, 11], [33, 46, 6.5],
  ];
  far.forEach(([x0, x1, h]) => {
    block(x0, x1, 0, h, D, 0, flat(FILL.dark), { opacity: 0.38 });
    for (let x = x0 + 1; x < x1 - 0.8; x += 1.8) {
      for (let y = 3.2; y < h - 1.2; y += 2.4) if (rand() > 0.3) windowAt(x, y, x + 0.8, y + 1.3, 0.025, { kind: 'far', frame: 0.25, sill: false });
    }
  });
  // Skyline behind the block.
  for (let i = 0; i < 14; i++) {
    const x0 = -44 + i * 6.4 + rand() * 2;
    const w = 4 + rand() * 4;
    const h = 10 + rand() * 7;
    const z1 = -15 - rand() * 7;
    block(x0, x0 + w, 0, h, z1 - 8, z1, flat(0x111811, { emissive: 0.2 }), { opacity: 0.12 });
    for (let k = 0; k < 4; k++) {
      const wx = x0 + 0.6 + rand() * (w - 1.6);
      const wy = 4 + rand() * (h - 6);
      windowAt(wx, wy, wx + 0.7, wy + 1.0, z1 + 0.025, { kind: 'far', frame: 0.12, sill: false, cross: false });
    }
  }

  // ---- props: hydrant, bench --------------------------------------------------------

  {
    const hyd = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, 0.55, 8), flat(FILL.trim));
    hyd.position.set(-20.4, SIDEWALK_Y + 0.27, 2.05);
    statics.add(hyd);
    outlined(hyd, { opacity: 0.6 });
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), flat(FILL.trim));
    cap.position.set(-20.4, SIDEWALK_Y + 0.55, 2.05);
    statics.add(cap);
    outlined(cap, { opacity: 0.6, thresholdAngle: 40 });
  }
  const bench = new THREE.Vector3(3.62, SIDEWALK_Y, 0.82);
  {
    const B = (x0, x1, y0, y1, z0, z1) => block(bench.x + x0, bench.x + x1, SIDEWALK_Y + y0, SIDEWALK_Y + y1, z0, z1, flat(FILL.light), { opacity: 0.75 });
    B(-0.68, 0.68, 0.42, 0.48, 0.55, 1.0); // seat
    B(-0.68, 0.68, 0.62, 0.95, 0.5, 0.55); // backrest
    for (const x of [-0.6, 0.55]) {
      B(x, x + 0.06, 0, 0.42, 0.6, 0.66);
      B(x, x + 0.06, 0, 0.42, 0.9, 0.96);
      B(x, x + 0.06, 0.48, 0.95, 0.5, 0.55);
    }
  }

  // ---- build the window instances ---------------------------------------------------

  const winGeo = new THREE.PlaneGeometry(1, 1);
  const winMat = new THREE.MeshBasicMaterial({ color: 0xffffff, map: windowTexture() });
  const winMesh = new THREE.InstancedMesh(winGeo, winMat, windows.length);
  const tmp = new THREE.Object3D();
  windows.forEach((w, i) => {
    tmp.position.set((w.x0 + w.x1) / 2, (w.y0 + w.y1) / 2, w.z);
    tmp.scale.set(w.x1 - w.x0, w.y1 - w.y0, 1);
    tmp.updateMatrix();
    winMesh.setMatrixAt(i, tmp.matrix);
  });
  winMesh.instanceMatrix.needsUpdate = true;
  root.add(winMesh);

  // Window lighting: each window's level = max(ambient, progress, all).
  const dark = new THREE.Color(0x0c110c);
  const warm = new THREE.Color(PALETTE.lamp);
  const ambient = new Float32Array(windows.length);
  const progressLvl = new Float32Array(windows.length);
  const allLvl = { v: 0 };
  const color = new THREE.Color();
  const kindBase = { upper: 0, ground: 0.15, neighbor: 0, transom: 0.5, far: 0 };
  function paint(i) {
    const w = windows[i];
    const base = kindBase[w.kind] ?? 0;
    const lvl = Math.max(base, ambient[i], progressLvl[i], allLvl.v * (w.kind === 'far' ? 0.6 : 1.05));
    color.copy(dark).lerp(warm, Math.min(1, lvl));
    if (lvl > 1) color.multiplyScalar(lvl);
    winMesh.setColorAt(i, color);
  }
  function paintAll() {
    for (let i = 0; i < windows.length; i++) paint(i);
    winMesh.instanceColor.needsUpdate = true;
  }

  // Random ambient windows, and a fixed order for "one more per finished video".
  const upper = windows.map((w, i) => ({ w, i })).filter(({ w }) => w.kind === 'upper' || w.kind === 'neighbor');
  const progressOrder = [];
  {
    const pool = upper.slice();
    const r2 = rng(77);
    // Start with the neighbor's single window, then spread out across the block.
    const first = pool.findIndex(({ w }) => w.kind === 'neighbor');
    if (first >= 0) progressOrder.push(pool.splice(first, 1)[0].i);
    while (pool.length) progressOrder.push(pool.splice(Math.floor(r2() * pool.length), 1)[0].i);
  }
  const progressSet = new Set(progressOrder.slice(0, 12));
  windows.forEach((w, i) => {
    if (progressSet.has(i)) return;
    if (w.kind === 'upper' && rand() < 0.24) ambient[i] = 0.55 + rand() * 0.35;
    if (w.kind === 'far' && rand() < 0.3) ambient[i] = 0.25 + rand() * 0.3;
  });
  paintAll();

  const ambientCandidates = windows.map((w, i) => i).filter((i) => (windows[i].kind === 'upper' || windows[i].kind === 'far') && !progressSet.has(i));
  function windowLife() {
    const i = ambientCandidates[Math.floor(Math.random() * ambientCandidates.length)];
    const on = ambient[i] < 0.2;
    const target = on ? (windows[i].kind === 'far' ? 0.3 : 0.55 + Math.random() * 0.35) : 0;
    const proxy = { v: ambient[i] };
    gsap.to(proxy, {
      v: target,
      duration: 1.4,
      ease: 'sine.inOut',
      onUpdate: () => {
        ambient[i] = proxy.v;
        paint(i);
        winMesh.instanceColor.needsUpdate = true;
      },
    });
    gsap.delayedCall(4 + Math.random() * 7, windowLife);
  }
  gsap.delayedCall(5, windowLife);

  let litCount = -1;
  let allOn = false;
  /** Light one window per finished video; every window when the day is done. */
  function setLitWindows(n, all = false, { animate = true, force = false } = {}) {
    const count = Math.max(0, Math.min(progressOrder.length, n));
    if (count !== litCount || force) {
      const prev = litCount < 0 ? 0 : litCount;
      litCount = count;
      progressOrder.forEach((idx, k) => {
        const target = k < count ? 1.15 : 0;
        if (progressLvl[idx] === target) return;
        const delay = animate ? Math.abs(k - prev) * 0.25 : 0;
        const proxy = { v: progressLvl[idx] };
        gsap.to(proxy, {
          v: target,
          duration: animate ? 0.9 : 0,
          delay,
          ease: 'power2.out',
          overwrite: true,
          onUpdate: () => {
            progressLvl[idx] = proxy.v;
            paint(idx);
            winMesh.instanceColor.needsUpdate = true;
          },
        });
      });
    }
    if (all !== allOn || force) {
      allOn = all;
      lightAll(all, { animate });
    }
  }

  function lightAll(on, { animate = true, duration = 2.2 } = {}) {
    return gsap.to(allLvl, {
      v: on ? 1 : 0,
      duration: animate ? duration : 0,
      ease: on ? 'power1.in' : 'power1.out',
      overwrite: true,
      onUpdate: paintAll,
    });
  }

  // ---- doors -----------------------------------------------------------------------

  let doorsOpen = false;
  function setDoors(open, { animate = true, duration = 1.1, stagger = 0.12 } = {}) {
    if (reducedMotion()) animate = false;
    doorsOpen = open;
    gsap.killTweensOf(doorLeaves.map((d) => d.rotation));
    return gsap.to(
      doorLeaves.map((d) => d.rotation),
      {
        y: (i) => (open ? doorLeaves[i].userData.openAngle : 0),
        duration: animate ? duration : 0,
        ease: open ? 'back.out(1.1)' : 'power2.inOut',
        stagger: animate ? stagger : 0,
      },
    );
  }

  // ---- wet street ------------------------------------------------------------------

  const wetness = { v: 0 };
  function applyWet() {
    const w = wetness.v;
    streetMat.specular.setRGB(0.9 * w, 0.78 * w, 0.6 * w);
    streetMat.shininess = 18 + w * 70;
    streetMat.color.setHex(0x151b14).multiplyScalar(1 - w * 0.35);
  }
  function setWet(amount, { animate = true } = {}) {
    gsap.to(wetness, { v: amount, duration: animate ? 1.6 : 0, ease: 'sine.inOut', onUpdate: applyWet, overwrite: true });
  }
  applyWet();

  // ---- finish: bake static outlines and segments -------------------------------------

  for (const { opacity, data } of segBuckets.values()) segments(statics, new Float32Array(data), { opacity });
  mergeStatic(statics);
  mergeStaticMeshes(statics);

  fontsReady().then(() => {
    signTex.userData.redraw();
    posterTex.forEach((t) => t.userData.redraw());
  });

  return {
    root,
    anchors: {
      startX: -16.6,
      doorX: 0,
      walkZ: 1.45,
      bench,
      marquee: MQ,
      clockCenter,
      doorY: DOOR.y0,
    },
    setLitWindows,
    lightAll,
    setDoors,
    get doorsOpen() {
      return doorsOpen;
    },
    setWet,
    streetMat,
  };
}

// ---- helpers --------------------------------------------------------------------------

/** Lit-window interior: a warm glow low in the middle and curtains at the sides. */
let winTex = null;
function windowTexture() {
  if (winTex) return winTex;
  winTex = canvasTexture(64, 96, (g, w, h) => {
    g.fillStyle = 'rgb(120,120,120)';
    g.fillRect(0, 0, w, h);
    const grd = g.createRadialGradient(w / 2, h * 0.72, 2, w / 2, h * 0.6, h * 0.62);
    grd.addColorStop(0, 'rgb(255,255,255)');
    grd.addColorStop(0.55, 'rgb(205,205,205)');
    grd.addColorStop(1, 'rgb(130,130,130)');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(30,30,30,0.55)';
    for (const side of [0, 1]) {
      g.beginPath();
      const x0 = side ? w : 0;
      const dir = side ? -1 : 1;
      g.moveTo(x0, 0);
      g.lineTo(x0 + dir * w * 0.3, 0);
      g.quadraticCurveTo(x0 + dir * w * 0.14, h * 0.45, x0 + dir * w * 0.2, h);
      g.lineTo(x0, h);
      g.closePath();
      g.fill();
    }
  });
  return winTex;
}

function mergeGeometries(geos) {
  let count = 0;
  geos.forEach((g) => (count += g.attributes.position.count));
  const pos = new Float32Array(count * 3);
  const idx = [];
  let off = 0;
  geos.forEach((g) => {
    pos.set(g.attributes.position.array, off * 3);
    const gi = g.index.array;
    for (let i = 0; i < gi.length; i++) idx.push(gi[i] + off);
    off += g.attributes.position.count;
    g.dispose();
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setIndex(idx);
  return out;
}

function drawPoster(g, w, h, which) {
  g.fillStyle = '#141b14';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = '#efe7d4';
  g.fillStyle = '#efe7d4';
  g.lineWidth = 2;
  g.strokeRect(10, 10, w - 20, h - 20);
  g.lineWidth = 1;
  g.strokeRect(17, 17, w - 34, h - 34);
  g.textBaseline = 'middle';
  g.font = `500 22px ${SERIF}`;
  spaced(g, which === 'left' ? 'NOW SHOWING' : 'COMING SOON', w / 2, 50, 4);
  g.lineWidth = 2.2;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  if (which === 'left') {
    // A crescent moon over three hills.
    g.beginPath();
    g.arc(w / 2, 175, 58, 0.35 * Math.PI, 1.65 * Math.PI, false);
    g.arc(w / 2 + 26, 160, 48, 1.55 * Math.PI, 0.45 * Math.PI, true);
    g.closePath();
    g.stroke();
    [[60, 120], [196, 110], [178, 232], [80, 240]].forEach(([x, y], i) => star(g, x, y, i % 2 ? 5 : 7));
    g.beginPath();
    g.moveTo(26, 300);
    g.quadraticCurveTo(80, 262, 128, 296);
    g.quadraticCurveTo(178, 260, 230, 298);
    g.stroke();
  } else {
    // A film reel.
    g.beginPath();
    g.arc(w / 2, 180, 66, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.arc(w / 2, 180, 12, 0, Math.PI * 2);
    g.stroke();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      g.beginPath();
      g.arc(w / 2 + Math.cos(a) * 38, 180 + Math.sin(a) * 38, 15, 0, Math.PI * 2);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(w / 2 + 60, 210);
    g.bezierCurveTo(w / 2 + 110, 260, w / 2 + 20, 290, w / 2 + 70, 320);
    g.stroke();
  }
  g.font = `52px ${SCRIPT}`;
  g.textAlign = 'center';
  g.fillText(which === 'left' ? 'Nocturne' : 'The Long Reel', w / 2, 375);
  g.font = `italic 22px ${SERIF}`;
  g.fillText(which === 'left' ? 'a picture in three acts' : 'every evening at eight', w / 2, 420);
  g.font = `500 18px ${SERIF}`;
  spaced(g, 'ADMIT ONE', w / 2, 470, 4);
}

function star(g, x, y, r) {
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const rr = i % 2 ? r * 0.35 : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.stroke();
}
