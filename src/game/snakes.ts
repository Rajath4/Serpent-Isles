// ── Gallery-grade serpents, fused for speed: bodies stay sculpted, but each ─
// head is merged by material (~22 draws → ~12 per snake) and micro-parts skip
// the shadow pass. Identical look, identical behavior, far fewer draw calls.
import * as THREE from 'three';
import { mergeCompat } from './merge';
import { Q } from './quality';
import { SNAKES, TOP_Y, cellCenter } from './constants';
import { makeGlowTexture } from './environment';

export type RouteMode = 'full' | 'ghost' | 'hidden';

export interface SnakeHandles {
  group: THREE.Group;
  curveOf: (head: number) => THREE.CatmullRomCurve3 | undefined;
  spotlight: (head: number | null) => void;
  setDimAll: (dim: boolean) => void;
  setRouteMode: (mode: RouteMode) => void;
  update: (t: number, dt: number) => void;
}

const PALETTE = [
  { body: '#d21f4d', belly: '#ffe0ae', pattern: '#7a0f28' },
  { body: '#2fb45f', belly: '#ecf9cd', pattern: '#1d5c2a' },
  { body: '#6f5cff', belly: '#e0d6ff', pattern: '#3d2a99' },
  { body: '#e8721d', belly: '#ffe6b8', pattern: '#9a3d00' },
  { body: '#00bdd1', belly: '#d6fcff', pattern: '#005f6b' },
  { body: '#cf3ff2', belly: '#fbd6ff', pattern: '#7a1a99' },
  { body: '#93d923', belly: '#f6ffd6', pattern: '#4a6b00' },
  { body: '#e3b52e', belly: '#fff5c8', pattern: '#9a6a00' },
  { body: '#1f94d6', belly: '#d2ecff', pattern: '#0a3d5c' },
  { body: '#7f52c9', belly: '#e7d9ff', pattern: '#37215c' },
];

// ── shared skin maps (grayscale; hue comes from vertex colors) ──────────────
type SkinStyle = 'banded' | 'diamond';
const skinCache = new Map<SkinStyle, { map: THREE.CanvasTexture; bump: THREE.CanvasTexture }>();

