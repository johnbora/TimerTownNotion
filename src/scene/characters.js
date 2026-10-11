// Bartholomew and friends: billboard sprites in the program's cream line work.
//
// Every pose is drawn once onto a canvas atlas (cream strokes over dark fills,
// transparent background). Sprites share the atlas image and pick their frame
// by UV offset; flipping is a negative UV repeat. GSAP moves, bobs and swaps.

import * as THREE from 'three';
import { gsap } from 'gsap';
import { SIDEWALK_Y, fontsReady } from './town.js';
import { reducedMotion } from '../state/settings.js';

const INK = '#efe7d4';
const DARK = '#141b14';
const DARK2 = '#1c251c';
const GOLD = '#cdb57f';
const ROSE = '#c99a8f';
const SAGE = '#9aa77a';

// ---- drawing helpers ---------------------------------------------------------------

function shape(g, build, { fill = DARK, stroke = INK, width = 2.6 } = {}) {
  g.beginPath();
  build(g);
  if (fill) {
    g.fillStyle = fill;
    g.fill();
  }
  if (stroke) {
    g.strokeStyle = stroke;
    g.lineWidth = width;
    g.stroke();
  }
}
const line = (g, pts, { stroke = INK, width = 2.4 } = {}) =>
  shape(g, (c) => pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))), { fill: null, stroke, width });
const dot = (g, x, y, r, fill = INK) => shape(g, (c) => c.arc(x, y, r, 0, Math.PI * 2), { fill, stroke: null });
const circle = (g, x, y, r, opts) => shape(g, (c) => c.arc(x, y, r, 0, Math.PI * 2), opts);

// ---- Bartholomew (design space 200 × 300, feet at y ≈ 294) ----------------------------

function drawHat(g, { lift = 0, tilt = 0, dy = 0 } = {}) {
  g.save();
  g.translate(100, 60 + dy - lift * 44);
  g.rotate(tilt);
  g.translate(-100, -60);
  // Crown (dome).
  shape(g, (c) => {
    c.moveTo(73, 61);
    c.bezierCurveTo(70, 26, 130, 26, 127, 61);
    c.closePath();
  });
  // Band.
  shape(g, (c) => c.rect(73.5, 53, 53, 8), { fill: DARK2 });
  // Brim, curled up at the sides.
  shape(g, (c) => {
    c.moveTo(58, 59);
    c.quadraticCurveTo(62, 66, 72, 66);
    c.quadraticCurveTo(100, 71, 128, 66);
    c.quadraticCurveTo(138, 66, 142, 59);
    c.quadraticCurveTo(134, 62, 126, 61);
    c.quadraticCurveTo(100, 63, 74, 61);
    c.quadraticCurveTo(66, 62, 58, 59);
    c.closePath();
  });
  line(g, [[84, 44], [90, 36]], { width: 2 });
  g.restore();
}

function drawHead(g, { hatOff = false, sleepy = false, glint = false } = {}) {
  // Ears.
  shape(g, (c) => c.ellipse(74.5, 88, 5, 8, 0, 0, Math.PI * 2), { fill: DARK2 });
  shape(g, (c) => c.ellipse(125.5, 88, 5, 8, 0, 0, Math.PI * 2), { fill: DARK2 });
  // Face.
  shape(g, (c) => c.ellipse(100, 87, 26, 30, 0, 0, Math.PI * 2), { fill: DARK2 });
  if (hatOff) {
    // Neatly parted hair.
    line(g, [[78, 70], [84, 60], [96, 57], [110, 58], [120, 64], [123, 72]], { width: 2.2 });
    line(g, [[92, 58], [88, 67]], { width: 1.8 });
  }
  if (sleepy) {
    line(g, [[84, 86], [90, 89], [96, 86]], { width: 2 });
  } else {
    // Left eye and brow.
    dot(g, 90, 85, 2.8);
    line(g, [[83, 77], [90, 74], [96, 76]], { width: 2 });
    // Right eye behind the monocle, brow raised.
    dot(g, 111, 85, 2.6);
    line(g, [[104, 72], [111, 68], [119, 71]], { width: 2 });
    circle(g, 111, 85, 9, { fill: null, stroke: GOLD, width: 2.2 });
    line(g, [[105, 80], [108, 78]], { stroke: INK, width: 1.4 });
  }
  // Nose.
  line(g, [[100, 85], [96.5, 97], [102, 98.5]], { width: 2 });
  // Curled mustache (filled cream).
  shape(
    g,
    (c) => {
      for (const s of [-1, 1]) {
        c.moveTo(100, 101);
        c.bezierCurveTo(100 + s * 6, 98, 100 + s * 16, 100, 100 + s * 22, 105);
        c.bezierCurveTo(100 + s * 27, 108, 100 + s * 31, 104, 100 + s * 29, 99);
        c.bezierCurveTo(100 + s * 28, 96, 100 + s * 24, 97, 100 + s * 25, 100);
        c.bezierCurveTo(100 + s * 25, 102, 100 + s * 27, 102, 100 + s * 27, 100);
        c.bezierCurveTo(100 + s * 28, 106, 100 + s * 20, 110, 100 + s * 12, 108);
        c.bezierCurveTo(100 + s * 6, 107, 100 + s * 2, 106, 100, 104);
      }
    },
    { fill: INK, stroke: INK, width: 1.2 },
  );
  // Mouth: a small smile, or an "o" when he dozes.
  if (sleepy) circle(g, 100, 113, 2.6, { fill: DARK, stroke: INK, width: 1.6 });
  else line(g, [[96, 112], [100, 114], [104, 112]], { width: 1.8 });
  if (glint) {
    // Monocle glint: a four-point twinkle.
    g.save();
    g.translate(106, 79);
    shape(g, (c) => {
      c.moveTo(0, -10);
      c.quadraticCurveTo(1.2, -1.2, 10, 0);
      c.quadraticCurveTo(1.2, 1.2, 0, 10);
      c.quadraticCurveTo(-1.2, 1.2, -10, 0);
      c.quadraticCurveTo(-1.2, -1.2, 0, -10);
    }, { fill: '#fffaf0', stroke: null });
    g.restore();
  }
}

