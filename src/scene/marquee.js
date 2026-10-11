// The marquee face (canvas texture), its chasing bulbs, and the parapet clock hand.

import * as THREE from 'three';
import { gsap } from 'gsap';
import { canvasTexture, fontsReady } from './town.js';
import { PALETTE } from './lineStyle.js';
import { clock } from '../ui/format.js';
import { reducedMotion } from '../state/settings.js';

const SERIF = '"EB Garamond", Garamond, Georgia, serif';
const W = 2048; // drawn at 2× of the ~1024 face for crisp letters up close
const H = 320;
const CHASE_PERIOD = 4; // every 4th bulb lit
const CHASE_STEP = 0.12; // seconds per step at 1×

function spacedWidth(g, text, spacing) {
  return [...text].reduce((a, ch) => a + g.measureText(ch).width, 0) + spacing * ([...text].length - 1);
}
function spaced(g, text, cx, y, spacing) {
  let x = cx - spacedWidth(g, text, spacing) / 2;
  g.textAlign = 'left';
  for (const ch of text) {
    g.fillText(ch, x, y);
    x += g.measureText(ch).width + spacing;
  }
}
/** Fit letter-spaced caps into maxW by shrinking, then by trimming with an ellipsis. */
function fitCaps(g, text, maxW, size, spacing, weight = 500) {
  let s = size;
  let t = text.toUpperCase();
  for (; s > size * 0.62; s -= 2) {
    g.font = `${weight} ${s}px ${SERIF}`;
    if (spacedWidth(g, t, spacing * (s / size)) <= maxW) return { text: t, spacing: spacing * (s / size) };
  }
  const sp = spacing * (s / size);
  while (t.length > 3 && spacedWidth(g, t + '…', sp) > maxW) t = t.slice(0, -1);
  return { text: t.trimEnd() + '…', spacing: sp };
}

