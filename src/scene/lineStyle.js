// Cream outlines over dark, nearly flat fills — the 2D program's line drawings in 3D.
//
// outlined(mesh) hangs EdgesGeometry lines off a mesh. Hairline weight uses
// LineBasicMaterial (always 1 device pixel); anything thicker swaps in
// LineSegments2 + LineMaterial so the width really changes. Static outlines are
// merged into one line object per opacity to keep draw calls low.

import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const PALETTE = {
  bg: 0x10150f,
  panel: 0x171e17,
  cream: 0xefe7d4,
  muted: 0x9a9483,
  rule: 0x2b3329,
  gold: 0xcdb57f,
  sage: 0x9aa77a,
  rose: 0xc99a8f,
  lamp: 0xffd9a0,
};

// Fills from the brief: #141b14 – #1d261d.
export const FILL = { deep: 0x141b14, dark: 0x171f17, mid: 0x1a221a, light: 0x1d261d, trim: 0x202a20 };

const LINE_COLOR = new THREE.Color(PALETTE.cream);
const matSets = new Map(); // opacity key → { basic, fat }
const entries = new Set(); // { basic, fat, positions }
let weight = 1;
let pixelRatio = 1;

function materials(opacity) {
  const key = opacity.toFixed(2);
  if (!matSets.has(key)) {
    matSets.set(key, {
      basic: new THREE.LineBasicMaterial({ color: LINE_COLOR, transparent: true, opacity, fog: true }),
      fat: new LineMaterial({ color: PALETTE.cream, linewidth: weight * pixelRatio, transparent: true, opacity, fog: true, worldUnits: false }),
    });
  }
  return matSets.get(key);
}

function ensureFat(entry) {
  if (entry.fat) return entry.fat;
  const geo = new LineSegmentsGeometry().setPositions(entry.positions);
  const fat = new LineSegments2(geo, materials(entry.opacity).fat);
  fat.position.copy(entry.basic.position);
  fat.quaternion.copy(entry.basic.quaternion);
  fat.scale.copy(entry.basic.scale);
  fat.renderOrder = entry.basic.renderOrder;
  fat.raycast = () => {};
  entry.basic.parent?.add(fat);
  entry.fat = fat;
  return fat;
}

function show(entry) {
  const fat = weight > 1.01;
  entry.basic.visible = !fat;
  if (fat) ensureFat(entry).visible = true;
  else if (entry.fat) entry.fat.visible = false;
}

function register(line, positions, opacity) {
  line.raycast = () => {};
  const entry = { basic: line, fat: null, positions, opacity };
  line.userData.lineEntry = entry;
  entries.add(entry);
  show(entry);
  return entry;
}

/** Add cream edges to a mesh. Returns the mesh for chaining. */
export function outlined(mesh, { thresholdAngle = 20, opacity = 0.72, dynamic = false } = {}) {
  const edges = new THREE.EdgesGeometry(mesh.geometry, thresholdAngle);
  const line = new THREE.LineSegments(edges, materials(opacity).basic);
  line.userData.dynamicOutline = dynamic;
  mesh.add(line);
  register(line, edges.attributes.position.array, opacity);
  return mesh;
}

/** Free-standing cream segments (window frames, siding, railings). positions: flat xyz pairs. */
export function segments(parent, positions, { opacity = 0.5, dynamic = false } = {}) {
  const arr = positions instanceof Float32Array ? positions : new Float32Array(positions);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const line = new THREE.LineSegments(geo, materials(opacity).basic);
  line.userData.dynamicOutline = dynamic;
  parent.add(line);
  register(line, arr, opacity);
  return line;
}

/** Rectangle outline on a z plane, plus optional mullions, as segment positions. */
export function rectSegs(x0, y0, x1, y1, z, { cross = false, vbars = 0, hbars = 0 } = {}) {
  const p = [x0, y0, z, x1, y0, z, x1, y0, z, x1, y1, z, x1, y1, z, x0, y1, z, x0, y1, z, x0, y0, z];
  const v = cross ? 1 : vbars;
  const h = cross ? 1 : hbars;
  for (let i = 1; i <= v; i++) {
    const x = x0 + ((x1 - x0) * i) / (v + 1);
    p.push(x, y0, z, x, y1, z);
  }
  for (let i = 1; i <= h; i++) {
    const y = y0 + ((y1 - y0) * i) / (h + 1);
    p.push(x0, y, z, x1, y, z);
  }
  return p;
}

