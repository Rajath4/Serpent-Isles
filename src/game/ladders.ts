// ── Premium golden ladders, arched over the board ────────────────────────────
import * as THREE from 'three';
import { LADDERS, TOP_Y, cellCenter } from './constants';

export interface LadderHandles {
  group: THREE.Group;
  curveOf: (foot: number) => THREE.QuadraticBezierCurve3 | undefined;
  update: (t: number, dt: number) => void;
}

export function buildLadders(scene: THREE.Scene): LadderHandles {
  const group = new THREE.Group();
  const curves = new Map<number, THREE.QuadraticBezierCurve3>();
  const glints: THREE.Mesh[] = [];

  const railMat = new THREE.MeshStandardMaterial({ color: 0xd9a441, metalness: 0.85, roughness: 0.3 });
  const rungMat = new THREE.MeshStandardMaterial({ color: 0xffe1a1, metalness: 0.9, roughness: 0.22, emissive: 0x553300, emissiveIntensity: 0.3 });

  Object.entries(LADDERS).forEach(([fs, ts]) => {
    const foot = Number(fs);
    const top = Number(ts);
    const a = cellCenter(foot);
    const b = cellCenter(top);
    const p0 = new THREE.Vector3(a.x, TOP_Y + 0.05, a.z);
    const p2 = new THREE.Vector3(b.x, TOP_Y + 0.05, b.z);
    const dist = p0.distanceTo(p2);
    const apex = p0.clone().lerp(p2, 0.5);
    apex.y += Math.min(2.4, 0.55 + dist * 0.24);
    const curve = new THREE.QuadraticBezierCurve3(p0, apex, p2);
    curves.set(foot, curve);

    const dir = new THREE.Vector3().subVectors(p2, p0).setY(0).normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(0.26);

    // rails as tubes along offset curves
    [side.clone(), side.clone().negate()].forEach((off) => {
      const rc = new THREE.QuadraticBezierCurve3(
        p0.clone().add(off),
        apex.clone().add(off),
        p2.clone().add(off),
      );
      const tube = new THREE.Mesh(new THREE.TubeGeometry(rc, 24, 0.07, 10, false), railMat);
      tube.castShadow = true;
      group.add(tube);
      // finial knobs
      [p0.clone().add(off), p2.clone().add(off)].forEach((p) => {
        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), rungMat);
        knob.position.copy(p).add(new THREE.Vector3(0, 0.1, 0));
        knob.castShadow = true;
        group.add(knob);
        glints.push(knob);
      });
    });

    // rungs
    const rungs = Math.max(2, Math.floor(dist / 0.55));
    for (let i = 1; i <= rungs; i++) {
      const tt = i / (rungs + 1);
      const c = curve.getPoint(tt);
      const tangent = curve.getTangent(tt);
      const up = new THREE.Vector3(0, 1, 0);
      const binormal = new THREE.Vector3().crossVectors(tangent, up);
      if (binormal.lengthSq() < 1e-4) binormal.set(1, 0, 0);
      binormal.normalize();
      // rung spans between rails along side direction projected
      const rungDir = side.clone().normalize();
      const len = 0.52;
      const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, len, 10), rungMat);
      rung.position.copy(c);
      rung.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), rungDir);
      rung.castShadow = true;
      group.add(rung);
    }
  });

  scene.add(group);
  return {
    group,
    curveOf: (foot: number) => curves.get(foot),
    update(t: number, _dt: number) {
      const s = 0.25 + (Math.sin(t * 2.4) * 0.5 + 0.5) * 0.35;
      rungMat.emissiveIntensity = s;
    },
  };
}
