// Camera presets, the follow cam and auto-orbit.
// Presets are framed for the part of the stage the panel leaves visible: a
// narrow or covered view backs the camera off so the block still fits.

import * as THREE from 'three';
import { gsap } from 'gsap';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { reducedMotion } from '../state/settings.js';

// Each preset frames a target with a viewing direction and the half-extents
// (world units) that must fit inside the visible part of the stage.
const PRESETS = {
  street: { target: [-5.0, 6.1, 0], dir: [0, -0.1, 1], halfW: 14.2, halfH: 8.8, maxDist: 60, narrowX: -6.6 },
  marquee: { target: [0, 4.35, 1.4], dir: [0.07, -0.05, 1], halfW: 5.0, halfH: 3.0, maxDist: 22 },
  bird: { target: [-4.5, 2.2, -1.5], dir: [0, 1.25, 0.8], halfW: 15.5, halfH: 9, maxDist: 62, narrowX: -2 },
  follow: { target: [0, 1.15, 0], dir: [0.16, 0.1, 1], halfW: 2.5, halfH: 1.7, maxDist: 14 },
};
// Tall, narrow screens (phones): a three-quarter view down the street, so the
// picture house is close and large and the lamps recede into the distance.
const PORTRAIT = {
  street: { target: [-4.9, 4.2, 1.0], dir: [0.8, 0.04, 1], halfW: 6.2, halfH: 9, maxDist: 42 },
  marquee: { target: [0, 4.35, 1.4], dir: [0.18, -0.05, 1], halfW: 4.4, halfH: 3.0, maxDist: 24 },
  bird: { target: [-4.5, 1.6, 0], dir: [0.55, 1.25, 0.85], halfW: 7.5, halfH: 10, maxDist: 44 },
  follow: { target: [0, 1.15, 0], dir: [0.3, 0.1, 1], halfW: 2.2, halfH: 1.9, maxDist: 12 },
};
const BOUNDS = { x: [-22, 22], y: [0.4, 14], z: [-4, 16] };
const AZIMUTH = 1.25;