function skinMaps(style: SkinStyle) {
  const hit = skinCache.get(style);
  if (hit) return hit;
  const W = 256;
  const H = 64;
  const mapC = document.createElement('canvas');
  mapC.width = W;
  mapC.height = H;
  const g = mapC.getContext('2d')!;
  g.fillStyle = '#f4f4f4';
  g.fillRect(0, 0, W, H);
  if (style === 'banded') {
    for (let x = 0; x < W; x += 42) {
      g.fillStyle = '#8f8f8f';
      g.fillRect(x, 0, 15, H);
      g.fillStyle = '#c9c9c9';
      g.fillRect(x + 15, 0, 3, H);
    }
  } else {
    g.strokeStyle = 'rgba(60,60,60,0.55)';
    g.lineWidth = 3;
    for (let y = -H; y < H * 2; y += 16) {
      for (let x = -W; x < W * 2; x += 16) {
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + 8, y + 8);
        g.lineTo(x, y + 16);
        g.lineTo(x - 8, y + 8);
        g.closePath();
        g.stroke();
      }
    }
    g.fillStyle = 'rgba(255,255,255,0.7)';
    for (let y = 8; y < H; y += 16) {
      for (let x = 8; x < W; x += 16) {
        g.beginPath();
        g.arc(x, y, 2, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  const sheen = g.createLinearGradient(0, 0, 0, H);
  sheen.addColorStop(0, 'rgba(255,255,255,0.20)');
  sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
  sheen.addColorStop(1, 'rgba(0,0,0,0.16)');
  g.fillStyle = sheen;
  g.fillRect(0, 0, W, H);

  const bumpC = document.createElement('canvas');
  bumpC.width = W;
  bumpC.height = H;
  const b = bumpC.getContext('2d')!;
  b.fillStyle = '#000';
  b.fillRect(0, 0, W, H);
  b.fillStyle = '#fff';
  [10, 26, 42, 58].forEach((y, row) => {
    for (let x = row % 2 ? 16 : 8; x < W + 16; x += 16) {
      b.beginPath();
      b.arc(x, y, 8, Math.PI, 0);
      b.fill();
    }
  });

  const map = new THREE.CanvasTexture(mapC);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(7, 1);
  map.colorSpace = THREE.SRGBColorSpace;
  const bump = new THREE.CanvasTexture(bumpC);
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
  bump.repeat.set(7, 1);
  const out = { map, bump };
  skinCache.set(style, out);
  return out;
}

interface Entry {
  head: number;
  fadeMats: THREE.MeshStandardMaterial[];
  eyeMats: THREE.MeshStandardMaterial[];
  spikes: THREE.InstancedMesh;
  glow: THREE.Sprite;
  glowMat: THREE.SpriteMaterial;
  headGroup: THREE.Group;
  tongue: THREE.Mesh;
  tongueBaseZ: number;
  tongueTravel: number;
  tongueExt: number;
  phase: number;
}

const BODY_Y = TOP_Y + 0.1;

/** Paint a head→tail jewel gradient into the tube's vertex colors. */
function paintGradient(geo: THREE.TubeGeometry, hex: string, tubular: number, radial: number) {
  const count = geo.attributes.position.count;
  const colors = new Float32Array(count * 3);
  const headC = new THREE.Color(hex);
  const tailC = headC.clone().multiplyScalar(0.42);
  const tmp = new THREE.Color();
  const ring = radial + 1;
  for (let i = 0; i < count; i++) {
    const t = Math.min(1, Math.floor(i / ring) / tubular);
    tmp.copy(headC).lerp(tailC, Math.pow(t, 0.85));
    const lift = 1.1 - t * 0.12;
    colors[i * 3] = tmp.r * lift;
    colors[i * 3 + 1] = tmp.g * lift;
    colors[i * 3 + 2] = tmp.b * lift;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
/** Bake a part transform into its geometry so parts can merge. */
function bake(
  bucket: THREE.BufferGeometry[],
  geo: THREE.BufferGeometry,
  px: number, py: number, pz: number,
  rx = 0, ry = 0, rz = 0,
  sx = 1, sy?: number, sz?: number,
  parent?: THREE.Matrix4,
) {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  _v.set(px, py, pz);
  _s.set(sx, sy ?? sx, sz ?? sx);
  const m = new THREE.Matrix4().compose(_v, _q, _s);
  if (parent) m.premultiply(parent);
  geo.applyMatrix4(m);
  bucket.push(geo);
}

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
      const base = mode === 'ghost' ? 0.16 : 1;
      const target = dimAll ? 0.14 : spot === null ? base : focused ? 1 : 0.13;
      for (const m of e.fadeMats) m.opacity = m.userData.baseOpacity * target;
      e.glowMat.opacity = focused ? 0.9 : target * 0.5;
      e.glow.visible = e.glowMat.opacity > 0.02;
      const show = target > 0.2 || focused;
      e.headGroup.visible = show;
      e.spikes.visible = show;
    }
  };
  const track = (e: Entry, m: THREE.MeshStandardMaterial, base = 1) => {
    m.transparent = true;
    m.userData.baseOpacity = base;
    e.fadeMats.push(m);
    return m;
  };

  Object.entries(SNAKES).forEach(([hs, ts], i) => {
    const head = Number(hs);
    const tail = Number(ts);
    const a = cellCenter(head);
    const b = cellCenter(tail);
    const p0 = new THREE.Vector3(a.x, BODY_Y + 0.2, a.z);
    const p3 = new THREE.Vector3(b.x, BODY_Y, b.z);

    const dir = new THREE.Vector3().subVectors(p3, p0);
    const len = dir.length();
    dir.normalize();
    const perp = new THREE.Vector3(-dir.z, 0, dir.x);
    const wiggle = Math.min(0.7, 0.22 + len * 0.06);
    const lift = 0.1 + Math.min(0.2, len * 0.03);
    const at = (f: number, side: number, up: number) =>
      p0.clone().lerp(p3, f).addScaledVector(perp, side).add(new THREE.Vector3(0, up, 0));
    const curve = new THREE.CatmullRomCurve3([
      p0,
      at(0.2, wiggle, lift * 0.4),
      at(0.42, -wiggle * 1.1, lift),
      at(0.64, wiggle * 0.9, lift * 0.65),
      at(0.84, -wiggle * 0.35, lift * 0.25),
      p3,
    ]);
    curves.set(head, curve);

    const pal = PALETTE[i % PALETTE.length];
    const style: SkinStyle = i % 2 === 0 ? 'diamond' : 'banded';
    const skin = skinMaps(style);
    const radius = 0.08 + Math.min(0.022, len * 0.0035);
    const R = radius;

    const entry: Entry = {
      head, fadeMats: [], eyeMats: [], spikes: null as unknown as THREE.InstancedMesh,
      glow: null as unknown as THREE.Sprite, glowMat: null as unknown as THREE.SpriteMaterial,
      headGroup: new THREE.Group(), tongue: null as unknown as THREE.Mesh,
      tongueBaseZ: 3.55 * R, tongueTravel: 1.1 * R, tongueExt: 0, phase: i * 1.7,
    };

    // — body: jewel skin with scale relief + head→tail gradient —
    // (low tier: leaner tubes, plain PBR — same silhouette, cheaper fragments)
    const D = Q.tubeDetail;
    const TUB = Math.max(24, Math.round(56 * D));
    const RAD = Math.max(6, Math.round(10 * D));
    const bodyGeo = new THREE.TubeGeometry(curve, TUB, radius, RAD, false);
    paintGradient(bodyGeo, pal.body, TUB, RAD);
    const skinOpts = {
      map: skin.map,
      bumpMap: skin.bump,
      bumpScale: 0.6,
      vertexColors: true,
      roughness: Q.fancy ? 0.34 : 0.45,
      metalness: 0.08,
      emissive: new THREE.Color(pal.body),
      emissiveIntensity: 0.18,
      envMapIntensity: Q.fancy ? 1.0 : 0.6,
    };
    const bodyMat = track(
      entry,
      Q.fancy
        ? new THREE.MeshPhysicalMaterial({
            ...skinOpts,
            clearcoat: 1,
            clearcoatRoughness: 0.22,
            iridescence: 0.32,
            iridescenceIOR: 1.3,
          })
        : new THREE.MeshStandardMaterial(skinOpts),
    );
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // — cream underbelly hugging the tile (presence only, no shadow cost) —
    const bellyMat = track(
      entry,
      Q.fancy
        ? new THREE.MeshPhysicalMaterial({
            color: pal.belly, roughness: 0.5, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.4,
          })
        : new THREE.MeshStandardMaterial({ color: pal.belly, roughness: 0.55, metalness: 0 }),
    );
    const belly = new THREE.Mesh(
      new THREE.TubeGeometry(curve, Math.max(16, Math.round(32 * D)), radius * 0.78, 8, false),
      bellyMat,
    );
    belly.position.y = -radius * 0.52;
    belly.receiveShadow = true;
    group.add(belly);

    // — dorsal spines, tapering toward the tail —
    const SPIKES = 12;
    const spikeMat = track(entry, new THREE.MeshStandardMaterial({
      color: pal.pattern, roughness: 0.45, metalness: 0.15,
    }));
    const spikes = new THREE.InstancedMesh(new THREE.ConeGeometry(radius * 0.4, radius * 1.2, 6), spikeMat, SPIKES);
    const mtx = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const Y = new THREE.Vector3(0, 1, 0);
    for (let k = 0; k < SPIKES; k++) {
      const t = 0.05 + (k / (SPIKES - 1)) * 0.85;
      curve.getPoint(t, pos);
      const tan = curve.getTangent(t);
      up.copy(Y).addScaledVector(tan, -tan.y).normalize();
      q.setFromUnitVectors(Y, up);
      const s = 1 - t * 0.5;
      scl.set(s, s, s);
      pos.addScaledVector(up, radius * 0.95);
      mtx.compose(pos, q, scl);
      spikes.setMatrixAt(k, mtx);
    }
    group.add(spikes);
    entry.spikes = spikes;

    // — beaded tail tip marching PAST the tube end, capping the hollow —
    const tailMat = track(entry, new THREE.MeshStandardMaterial({ color: pal.pattern, roughness: 0.4, metalness: 0.3 }));
    const tailGeos: THREE.BufferGeometry[] = [];
    [0.8, 0.62, 0.45, 0.3].forEach((s, k) => {
      const bead = new THREE.SphereGeometry(radius * s, 10, 8);
      bead.translate(
        p3.x + dir.x * (k + 0.4) * radius * 1.15, p3.y + 0.015,
        p3.z + dir.z * (k + 0.4) * radius * 1.15,
      );
      tailGeos.push(bead);
    });
    group.add(new THREE.Mesh(mergeCompat(tailGeos), tailMat));

    // — head: ONE continuous lathe-turned predator skull, parts fused by material —
    const hg = entry.headGroup;
    const skullMat = track(
      entry,
      Q.fancy
        ? new THREE.MeshPhysicalMaterial({
            color: pal.body, roughness: 0.32, metalness: 0.08,
            clearcoat: 1, clearcoatRoughness: 0.22, envMapIntensity: 1.0,
          })
        : new THREE.MeshStandardMaterial({
            color: pal.body, roughness: 0.38, metalness: 0.08, envMapIntensity: 0.6,
          }),
    );
    const skullParts: THREE.BufferGeometry[] = [];
    const prof: Array<[number, number]> = [
      [1.06, -0.45], [1.05, -0.15], [1.0, 0.1], [1.12, 0.55], [1.18, 1.0], [1.02, 1.6],
      [0.82, 2.2], [0.58, 2.75], [0.32, 3.15], [0.1, 3.42], [0.02, 3.5],
    ];
    const skullGeo = new THREE.LatheGeometry(
      prof.map(([x, y]) => new THREE.Vector2(x * R, y * R)), 20,
    );
    skullGeo.rotateX(Math.PI / 2); // long axis → +Z (snout forward)
    bake(skullParts, skullGeo, 0, 0, 0, 0, 0, 0, 1, 0.7, 1);
    // brow ridges ride the same skull (fused)
    [-1, 1].forEach((s) => {
      bake(skullParts, new THREE.SphereGeometry(0.32 * R, 12, 10),
        s * 0.72 * R, 0.62 * R, 1.55 * R, 0, -s * 0.3, 0, 1.3, 0.45, 0.9);
    });
    const skull = new THREE.Mesh(mergeCompat(skullParts), skullMat);
    skull.castShadow = true;
    hg.add(skull);

    // cobra hood on a few individuals only
    if ([0, 4, 7].includes(i)) {
      const hoodMat = track(
        entry,
        Q.fancy
          ? new THREE.MeshPhysicalMaterial({
              color: pal.pattern, roughness: 0.42, metalness: 0.1, clearcoat: 0.8, clearcoatRoughness: 0.35,
            })
          : new THREE.MeshStandardMaterial({ color: pal.pattern, roughness: 0.5, metalness: 0.1 }),
      );
      const hoodInnerMat = track(entry, new THREE.MeshStandardMaterial({ color: pal.belly, roughness: 0.55 }));
      const hoodM = new THREE.Matrix4().compose(
        new THREE.Vector3(0, 0.1 * R, -0.85 * R),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.3, 0, 0)),
        new THREE.Vector3(1, 1, 1),
      );
      const hoodGeos: THREE.BufferGeometry[] = [];
      bake(hoodGeos, new THREE.SphereGeometry(R, 18, 14), 0, 0, 0, 0, 0, 0, 1.6, 2.0, 0.55, hoodM);
      const hood = new THREE.Mesh(mergeCompat(hoodGeos), hoodMat);
      hood.castShadow = true;
      hg.add(hood);
      const hoodInGeos: THREE.BufferGeometry[] = [];
      bake(hoodInGeos, new THREE.SphereGeometry(R, 16, 12), 0, 0, 0.16 * R, 0, 0, 0, 1.24, 1.6, 0.45, hoodM);
      [-1, 1].forEach((s) => {
        bake(hoodInGeos, new THREE.SphereGeometry(0.2 * R, 10, 8),
          s * 0.55 * R, 0.55 * R, -0.52 * R, 0, 0, 0, 1, 1.3, 0.4, hoodM);
      });
      hg.add(new THREE.Mesh(mergeCompat(hoodInGeos), hoodInnerMat));
    }

    // one fused dark mask: sockets + pupils + nostrils (micro-parts, zero shadow cost)
    const darkMat = track(entry, new THREE.MeshStandardMaterial({ color: 0x140d0a, roughness: 0.5 }));
    const darkGeos: THREE.BufferGeometry[] = [];
    [-1, 1].forEach((s) => {
      bake(darkGeos, new THREE.TorusGeometry(0.34 * R, 0.11 * R, 8, 18),
        s * 1.0 * R, 0.55 * R, 1.32 * R, 0, s * 0.55, 0);
      bake(darkGeos, new THREE.BoxGeometry(0.08 * R, 0.3 * R, 0.1 * R),
        s * 1.04 * R, 0.57 * R, 1.6 * R, 0, s * 0.33, 0);
      bake(darkGeos, new THREE.SphereGeometry(0.08 * R, 8, 6), s * 0.22 * R, 0.3 * R, 2.95 * R);
    });
    hg.add(new THREE.Mesh(mergeCompat(darkGeos), darkMat));

    // jeweled amber eyes, fused pair
    const eyeMat = track(entry, new THREE.MeshStandardMaterial({
      color: 0x2a1500, emissive: 0xffae00, emissiveIntensity: 2.2, roughness: 0.15,
    }));
    entry.eyeMats.push(eyeMat);
    const eyeGeos: THREE.BufferGeometry[] = [];
    [-1, 1].forEach((s) => {
      bake(eyeGeos, new THREE.SphereGeometry(0.3 * R, 14, 12), s * 0.95 * R, 0.55 * R, 1.35 * R);
    });
    hg.add(new THREE.Mesh(mergeCompat(eyeGeos), eyeMat));

    // fangs, fused pair
    const fangMat = track(entry, new THREE.MeshStandardMaterial({ color: 0xfff6e6, roughness: 0.2, metalness: 0.05 }));
    const fangGeos: THREE.BufferGeometry[] = [];
    [-1, 1].forEach((s) => {
      bake(fangGeos, new THREE.ConeGeometry(0.09 * R, 0.45 * R, 8),
        s * 0.4 * R, -0.35 * R, 2.7 * R, Math.PI - 0.12, 0, 0);
    });
    hg.add(new THREE.Mesh(mergeCompat(fangGeos), fangMat));

    // slim forked tongue, fused — the whole mount darts (position + sway carry it)
    const tongueMat = track(entry, new THREE.MeshStandardMaterial({ color: '#ff2244', emissive: 0xaa0022, emissiveIntensity: 0.9 }));
    const tongueGeos: THREE.BufferGeometry[] = [];
    bake(tongueGeos, new THREE.BoxGeometry(0.14 * R, 0.05 * R, 0.9 * R), 0, 0, 0.15 * R);
    [-1, 1].forEach((s) => {
      bake(tongueGeos, new THREE.ConeGeometry(0.07 * R, 0.5 * R, 6), s * 0.16 * R, 0, 0.95 * R, Math.PI / 2, 0, 0);
    });
    const tongue = new THREE.Mesh(mergeCompat(tongueGeos), tongueMat);
    tongue.position.set(0, -0.3 * R, 3.55 * R);
    hg.add(tongue);
    entry.tongue = tongue;

    // Stance: prowling forward off the neck — collar + throat swallow the tube
    // start so the joint can never gape.
    const outward = curve.getTangent(0).setY(0).normalize().negate();
    const throat = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.04, 14, 12), skullMat);
    throat.position.copy(p0);
    throat.scale.set(1, 0.85, 1.3);
    throat.lookAt(p0.clone().add(outward));
    group.add(throat);

    hg.position.set(a.x, BODY_Y + 0.2, a.z);
    hg.lookAt(a.x + outward.x * 4, BODY_Y + 0.55, a.z + outward.z * 4);
    group.add(hg);

    // warning glow on the strike square
    const glowMat = new THREE.SpriteMaterial({
      map: glowTex, color: pal.body, transparent: true, opacity: 0.45,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const glow = new THREE.Sprite(glowMat);
    glow.scale.set(1.35, 1.35, 1);
    glow.position.set(a.x, BODY_Y + 0.3, a.z);
    group.add(glow);
    entry.glow = glow;
    entry.glowMat = glowMat;

    entries.push(entry);
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
    update(t: number, dt: number) {
      if (mode === 'hidden') return;
      for (const e of entries) {
        const active = spot === null || spot === e.head;
        e.headGroup.position.y = BODY_Y + 0.2 + (active ? Math.sin(t * 2 + e.phase) * 0.03 : 0);
        e.headGroup.rotation.z = active ? Math.sin(t * 1.4 + e.phase) * 0.07 : 0;
        // tongue dart: a quick flick out every few seconds (staggered per snake),
        // quivering while extended — then withdrawn into the snout.
        const period = 3.4 + (e.phase % 2.1);
        const lt = (t + e.phase * 2.13) % period;
        let target = 0;
        if (active && lt < 0.5) {
          const k = lt / 0.5;
          target = k < 0.28 ? 1 - Math.pow(1 - k / 0.28, 2) : k < 0.55 ? 1 : 1 - (k - 0.55) / 0.45;
        }
        e.tongueExt += (target - e.tongueExt) * Math.min(1, dt * 10);
        const ext = Math.max(0, e.tongueExt);
        e.tongue.position.z = e.tongueBaseZ - (1 - ext) * e.tongueTravel;
        e.tongue.rotation.y = ext * Math.sin(t * 28 + e.phase) * 0.09;
        for (const m of e.eyeMats) m.emissiveIntensity = active ? 2.1 + Math.sin(t * 3 + e.phase) * 0.5 : 1.2;
      }
    },
  };
}
