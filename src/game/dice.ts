// ── The arcane throw: anticipation → launch → slam → settling bounces ──────
// A conjured die, not a table die — it shivers, rockets skyward trailing sparks,
// slams onto a random spot of the velvet pad, bounces twice, and locks face-up.
import * as THREE from 'three';
import { easeOut, easeInOut } from './constants';

function pipTexture(v: number): THREE.CanvasTexture {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, s, s);
  grad.addColorStop(0, '#fffdf6');
  grad.addColorStop(1, '#e8dcc2');
  g.fillStyle = grad;
  roundRect(g, 8, 8, s - 16, s - 16, 44);
  g.fill();
  g.strokeStyle = '#b89b5e';
  g.lineWidth = 10;
  roundRect(g, 14, 14, s - 28, s - 28, 38);
  g.stroke();
  const pip = (x: number, y: number) => {
    const rg = g.createRadialGradient(x - 8, y - 8, 2, x, y, 30);
    rg.addColorStop(0, '#3a2c5c');
    rg.addColorStop(1, '#141024');
    g.fillStyle = rg;
    g.beginPath();
    g.arc(x, y, 30, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.beginPath();
    g.arc(x - 9, y - 10, 8, 0, Math.PI * 2);
    g.fill();
  };
  const q = s / 4;
  const layouts: Record<number, Array<[number, number]>> = {
    1: [[2 * q, 2 * q]],
    2: [[q, q], [3 * q, 3 * q]],
    3: [[q, q], [2 * q, 2 * q], [3 * q, 3 * q]],
    4: [[q, q], [3 * q, q], [q, 3 * q], [3 * q, 3 * q]],
    5: [[q, q], [3 * q, q], [2 * q, 2 * q], [q, 3 * q], [3 * q, 3 * q]],
    6: [[q, q], [3 * q, q], [q, 2 * q], [3 * q, 2 * q], [q, 3 * q], [3 * q, 3 * q]],
  };
  layouts[v].forEach(([x, y]) => pip(x, y));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Quaternion that puts value v on top. Materials: [px:1, nx:6, py:2, ny:5, pz:3, nz:4] */
function faceQuaternion(v: number, extraYaw: number): THREE.Quaternion {
  const e = new THREE.Euler();
  if (v === 2) e.set(0, extraYaw, 0);
  else if (v === 5) e.set(Math.PI, extraYaw, 0);
  else if (v === 1) e.set(0, 0, Math.PI / 2);
  else if (v === 6) e.set(0, 0, -Math.PI / 2);
  else if (v === 3) e.set(-Math.PI / 2, 0, 0);
  else e.set(Math.PI / 2, 0, 0);
  if (v === 1 || v === 6 || v === 3 || v === 4) {
    const yaw = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, extraYaw, 0));
    return yaw.multiply(new THREE.Quaternion().setFromEuler(e));
  }
  return new THREE.Quaternion().setFromEuler(e);
}

export interface DiceHandles {
  mesh: THREE.Mesh;
  rolling: boolean;
  roll: (value: number) => Promise<void>;
  update: (t: number, dt: number) => void;
  setIdle: (on: boolean) => void;
}

const REST_Y = 0.65; // die rests ON the velvet, not floating above it
const PAD_X = 9.2;
const PAD_Z = 8.6;

const D_ANTICIPATE = 0.3;
const D_LAUNCH = 0.55;
const D_SLAM = 0.36;
const D_BOUNCES = 0.55;
const D_SETTLE = 0.3;

interface Throw {
  phase: 'anticipate' | 'launch' | 'slam' | 'bounces' | 'settle';
  t: number;
  value: number;
  rest: THREE.Vector3; // where it started (returns here only if it must)
  land: THREE.Vector3; // this throw's random landing spot
  apex: THREE.Vector3;
  spin: THREE.Vector3; // tumble rates (rad/s)
  q: THREE.Quaternion; // live tumble orientation
  qBase: THREE.Quaternion;
  qTarget: THREE.Quaternion;
  wobbleAxis: THREE.Vector3;
  slideDir: THREE.Vector3;
  bouncedMid: boolean;
  resolve: () => void;
}

