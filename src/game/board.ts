// ── Premium 3D board: tiles, numbers, gold frame, endpoint markers ──────────
import * as THREE from 'three';
import { BOARD_N, CELL, TOP_Y, TILE_H, SNAKES, LADDERS, cellCenter } from './constants';

export interface BoardHandles {
  group: THREE.Group;
  tileTop: (n: number) => THREE.Vector3;
  pulse: (n: number, color?: number) => void;
  update: (t: number, dt: number) => void;
}

function numberTexture(n: number, dark: boolean, special: 'start' | 'finish' | 'snake' | 'ladder' | null): THREE.CanvasTexture {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  // base
  const base = dark ? '#14505c' : '#f1e6cf';
  const edge = dark ? '#0d3540' : '#d9c9a6';
  g.fillStyle = base;
  g.fillRect(0, 0, s, s);
  // subtle radial sheen
  const rg = g.createRadialGradient(s / 2, s / 2, 10, s / 2, s / 2, s * 0.75);
  rg.addColorStop(0, 'rgba(255,255,255,0.20)');
  rg.addColorStop(1, 'rgba(0,0,0,0.14)');
  g.fillStyle = rg;
  g.fillRect(0, 0, s, s);
  // inner border
  g.strokeStyle = special === 'start' || special === 'finish' ? '#ffcf6e' : edge;
  g.lineWidth = special ? 14 : 8;
  const m = 14;
  g.strokeRect(m, m, s - m * 2, s - m * 2);
  // corner motif for snake / ladder
  if (special === 'snake' || special === 'ladder') {
    g.font = '44px serif';
    g.textAlign = 'right';
    g.textBaseline = 'top';
    g.fillStyle = special === 'snake' ? (dark ? '#ff9aa8' : '#c22747') : dark ? '#ffd98a' : '#9a6a12';
    g.fillText(special === 'snake' ? '◉' : '≣', s - 26, 22);
  }
  // number
  const isGold = special === 'start' || special === 'finish';
  g.fillStyle = isGold ? '#7a4d00' : dark ? '#f4ecd9' : '#274b53';
  g.font = `700 ${n >= 100 ? 96 : 118}px Georgia, serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = 'rgba(0,0,0,0.25)';
  g.shadowBlur = 6;
  g.fillText(String(n), s / 2, s / 2 + 8);
  if (isGold) {
    g.font = `700 30px Georgia, serif`;
    g.fillStyle = '#7a4d00';
    g.fillText(special === 'start' ? '★ START' : '★ CROWN', s / 2, s - 44);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function buildBoard(scene: THREE.Scene): BoardHandles {
  const group = new THREE.Group();
  const tileMeshes = new Map<number, THREE.Mesh>();
  const pulseState = new Map<number, { t: number; color: THREE.Color }>();

  const sideMat = new THREE.MeshStandardMaterial({ color: 0x241f3d, roughness: 0.55, metalness: 0.3 });

  const snakeHeads = new Set(Object.keys(SNAKES).map(Number));
  const snakeTails = new Set(Object.values(SNAKES));
  const ladderFeet = new Set(Object.keys(LADDERS).map(Number));
  const ladderTops = new Set(Object.values(LADDERS));

  for (let n = 1; n <= 100; n++) {
    const idx = n - 1;
    const row = Math.floor(idx / BOARD_N);
    const col = row % 2 === 0 ? idx % BOARD_N : BOARD_N - 1 - (idx % BOARD_N);
    const dark = (row + col) % 2 === 1;
    const { x, z } = cellCenter(n);
    const special =
      n === 1 ? 'start' : n === 100 ? 'finish' : snakeHeads.has(n) ? 'snake' : ladderFeet.has(n) ? 'ladder' : null;
    void snakeTails;
    void ladderTops;

    const topMat = new THREE.MeshStandardMaterial({
      map: numberTexture(n, dark, special),
      roughness: special ? 0.3 : 0.55,
      metalness: special ? 0.45 : 0.08,
      emissive: special === 'finish' ? 0x664411 : 0x000000,
      emissiveIntensity: special === 'finish' ? 0.5 : 0,
    });
    if (n === 1) {
      topMat.emissive = new THREE.Color(0x553a00);
      topMat.emissiveIntensity = 0.45;
    }
    const mats = [sideMat, sideMat, topMat, sideMat, sideMat, sideMat];
    const tile = new THREE.Mesh(new THREE.BoxGeometry(CELL * 0.96, TILE_H, CELL * 0.96), mats);
    tile.position.set(x, TILE_H / 2, z);
    tile.receiveShadow = true;
    tile.castShadow = false;
    tile.userData.square = n;
    group.add(tile);
    tileMeshes.set(n, tile);
  }

  // — Gold frame —
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xc9a24d, metalness: 0.9, roughness: 0.28 });
  const half = (BOARD_N * CELL) / 2 + 0.18;
  const mkBar = (w: number, d: number, x: number, z: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, d), frameMat);
    m.position.set(x, 0.1, z);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  };
  mkBar(half * 2 + 0.6, 0.3, 0, half);
  mkBar(half * 2 + 0.6, 0.3, 0, -half);
  mkBar(0.3, half * 2, half, 0);
  mkBar(0.3, half * 2, -half, 0);
  // corner gems
  const gemMat = new THREE.MeshStandardMaterial({ color: 0x53e9ff, emissive: 0x1e90ff, emissiveIntensity: 1.6, roughness: 0.2 });
  [[half, half], [-half, half], [half, -half], [-half, -half]].forEach(([x, z]) => {
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.26), gemMat);
    gem.position.set(x, 0.42, z);
    gem.castShadow = true;
    group.add(gem);
  });

  // — Endpoint rings: gold = ladder foot, red = snake head —
  const ringGeo = new THREE.TorusGeometry(0.32, 0.045, 10, 40);
  const ladderRingMat = new THREE.MeshStandardMaterial({ color: 0xffd98a, emissive: 0xcc8a00, emissiveIntensity: 0.9, metalness: 0.7, roughness: 0.3 });
  const snakeRingMat = new THREE.MeshStandardMaterial({ color: 0xff6b81, emissive: 0xcc0033, emissiveIntensity: 0.9, metalness: 0.3, roughness: 0.4 });
  Object.keys(LADDERS).forEach((k) => {
    const { x, z } = cellCenter(Number(k));
    const r = new THREE.Mesh(ringGeo, ladderRingMat);
    r.rotation.x = Math.PI / 2;
    r.position.set(x, TOP_Y + 0.03, z);
    group.add(r);
  });
  Object.keys(SNAKES).forEach((k) => {
    const { x, z } = cellCenter(Number(k));
    const r = new THREE.Mesh(ringGeo, snakeRingMat);
    r.rotation.x = Math.PI / 2;
    r.position.set(x, TOP_Y + 0.03, z);
    group.add(r);
  });

  // — Finish beacon —
  const fin = cellCenter(100);
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.3, 3.2, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd76e, transparent: true, opacity: 0.28, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  beacon.position.set(fin.x, TOP_Y + 1.6, fin.z);
  group.add(beacon);
  const crown = new THREE.Mesh(
    new THREE.TorusKnotGeometry(0.22, 0.07, 64, 12),
    new THREE.MeshStandardMaterial({ color: 0xffd76e, metalness: 1, roughness: 0.25, emissive: 0x7a4d00, emissiveIntensity: 0.6 }),
  );
  crown.position.set(fin.x, TOP_Y + 0.55, fin.z);
  crown.castShadow = true;
  group.add(crown);

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
    update(t: number, dt: number) {
      beacon.rotation.y += dt * 0.8;
      crown.rotation.y += dt * 1.2;
      crown.position.y = TOP_Y + 0.55 + Math.sin(t * 2) * 0.06;
      pulseState.forEach((s, n) => {
        s.t += dt;
        const mesh = tileMeshes.get(n);
        if (!mesh) return;
        const mats = mesh.material as THREE.Material[];
        const top = mats[2] as THREE.MeshStandardMaterial;
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
