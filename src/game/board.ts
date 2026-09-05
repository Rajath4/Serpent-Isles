// ── Premium 3D board: tiles, numbers, gold frame, endpoint markers ──────────
// Perf: 100 tile bodies are merged into ONE draw call; only the 100 printed
// top skins stay individual (per-tile pulse glow needs its own material).
import * as THREE from 'three';
import { mergeCompat, freeze } from './merge';
import { Q } from './quality';
import { BOARD_N, CELL, TOP_Y, TILE_H, SNAKES, LADDERS, cellCenter } from './constants';

export interface BoardHandles {
  group: THREE.Group;
  tileTop: (n: number) => THREE.Vector3;
  pulse: (n: number, color?: number) => void;
  /** Swift-voyage crown marker. Pass null for classic (crown lives at 100). */
  setGoal: (n: number | null) => void;
  update: (t: number, dt: number) => void;
}

function numberTexture(
  n: number,
  dark: boolean,
  special: 'start' | 'finish' | 'snake' | 'ladder' | null,
  size: number,
): THREE.CanvasTexture {
  const s = size;
  const k = size / 256; // all artwork scales from the 256 master
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  // hushed, low-contrast palette — the board is a stage, not the show
  const base = dark ? '#57757c' : '#e9dfc6';
  g.fillStyle = base;
  g.fillRect(0, 0, s, s);
  const rg = g.createRadialGradient(s / 2, s / 2, 10, s / 2, s / 2, s * 0.75);
  rg.addColorStop(0, 'rgba(255,255,255,0.12)');
  rg.addColorStop(1, 'rgba(0,0,0,0.10)');
  g.fillStyle = rg;
  g.fillRect(0, 0, s, s);
  // hairline inner border
  const isGold = special === 'start' || special === 'finish';
  g.strokeStyle = isGold ? '#a8842f' : dark ? 'rgba(255,255,255,0.20)' : 'rgba(90,70,40,0.25)';
  g.lineWidth = isGold ? 8 * k : 4 * k;
  const m = 12 * k;
  g.strokeRect(m, m, s - m * 2, s - m * 2);

  const ink = isGold ? '#6b4a08' : dark ? 'rgba(244,236,217,0.92)' : 'rgba(58,80,86,0.88)';
  if (isGold) {
    // landmark tiles keep a centered, ceremonial treatment
    g.fillStyle = ink;
    g.font = `700 ${(n >= 100 ? 84 : 104) * k}px Georgia, serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(n), s / 2, s / 2 - 6 * k);
    g.font = `700 ${28 * k}px Georgia, serif`;
    g.fillText(special === 'start' ? '★ START' : '★ CROWN', s / 2, s - 46 * k);
  } else {
    // corner numbers stay readable under tokens, snakes & ladders
    g.fillStyle = ink;
    g.font = `700 ${58 * k}px Georgia, serif`;
    g.textAlign = 'left';
    g.textBaseline = 'top';
    g.fillText(String(n), 24 * k, 18 * k);
    if (special === 'snake' || special === 'ladder') {
      g.font = `${30 * k}px serif`;
      g.textAlign = 'right';
      g.fillStyle = special === 'snake' ? (dark ? '#f2a3b1' : '#b02342') : dark ? '#f4d98c' : '#8a6410';
      g.fillText(special === 'snake' ? '◉' : '≣', s - 24 * k, 24 * k);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Q.anisotropy;
  return tex;
}

export function buildBoard(scene: THREE.Scene): BoardHandles {
  const group = new THREE.Group();
  const tileMeshes = new Map<number, THREE.Mesh>();
  const pulseState = new Map<number, { t: number; color: THREE.Color }>();

  const snakeHeads = new Set(Object.keys(SNAKES).map(Number));
  const ladderFeet = new Set(Object.keys(LADDERS).map(Number));

  // — merged tile bodies: one geometry, one material, one draw call —
  const baseGeos: THREE.BufferGeometry[] = [];
  const topGeo = new THREE.PlaneGeometry(CELL * 0.96, CELL * 0.96);
  for (let n = 1; n <= 100; n++) {
    const idx = n - 1;
    const row = Math.floor(idx / BOARD_N);
    const col = row % 2 === 0 ? idx % BOARD_N : BOARD_N - 1 - (idx % BOARD_N);
    const dark = (row + col) % 2 === 1;
    const { x, z } = cellCenter(n);
    const special =
      n === 1 ? 'start' : n === 100 ? 'finish' : snakeHeads.has(n) ? 'snake' : ladderFeet.has(n) ? 'ladder' : null;

    const base = new THREE.BoxGeometry(CELL * 0.96, TILE_H, CELL * 0.96);
    base.translate(x, TILE_H / 2, z);
    baseGeos.push(base);

    const topMat = new THREE.MeshStandardMaterial({
      map: numberTexture(n, dark, special, Q.tier === 'low' ? 160 : 256),
      roughness: special ? 0.3 : 0.55,
      metalness: special ? 0.45 : 0.08,
      emissive: special === 'finish' ? 0x664411 : 0x000000,
      emissiveIntensity: special === 'finish' ? 0.5 : 0,
    });
    if (n === 1) {
      topMat.emissive = new THREE.Color(0x553a00);
      topMat.emissiveIntensity = 0.45;
    }
    const top = new THREE.Mesh(topGeo, topMat);
    top.rotation.x = -Math.PI / 2;
    top.position.set(x, TOP_Y + 0.0015, z);
    top.receiveShadow = true;
    top.userData.square = n;
    freeze(top);
    group.add(top);
    tileMeshes.set(n, top);
  }
  const baseMesh = new THREE.Mesh(
    mergeCompat(baseGeos),
    new THREE.MeshStandardMaterial({ color: 0x241f3d, roughness: 0.55, metalness: 0.3 }),
  );
  baseGeos.forEach((g) => g.dispose());
  baseMesh.receiveShadow = true;
  freeze(baseMesh);
  group.add(baseMesh);

  // — Gold frame (merged bars + merged gems: 8 draws → 2) —
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xc9a24d, metalness: 0.9, roughness: 0.28 });
  const half = (BOARD_N * CELL) / 2 + 0.18;
  const barGeos: THREE.BufferGeometry[] = [];
  const mkBar = (w: number, d: number, x: number, z: number) => {
    const b = new THREE.BoxGeometry(w, 0.3, d);
    b.translate(x, 0.1, z);
    barGeos.push(b);
  };
  mkBar(half * 2 + 0.6, 0.3, 0, half);
  mkBar(half * 2 + 0.6, 0.3, 0, -half);
  mkBar(0.3, half * 2, half, 0);
  mkBar(0.3, half * 2, -half, 0);
  const frame = new THREE.Mesh(mergeCompat(barGeos), frameMat);
  frame.castShadow = true;
  frame.receiveShadow = true;
  freeze(frame);
  group.add(frame);
  // corner gems
  const gemMat = new THREE.MeshStandardMaterial({ color: 0x53e9ff, emissive: 0x1e90ff, emissiveIntensity: 1.6, roughness: 0.2 });
  const gemGeos: THREE.BufferGeometry[] = [];
  [[half, half], [-half, half], [half, -half], [-half, -half]].forEach(([x, z]) => {
    const gem = new THREE.OctahedronGeometry(0.26);
    gem.translate(x, 0.42, z);
    gemGeos.push(gem);
  });
  const gems = new THREE.Mesh(mergeCompat(gemGeos), gemMat);
  freeze(gems);
  group.add(gems);

  // — Endpoint rings, merged per hue (19 draws → 2) —
  const ringProto = new THREE.TorusGeometry(0.27, 0.035, 8, 36);
  const ladderRingMat = new THREE.MeshStandardMaterial({ color: 0xffd98a, emissive: 0xcc8a00, emissiveIntensity: 0.9, metalness: 0.7, roughness: 0.3 });
  const snakeRingMat = new THREE.MeshStandardMaterial({ color: 0xff6b81, emissive: 0xcc0033, emissiveIntensity: 0.9, metalness: 0.3, roughness: 0.4 });
  const ladderRingGeos: THREE.BufferGeometry[] = [];
  const snakeRingGeos: THREE.BufferGeometry[] = [];
  Object.keys(LADDERS).forEach((k) => {
    const { x, z } = cellCenter(Number(k));
    const r = ringProto.clone();
    r.rotateX(Math.PI / 2);
    r.translate(x, TOP_Y + 0.03, z);
    ladderRingGeos.push(r);
  });
  Object.keys(SNAKES).forEach((k) => {
    const { x, z } = cellCenter(Number(k));
    const r = ringProto.clone();
    r.rotateX(Math.PI / 2);
    r.translate(x, TOP_Y + 0.03, z);
    snakeRingGeos.push(r);
  });
  ringProto.dispose();
  const ladderRings = new THREE.Mesh(mergeCompat(ladderRingGeos), ladderRingMat);
  const snakeRings = new THREE.Mesh(mergeCompat(snakeRingGeos), snakeRingMat);
  freeze(ladderRings);
  freeze(snakeRings);
  group.add(ladderRings);
  group.add(snakeRings);

  // — Finish beacon —
  const fin = cellCenter(100);
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.3, 3.2, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd76e, transparent: true, opacity: 0.28, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  beacon.position.set(fin.x, TOP_Y + 1.6, fin.z);
  group.add(beacon);
  const crownMat = new THREE.MeshStandardMaterial({ color: 0xffd76e, metalness: 1, roughness: 0.25, emissive: 0x7a4d00, emissiveIntensity: 0.6 });
  const crown = new THREE.Mesh(
    new THREE.TorusKnotGeometry(0.22, 0.07, 64, 12),
    crownMat,
  );
  crown.position.set(fin.x, TOP_Y + 0.55, fin.z);
  crown.castShadow = true;
  group.add(crown);

  // — Swift-voyage goal marker (hidden for classic) —
  const goalRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.42, 0.05, 10, 48),
    new THREE.MeshStandardMaterial({ color: 0xffe1a1, emissive: 0xcc8a00, emissiveIntensity: 1.4, metalness: 0.8, roughness: 0.25 }),
  );
  goalRing.rotation.x = Math.PI / 2;
  goalRing.visible = false;
  group.add(goalRing);
  const goalBeacon = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.2, 2.2, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffe1a1, transparent: true, opacity: 0.3, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  goalBeacon.visible = false;
  group.add(goalBeacon);

  scene.add(group);

  const tileTop = (n: number) => {
    const { x, z } = cellCenter(n < 1 ? 1 : n);
    if (n < 1) return new THREE.Vector3(x, TOP_Y, z);
    return new THREE.Vector3(x, TOP_Y, z);
  };

  return {
    group,
    tileTop,
    pulse(n: number, color = 0xffd76e) {
      pulseState.set(n, { t: 0, color: new THREE.Color(color) });
    },
    setGoal(n: number | null) {
      if (n === null) {
        goalRing.visible = false;
        goalBeacon.visible = false;
        // Classic voyage — the square-100 crown is the prize.
        beacon.visible = true;
        crown.visible = true;
        return;
      }
      const { x, z } = cellCenter(n);
      goalRing.position.set(x, TOP_Y + 0.04, z);
      goalRing.visible = true;
      goalBeacon.position.set(x, TOP_Y + 1.1, z);
      goalBeacon.visible = true;
      // Swift voyage ends at 50 — the unreachable square-100 crown would mislead.
      beacon.visible = false;
      crown.visible = false;
    },
    update(t: number, dt: number) {
      beacon.rotation.y += dt * 0.8;
      crown.rotation.y += dt * 1.2;
      crown.position.y = TOP_Y + 0.55 + Math.sin(t * 2) * 0.06;
      // the crown breathes light — the reason eyes drift to square 100
      crownMat.emissiveIntensity = 0.5 + (Math.sin(t * 2.4) * 0.5 + 0.5) * 0.5;
      if (goalBeacon.visible) {
        goalBeacon.rotation.y += dt;
        goalRing.rotation.z += dt * 0.6;
      }
      pulseState.forEach((s, n) => {
        s.t += dt;
        const mesh = tileMeshes.get(n);
        if (!mesh) return;
        const top = mesh.material as THREE.MeshStandardMaterial;
        const k = Math.max(0, 1 - s.t / 1.6);
        top.emissive.copy(s.color).multiplyScalar(k * 0.9);
        if (k <= 0) {
          top.emissive.setHex(n === 100 ? 0x664411 : n === 1 ? 0x553a00 : 0x000000);
          pulseState.delete(n);
        }
      });
    },
  };
}