export function buildDice(
  scene: THREE.Scene,
  onLanded?: () => void,
  onBounce?: (strength: number) => void,
  onTrail?: (pos: THREE.Vector3) => void,
  onImpact?: (pos: THREE.Vector3) => void,
): DiceHandles {
  // velvet pad beside board
  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(1.5, 1.65, 0.22, 32),
    new THREE.MeshStandardMaterial({ color: 0x5c1a3a, roughness: 0.95 }),
  );
  pad.position.set(PAD_X, 0.11, PAD_Z);
  pad.receiveShadow = true;
  pad.castShadow = true;
  scene.add(pad);
  const padTrim = new THREE.Mesh(
    new THREE.TorusGeometry(1.55, 0.06, 10, 48),
    new THREE.MeshStandardMaterial({ color: 0xd9a441, metalness: 0.9, roughness: 0.3 }),
  );
  padTrim.rotation.x = Math.PI / 2;
  padTrim.position.set(PAD_X, 0.24, PAD_Z);
  scene.add(padTrim);

  const mats = [1, 6, 2, 5, 3, 4].map(
    (v) => new THREE.MeshStandardMaterial({ map: pipTexture(v), roughness: 0.3, metalness: 0.1 }),
  );
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.85, 0.85), mats);
  mesh.castShadow = true;
  const rest = new THREE.Vector3(PAD_X, REST_Y, PAD_Z);
  mesh.position.copy(rest);
  scene.add(mesh);

  const spot = new THREE.SpotLight(0xffe3b3, 25, 18, 0.6, 0.5, 1.6);
  spot.position.set(PAD_X, 7, PAD_Z);
  spot.target.position.set(PAD_X, REST_Y, PAD_Z);
  scene.add(spot, spot.target);

  let anim: Throw | null = null;
  let idle = true;
  const tmpQ = new THREE.Quaternion();
  const tmpE = new THREE.Euler();

  const setQuat = (q: THREE.Quaternion) => mesh.quaternion.copy(q);

  return {
    mesh,
    get rolling() {
      return anim !== null;
    },
    setIdle(on: boolean) {
      idle = on;
    },
    roll(value: number) {
      if (anim) return Promise.resolve();
      idle = false;
      // a fresh random landing spot on the velvet every throw
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * 0.75;
      const land = new THREE.Vector3(PAD_X + Math.cos(a) * r, REST_Y, PAD_Z + Math.sin(a) * r);
      const apex = land.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.4, 4.4 + Math.random() * 1.3, (Math.random() - 0.5) * 1.4));
      const yaw = Math.floor(Math.random() * 4) * (Math.PI / 2) + Math.random() * 0.12;
      const slide = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5);
      if (slide.lengthSq() < 1e-4) slide.set(1, 0, 0);
      slide.normalize();
      return new Promise<void>((resolve) => {
        anim = {
          phase: 'anticipate', t: 0, value, rest: rest.clone(), land, apex,
          spin: new THREE.Vector3(9 + Math.random() * 7, 8 + Math.random() * 8, 10 + Math.random() * 6),
          q: mesh.quaternion.clone(), qBase: mesh.quaternion.clone(),
          qTarget: faceQuaternion(value, yaw),
          wobbleAxis: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
          slideDir: slide, bouncedMid: false, resolve,
        };
      });
    },
    update(_t: number, dt: number) {
      if (!anim) {
        if (idle) {
          // at rest on the pad: breathe + slow honor-spin (yaw keeps the face up)
          mesh.position.set(rest.x, REST_Y + Math.sin(_t * 1.6) * 0.03, rest.z);
          mesh.rotation.y += dt * 0.4;
        }
        return;
      }
      const A = anim;
      A.t += dt;

      if (A.phase === 'anticipate') {
        // the shiver before the throw — crouch, not yet leap
        const k = Math.min(1, A.t / D_ANTICIPATE);
        mesh.position.set(
          A.rest.x + Math.sin(A.t * 91) * 0.035 * k,
          REST_Y + Math.abs(Math.sin(A.t * 47)) * 0.04 * k,
          A.rest.z + Math.cos(A.t * 83) * 0.035 * k,
        );
        const s = 1 + Math.sin(k * Math.PI) * 0.07;
        mesh.scale.set(s, 2 - s > 0 ? 2 - s : 1, s);
        tmpQ.setFromEuler(tmpE.set(Math.sin(A.t * 60) * 0.05 * k, 0, Math.cos(A.t * 55) * 0.05 * k));
        setQuat(A.qBase.clone().multiply(tmpQ));
        if (k >= 1) {
          A.phase = 'launch';
          A.t = 0;
          A.q.copy(A.qBase);
          mesh.scale.set(1, 1, 1);
        }
      } else if (A.phase === 'launch') {
        const k = Math.min(1, A.t / D_LAUNCH);
        const e = easeOut(k);
        mesh.position.lerpVectors(A.rest, A.apex, e);
        // corkscrew flourish on the way up
        const swirl = Math.sin(k * Math.PI * 2.2) * 0.55 * (1 - k * 0.3);
        mesh.position.x += swirl;
        mesh.position.z += Math.cos(k * Math.PI * 2.2) * 0.4 * (1 - k * 0.3);
        // furious tumble
        tmpQ.setFromEuler(tmpE.set(A.spin.x * dt, A.spin.y * dt, A.spin.z * dt));
        A.q.multiply(tmpQ);
        setQuat(A.q);
        const stretch = 1 + Math.sin(k * Math.PI) * 0.1;
        mesh.scale.set(1 / Math.sqrt(stretch), stretch, 1 / Math.sqrt(stretch));
        onTrail?.(mesh.position);
        if (k >= 1) {
          A.phase = 'slam';
          A.t = 0;
          mesh.scale.set(1, 1, 1);
        }
      } else if (A.phase === 'slam') {
        // accelerating plummet onto the landing spot
        const k = Math.min(1, A.t / D_SLAM);
        mesh.position.lerpVectors(A.apex, A.land, k * k);
        tmpQ.setFromEuler(tmpE.set(A.spin.x * 1.25 * dt, A.spin.y * 1.25 * dt, A.spin.z * 1.25 * dt));
        A.q.multiply(tmpQ);
        setQuat(A.q);
        onTrail?.(mesh.position);
        if (k >= 1) {
          mesh.position.copy(A.land);
          onImpact?.(A.land.clone().add(new THREE.Vector3(0, 0.1, 0)));
          mesh.scale.set(1.3, 0.62, 1.3); // impact squash
          A.phase = 'bounces';
          A.t = 0;
        }
      } else if (A.phase === 'bounces') {
        const k = Math.min(1, A.t / D_BOUNCES);
        // two decaying hops + a short forward roll-slide into rest
        mesh.position.set(
          A.land.x + A.slideDir.x * 0.35 * (1 - k) * (1 - k),
          REST_Y + 1.0 * Math.abs(Math.sin(k * Math.PI * 2)) * (1 - k * 0.8),
          A.land.z + A.slideDir.z * 0.35 * (1 - k) * (1 - k),
        );
        const e = easeOut(k);
        mesh.scale.set(1.3 - 0.3 * e, 0.62 + 0.38 * e, 1.3 - 0.3 * e);
        // tumble resolves into the true face while a dying wobble plays out
        mesh.quaternion.slerpQuaternions(A.q, A.qTarget, easeInOut(k));
        tmpQ.setFromAxisAngle(A.wobbleAxis, (1 - k) * 0.9 * Math.sin(k * Math.PI * 3));
        mesh.quaternion.multiply(tmpQ);
        if (!A.bouncedMid && k >= 0.5) {
          A.bouncedMid = true;
          onBounce?.(0.55);
        }
        if (k >= 1) {
          mesh.position.set(A.land.x, REST_Y, A.land.z);
          mesh.scale.set(1, 1, 1);
          onBounce?.(0.3);
          A.phase = 'settle';
          A.t = 0;
        }
      } else {
        // settle: lock the true face with a tiny victory pop
        const k = Math.min(1, A.t / D_SETTLE);
        setQuat(A.qTarget);
        const pop = Math.sin(k * Math.PI);
        mesh.scale.set(1 - 0.07 * pop, 1 + 0.14 * pop, 1 - 0.07 * pop);
        if (k >= 1) {
          mesh.scale.set(1, 1, 1);
          rest.copy(A.land);
          const r = A.resolve;
          anim = null;
          onLanded?.();
          r();
        }
      }
    },
  };
}