export function createMarquee(scene, town) {
  const MQ = town.anchors.marquee;
  const group = new THREE.Group();
  group.name = 'marquee';
  scene.add(group);

  // ---- face ------------------------------------------------------------------------
  let content = { kind: 'blank' }; // frame only until the fonts arrive
  const tex = canvasTexture(W, H, (g) => drawFace(g, content));
  const faceW = MQ.x1 - MQ.x0 - 0.42;
  const faceH = MQ.y1 - MQ.y0 - 0.38;
  const faceMat = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.12, 1.1, 1.04) });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(faceW, faceH), faceMat);
  face.position.set((MQ.x0 + MQ.x1) / 2, (MQ.y0 + MQ.y1) / 2, MQ.z + 0.006);
  group.add(face);

  function drawFace(g, c) {
    g.fillStyle = '#0e130d';
    g.fillRect(0, 0, W, H);
    const grd = g.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W / 2);
    grd.addColorStop(0, 'rgba(255,217,160,0.07)');
    grd.addColorStop(1, 'rgba(255,217,160,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#efe7d4';
    g.lineWidth = 4;
    g.strokeRect(14, 14, W - 28, H - 28);
    g.lineWidth = 1.5;
    g.strokeRect(28, 28, W - 56, H - 56);
    g.fillStyle = '#efe7d4';
    g.textBaseline = 'alphabetic';
    if (c.kind === 'blank') return;

    const diamond = (x, y, r) => {
      g.beginPath();
      g.moveTo(x, y - r);
      g.lineTo(x + r, y);
      g.lineTo(x, y + r);
      g.lineTo(x - r, y);
      g.closePath();
      g.fill();
    };

    if (c.kind === 'empty' || c.kind === 'idle') {
      const f = fitCaps(g, c.kind === 'idle' ? 'No picture selected' : 'The Picture House', W - 300, 84, 16);
      spaced(g, f.text, W / 2, 140, f.spacing);
      g.font = `italic 400 76px ${SERIF}`;
      g.textAlign = 'center';
      g.fillStyle = '#c9c0ac';
      g.fillText(c.kind === 'idle' ? 'pick a video from the program' : 'add a video to begin the program', W / 2, 250);
      diamond(150, 118, 12);
      diamond(W - 150, 118, 12);
      return;
    }

    // Title: letter-spaced small caps.
    const f = fitCaps(g, c.title, W - 360, 82, 18);
    spaced(g, f.text, W / 2, 122, f.spacing);
    diamond(140, 98, 12);
    diamond(W - 140, 98, 12);

    if (c.done) {
      g.font = `500 170px ${SERIF}`;
      g.fillStyle = '#cdb57f';
      g.shadowColor = 'rgba(255,217,160,0.65)';
      g.shadowBlur = 26;
      spaced(g, 'BRAVO', W / 2, 282, 34);
      g.shadowBlur = 0;
      return;
    }
    // Time left: H:MM:SS in EB Garamond (its default figures are lining).
    const time = clock(c.left);
    g.font = `400 172px ${SERIF}`;
    const tw = g.measureText(time).width;
    g.font = `italic 400 72px ${SERIF}`;
    const lw = g.measureText(' left').width;
    const x0 = W / 2 - (tw + lw) / 2;
    g.textAlign = 'left';
    g.font = `400 172px ${SERIF}`;
    g.fillText(time, x0, 284);
    g.font = `italic 400 72px ${SERIF}`;
    g.fillStyle = '#c9c0ac';
    g.fillText(' left', x0 + tw, 284);
  }

  // ---- bulbs -------------------------------------------------------------------------
  const positions = [];
  const inset = 0.11;
  const left = MQ.x0 + inset;
  const right = MQ.x1 - inset;
  const top = MQ.y1 - inset;
  const bottom = MQ.y0 + inset;
  const nx = Math.round((right - left) / 0.26);
  const ny = Math.max(2, Math.round((top - bottom) / 0.26));
  // Clockwise from the top-left corner so the chase runs around the frame.
  for (let i = 0; i < nx; i++) positions.push([left + ((right - left) * i) / nx, top]);
  for (let i = 0; i < ny; i++) positions.push([right, top - ((top - bottom) * i) / ny]);
  for (let i = 0; i < nx; i++) positions.push([right - ((right - left) * i) / nx, bottom]);
  for (let i = 0; i < ny; i++) positions.push([left, bottom + ((top - bottom) * i) / ny]);
  const N = positions.length;
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.052, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }), N);
  const tmp = new THREE.Object3D();
  positions.forEach(([x, y], i) => {
    tmp.position.set(x, y, MQ.z + 0.05);
    tmp.updateMatrix();
    bulbs.setMatrixAt(i, tmp.matrix);
  });
  group.add(bulbs);

  // Soffit downlights under the marquee, and the light they throw on the entrance.
  {
    const dots = [];
    for (const z of [0.55, 1.45]) for (let i = 0; i < 7; i++) dots.push([-3.3 + i * 1.1, z]);
    const geo = new THREE.CircleGeometry(0.07, 12);
    geo.rotateX(Math.PI / 2);
    const soffit = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.lamp).multiplyScalar(2.2) }), dots.length);
    dots.forEach(([x, z], i) => {
      tmp.position.set(x, MQ.y0 - 0.005, z);
      tmp.updateMatrix();
      soffit.setMatrixAt(i, tmp.matrix);
    });
    group.add(soffit);
  }
  const entranceLight = new THREE.PointLight(PALETTE.lamp, 9, 6.5, 2);
  entranceLight.position.set(0, MQ.y0 - 0.25, 1.25);
  group.add(entranceLight);

  const bulbColor = new THREE.Color(0xffe2b0);
  const c = new THREE.Color();
  const chase = { phase: 0, boost: 1, glow: 1 };
  function paintBulbs() {
    for (let i = 0; i < N; i++) {
      let d = (((i - chase.phase) % CHASE_PERIOD) + CHASE_PERIOD) % CHASE_PERIOD;
      d = Math.min(d, CHASE_PERIOD - d);
      const f = Math.max(0, 1 - d);
      const k = f * f * (3 - 2 * f);
      const level = (0.55 + 1.75 * k) * chase.glow;
      bulbs.setColorAt(i, c.copy(bulbColor).multiplyScalar(level));
    }
    bulbs.instanceColor.needsUpdate = true;
  }
  paintBulbs();

  // The chase: a looping timeline; the bulb-speed slider sets its timeScale.
  const chaseTl = gsap.timeline({ repeat: -1 });
  chaseTl.fromTo(chase, { phase: 0 }, { phase: CHASE_PERIOD, duration: CHASE_PERIOD * CHASE_STEP, ease: 'none', onUpdate: paintBulbs });
  let speed = 1;
  const applySpeed = () => chaseTl.timeScale(Math.max(0.0001, speed * chase.boost * (reducedMotion() ? 0 : 1)));
  if (reducedMotion()) chaseTl.pause();

  function setSpeed(s) {
    speed = s;
    if (s <= 0 || reducedMotion()) {
      chaseTl.pause();
      paintBulbs();
    } else {
      chaseTl.resume();
      applySpeed();
    }
  }

  /** Celebrate: the chase races for a few seconds, then eases back. */
  function boost(seconds = 4, factor = 3.5) {
    if (reducedMotion()) {
      return gsap.timeline().to(chase, { glow: 1.5, duration: 0.3, onUpdate: paintBulbs }).to(chase, { glow: 1, duration: 1.5, delay: seconds, onUpdate: paintBulbs });
    }
    return gsap
      .timeline()
      .to(chase, { boost: factor, glow: 1.25, duration: 0.6, ease: 'power2.out', onUpdate: applySpeed })
      .to(chase, { boost: 1, glow: 1, duration: 1.4, ease: 'power2.inOut', onUpdate: applySpeed }, `+=${seconds}`);
  }

  // ---- clock hand ----------------------------------------------------------------------
  const C = town.anchors.clockCenter;
  const handGeo = new THREE.BoxGeometry(0.045, 0.5, 0.02);
  handGeo.translate(0, 0.2, 0);
  const handMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.cream).multiplyScalar(0.95) });
  const hand = new THREE.Mesh(handGeo, handMat);
  hand.position.set(C.x, C.y, C.z + 0.03);
  group.add(hand);
  const tail = new THREE.Mesh(new THREE.CircleGeometry(0.05, 16), handMat);
  tail.position.set(C.x, C.y, C.z + 0.045);
  group.add(tail);

  function setHand(p, { animate = true } = {}) {
    const z = -Math.max(0, Math.min(1, p)) * Math.PI * 2;
    gsap.to(hand.rotation, { z, duration: animate && !reducedMotion() ? 1.3 : 0, ease: 'power2.inOut', overwrite: true });
  }

  // ---- data ---------------------------------------------------------------------------
  let ready = false;
  let pending = { kind: 'empty' };
  let lastKey = '';
  function update(sel, day, { animate = true } = {}) {
    pending = !day?.count ? { kind: 'empty' } : sel ? { kind: 'video', title: sel.title, left: sel.left, done: sel.done } : { kind: 'idle' };
    const key = JSON.stringify(pending);
    if (ready && key !== lastKey) {
      content = pending;
      tex.userData.redraw();
    }
    lastKey = ready ? key : '';
    setHand(sel ? sel.progress : 0, { animate });
  }
  // Never draw lettering before EB Garamond is ready.
  fontsReady().then(() => {
    ready = true;
    content = pending;
    lastKey = JSON.stringify(pending);
    tex.userData.redraw();
  });

  return { group, update, setSpeed, boost, setHand, hand, face };
}
