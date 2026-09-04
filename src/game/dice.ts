// ── Velvet dice pad + cinematic tumbling die ────────────────────────────────
import * as THREE from 'three';
import { easeOut } from './constants';

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

export function buildDice(scene: THREE.Scene, onLanded?: () => void): DiceHandles {
  // velvet pad beside board
  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(1.5, 1.65, 0.22, 32),
    new THREE.MeshStandardMaterial({ color: 0x5c1a3a, roughness: 0.95 }),
  );
  pad.position.set(9.2, 0.11, 8.6);
  pad.receiveShadow = true;
  pad.castShadow = true;
  scene.add(pad);
  const padTrim = new THREE.Mesh(
    new THREE.TorusGeometry(1.55, 0.06, 10, 48),
    new THREE.MeshStandardMaterial({ color: 0xd9a441, metalness: 0.9, roughness: 0.3 }),
  );
  padTrim.rotation.x = Math.PI / 2;
  padTrim.position.set(9.2, 0.24, 8.6);
  scene.add(padTrim);

  const mats = [1, 6, 2, 5, 3, 4].map(
    (v) => new THREE.MeshStandardMaterial({ map: pipTexture(v), roughness: 0.3, metalness: 0.1 }),
  );
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.85, 0.85), mats);
  mesh.castShadow = true;
  const home = new THREE.Vector3(9.2, 1.4, 8.6);
  mesh.position.copy(home);
  scene.add(mesh);

  // soft spotlight over pad
  const spot = new THREE.SpotLight(0xffe3b3, 25, 18, 0.6, 0.5, 1.6);
  spot.position.set(9.2, 7, 8.6);
  spot.target.position.copy(home);
  scene.add(spot, spot.target);

  let anim: {
    t: number; dur: number; value: number;
    from: THREE.Vector3; q0: THREE.Quaternion; q1: THREE.Quaternion;
    spins: number; resolve: () => void;
  } | null = null;
  let idle = true;

  return {
    mesh,
    get rolling() { return anim !== null; },
    setIdle(on: boolean) { idle = on; },
    roll(value: number) {
      if (anim) return Promise.resolve();
      idle = false;
      const yaw = Math.floor(Math.random() * 4) * (Math.PI / 2) + Math.random() * 0.12;
      const q1 = faceQuaternion(value, yaw);
      const q0 = mesh.quaternion.clone();
      const jitter = new THREE.Vector3((Math.random() - 0.5) * 1.2, 0, (Math.random() - 0.5) * 1.2);
      const from = mesh.position.clone();
      return new Promise<void>((resolve) => {
        anim = { t: 0, dur: 1.15, value, from, q0, q1, spins: 2 + Math.floor(Math.random() * 2), resolve };
      });
    },
    update(_t: number, dt: number) {
      if (anim) {
        anim.t += dt;
        const k = Math.min(1, anim.t / anim.dur);
        const e = easeOut(k);
        // hop arc above pad
        const peak = 4.2;
        const y = THREE.MathUtils.lerp(anim.from.y, home.y, e) + Math.sin(k * Math.PI) * peak;
        mesh.position.set(
          THREE.MathUtils.lerp(anim.from.x, home.x, e) + Math.sin(k * Math.PI * 3) * 0.4,
          y,
          THREE.MathUtils.lerp(anim.from.z, home.z, e) + Math.cos(k * Math.PI * 2) * 0.4,
        );
        // tumble: slerp to target + extra spins that decay
        const spin = new THREE.Quaternion().setFromEuler(new THREE.Euler(
          (1 - e) * anim.spins * Math.PI * 2,
          (1 - e) * anim.spins * Math.PI * 1.4,
          0,
        ));
        mesh.quaternion.copy(anim.q0).slerp(anim.q1, e).multiply(spin);
        if (k >= 1) {
          mesh.position.copy(home);
          mesh.quaternion.copy(anim.q1);
          const r = anim.resolve;
          anim = null;
          // squash bounce
          mesh.scale.set(1.25, 0.7, 1.25);
          setTimeout(() => mesh.scale.set(1, 1, 1), 130);
          onLanded?.();
          r();
        }
      } else if (idle) {
        mesh.position.y = home.y + Math.sin(_t * 1.6) * 0.12;
        mesh.rotation.y += dt * 0.5;
      }
    },
  };
}
