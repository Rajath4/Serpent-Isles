// ── Bulletproof geometry merging ───────────────────────────────────────────
// Stock mergeGeometries() silently returns null when indexed and non-indexed
// geometries mix (e.g. Torus collar + Octahedron topper) — and a null geometry
// murders the render loop on first frame. This normalizes first and throws a
// *legible* error if parts are truly incompatible, so boot failures blame the
// merge instead of dying mysteriously inside the renderer.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function mergeCompat(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  if (!geos.length) throw new Error('mergeCompat: nothing to merge');
  const anyNonIndexed = geos.some((g) => g.index === null);
  const list = anyNonIndexed ? geos.map((g) => (g.index ? g.toNonIndexed() : g)) : geos;
  const out = mergeGeometries(list, false);
  list.forEach((g, k) => {
    if (g !== geos[k]) g.dispose(); // converted temporaries only
  });
  if (!out) {
    const kinds = geos.map((g) => g.type).join(', ');
    throw new Error(`mergeCompat: incompatible attributes [${kinds}]`);
  }
  return out;
}

/**
 * Freeze a static transform: skips the per-frame matrix compose for objects
 * that never move (~400 of them). Call AFTER final placement; never touch
 * position/rotation/scale afterwards (or call updateMatrix() manually).
 */
export function freeze(m: THREE.Object3D): void {
  m.updateMatrix();
  m.matrixAutoUpdate = false;
}
