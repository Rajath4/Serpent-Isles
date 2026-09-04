// ── Procedural jeweled snakes (TubeGeometry + sculpted heads) ───────────────
import * as THREE from 'three';
import { SNAKES, TOP_Y, cellCenter } from './constants';

export interface SnakeHandles {
  group: THREE.Group;
  curveOf: (head: number) => THREE.CatmullRomCurve3 | undefined;
  update: (t: number, dt: number) => void;
}

const PALETTE = [
  { body: '#c22747', belly: '#ffd9a0', pattern: '#7a0f28' },
  { body: '#3fa34d', belly: '#e8f7c8', pattern: '#1d5c2a' },
  { body: '#7b5cff', belly: '#dcd2ff', pattern: '#3d2a99' },
  { body: '#ff7a1a', belly: '#ffe3b3', pattern: '#9a3d00' },
  { body: '#00b3c6', belly: '#d2fbff', pattern: '#005f6b' },
  { body: '#e040fb', belly: '#f9d2ff', pattern: '#7a1a99' },
  { body: '#8ac926', belly: '#f4ffd2', pattern: '#4a6b00' },
  { body: '#ffca3a', belly: '#fff3c4', pattern: '#9a6a00' },
  { body: '#1982c4', belly: '#cdeaff', pattern: '#0a3d5c' },
  { body: '#6a4c93', belly: '#e3d5ff', pattern: '#37215c' },
];

function scaleTexture(body: string, pattern: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = body;
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = pattern;
  for (let x = 0; x < 256; x += 32) {
    g.beginPath();
    g.ellipse(x + 16, 32, 13, 22, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = 'rgba(255,255,255,0.25)';
  for (let x = 16; x < 256; x += 32) {
    g.beginPath();
    g.ellipse(x, 20, 5, 9, 0, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildSnakes(scene: THREE.Scene): SnakeHandles {
  const group = new THREE.Group();
  const curves = new Map<number, THREE.CatmullRomCurve3>();
  const heads: THREE.Group[] = [];
  const tongues: THREE.Mesh[] = [];

  Object.entries(SNAKES).forEach(([hs, ts], i) => {
    const head = Number(hs);
    const tail = Number(ts);
    const a = cellCenter(head);
    const b = cellCenter(tail);
    const p0 = new THREE.Vector3(a.x, TOP_Y + 0.55, a.z);
    const p3 = new THREE.Vector3(b.x, TOP_Y + 0.12, b.z);

    // S-wiggle control points
    const dir = new THREE.Vector3().subVectors(p3, p0);
    const len = dir.length();
    dir.normalize();
    const perp = new THREE.Vector3(-dir.z, 0, dir.x);
    const wiggle = Math.min(1.6, 0.5 + len * 0.16);
    const lift = Math.min(2.2, 0.7 + len * 0.22);
    const pts = [
      p0,
      p0.clone().addScaledVector(dir, len * 0.22).addScaledVector(perp, wiggle).add(new THREE.Vector3(0, lift * 0.55, 0)),
      p0.clone().addScaledVector(dir, len * 0.45).addScaledVector(perp, -wiggle * 1.2).add(new THREE.Vector3(0, lift, 0)),
      p0.clone().addScaledVector(dir, len * 0.68).addScaledVector(perp, wiggle * 0.9).add(new THREE.Vector3(0, lift * 0.5, 0)),
      p0.clone().addScaledVector(dir, len * 0.86).addScaledVector(perp, -wiggle * 0.4).add(new THREE.Vector3(0, 0.1, 0)),
      p3,
    ];
    const curve = new THREE.CatmullRomCurve3(pts);
    curves.set(head, curve);

    const pal = PALETTE[i % PALETTE.length];
    const radius = 0.13 + Math.min(0.08, len * 0.008);
    const geo = new THREE.TubeGeometry(curve, 64, radius, 12, false);
    const mat = new THREE.MeshStandardMaterial({
      map: scaleTexture(pal.body, pal.pattern),
      roughness: 0.35,
      metalness: 0.15,
    });
    const body = new THREE.Mesh(geo, mat);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // tail tip
    const tip = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.9, 0.5, 10), new THREE.MeshStandardMaterial({ color: pal.pattern, roughness: 0.5 }));
    tip.position.copy(p3);
    tip.rotation.x = Math.PI;
    group.add(tip);

    // head group oriented along curve start tangent
    const hg = new THREE.Group();
    const tangent = curve.getTangent(0).normalize();
    const headMesh = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 1.9, 20, 16),
      new THREE.MeshStandardMaterial({ color: pal.body, roughness: 0.3, metalness: 0.2 }),
    );
    headMesh.scale.set(1, 0.85, 1.25);
    headMesh.castShadow = true;
    hg.add(headMesh);
    // snout
    const snout = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 1.1, 14, 12),
      new THREE.MeshStandardMaterial({ color: pal.belly, roughness: 0.5 }),
    );
    snout.position.set(0, -radius * 0.5, radius * 1.4);
    snout.scale.set(1, 0.6, 0.8);
    hg.add(snout);
    // eyes
    const eyeWhite = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.15 });
    const pupil = new THREE.MeshStandardMaterial({ color: '#101018', roughness: 0.1 });
    [-1, 1].forEach((s) => {
      const e = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.55, 12, 10), eyeWhite);
      e.position.set(s * radius * 0.95, radius * 0.75, radius * 1.0);
      hg.add(e);
      const p = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.26, 10, 8), pupil);
      p.position.set(s * radius * 0.95, radius * 0.78, radius * 1.45);
      hg.add(p);
    });
    // forked tongue
    const tongueMat = new THREE.MeshStandardMaterial({ color: '#ff2244', emissive: 0xaa0022, emissiveIntensity: 0.7 });
    const tongue = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.5), tongueMat);
    tongue.position.set(0, -radius * 0.3, radius * 2.3);
    hg.add(tongue);
    tongues.push(tongue);

    hg.position.copy(p0).add(new THREE.Vector3(0, radius * 0.9, 0));
    const look = p0.clone().add(tangent);
    hg.lookAt(look);
    hg.rotateX(-0.25);
    group.add(hg);
    heads.push(hg);
  });

  scene.add(group);

  return {
    group,
    curveOf: (head: number) => curves.get(head),
    update(t: number, _dt: number) {
      heads.forEach((h, i) => {
        h.position.y += Math.sin(t * 2 + i * 1.9) * 0.0012;
        h.rotation.z = Math.sin(t * 1.3 + i) * 0.06;
      });
      tongues.forEach((tg, i) => {
        const s = 0.75 + (Math.sin(t * 6 + i * 2) * 0.5 + 0.5) * 0.5;
        tg.scale.z = s;
      });
    },
  };
}
