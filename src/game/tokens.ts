// ── Championship player tokens: distinct silhouettes, jewel materials ───────
import * as THREE from 'three';
import { mergeCompat } from './merge';
import { Q } from './quality';
import type { PlayerDef } from './constants';
import { TOP_Y, cellCenter, stackOffset } from './constants';
import { makeGlowTexture } from './environment';

export interface TokenHandles {
  group: THREE.Group;
  objects: Map<number, THREE.Group>;
  halos: Map<number, THREE.Sprite>;
  placeInstant: (id: number, square: number, slot: number) => void;
  tokenPos: (square: number, slot: number) => THREE.Vector3;
  setActive: (id: number | null) => void;
  update: (t: number, dt: number) => void;
}

function pawnProfile(): THREE.Vector2[] {
  const pts: THREE.Vector2[] = [];
  const raw: Array<[number, number]> = [
    [0.0, 0.0], [0.30, 0.0], [0.30, 0.06], [0.20, 0.12], [0.16, 0.3],
    [0.22, 0.42], [0.13, 0.5], [0.12, 0.56], [0.0, 0.56],
  ];
  raw.forEach(([x, y]) => pts.push(new THREE.Vector2(x, y)));
  return pts;
}

function topper(id: number, mat: THREE.Material): THREE.Mesh {
  let m: THREE.Mesh;
  if (id === 0) {
    m = new THREE.Mesh(new THREE.SphereGeometry(0.17, 20, 16), mat);
    m.position.y = 0.78;
  } else if (id === 1) {
    m = new THREE.Mesh(new THREE.OctahedronGeometry(0.2), mat);
    m.position.y = 0.78;
  } else if (id === 2) {
    m = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.34, 16), mat);
    m.position.y = 0.8;
  } else {
    m = new THREE.Mesh(new THREE.TorusKnotGeometry(0.11, 0.045, 48, 10), mat);
    m.position.y = 0.78;
  }
  m.castShadow = true;
  return m;
}

export function buildTokens(scene: THREE.Scene, defs: PlayerDef[]): TokenHandles {
  const group = new THREE.Group();
  const objects = new Map<number, THREE.Group>();
  const halos = new Map<number, THREE.Sprite>();
  const glowTex = makeGlowTexture();
  let activeId: number | null = null;

  defs.forEach((def) => {
    const g = new THREE.Group();
    const jewel = new THREE.MeshPhysicalMaterial({
      color: def.color,
      roughness: 0.18,
      metalness: 0.35,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
      emissive: def.color,
      emissiveIntensity: 0.12,
    });
    const gold = new THREE.MeshStandardMaterial({ color: 0xf3cf7a, metalness: 1, roughness: 0.25 });

    const body = new THREE.Mesh(
      new THREE.LatheGeometry(pawnProfile(), Q.tier === 'low' ? 18 : 28),
      jewel,
    );
    body.castShadow = true;
    body.position.y = 0.06;
    g.add(body);

    // gold trim merged: collar + topper, one draw per champion
    const collarGeo = new THREE.TorusGeometry(0.2, 0.045, 10, 28);
    collarGeo.rotateX(Math.PI / 2);
    collarGeo.translate(0, 0.5, 0);
    const topMesh = topper(def.id, gold);
    topMesh.updateMatrix();
    const topGeo = topMesh.geometry.clone().applyMatrix4(topMesh.matrix);
    const goldMesh = new THREE.Mesh(mergeCompat([collarGeo, topGeo]), gold);
    goldMesh.castShadow = true;
    g.add(goldMesh);

    // base disc
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.38, 0.08, 28),
      new THREE.MeshStandardMaterial({ color: 0x1c1830, metalness: 0.7, roughness: 0.3 }),
    );
    base.position.y = 0.04;
    base.castShadow = true;
    g.add(base);
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.35, 0.03, 8, 40),
      new THREE.MeshStandardMaterial({ color: def.color, emissive: def.color, emissiveIntensity: 1.6 }),
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.08;
    g.add(rim);
    g.userData.rim = rim;

    // halo sprite under token
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: def.color, transparent: true, opacity: 0.0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    halo.scale.set(1.4, 1.4, 1);
    halo.position.y = 0.12;
    g.add(halo);
    halos.set(def.id, halo);

    group.add(g);
    objects.set(def.id, g);
  });

  scene.add(group);

  const tokenPos = (square: number, slot: number) => {
    const { x, z } = cellCenter(Math.max(0, square));
    const { dx, dz } = stackOffset(slot);
    const same = square < 1 ? { dx: 0, dz: 0 } : { dx, dz };
    return new THREE.Vector3(x + same.dx, TOP_Y, z + same.dz);
  };

  return {
    group,
    objects,
    halos,
    tokenPos,
    placeInstant(id, square, slot) {
      const o = objects.get(id);
      if (!o) return;
      o.position.copy(tokenPos(square, slot));
    },
    setActive(id: number | null) {
      activeId = id;
    },
    update(t: number, _dt: number) {
      objects.forEach((o, id) => {
        const isActive = id === activeId;
        const halo = halos.get(id)!;
        halo.material.opacity += (((isActive ? 0.55 + Math.sin(t * 4) * 0.15 : 0)) - halo.material.opacity) * 0.12;
        halo.visible = halo.material.opacity > 0.02; // dead sprites skip the draw call
        const rim = o.userData.rim as THREE.Mesh;
        const rm = rim.material as THREE.MeshStandardMaterial;
        rm.emissiveIntensity = isActive ? 2.2 + Math.sin(t * 4) * 0.8 : 1.2;
        o.position.y = (o.userData.hopY as number | undefined) ?? o.position.y;
        if (o.userData.hopY === undefined) {
          // idle bob only for active token — read base Y from tokenPos? keep static
        }
      });
    },
  };
}