function drawCollar(g) {
  shape(g, (c) => {
    c.moveTo(91, 114);
    c.lineTo(98, 121);
    c.lineTo(89, 124);
    c.closePath();
  }, { fill: DARK2, width: 1.8 });
  shape(g, (c) => {
    c.moveTo(109, 114);
    c.lineTo(102, 121);
    c.lineTo(111, 124);
    c.closePath();
  }, { fill: DARK2, width: 1.8 });
  // Bow tie.
  shape(g, (c) => {
    c.moveTo(100, 122);
    c.lineTo(86, 115);
    c.lineTo(87, 130);
    c.closePath();
    c.moveTo(100, 122);
    c.lineTo(114, 115);
    c.lineTo(113, 130);
    c.closePath();
  }, { fill: ROSE, width: 2 });
  shape(g, (c) => c.rect(96.5, 118, 7, 8), { fill: ROSE, width: 2 });
}

function drawTorso(g, { watchSwing = 0 } = {}) {
  // Tailcoat front.
  shape(g, (c) => {
    c.moveTo(90, 120);
    c.quadraticCurveTo(72, 124, 66, 136);
    c.quadraticCurveTo(62, 168, 75, 203);
    c.lineTo(125, 203);
    c.quadraticCurveTo(138, 168, 134, 136);
    c.quadraticCurveTo(128, 124, 110, 120);
    c.closePath();
  });
  // Waistcoat.
  shape(g, (c) => {
    c.moveTo(91, 124);
    c.lineTo(109, 124);
    c.lineTo(111, 196);
    c.lineTo(105, 205);
    c.lineTo(100, 199);
    c.lineTo(95, 205);
    c.lineTo(89, 196);
    c.closePath();
  }, { fill: DARK2 });
  [148, 163, 178].forEach((y) => dot(g, 100, y, 2.3));
  line(g, [[103, 170], [109, 169]], { width: 1.6 }); // pocket
  // Lapels.
  line(g, [[91, 122], [80, 142], [88, 148], [93, 180]], { width: 2.2 });
  line(g, [[109, 122], [120, 142], [112, 148], [107, 180]], { width: 2.2 });
  // Pocket watch, swinging on its chain from the waistcoat pocket.
  const px = 106;
  const py = 170;
  const wx = px + Math.sin(watchSwing) * 22;
  const wy = py + Math.cos(watchSwing) * 22;
  line(g, [[px, py], [(px + wx) / 2 + 2, (py + wy) / 2 + 2], [wx, wy - 6]], { stroke: GOLD, width: 1.5 });
  circle(g, wx, wy, 6.5, { fill: DARK, stroke: GOLD, width: 2 });
  line(g, [[wx, wy], [wx, wy - 3.6]], { stroke: GOLD, width: 1.3 });
  line(g, [[wx, wy], [wx + 2.8, wy + 1]], { stroke: GOLD, width: 1.3 });
  dot(g, wx, wy - 8, 1.6, GOLD);
}

function drawTails(g, { flare = 0 } = {}) {
  shape(g, (c) => {
    c.moveTo(79, 198);
    c.lineTo(68 - flare, 240);
    c.lineTo(81 - flare / 2, 237);
    c.lineTo(88, 200);
    c.closePath();
  });
  shape(g, (c) => {
    c.moveTo(121, 198);
    c.lineTo(132 + flare, 240);
    c.lineTo(119 + flare / 2, 237);
    c.lineTo(112, 200);
    c.closePath();
  });
}

function drawLegs(g, { liftL = 0, liftR = 0 } = {}) {
  const leg = (x0, x1, lift, toe) => {
    const bot = 282 - lift;
    const knee = 240 - lift * 0.4;
    shape(g, (c) => {
      c.moveTo(x0, 198);
      c.lineTo(x1, 198);
      c.lineTo(x1 - (lift ? 1 : 0) + toe * lift * 0.15, knee);
      c.lineTo(x1 - 1, bot);
      c.lineTo(x0 + 1, bot);
      c.lineTo(x0 + toe * lift * 0.15, knee);
      c.closePath();
    });
    line(g, [[(x0 + x1) / 2, 206], [(x0 + x1) / 2, bot - 4]], { width: 1.2 }); // crease
    shape(g, (c) => c.ellipse((x0 + x1) / 2 + toe * 5, bot + 5, 12, 6, 0, 0, Math.PI * 2), { fill: DARK });
    line(g, [[(x0 + x1) / 2 + toe * 5 - 6, bot + 2], [(x0 + x1) / 2 + toe * 5 + 4, bot + 2]], { width: 1.2 });
  };
  leg(84, 99, liftL, -1);
  leg(101, 116, liftR, 1);
}

function drawCaneArm(g, { tilt = 0 } = {}) {
  // Cane: crook handle at the hand, shaft to the ground.
  const hx = 58;
  const hy = 205;
  const fx = hx - 6 + tilt * 120;
  line(g, [[hx, hy], [fx, 291]], { width: 3.2 });
  dot(g, fx, 292, 2.4);
  shape(g, (c) => c.arc(hx + 7, hy - 2, 7, Math.PI, 0.05, false), { fill: null, width: 3.2 });
  // Sleeve.
  shape(g, (c) => {
    c.moveTo(70, 132);
    c.quadraticCurveTo(54, 140, 51, 170);
    c.quadraticCurveTo(50, 190, 53, 201);
    c.lineTo(65, 201);
    c.quadraticCurveTo(64, 180, 67, 166);
    c.quadraticCurveTo(70, 152, 76, 145);
    c.closePath();
  });
  line(g, [[52, 196], [65, 196]], { width: 1.6 }); // cuff
  // Gloved hand.
  circle(g, 59, 206, 7, { fill: INK, stroke: INK, width: 1.4 });
}

