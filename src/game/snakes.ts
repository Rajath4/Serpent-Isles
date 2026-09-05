// ── Low-profile jeweled serpents: slim bodies hug the board, heads rear up ───
// Focus-first design: bodies are quiet routes; drama lives at the strike square.
import * as THREE from 'three';
import { SNAKES, TOP_Y, cellCenter } from './constants';
import { makeGlowTexture } from './environment';

export type RouteMode = 'full' | 'ghost' | 'hidden';

export interface SnakeHandles {
  group: THREE.Group;
  curveOf: (head: number) => THREE.CatmullRomCurve3 | undefined;
  /** Spotlight one serpent (its head square); everything else falls back. */
  spotlight: (head: number | null) => void;
  /** Dim every serpent regardless of spotlight (e.g. while inspecting a ladder). */
  setDimAll: (dim: boolean) => void;
  setRouteMode: (mode: RouteMode) => void;
  update: (t: number, dt: number) => void;
}

const PALETTE = [
  { body: '#b02342', belly: '#ffd9a0', pattern: '#7a0f28' },
  { body: '#35853f', belly: '#e8f7c8', pattern: '#1d5c2a' },
  { body: '#5f4fd0', belly: '#dcd2ff', pattern: '#3d2a99' },
  { body: '#d2681c', belly: '#ffe3b3', pattern: '#9a3d00' },
  { body: '#0d8b9c', belly: '#d2fbff', pattern: '#005f6b' },
  { body: '#b02fc4', belly: '#f9d2ff', pattern: '#7a1a99' },
  { body: '#6d9c1f', belly: '#f4ffd2', pattern: '#4a6b00' },
  { body: '#c39a2b', belly: '#fff3c4', pattern: '#9a6a00' },
  { body: '#1668a0', belly: '#cdeaff', pattern: '#0a3d5c' },
  { body: '#57407e', belly: '#e3d5ff', pattern: '#37215c' },
];