export function createCameraRig({ camera, dom, getStage, getFollowTarget }) {
  const controls = new OrbitControls(camera, dom);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 2.5;
  controls.maxDistance = 70;
  controls.minPolarAngle = 0.08;
  controls.maxPolarAngle = Math.PI / 2 - 0.035;
  controls.minAzimuthAngle = -AZIMUTH;
  controls.maxAzimuthAngle = AZIMUTH;
  controls.rotateSpeed = 0.55;
  controls.zoomSpeed = 0.8;
  controls.panSpeed = 0.8;
  controls.screenSpacePanning = true;
  controls.listenToKeyEvents(dom);
  controls.keyPanSpeed = 14;

  let mode = 'street';
  let moving = null;
  let userMoved = false;
  let orbitSpeed = 0;
  let orbitDir = 1;
  const listeners = [];
  const followPos = new THREE.Vector3();
  const followPrev = new THREE.Vector3();
  let following = false;

  controls.addEventListener('start', () => {
    userMoved = true;
    if (moving) {
      moving.kill();
      moving = null;
      controls.enabled = true;
      if (mode === 'follow') beginFollow(false);
    }
  });
  controls.addEventListener('change', () => {
    const t = controls.target;
    t.x = THREE.MathUtils.clamp(t.x, ...BOUNDS.x);
    t.y = THREE.MathUtils.clamp(t.y, ...BOUNDS.y);
    t.z = THREE.MathUtils.clamp(t.z, ...BOUNDS.z);
  });

  /** Distance at which the preset's extents fit the visible part of the stage. */
  function presetPose(name) {
    const { w, h, right, bottom } = getStage();
    const vw = Math.max(1, w - right);
    const vh = Math.max(1, h - bottom);
    const p = (vw / vh < 0.9 && PORTRAIT[name]) || PRESETS[name];
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    // With a view offset the projection keeps the full-stage FOV; only vw × vh shows.
    const dW = p.halfW / (tanV * (vw / h));
    const dH = p.halfH / (tanV * (vh / h));
    let d = Math.max(dW, dH);
    const target = new THREE.Vector3(...p.target);
    if (d > p.maxDist) {
      // Too narrow to show it all (phones): keep the lamp path, start to doors, in frame.
      if (p.narrowX !== undefined) target.x += (p.narrowX - target.x) * Math.min(1, (d - p.maxDist) / p.maxDist);
      d = p.maxDist;
    }
    if (name === 'follow') target.add(getFollowTarget());
    const pos = target.clone().add(new THREE.Vector3(...p.dir).normalize().multiplyScalar(d));
    return { pos, target };
  }

  function emit() {
    listeners.forEach((fn) => fn(mode));
  }

  function beginFollow(snap = true) {
    following = true;
    followPos.copy(getFollowTarget());
    followPrev.copy(followPos);
    if (snap) controls.update();
  }

  /** Tween to a preset ('street' | 'marquee' | 'bird' | 'follow'). */
  function goTo(name, { animate = true } = {}) {
    mode = name;
    following = false;
    userMoved = false;
    moving?.kill();
    const { pos, target } = presetPose(name);
    emit();
    if (!animate || reducedMotion()) {
      camera.position.copy(pos);
      controls.target.copy(target);
      controls.update();
      if (name === 'follow') beginFollow();
      return;
    }
    controls.enabled = false;
    const from = { px: camera.position.x, py: camera.position.y, pz: camera.position.z, tx: controls.target.x, ty: controls.target.y, tz: controls.target.z };
    const dist = camera.position.distanceTo(pos);
    moving = gsap.to(from, {
      px: pos.x, py: pos.y, pz: pos.z, tx: target.x, ty: target.y, tz: target.z,
      duration: THREE.MathUtils.clamp(0.9 + dist * 0.035, 1.1, 2.2),
      ease: 'power2.inOut',
      onUpdate: () => {
        // The follow target can move mid-flight: aim at where he is now.
        if (name === 'follow') {
          const live = presetPose('follow');
          const k = moving ? moving.progress() : 1;
          camera.position.set(from.px, from.py, from.pz).lerp(live.pos, k * k);
          controls.target.set(from.tx, from.ty, from.tz).lerp(live.target, k * k);
        } else {
          camera.position.set(from.px, from.py, from.pz);
          controls.target.set(from.tx, from.ty, from.tz);
        }
      },
      onComplete: () => {
        moving = null;
        controls.enabled = true;
        controls.update();
        if (name === 'follow') beginFollow();
      },
    });
  }

  /** Re-frame after a resize or panel change, unless the user has moved the view. */
  function refit() {
    if (!userMoved && !moving && mode !== 'follow') goTo(mode, { animate: false });
  }

  function setAutoOrbit(speed) {
    orbitSpeed = reducedMotion() ? 0 : speed;
    controls.autoRotate = orbitSpeed > 0;
  }

  function update(dt) {
    if (following && !moving) {
      const t = getFollowTarget();
      const k = 1 - Math.exp(-dt * 3.2);
      followPos.lerp(t, k);
      const d = followPos.clone().sub(followPrev);
      camera.position.add(d);
      controls.target.add(d);
      followPrev.copy(followPos);
    }
    if (controls.autoRotate) {
      // Ping-pong between the azimuth limits so the facade stays in view.
      const az = controls.getAzimuthalAngle();
      if (az >= AZIMUTH - 0.02) orbitDir = 1;
      else if (az <= -AZIMUTH + 0.02) orbitDir = -1;
      controls.autoRotateSpeed = orbitSpeed * orbitDir;
    }
    if (controls.enabled) controls.update(dt);
  }

  goTo('street', { animate: false });

  return {
    controls,
    goTo,
    refit,
    update,
    setAutoOrbit,
    onMode: (fn) => listeners.push(fn),
    get mode() {
      return mode;
    },
    /** How far the camera sits from what it looks at (drives fog thinning). */
    viewDistance: () => camera.position.distanceTo(controls.target),
  };
}