function drawRightArm(g, pose = 'hip') {
  if (pose === 'hip') {
    shape(g, (c) => {
      c.moveTo(130, 132);
      c.quadraticCurveTo(148, 146, 148, 168);
      c.quadraticCurveTo(146, 186, 136, 198);
      c.lineTo(126, 192);
      c.quadraticCurveTo(136, 180, 136, 168);
      c.quadraticCurveTo(134, 154, 124, 146);
      c.closePath();
    });
    circle(g, 129, 197, 7, { fill: INK, stroke: INK, width: 1.4 });
    return;
  }
  const high = pose === 'raise2';
  const ex = high ? 158 : 156;
  const ey = high ? 102 : 122;
  const hx = high ? 134 : 140;
  const hy = high ? 30 : 64;
  shape(g, (c) => {
    c.moveTo(130, 132);
    c.quadraticCurveTo(ex + 4, ey + 16, ex + 2, ey);
    c.quadraticCurveTo(ex, ey - 14, hx + 7, hy + 8);
    c.lineTo(hx - 5, hy + 6);
    c.quadraticCurveTo(ex - 10, ey - 6, ex - 10, ey + 6);
    c.quadraticCurveTo(ex - 12, ey + 18, 124, 146);
    c.closePath();
  });
  circle(g, hx, hy + 4, 7, { fill: INK, stroke: INK, width: 1.4 });
}

function drawMonocleChain(g) {
  g.save();
  g.setLineDash([2.5, 2.5]);
  line(g, [[118, 91], [124, 106], [119, 122], [106, 150]], { stroke: GOLD, width: 1.3 });
  g.restore();
}

/** One standing / walking / hat-tipping frame. */
function drawBartholomew(g, p = {}) {
  drawTails(g, { flare: p.flare || 0 });
  drawLegs(g, p);
  drawTorso(g, p);
  drawCaneArm(g, p);
  drawCollar(g);
  drawHead(g, { hatOff: (p.hatLift || 0) > 0.3, glint: p.glint });
  drawMonocleChain(g);
  drawHat(g, { lift: p.hatLift || 0, tilt: (p.hatLift || 0) * -0.35, dy: 0 });
  drawRightArm(g, p.arm || 'hip');
}

/** Dozing on the bench: seated, hands on the cane, hat slipped over his eyes. */
function drawSleeping(g) {
  // Legs: knees toward us, shins down to the pavement.
  for (const [x0, x1, toe] of [[80, 97, -1], [103, 120, 1]]) {
    shape(g, (c) => {
      c.moveTo(x0 - 2, 226);
      c.lineTo(x1 + 2, 226);
      c.lineTo(x1, 282);
      c.lineTo(x0, 282);
      c.closePath();
    });
    shape(g, (c) => c.ellipse((x0 + x1) / 2, 236, 10, 6, 0, 0, Math.PI * 2), { fill: DARK2, width: 1.6 });
    shape(g, (c) => c.ellipse((x0 + x1) / 2 + toe * 5, 287, 12, 6, 0, 0, Math.PI * 2), { fill: DARK });
  }
  g.save();
  g.translate(0, 34);
  drawTails(g, { flare: 10 });
  drawTorso(g, { watchSwing: 0.15 });
  drawCollar(g);
  g.restore();
  // Cane upright between the knees, both hands resting on the crook.
  line(g, [[100, 214], [100, 292]], { width: 3.2 });
  shape(g, (c) => c.arc(107, 212, 7, Math.PI, 0.05, false), { fill: null, width: 3.2 });
  for (const s of [-1, 1]) {
    shape(g, (c) => {
      c.moveTo(100 + s * 32, 168);
      c.quadraticCurveTo(100 + s * 40, 196, 100 + s * 10, 214);
      c.lineTo(100 + s * 4, 206);
      c.quadraticCurveTo(100 + s * 26, 192, 100 + s * 22, 176);
      c.closePath();
    });
  }
  circle(g, 96, 213, 6.5, { fill: INK, stroke: INK, width: 1.2 });
  circle(g, 105, 214, 6.5, { fill: INK, stroke: INK, width: 1.2 });
  // Head tipped forward, hat over his eyes.
  g.save();
  g.translate(100, 150);
  g.rotate(0.12);
  g.translate(-100, -150);
  g.translate(0, 34);
  drawHead(g, { sleepy: true });
  drawHat(g, { dy: 17, tilt: 0.12 });
  g.restore();
}

// ---- friends (design space 160 × 160, feet at y ≈ 152) ---------------------------------

function eyes(g, xs, y, { happy = false, r = 5 } = {}) {
  for (const x of xs) {
    if (happy) line(g, [[x - 5, y + 1], [x, y - 4], [x + 5, y + 1]], { width: 2.4 });
    else {
      shape(g, (c) => c.ellipse(x, y, r, r * 1.25, 0, 0, Math.PI * 2), { fill: INK, stroke: null });
      dot(g, x + 0.8, y + 1.2, r * 0.55, DARK);
      dot(g, x - 1.2, y - 1.6, r * 0.22, INK);
    }
  }
}
const smile = (g, x, y, w = 9) => shape(g, (c) => c.arc(x, y - w * 0.4, w, 0.18 * Math.PI, 0.82 * Math.PI), { fill: null, width: 2.4 });

function drawDrip(g, { happy }) {
  shape(g, (c) => {
    c.moveTo(80, 12);
    c.bezierCurveTo(92, 44, 124, 70, 124, 102);
    c.bezierCurveTo(124, 132, 104, 146, 80, 146);
    c.bezierCurveTo(56, 146, 36, 132, 36, 102);
    c.bezierCurveTo(36, 70, 68, 44, 80, 12);
  }, { fill: '#162019' });
  line(g, [[52, 98], [54, 84], [62, 70]], { width: 2.2 });
  eyes(g, [68, 92], 100, { happy });
  smile(g, 80, 118, 9);
  dot(g, 58, 114, 3.2, ROSE);
  dot(g, 102, 114, 3.2, ROSE);
  shape(g, (c) => c.ellipse(68, 150, 8, 4, 0, 0, Math.PI * 2), { fill: DARK, width: 2 });
  shape(g, (c) => c.ellipse(92, 150, 8, 4, 0, 0, Math.PI * 2), { fill: DARK, width: 2 });
}