function scaleTexture(body: string, pattern: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = body;
  g.fillRect(0, 0, 256, 64);
  // muted scale motif — low contrast so tiles stay readable
  g.globalAlpha = 0.45;
  g.fillStyle = pattern;
  for (let x = 0; x < 256; x += 32) {
    g.beginPath();
    g.ellipse(x + 16, 32, 9, 15, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 0.3;
  g.fillStyle = '#ffffff';
  for (let x = 16; x < 256; x += 32) {
    g.beginPath();
    g.ellipse(x, 22, 4, 7, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

interface Entry {
  head: number;
  bodyMat: THREE.MeshStandardMaterial;
  glowMat: THREE.SpriteMaterial;
  headGroup: THREE.Group;
  tongue: THREE.Mesh;
  phase: number;
}

const BODY_Y = TOP_Y + 0.1;

export function buildSnakes(scene: THREE.Scene): SnakeHandles {
  const group = new THREE.Group();
  const curves = new Map<number, THREE.CatmullRomCurve3>();
  const entries: Entry[] = [];
  const glowTex = makeGlowTexture();

  let mode: RouteMode = 'full';
  let spot: number | null = null;
  let dimAll = false;

  const refresh = () => {
    group.visible = mode !== 'hidden';
    if (mode === 'hidden') return;
    for (const e of entries) {
      const focused = spot === e.head;
      const base = mode === 'ghost' ? 0.16 : 0.92;
      const target = dimAll ? 0.14 : spot === null ? base : focused ? 1 : 0.13;
      e.bodyMat.opacity = target;
      e.bodyMat.emissiveIntensity = focused ? 0.85 : 0.22;
      e.glowMat.opacity = focused ? 0.85 : target * 0.5;
      e.headGroup.visible = target > 0.2 || focused;
    }
  };

  Object.entries(SNAKES).forEach(([hs, ts], i) => {
    const head = Number(hs);
    const tail = Number(ts);
    const a = cellCenter(head);
    const b = cellCenter(tail);
    const p0 = new THREE.Vector3(a.x, BODY_Y + 0.22, a.z); // neck rises to the head
    const p3 = new THREE.Vector3(b.x, BODY_Y, b.z);

    // gentle in-plane S-wiggle — the body stays glued to the board
    const dir = new THREE.Vector3().subVectors(p3, p0);
    const len = dir.length();
    dir.normalize();
    const perp = new THREE.Vector3(-dir.z, 0, dir.x);
    const wiggle = Math.min(0.7, 0.22 + len * 0.06);
    const lift = 0.1 + Math.min(0.22, len * 0.03);
    const at = (f: number, side: number, up: number) =>
      p0.clone().lerp(p3, f).addScaledVector(perp, side).add(new THREE.Vector3(0, up, 0));
    const curve = new THREE.CatmullRomCurve3([
      p0,
      at(0.2, wiggle, lift * 0.4),
      at(0.42, -wiggle * 1.1, lift),
      at(0.64, wiggle * 0.9, lift * 0.7),
      at(0.84, -wiggle * 0.35, lift * 0.25),
      p3,
    ]);
    curves.set(head, curve);

    const pal = PALETTE[i % PALETTE.length];
    const radius = 0.075 + Math.min(0.025, len * 0.004);
    const bodyMat = new THREE.MeshStandardMaterial({
      map: scaleTexture(pal.body, pal.pattern),
      roughness: 0.5,
      metalness: 0.1,
      transparent: true,
      opacity: 0.92,
      emissive: new THREE.Color(pal.body),
      emissiveIntensity: 0.22,
    });
    const body = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, radius, 8, false), bodyMat);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // tail tip lies flat
    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(radius * 0.85, 0.34, 8),
      new THREE.MeshStandardMaterial({ color: pal.pattern, roughness: 0.6, transparent: true, opacity: 0.92 }),
    );
    tip.position.copy(p3);
    tip.rotation.set(Math.PI / 2, 0, Math.atan2(dir.x, dir.z) + Math.PI / 2);
    group.add(tip);

    // head rears up at the strike square — the one dramatic beat per serpent
    const hg = new THREE.Group();
    const headMesh = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 1.75, 18, 14),
      new THREE.MeshStandardMaterial({ color: pal.body, roughness: 0.35, metalness: 0.15, transparent: true, opacity: 0.96 }),
    );
    headMesh.scale.set(1, 0.9, 1.2);
    headMesh.castShadow = true;
    hg.add(headMesh);
    const eyeWhite = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.2 });
    const pupil = new THREE.MeshStandardMaterial({ color: '#101018', roughness: 0.15 });
    [-1, 1].forEach((s) => {
      const e = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.5, 10, 8), eyeWhite);
      e.position.set(s * radius * 0.9, radius * 0.8, radius * 0.9);
      hg.add(e);
      const p = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.24, 8, 6), pupil);
      p.position.set(s * radius * 0.9, radius * 0.82, radius * 1.28);
      hg.add(p);
    });
    const tongue = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.015, 0.34),
      new THREE.MeshStandardMaterial({ color: '#ff2244', emissive: 0xaa0022, emissiveIntensity: 0.8 }),
    );
    tongue.position.set(0, -radius * 0.25, radius * 1.9);
    hg.add(tongue);

    hg.position.set(a.x, BODY_Y + 0.34, a.z);
    const tangent = curve.getTangent(0).setY(0).normalize();
    hg.lookAt(a.x + tangent.x, BODY_Y + 0.34, a.z + tangent.z);
    hg.rotateX(-0.35);
    group.add(hg);

    // soft warning glow on the strike square
    const glowMat = new THREE.SpriteMaterial({
      map: glowTex, color: pal.body, transparent: true, opacity: 0.45,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const glow = new THREE.Sprite(glowMat);
    glow.scale.set(1.15, 1.15, 1);
    glow.position.set(a.x, BODY_Y + 0.3, a.z);
    group.add(glow);

    entries.push({ head, bodyMat, glowMat, headGroup: hg, tongue, phase: i * 1.7 });
  });

  scene.add(group);
  refresh();

  return {
    group,
    curveOf: (head: number) => curves.get(head),
    spotlight(h: number | null) {
      spot = h;
      refresh();
    },
    setDimAll(d: boolean) {
      dimAll = d;
      refresh();
    },
    setRouteMode(m: RouteMode) {
      mode = m;
      refresh();
    },
    update(t: number, _dt: number) {
      if (mode === 'hidden') return;
      for (const e of entries) {
        const active = spot === null || spot === e.head;
        e.headGroup.position.y = BODY_Y + 0.34 + (active ? Math.sin(t * 2 + e.phase) * 0.03 : 0);
        e.headGroup.rotation.z = active ? Math.sin(t * 1.4 + e.phase) * 0.07 : 0;
        e.tongue.scale.z = 0.7 + (Math.sin(t * 5 + e.phase) * 0.5 + 0.5) * 0.5;
      }
    },
  };
}
