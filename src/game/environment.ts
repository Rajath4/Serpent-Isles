// ── Cinematic island environment: sky, sea, platform, flora, particles ──────
// Perf: 13-scene-light rig cut to 6 (every forward light taxes ALL shaders);
// static decor merged wherever per-object fading isn't needed.
import * as THREE from 'three';
import { mergeCompat } from './merge';
import { Q } from './quality';

export interface EnvHandles {
  update: (t: number, dt: number) => void;
  /** Ghost any foliage standing between the lens and the action. Never a blocked view. */
  fadeOccluders: (camPos: THREE.Vector3, lookAt: THREE.Vector3) => void;
  sun: THREE.DirectionalLight;
}

function skyTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 512;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0.0, '#0b1035');
  grad.addColorStop(0.35, '#1b2a6b');
  grad.addColorStop(0.58, '#3b5bbf');
  grad.addColorStop(0.72, '#ff9a5c');
  grad.addColorStop(0.8, '#ffd9a0');
  grad.addColorStop(1.0, '#2a1b4a');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildEnvironment(scene: THREE.Scene): EnvHandles {
  // — Sky dome —
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(220, 32, 20),
    new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false, depthWrite: false }),
  );
  scene.add(sky);

  scene.fog = new THREE.Fog(0x2a2358, 55, 165);

  // — Lights: hemi + sun + rim + dice spot + 2 front braziers. Nothing more. —
  const hemi = new THREE.HemisphereLight(0x9db8ff, 0x3a2350, 0.95);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffe3b3, 2.1);
  sun.position.set(18, 26, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(Q.shadow, Q.shadow);
  sun.shadow.camera.left = -14;
  sun.shadow.camera.right = 14;
  sun.shadow.camera.top = 14;
  sun.shadow.camera.bottom = -14;
  sun.shadow.camera.far = 80;
  sun.shadow.bias = -0.0004;
  scene.add(sun);

  const rim = new THREE.DirectionalLight(0x6f7bff, 0.9);
  rim.position.set(-16, 10, -18);
  scene.add(rim);

  // — Sea —
  const seaGeo = new THREE.CircleGeometry(200, 64);
  const seaMat = new THREE.MeshStandardMaterial({
    color: 0x14335e,
    roughness: 0.25,
    metalness: 0.55,
    transparent: true,
    opacity: 0.94,
  });
  const sea = new THREE.Mesh(seaGeo, seaMat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -2.6;
  sea.receiveShadow = true;
  scene.add(sea);

  // Sea glow ring
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(15.4, 16.6, 96),
    new THREE.MeshBasicMaterial({ color: 0x53e9ff, transparent: true, opacity: 0.5, side: THREE.DoubleSide, fog: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -2.45;
  scene.add(ring);

  // — Island platform (layered stone + grass rim) —
  const island = new THREE.Group();
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x4a3f66, roughness: 0.9 });
  const rock = new THREE.Mesh(new THREE.CylinderGeometry(15, 11.5, 3.4, 48), stoneMat);
  rock.position.y = -1.7 - 0.15;
  rock.receiveShadow = true;
  rock.castShadow = true;
  island.add(rock);

  const grassMat = new THREE.MeshStandardMaterial({ color: 0x2f9e6e, roughness: 0.8 });
  const grass = new THREE.Mesh(new THREE.CylinderGeometry(15.2, 15.0, 0.5, 48), grassMat);
  grass.position.y = -0.22;
  grass.receiveShadow = true;
  island.add(grass);

  const trimMat = new THREE.MeshStandardMaterial({
    color: 0xd9b36a, roughness: 0.35, metalness: 0.75, emissive: 0x664411, emissiveIntensity: 0.25,
  });
  const trim = new THREE.Mesh(new THREE.TorusGeometry(15.15, 0.12, 12, 96), trimMat);
  trim.rotation.x = Math.PI / 2;
  trim.position.y = 0.02;
  island.add(trim);
  scene.add(island);

  // — Board plinth: dark marble slab under tiles —
  const plinth = new THREE.Mesh(
    new THREE.BoxGeometry(12.6, 0.5, 12.6),
    new THREE.MeshStandardMaterial({ color: 0x1c1830, roughness: 0.3, metalness: 0.6 }),
  );
  plinth.position.y = -0.28;
  plinth.receiveShadow = true;
  plinth.castShadow = true;
  scene.add(plinth);

  const plinthGlow = new THREE.Mesh(
    new THREE.BoxGeometry(12.75, 0.1, 12.75),
    new THREE.MeshBasicMaterial({ color: 0x38e0ff }),
  );
  plinthGlow.position.y = -0.42;
  scene.add(plinthGlow);

  // — Stylized palms / pines around the island —
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.9 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2fbf71, roughness: 0.7 });
  const leafMat2 = new THREE.MeshStandardMaterial({ color: 0x27a5a0, roughness: 0.7 });
  const treePositions: Array<[number, number, number]> = [
    [-12.4, 0, 6.5], [12.2, 0, 7.2], [-11.6, 0, -7.4], [11.8, 0, -6.8],
    [-6.5, 0, 12.6], [-3.8, 0, 13.4], [-7.2, 0, -12.4], [7.4, 0, -12.2],
  ];
  const trees = new THREE.Group();
  // per-tree material clones so the occlusion system can ghost trees individually
  const occluders: Array<{ root: THREE.Group; mats: THREE.MeshStandardMaterial[]; cur: number; tgt: number }> = [];
  treePositions.forEach(([x, _y, z], i) => {
    const t = new THREE.Group();
    const trunkM = trunkMat.clone();
    const leafM = (i % 2 ? leafMat : leafMat2).clone();
    trunkM.transparent = true;
    leafM.transparent = true;
    const h = 1.6 + (i % 3) * 0.5;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, h, 8), trunkM);
    trunk.position.y = h / 2;
    t.add(trunk);
    const lm = leafM;
    // canopy merged: 3 cones → 1 draw per tree (trunk shadow was invisible anyway)
    const canopyGeos: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 3; k++) {
      const cone = new THREE.ConeGeometry(1.05 - k * 0.24, 1.0, 9);
      cone.translate(0, h + 0.35 + k * 0.62, 0);
      canopyGeos.push(cone);
    }
    const canopy = new THREE.Mesh(mergeCompat(canopyGeos), lm);
    canopy.castShadow = true;
    t.add(canopy);
    t.position.set(x, 0, z);
    t.rotation.y = i * 1.3;
    t.traverse((o) => {
      o.userData.occRoot = t;
    });
    trees.add(t);
    occluders.push({ root: t, mats: [trunkM, leafM], cur: 1, tgt: 1 });
  });
  scene.add(trees);

  const occRay = new THREE.Raycaster();
  const occDir = new THREE.Vector3();
  function fadeOccluders(camPos: THREE.Vector3, lookAt: THREE.Vector3) {
    occDir.subVectors(lookAt, camPos);
    const dist = occDir.length();
    if (dist < 1e-3) return;
    occDir.normalize();
    occRay.set(camPos, occDir);
    occRay.far = Math.max(0.1, dist - 0.8);
    const hits = occRay.intersectObjects(trees.children, true);
    const blocked = new Set<THREE.Object3D>();
    for (const h of hits) {
      const root = h.object.userData.occRoot as THREE.Object3D | undefined;
      if (root) blocked.add(root);
    }
    for (const oc of occluders) oc.tgt = blocked.has(oc.root) ? 0.1 : 1;
  }

  // — Glowing crystals: merged per hue (16 draws → 2). Emissive carries them. —
  const crystalMat = new THREE.MeshStandardMaterial({
    color: 0x7df9ff, emissive: 0x1e90ff, emissiveIntensity: 1.4, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.95,
  });
  const crystalMat2 = new THREE.MeshStandardMaterial({
    color: 0xff9df2, emissive: 0xb01aff, emissiveIntensity: 1.2, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.95,
  });
  const crystalGeosA: THREE.BufferGeometry[] = [];
  const crystalGeosB: THREE.BufferGeometry[] = [];
  const crystalSpots: Array<[number, number, number, number]> = [
    [-13.6, 0, 1.5, 1], [13.6, 0, -1.5, 0], [1.8, 0, 13.8, 1], [-2.0, 0, -13.8, 0],
  ];
  const ONE = new THREE.Vector3(1, 1, 1);
  crystalSpots.forEach(([x, _y, z, v], i) => {
    const yaw = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, i * 2.1, 0));
    for (let k = 0; k < 4; k++) {
      const m = new THREE.OctahedronGeometry(0.32 + (k % 2) * 0.2);
      const q = yaw.clone().multiply(
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3 * k, k * 0.9, 0.2 * k)),
      );
      const p = new THREE.Vector3((k - 1.5) * 0.35, 0.35 + (k % 3) * 0.3, ((k * 7) % 3 - 1) * 0.3)
        .applyQuaternion(yaw)
        .add(new THREE.Vector3(x, 0, z));
      m.applyMatrix4(new THREE.Matrix4().compose(p, q, ONE));
      (v ? crystalGeosA : crystalGeosB).push(m);
    }
  });
  for (const [geos, mat] of [[crystalGeosA, crystalMat], [crystalGeosB, crystalMat2]] as const) {
    const merged = new THREE.Mesh(mergeCompat(geos), mat);
    scene.add(merged);
  }

  // — Torches (braziers) at board corners: merged ironwork, light only up front —
  const flameTargets: THREE.Sprite[] = [];
  const flameTex = makeGlowTexture();
  const corners: Array<[number, number]> = [[-7.4, 7.4], [7.4, 7.4], [-7.4, -7.4], [7.4, -7.4]];
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x3a2c22, roughness: 0.8 });
  const bowlMat = new THREE.MeshStandardMaterial({ color: 0x8a6a3a, metalness: 0.8, roughness: 0.35 });
  const poleGeos: THREE.BufferGeometry[] = [];
  const bowlGeos: THREE.BufferGeometry[] = [];
  corners.forEach(([x, z]) => {
    const pole = new THREE.CylinderGeometry(0.09, 0.13, 1.5, 8);
    pole.translate(x, 0.75, z);
    poleGeos.push(pole);
    const bowl = new THREE.CylinderGeometry(0.34, 0.18, 0.28, 12);
    bowl.translate(x, 1.6, z);
    bowlGeos.push(bowl);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, color: 0xffb14e, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    spr.position.set(x, 2.05, z);
    spr.scale.set(1.05, 1.4, 1);
    scene.add(spr);
    flameTargets.push(spr);
    if (z > 0) {
      // front braziers only — the back pair's pools were never on camera
      const l = new THREE.PointLight(0xff9a3c, 14, 10, 1.9);
      l.position.set(x, 2.1, z);
      scene.add(l);
    }
  });
  scene.add(new THREE.Mesh(mergeCompat(poleGeos), poleMat));
  scene.add(new THREE.Mesh(mergeCompat(bowlGeos), bowlMat));

  // — Fireflies —
  const fireflyCount = Q.fireflies;
  const fGeo = new THREE.BufferGeometry();
  const fPos = new Float32Array(fireflyCount * 3);
  const fSeed = new Float32Array(fireflyCount);
  for (let i = 0; i < fireflyCount; i++) {
    const r = 8 + Math.random() * 14;
    const a = Math.random() * Math.PI * 2;
    fPos[i * 3] = Math.cos(a) * r;
    fPos[i * 3 + 1] = 0.5 + Math.random() * 6;
    fPos[i * 3 + 2] = Math.sin(a) * r;
    fSeed[i] = Math.random() * 100;
  }
  fGeo.setAttribute('position', new THREE.BufferAttribute(fPos, 3));
  const fMat = new THREE.PointsMaterial({
    color: 0xffe08a, size: 0.16, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false, map: makeGlowTexture(),
  });
  const fireflies = new THREE.Points(fGeo, fMat);
  scene.add(fireflies);

  // — Stars —
  const starGeo = new THREE.BufferGeometry();
  const starCount = 500;
  const sPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(190);
    if (v.y < 8) v.y = Math.abs(v.y) + 12;
    sPos.set([v.x, v.y, v.z], i * 3);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.9, sizeAttenuation: false, transparent: true, opacity: 0.85, fog: false }));
  scene.add(stars);

  // — Low sun billboard on horizon —
  const sunSpr = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeGlowTexture(), color: 0xffc98a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  sunSpr.position.set(40, 9, -120);
  sunSpr.scale.set(46, 46, 1);
  scene.add(sunSpr);

  // — Drifting clouds —
  const clouds: THREE.Sprite[] = [];
  const cloudTex = makeCloudTexture();
  for (let i = 0; i < Q.clouds; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.35 + Math.random() * 0.3, depthWrite: false, fog: false }));
    const a = Math.random() * Math.PI * 2;
    const r = 60 + Math.random() * 70;
    s.position.set(Math.cos(a) * r, 18 + Math.random() * 22, Math.sin(a) * r);
    const sc = 22 + Math.random() * 26;
    s.scale.set(sc, sc * 0.42, 1);
    scene.add(s);
    clouds.push(s);
  }

  const clock = { t: 0 };
  void clock;

  return {
    update(t: number, dt: number) {
      // water shimmer
      seaMat.color.setHSL(0.6, 0.62, 0.16 + Math.sin(t * 0.7) * 0.015);
      ring.material.opacity = 0.4 + Math.sin(t * 1.6) * 0.15;
      // flames flicker
      flameTargets.forEach((f, i) => {
        const s = 1 + Math.sin(t * 11 + i * 2.4) * 0.12 + Math.sin(t * 23 + i) * 0.06;
        f.scale.set(1.05 * s, 1.4 * (2 - s) * s * 0.5 + 0.7, 1);
      });
      // fireflies drift
      const p = fGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < fireflyCount; i++) {
        const s = fSeed[i];
        p.setX(i, p.getX(i) + Math.sin(t * 0.5 + s) * dt * 0.35);
        p.setY(i, p.getY(i) + Math.cos(t * 0.7 + s * 1.3) * dt * 0.25);
      }
      p.needsUpdate = true;
      fMat.opacity = 0.65 + Math.sin(t * 2.2) * 0.25;
      clouds.forEach((c, i) => {
        c.position.x += dt * (0.4 + (i % 3) * 0.25);
        if (c.position.x > 130) c.position.x = -130;
      });
      trees.rotation.y = Math.sin(t * 0.05) * 0.01;
      // ease foliage ghosts toward their targets (occlusion fade)
      for (const oc of occluders) {
        oc.cur += (oc.tgt - oc.cur) * Math.min(1, dt * 6);
        if (Math.abs(oc.tgt - oc.cur) < 0.01) oc.cur = oc.tgt;
        for (const m of oc.mats) m.opacity = oc.cur;
        const solid = oc.cur > 0.5;
        oc.root.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = solid;
        });
      }
    },
    fadeOccluders,
    sun,
  };
}

export function makeGlowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function makeCloudTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d')!;
  for (let i = 0; i < 26; i++) {
    const x = 30 + Math.random() * 196;
    const y = 40 + Math.random() * 48;
    const r = 14 + Math.random() * 26;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(255,235,225,0.5)');
    grad.addColorStop(1, 'rgba(255,235,225,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  return new THREE.CanvasTexture(c);
}