function drawReel(g, { happy }) {
  // Film strip trailing to the ground.
  shape(g, (c) => {
    c.moveTo(118, 104);
    c.bezierCurveTo(148, 118, 128, 140, 152, 152);
    c.lineTo(146, 156);
    c.bezierCurveTo(118, 144, 140, 122, 112, 110);
    c.closePath();
  }, { fill: DARK2, width: 2 });
  line(g, [[66, 124], [64, 150]], { width: 2.6 });
  line(g, [[94, 124], [96, 150]], { width: 2.6 });
  line(g, [[58, 151], [68, 151]], { width: 2.6 });
  line(g, [[92, 151], [102, 151]], { width: 2.6 });
  circle(g, 80, 76, 52, { fill: DARK });
  circle(g, 80, 76, 46, { fill: null, width: 1.4 });
  for (const a of [0.25, 0.75, 1.25, 1.75]) circle(g, 80 + Math.cos(a * Math.PI) * 35, 76 + Math.sin(a * Math.PI) * 35, 8, { fill: '#0d120d', width: 2 });
  circle(g, 80, 76, 4, { fill: INK, stroke: null });
  eyes(g, [64, 96], 66, { happy, r: 5.5 });
  smile(g, 80, 96, 10);
}

function drawTicket(g, { happy }) {
  g.save();
  g.translate(80, 84);
  g.rotate(-0.08);
  g.translate(-80, -84);
  line(g, [[66, 136], [64, 152]], { width: 2.6 });
  line(g, [[94, 136], [96, 152]], { width: 2.6 });
  line(g, [[58, 152], [67, 152]], { width: 2.6 });
  line(g, [[93, 152], [102, 152]], { width: 2.6 });
  line(g, [[44, 98], [32, 108], [30, 116]], { width: 2.4 });
  line(g, [[116, 98], [128, 90], [132, 82]], { width: 2.4 });
  shape(g, (c) => {
    c.moveTo(44, 24);
    c.lineTo(116, 24);
    c.lineTo(116, 74);
    c.arc(116, 82, 8, -Math.PI / 2, Math.PI / 2, true);
    c.lineTo(116, 138);
    c.lineTo(44, 138);
    c.lineTo(44, 90);
    c.arc(44, 82, 8, Math.PI / 2, -Math.PI / 2, true);
    c.closePath();
  }, { fill: '#1f2519' });
  g.save();
  g.setLineDash([3, 4]);
  line(g, [[48, 52], [112, 52]], { width: 1.6 });
  g.restore();
  g.fillStyle = GOLD;
  g.font = '600 12px "EB Garamond", Georgia, serif';
  g.textAlign = 'center';
  g.fillText('ADMIT ONE', 80, 42);
  eyes(g, [66, 94], 88, { happy, r: 5 });
  smile(g, 80, 108, 9);
  g.restore();
}

function drawWatcher(g, { happy }) {
  line(g, [[68, 100], [62, 124], [58, 150]], { width: 2.6 });
  line(g, [[92, 100], [98, 124], [102, 150]], { width: 2.6 });
  line(g, [[50, 151], [60, 151]], { width: 2.6 });
  line(g, [[100, 151], [110, 151]], { width: 2.6 });
  if (happy) {
    // Blink: the lid closed in a smile.
    shape(g, (c) => {
      c.moveTo(24, 64);
      c.quadraticCurveTo(80, 26, 136, 64);
      c.quadraticCurveTo(80, 92, 24, 64);
    }, { fill: '#1f2519' });
    line(g, [[30, 66], [80, 84], [130, 66]], { width: 2.6 });
    for (let i = 0; i < 5; i++) {
      const x = 44 + i * 18;
      line(g, [[x, 78 - Math.abs(i - 2) * 3], [x - 3 + i * 1.5, 88 - Math.abs(i - 2) * 3]], { width: 2 });
    }
    return;
  }
  shape(g, (c) => {
    c.moveTo(24, 64);
    c.quadraticCurveTo(80, 12, 136, 64);
    c.quadraticCurveTo(80, 112, 24, 64);
  }, { fill: '#d9d1bd' });
  circle(g, 80, 64, 21, { fill: GOLD, stroke: DARK, width: 2 });
  circle(g, 80, 64, 10, { fill: DARK, stroke: null });
  dot(g, 86, 58, 4, '#fffaf0');
  for (let i = 0; i < 5; i++) {
    const t = (i + 1) / 6;
    const x = 24 + t * 112;
    const y = 64 - Math.sin(t * Math.PI) * 26;
    line(g, [[x, y], [x + (t - 0.5) * 10, y - 10]], { width: 2.2 });
  }
}

function drawPartyHat(g) {
  shape(g, (c) => {
    c.moveTo(32, 8);
    c.lineTo(52, 72);
    c.quadraticCurveTo(32, 78, 12, 72);
    c.closePath();
  }, { fill: '#2a2a20' });
  g.save();
  g.beginPath();
  g.moveTo(32, 8);
  g.lineTo(52, 72);
  g.quadraticCurveTo(32, 78, 12, 72);
  g.closePath();
  g.clip();
  [[ROSE, 20], [GOLD, 38], [SAGE, 56]].forEach(([col, y]) => {
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(64, y - 14);
    g.lineTo(64, y - 6);
    g.lineTo(0, y + 8);
    g.fill();
  });
  g.restore();
  shape(g, (c) => {
    c.moveTo(32, 8);
    c.lineTo(52, 72);
    c.quadraticCurveTo(32, 78, 12, 72);
    c.closePath();
  }, { fill: null, width: 2.4 });
  circle(g, 32, 8, 6, { fill: INK, stroke: INK, width: 1 });
}

