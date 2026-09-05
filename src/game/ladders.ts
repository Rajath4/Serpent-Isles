// ── Low-arched golden ladders: 2 draws each, per-route spotlight support ────
import * as THREE from 'three';
import { mergeCompat } from './merge';
import { LADDERS, TOP_Y, cellCenter } from './constants';
import type { RouteMode } from './snakes';

export interface LadderHandles {
  group: THREE.Group;
  curveOf: (foot: number) => THREE.QuadraticBezierCurve3 | undefined;
  spotlight: (foot: number | null) => void;
  setDimAll: (dim: boolean) => void;
  setRouteMode: (mode: RouteMode) => void;
  update: (t: number, dt: number) => void;
}

interface Entry {
  foot: number;
  railMat: THREE.MeshStandardMaterial;
  rungMat: THREE.MeshStandardMaterial;
}

const V1 = new THREE.Vector3(1, 1, 1);

export function buildLadders(scene: THREE.Scene): LadderHandles {
  const group = new THREE.Group();
  const curves = new Map<number, THREE.QuadraticBezierCurve3>();
  const entries: Entry[] = [];

  let mode: RouteMode = 'full';
  let spot: number | null = null;
  let dimAll = false;

  const refresh = () => {
    group.visible = mode !== 'hidden';
    if (mode === 'hidden') return;
    for (const e of entries) {
      const focused = spot === e.foot;
      const base = mode === 'ghost' ? 0.18 : 0.96;
      const target = dimAll ? 0.15 : spot === null ? base : focused ? 1 : 0.14;
      e.railMat.opacity = target;
      e.rungMat.opacity = target;
      e.rungMat.emissiveIntensity = focused ? 0.9 : 0.3;
    }
  };

  Object.entries(LADDERS).forEach(([fs, ts]) => {
    const foot = Number(fs);
    const top = Number(ts);
    const a = cellCenter(foot);
    const b = cellCenter(top);
    const p0 = new THREE.Vector3(a.x, TOP_Y + 0.05, a.z);
    const p2 = new THREE.Vector3(b.x, TOP_Y + 0.05, b.z);
    const dist = p0.distanceTo(p2);
    // gentle arc — clears tokens but never looms over the board
    const apex = p0.clone().lerp(p2, 0.5);
    apex.y += Math.min(1.05, 0.32 + dist * 0.11);
    const curve = new THREE.QuadraticBezierCurve3(p0, apex, p2);
    curves.set(foot, curve);

    const railMat = new THREE.MeshStandardMaterial({
      color: 0xc79a3f, metalness: 0.85, roughness: 0.35, transparent: true, opacity: 0.96,
    });
    const rungMat = new THREE.MeshStandardMaterial({
      color: 0xffe1a1, metalness: 0.9, roughness: 0.25,
      emissive: 0x553300, emissiveIntensity: 0.3, transparent: true, opacity: 0.96,
    });
    entries.push({ foot, railMat, rungMat });

    const dir = new THREE.Vector3().subVectors(p2, p0).setY(0).normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(0.24);

    const railGeos: THREE.BufferGeometry[] = [];
    const rungGeos: THREE.BufferGeometry[] = [];
    [side.clone(), side.clone().negate()].forEach((off) => {
      const rc = new THREE.QuadraticBezierCurve3(
        p0.clone().add(off),
        apex.clone().add(off),
        p2.clone().add(off),
      );
      railGeos.push(new THREE.TubeGeometry(rc, 16, 0.055, 8, false));
      [p0.clone().add(off), p2.clone().add(off)].forEach((p) => {
        const knob = new THREE.SphereGeometry(0.09, 10, 8);
        knob.translate(p.x, p.y + 0.08, p.z);
        rungGeos.push(knob);
      });
    });

    const rungs = Math.max(2, Math.floor(dist / 0.55));
    for (let i = 1; i <= rungs; i++) {
      const tt = i / (rungs + 1);
      const c = curve.getPoint(tt);
      const rung = new THREE.CylinderGeometry(0.042, 0.042, 0.48, 8);
      rung.applyMatrix4(
        new THREE.Matrix4().compose(
          c,
          new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), side.clone().normalize()),
          V1,
        ),
      );
      rungGeos.push(rung);
    }
    const rails = new THREE.Mesh(mergeCompat(railGeos), railMat);
    rails.castShadow = true;
    group.add(rails);
    // rungs ride along — their shadows were sub-pixel, so they only receive presence
    group.add(new THREE.Mesh(mergeCompat(rungGeos), rungMat));
  });

  scene.add(group);
  refresh();

  return {
    group,
    curveOf: (foot: number) => curves.get(foot),
    spotlight(f: number | null) {
      spot = f;
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
      const s = 0.25 + (Math.sin(t * 2) * 0.5 + 0.5) * 0.3;
      for (const e of entries) {
        if (spot === null || spot === e.foot) e.rungMat.emissiveIntensity = spot === e.foot ? 0.9 : s;
      }
    },
  };
}