/**
 * Bake every static outline under `root` into one LineSegments per opacity.
 * Outlines flagged dynamic (doors, clock hand) stay attached to their meshes.
 */
export function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const m = new THREE.Matrix4();
  const v = new THREE.Vector3();
  const buckets = new Map();
  const doomed = [];
  root.traverse((obj) => {
    const entry = obj.userData.lineEntry;
    if (!entry || entry.basic !== obj || obj.userData.dynamicOutline || obj.userData.merged) return;
    // Skip lines under a dynamic ancestor (e.g. door panes).
    for (let p = obj.parent; p && p !== root; p = p.parent) if (p.userData.dynamic) return;
    m.multiplyMatrices(inv, obj.matrixWorld);
    const src = entry.positions;
    const key = entry.opacity.toFixed(2);
    if (!buckets.has(key)) buckets.set(key, { opacity: entry.opacity, data: [] });
    const out = buckets.get(key).data;
    for (let i = 0; i < src.length; i += 3) {
      v.set(src[i], src[i + 1], src[i + 2]).applyMatrix4(m);
      out.push(v.x, v.y, v.z);
    }
    doomed.push(entry);
  });
  for (const entry of doomed) {
    entry.basic.parent?.remove(entry.basic);
    entry.basic.geometry.dispose();
    if (entry.fat) {
      entry.fat.parent?.remove(entry.fat);
      entry.fat.geometry.dispose();
    }
    entries.delete(entry);
  }
  for (const { opacity, data } of buckets.values()) {
    const line = segments(root, new Float32Array(data), { opacity });
    line.userData.merged = true;
  }
}

/**
 * Bake static meshes that share a fill material into one mesh per material.
 * Call after mergeStatic() so outlines have already been lifted off.
 */
export function mergeStaticMeshes(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const groups = new Map();
  root.traverse((obj) => {
    if (!obj.isMesh || obj.isInstancedMesh || obj.userData.dynamic || obj.userData.keep) return;
    for (let p = obj.parent; p && p !== root; p = p.parent) if (p.userData.dynamic) return;
    if (obj.children.some((c) => !c.userData.merged)) return; // still carries its own lines
    if (!groups.has(obj.material)) groups.set(obj.material, []);
    groups.get(obj.material).push(obj);
  });
  const m = new THREE.Matrix4();
  for (const [material, meshes] of groups) {
    if (meshes.length < 2) continue;
    const geos = meshes.map((mesh) => {
      m.multiplyMatrices(inv, mesh.matrixWorld);
      let g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
      g.clearGroups();
      g.applyMatrix4(m);
      return g;
    });
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) continue;
    meshes.forEach((mesh) => mesh.parent.remove(mesh));
    const out = new THREE.Mesh(merged, material);
    out.userData.mergedMesh = true;
    root.add(out);
  }
}

/** Outline width in CSS pixels. 1 = hairline LineBasicMaterial; >1 = LineMaterial. */
export function setLineWeight(w) {
  weight = w;
  for (const set of matSets.values()) set.fat.linewidth = w * pixelRatio;
  for (const e of entries) show(e);
}

export function setLinePixelRatio(pr) {
  pixelRatio = pr;
  setLineWeight(weight);
}

// ---- fills -----------------------------------------------------------------------

const fillCache = new Map();
/**
 * Dark, nearly flat Lambert fill. A little self-emission keeps fills reading as
 * flat ink even where no lamp reaches; polygon offset lets outlines win depth.
 */
export function flat(hex = FILL.mid, { emissive = 0.55, side = THREE.FrontSide } = {}) {
  const key = `${hex}:${emissive}:${side}`;
  if (!fillCache.has(key)) {
    fillCache.set(
      key,
      new THREE.MeshLambertMaterial({
        color: hex,
        emissive: hex,
        emissiveIntensity: emissive,
        side,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      }),
    );
  }
  return fillCache.get(key);
}

/** A soft round glow texture for sprites (lamps, moon halo, fireworks). */
let glowTex = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.18, 'rgba(255,255,255,0.55)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.14)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}