// ---- atlases ---------------------------------------------------------------------------

function atlas(cols, rows, cw, ch, frames, designW, designH) {
  const c = document.createElement('canvas');
  c.width = cols * cw;
  c.height = rows * ch;
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const redraw = () => {
    g.clearRect(0, 0, c.width, c.height);
    frames.forEach((draw, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      g.save();
      g.translate(col * cw, row * ch);
      g.scale(cw / designW, ch / designH);
      g.lineCap = 'round';
      g.lineJoin = 'round';
      draw(g);
      g.restore();
    });
    tex.needsUpdate = true;
  };
  redraw();
  return { tex, cols, rows, redraw };
}

function squash(draw, sx, sy) {
  return (g) => {
    g.save();
    g.translate(80, 152);
    g.scale(sx, sy);
    g.translate(-80, -152);
    draw(g);
    g.restore();
  };
}

/** A sprite that shows one cell of an atlas, optionally mirrored. */
function atlasSprite({ tex, cols, rows }, width, height, tint = 0.9) {
  const t = tex.clone();
  t.repeat.set(1 / cols, 1 / rows);
  const mat = new THREE.SpriteMaterial({ map: t, transparent: true, alphaTest: 0.04, color: new THREE.Color(tint, tint, tint) });
  const sprite = new THREE.Sprite(mat);
  sprite.center.set(0.5, 0);
  sprite.scale.set(width, height, 1);
  let frame = -1;
  let flipped = false;
  return {
    sprite,
    mat,
    setFrame(i, flip = flipped) {
      if (i === frame && flip === flipped) return;
      frame = i;
      flipped = flip;
      const col = i % cols;
      const row = Math.floor(i / cols);
      t.repeat.x = (flip ? -1 : 1) / cols;
      t.offset.x = (col + (flip ? 1 : 0)) / cols;
      t.offset.y = 1 - (row + 1) / rows;
    },
    get frame() {
      return frame;
    },
  };
}

// ---- the cast --------------------------------------------------------------------------

const BF = { idle0: 0, idle1: 1, idle2: 2, idle3: 3, glint: 4, walk0: 5, walk1: 6, walk2: 7, walk3: 8, tip0: 9, tip1: 10, tip2: 11, sleep: 12 };
const FF = { stand: 0, crouch: 1, air: 2, happy: 3 };
const FRIENDS = ['drip', 'reel', 'ticket', 'watcher'];

export function createCharacters({ scene, camera, town, stage, bubble }) {
  const A = town.anchors;
  const reduced = () => reducedMotion();

  const bAtlas = atlas(4, 4, 256, 384, [
    (g) => drawBartholomew(g, { tilt: 0, watchSwing: -0.25 }),
    (g) => drawBartholomew(g, { tilt: 0.025, watchSwing: 0 }),
    (g) => drawBartholomew(g, { tilt: 0.04, watchSwing: 0.25 }),
    (g) => drawBartholomew(g, { tilt: 0.02, watchSwing: 0 }),
    (g) => drawBartholomew(g, { tilt: 0, watchSwing: -0.25, glint: true }),
    (g) => drawBartholomew(g, { tilt: -0.03, liftL: 12, watchSwing: 0.3, flare: 4 }),
    (g) => drawBartholomew(g, { tilt: 0.02, watchSwing: 0.1, flare: 2 }),
    (g) => drawBartholomew(g, { tilt: 0.06, liftR: 12, watchSwing: -0.3, flare: 4 }),
    (g) => drawBartholomew(g, { tilt: 0.02, watchSwing: -0.1, flare: 2 }),
    (g) => drawBartholomew(g, { arm: 'raise1', hatLift: 0.15 }),
    (g) => drawBartholomew(g, { arm: 'raise2', hatLift: 0.7 }),
    (g) => drawBartholomew(g, { arm: 'raise2', hatLift: 1, glint: true }),
    (g) => drawSleeping(g),
  ], 200, 300);

  const friendDraw = { drip: drawDrip, reel: drawReel, ticket: drawTicket, watcher: drawWatcher };
  const fFrames = [];
  for (const name of FRIENDS) {
    const d = friendDraw[name];
    fFrames.push((g) => d(g, {}));
    fFrames.push(squash((g) => d(g, {}), 1.12, 0.84));
    fFrames.push(squash((g) => d(g, { happy: true }), 0.92, 1.1));
    fFrames.push((g) => d(g, { happy: true }));
  }
  const fAtlas = atlas(4, 4, 192, 192, fFrames, 160, 160);
  const hatAtlas = atlas(1, 1, 64, 80, [drawPartyHat], 64, 80);
  const zAtlas = atlas(1, 1, 64, 64, [(g) => {
    g.fillStyle = INK;
    g.font = 'italic 500 54px "EB Garamond", Georgia, serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('z', 32, 30);
  }], 64, 64);

  // Lettering in the atlases (the ticket stub, the z's) wants EB Garamond.
  fontsReady().then(() => {
    fAtlas.redraw();
    zAtlas.redraw();
  });

  const root = new THREE.Group();
  root.name = 'characters';
  scene.add(root);

  // Bartholomew.
  const bart = new THREE.Group();
  bart.position.set(A.startX, SIDEWALK_Y, A.walkZ);
  root.add(bart);
  const body = atlasSprite(bAtlas, 1.24, 1.86);
  body.setFrame(BF.idle0, false);
  bart.add(body.sprite);

  const zs = [0, 1].map(() => {
    const z = atlasSprite(zAtlas, 0.32, 0.32, 0.85);
    z.setFrame(0);
    z.sprite.visible = false;
    root.add(z.sprite);
    return z;
  });

  // Friends wait inside the theater until they are needed.
  const friends = {};
  FRIENDS.forEach((name, row) => {
    const g = new THREE.Group();
    g.visible = false;
    root.add(g);
    const size = name === 'watcher' ? 0.95 : name === 'reel' ? 0.82 : 0.76;
    const s = atlasSprite(fAtlas, size, size, name === 'watcher' ? 0.82 : 0.9);
    s.setFrame(row * 4 + FF.stand);
    g.add(s.sprite);
    const hat = atlasSprite(hatAtlas, 0.26, 0.33);
    hat.setFrame(0);
    hat.sprite.position.y = size * 0.86;
    hat.sprite.visible = false;
    g.add(hat.sprite);
    friends[name] = { name, row, group: g, sprite: s, hat, size, hopTl: null, out: false };
  });
  const fFrame = (f, k) => f.sprite.setFrame(f.row * 4 + k);

  const GATHER = { ticket: [-1.75, 1.42], drip: [-1.0, 1.82], reel: [1.05, 1.78] };
  const LINEUP = { ticket: [-2.5, 1.62], drip: [-1.25, 1.66], bart: [0, 1.6], reel: [1.25, 1.66], watcher: [2.5, 1.62] };
  const DOOR_SPOTS = { ticket: -1.6, drip: -1.6, reel: 1.6, watcher: 0 };

  // ---- Bartholomew: idle / walk / sleep ----------------------------------------------

  let mode = 'idle'; // 'idle' | 'walk' | 'sleep' | 'tip'
  let facingLeft = false;
  let idleTl = null;
  let bobTween = null;
  let walkTl = null;
  let walkEndsAt = 0;
  let glintCall = null;
  let zTl = null;

  function stopIdle() {
    idleTl?.kill();
    idleTl = null;
    bobTween?.kill();
    bobTween = null;
    glintCall?.kill();
    glintCall = null;
  }

  function idle() {
    stopIdle();
    mode = 'idle';
    body.mat.rotation = 0;
    body.sprite.position.y = 0;
    body.setFrame(BF.idle0, facingLeft);
    if (reduced()) return;
    idleTl = gsap.timeline({ repeat: -1 });
    [BF.idle0, BF.idle1, BF.idle2, BF.idle3].forEach((f, i) => idleTl.call(() => body.setFrame(f, facingLeft), null, i * 0.42));
    idleTl.to({}, { duration: 0.42 }, 3 * 0.42);
    bobTween = gsap.to(body.sprite.position, { y: 0.022, duration: 1.3, ease: 'sine.inOut', yoyo: true, repeat: -1 });
    const scheduleGlint = () => {
      glintCall = gsap.delayedCall(3 + Math.random() * 5, () => {
        if (mode !== 'idle') return;
        idleTl?.pause();
        body.setFrame(BF.glint, facingLeft);
        glintCall = gsap.delayedCall(0.22, () => {
          if (mode !== 'idle') return;
          idleTl?.resume();
          scheduleGlint();
        });
      });
    };
    scheduleGlint();
  }

  function stopZs() {
    zTl?.kill();
    zTl = null;
    zs.forEach((z) => (z.sprite.visible = false));
  }

  function startZs() {
    stopZs();
    const base = new THREE.Vector3(A.bench.x + 0.18, SIDEWALK_Y + 1.62, A.bench.z + 0.25);
    if (reduced()) {
      zs[0].sprite.visible = true;
      zs[0].sprite.position.copy(base);
      zs[0].mat.opacity = 0.8;
      return;
    }
    zTl = gsap.timeline({ repeat: -1 });
    zs.forEach((z, i) => {
      zTl.fromTo(
        z.sprite.position,
        { x: base.x, y: base.y, z: base.z },
        {
          x: base.x + 0.35, y: base.y + 0.75, duration: 2.4, ease: 'sine.out',
          onStart: () => (z.sprite.visible = true),
        },
        i * 1.2,
      );
      zTl.fromTo(z.mat, { opacity: 0 }, { opacity: 0.85, duration: 0.5, ease: 'none' }, i * 1.2);
      zTl.to(z.mat, { opacity: 0, duration: 0.8, ease: 'none' }, i * 1.2 + 1.6);
      zTl.fromTo(z.sprite.scale, { x: 0.22, y: 0.22 }, { x: 0.4, y: 0.4, duration: 2.4, ease: 'none' }, i * 1.2);
    });
  }

  function killWalk() {
    walkTl?.kill();
    walkTl = null;
    walkEndsAt = 0;
  }

  /** Walk along the sidewalk to x (and optionally to z). Returns the duration. */
  function walkTo(x, { z = A.walkZ, then = idle } = {}) {
    killWalk();
    const from = bart.position.clone();
    const dx = x - from.x;
    const dz = z - from.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.02) {
      then();
      return 0;
    }
    if (Math.abs(dx) > 0.05) facingLeft = dx < 0;
    if (reduced()) {
      // Reduced motion: change place and pose without walking.
      bart.position.x = x;
      bart.position.z = z;
      then();
      return 0;
    }
    stopIdle();
    mode = 'walk';
    const duration = THREE.MathUtils.clamp(dist / 2.1, 0.55, 7.5);
    const STRIDE = 0.42;
    const state = { t: 0 };
    walkTl = gsap.timeline({ onComplete: () => { walkTl = null; then(); } });
    walkTl.to(state, {
      t: 1,
      duration,
      ease: 'power1.inOut',
      onUpdate: () => {
        bart.position.x = from.x + dx * state.t;
        bart.position.z = from.z + dz * state.t;
        const traveled = dist * state.t;
        const phase = traveled / STRIDE;
        const step = Math.floor(phase * 2) % 4;
        body.setFrame([BF.walk0, BF.walk1, BF.walk2, BF.walk3][step], facingLeft);
        body.sprite.position.y = Math.abs(Math.sin(phase * Math.PI)) * 0.05;
        body.mat.rotation = (facingLeft ? 1 : -1) * 0.045;
      },
    });
    walkEndsAt = performance.now() + duration * 1000;
    return duration;
  }

  function sit() {
    stopIdle();
    killWalk();
    mode = 'sleep';
    body.mat.rotation = 0;
    body.sprite.position.y = 0;
    bart.position.set(A.bench.x, SIDEWALK_Y, A.bench.z + 0.16);
    body.setFrame(BF.sleep, false);
    startZs();
  }

  function goSleep() {
    if (mode === 'sleep') return;
    stopZs();
    const benchFront = A.bench.z + 0.65;
    walkTo(A.bench.x, { z: benchFront, then: sit });
  }

  function wake() {
    if (mode !== 'sleep') return;
    stopZs();
    mode = 'idle';
    bart.position.z = A.bench.z + 0.65;
    body.setFrame(BF.idle0, facingLeft);
  }

  // ---- friends -----------------------------------------------------------------------

  let arrangement = 'none';

  function stopHops(f) {
    f.hopTl?.kill();
    f.hopTl = null;
    f.sprite.sprite.position.y = 0;
    fFrame(f, FF.stand);
  }

  function quietHops(f) {
    stopHops(f);
    if (reduced()) return;
    const tl = gsap.timeline({ repeat: -1, repeatDelay: 1 + Math.random() * 2.4, delay: Math.random() * 1.5 });
    tl.call(() => fFrame(f, FF.crouch))
      .to({}, { duration: 0.1 })
      .call(() => fFrame(f, FF.air))
      .to(f.sprite.sprite.position, { y: 0.13, duration: 0.2, ease: 'power2.out' })
      .to(f.sprite.sprite.position, { y: 0, duration: 0.2, ease: 'power2.in' })
      .call(() => fFrame(f, FF.crouch))
      .to({}, { duration: 0.08 })
      .call(() => fFrame(f, Math.random() < 0.4 ? FF.happy : FF.stand));
    f.hopTl = tl;
  }

  function placeFriend(f, x, z, { animate = true } = {}) {
    gsap.killTweensOf(f.group.position);
    gsap.killTweensOf(f.group.scale);
    const appearing = !f.group.visible;
    f.group.visible = true;
    f.out = true;
    f.group.position.set(x, SIDEWALK_Y, z);
    if (appearing && animate && !reduced()) gsap.fromTo(f.group.scale, { x: 0.4, y: 0.4, z: 0.4 }, { x: 1, y: 1, z: 1, duration: 0.45, ease: 'back.out(2.2)' });
    else f.group.scale.set(1, 1, 1);
    quietHops(f);
  }

  function hideFriend(f, { animate = true } = {}) {
    if (!f.group.visible) return;
    stopHops(f);
    f.out = false;
    f.hat.sprite.visible = false;
    if (!animate || reduced()) {
      f.group.visible = false;
      return;
    }
    gsap.to(f.group.scale, { x: 0.01, y: 0.01, z: 0.01, duration: 0.3, ease: 'back.in(2)', onComplete: () => { f.group.visible = false; f.group.scale.set(1, 1, 1); } });
  }

  /** Friends' resting arrangement for the current state: none, gathered, or lined up. */
  function arrange(kind, { animate = true } = {}) {
    arrangement = kind;
    const spots = kind === 'lineup' ? LINEUP : kind === 'gather' ? GATHER : {};
    for (const f of Object.values(friends)) {
      const spot = spots[f.name];
      if (!spot) hideFriend(f, { animate });
      else placeFriend(f, spot[0], spot[1], { animate });
    }
  }

  /** Celebration: friends hop out of the open doors to their spots. */
  function hopOut(names, kind = 'gather') {
    const spots = kind === 'lineup' ? LINEUP : GATHER;
    const tl = gsap.timeline();
    if (reduced()) {
      // Reduced motion: they are simply there.
      names.forEach((n) => placeFriend(friends[n], spots[n][0], spots[n][1], { animate: false }));
      return tl;
    }
    names.forEach((name, k) => {
      const f = friends[name];
      const [tx, tz] = spots[name];
      if (f.out && f.group.visible) {
        // Already outside: just hop over to the new spot.
        stopHops(f);
        tl.add(hopPath(f, f.group.position.clone(), new THREE.Vector3(tx, SIDEWALK_Y, tz), 2), k * 0.15);
        return;
      }
      const start = new THREE.Vector3(DOOR_SPOTS[name], A.doorY, 0.32);
      tl.call(() => {
        stopHops(f);
        f.group.visible = true;
        f.out = true;
        f.group.scale.set(1, 1, 1);
        f.group.position.copy(start);
      }, null, k * 0.28);
      tl.add(hopPath(f, start, new THREE.Vector3(tx, SIDEWALK_Y, tz), 3), k * 0.28);
    });
    tl.call(() => names.forEach((n) => quietHops(friends[n])));
    return tl;
  }

  function hopPath(f, from, to, hops) {
    const tl = gsap.timeline();
    for (let i = 0; i < hops; i++) {
      const a = from.clone().lerp(to, i / hops);
      const b = from.clone().lerp(to, (i + 1) / hops);
      const pos = { k: 0 };
      tl.call(() => fFrame(f, FF.crouch));
      tl.to({}, { duration: 0.07 });
      tl.call(() => fFrame(f, FF.air));
      tl.to(pos, {
        k: 1,
        duration: 0.34,
        ease: 'none',
        onUpdate: () => {
          f.group.position.x = a.x + (b.x - a.x) * pos.k;
          f.group.position.z = a.z + (b.z - a.z) * pos.k;
          f.group.position.y = a.y + (b.y - a.y) * pos.k + Math.sin(pos.k * Math.PI) * 0.42;
        },
      });
    }
    tl.call(() => fFrame(f, FF.happy));
    return tl;
  }

  /** Every friend that is out hops for joy, a few times. */
  function cheer(times = 3) {
    const tl = gsap.timeline();
    if (reduced()) {
      Object.values(friends).forEach((f) => f.out && fFrame(f, FF.happy));
      return tl;
    }
    Object.values(friends).forEach((f, k) => {
      if (!f.out) return;
      tl.call(() => stopHops(f), null, 0);
      for (let i = 0; i < times; i++) {
        const at = k * 0.09 + i * 0.62;
        tl.call(() => fFrame(f, FF.crouch), null, at);
        tl.call(() => fFrame(f, FF.air), null, at + 0.08);
        tl.to(f.sprite.sprite.position, { y: 0.32, duration: 0.24, ease: 'power2.out' }, at + 0.08);
        tl.to(f.sprite.sprite.position, { y: 0, duration: 0.24, ease: 'power2.in' }, at + 0.32);
        tl.call(() => fFrame(f, FF.happy), null, at + 0.56);
      }
    });
    tl.call(() => Object.values(friends).forEach((f) => f.out && quietHops(f)));
    return tl;
  }

  function partyHats(on, { animate = true } = {}) {
    for (const f of Object.values(friends)) {
      const h = f.hat.sprite;
      gsap.killTweensOf(h.scale);
      if (on && f.out) {
        h.visible = true;
        if (animate && !reduced()) gsap.fromTo(h.scale, { x: 0.01, y: 0.01 }, { x: 0.26, y: 0.33, duration: 0.4, ease: 'back.out(3)', delay: Math.random() * 0.2 });
        else h.scale.set(0.26, 0.33, 1);
      } else if (h.visible) {
        if (animate && !reduced()) gsap.to(h.scale, { x: 0.01, y: 0.01, duration: 0.3, ease: 'back.in(2)', onComplete: () => (h.visible = false) });
        else h.visible = false;
      }
    }
  }

  // ---- hat tip ------------------------------------------------------------------------

  /** Tip the bowler `times` times. Resolves back to idle. */
  function tipHat(times = 3) {
    killWalk();
    stopIdle();
    mode = 'tip';
    body.mat.rotation = 0;
    body.sprite.position.y = 0;
    const tl = gsap.timeline({ onComplete: idle });
    if (reduced()) {
      tl.call(() => body.setFrame(BF.tip2, facingLeft)).to({}, { duration: 1.6 });
      return tl;
    }
    for (let i = 0; i < times; i++) {
      const at = i * 0.95;
      tl.call(() => body.setFrame(BF.tip0, facingLeft), null, at);
      tl.call(() => body.setFrame(BF.tip1, facingLeft), null, at + 0.12);
      tl.call(() => body.setFrame(BF.tip2, facingLeft), null, at + 0.26);
      tl.to(body.sprite.position, { y: 0.06, duration: 0.18, ease: 'power2.out', yoyo: true, repeat: 1 }, at + 0.26);
      tl.call(() => body.setFrame(BF.tip1, facingLeft), null, at + 0.68);
      tl.call(() => body.setFrame(BF.tip0, facingLeft), null, at + 0.8);
    }
    tl.to({}, { duration: 0.15 });
    return tl;
  }

  // ---- speech bubble ------------------------------------------------------------------

  const bubbleInner = bubble.querySelector('.bubble-inner');
  let bubbleOn = false;
  let bubbleHide = null;
  function say(text, { duration = 2.6 } = {}) {
    bubbleInner.textContent = text;
    bubbleOn = true;
    bubbleHide?.kill();
    gsap.killTweensOf(bubbleInner);
    if (reduced()) gsap.set(bubbleInner, { opacity: 1, scale: 1 });
    else gsap.fromTo(bubbleInner, { opacity: 0, scale: 0.5, y: 6 }, { opacity: 1, scale: 1, y: 0, duration: 0.35, ease: 'back.out(2.4)' });
    bubbleHide = gsap.delayedCall(duration, () => {
      gsap.to(bubbleInner, { opacity: 0, y: -6, duration: reduced() ? 0 : 0.4, onComplete: () => (bubbleOn = false) });
    });
  }

  const v = new THREE.Vector3();
  function updateBubble() {
    if (!bubbleOn) return;
    const head = mode === 'sleep' ? 1.55 : 2.0;
    v.set(bart.position.x, bart.position.y + head + body.sprite.position.y, bart.position.z).project(camera);
    const behind = v.z > 1;
    const rect = stage.getBoundingClientRect();
    const x = ((v.x + 1) / 2) * rect.width;
    const y = ((1 - v.y) / 2) * rect.height;
    bubble.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%)`;
    bubble.style.visibility = behind ? 'hidden' : 'visible';
  }

  // ---- state from data ------------------------------------------------------------------

  let celebrating = false;

  /** Put everyone where the data says, e.g. walk to the progress point. */
  function update(sel, day, { holdFriends = false, animate = true } = {}) {
    if (!day.count) {
      if (!celebrating) arrange('none', { animate });
      if (animate) goSleep();
      else sit();
      return;
    }
    wake();
    const x = THREE.MathUtils.lerp(A.startX, A.doorX, sel ? sel.progress : 0);
    const kind = day.allDone ? 'lineup' : sel?.done ? 'gather' : 'none';
    const z = kind === 'lineup' ? LINEUP.bart[1] : A.walkZ;
    if (!animate) {
      killWalk();
      bart.position.set(x, SIDEWALK_Y, z);
      idle();
    } else if (mode !== 'tip' || Math.abs(bart.position.x - x) > 0.05) {
      walkTo(x, { z });
    }
    if (!holdFriends && !celebrating) arrange(kind, { animate });
  }

  function setCelebrating(on) {
    celebrating = on;
  }

  function frame() {
    updateBubble();
  }

  return {
    root,
    update,
    frame,
    say,
    tipHat,
    hopOut,
    cheer,
    partyHats,
    arrange,
    walkTo,
    idle,
    setCelebrating,
    get position() {
      return bart.position;
    },
    get mode() {
      return mode;
    },
    get arrangement() {
      return arrangement;
    },
    /** Seconds until he reaches the end of his current walk. */
    walkRemaining: () => Math.max(0, (walkEndsAt - performance.now()) / 1000),
    friends,
    LINEUP,
  };
}
