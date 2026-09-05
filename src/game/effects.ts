// ── Juice engine: pooled spark bursts + shockwave rings (zero GC churn) ─────
import * as THREE from 'three';
import { Q } from './quality';
import { makeGlowTexture } from './environment';

export interface BurstOptions {
  color: number;
  count?: number;
  speed?: number;
  up?: number;
  life?: number;
  size?: number;
  gravity?: number;
}

interface Particle {
  spr: THREE.Sprite;
  vel: THREE.Vector3;
  age: number;
  life: number;
  size: number;
  gravity: number;
  active: boolean;
}

interface Ring {
  mesh: THREE.Mesh;
  age: number;
  life: number;
  maxR: number;
  active: boolean;
}

const MAX_PARTICLES = 320;
const MAX_RINGS = 14;

export class Effects {
  private particles: Particle[] = [];
  private rings: Ring[] = [];
  private tex: THREE.Texture;

  constructor(private scene: THREE.Scene) {
    this.tex = makeGlowTexture();
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const mat = new THREE.SpriteMaterial({
        map: this.tex, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const spr = new THREE.Sprite(mat);
      spr.visible = false;
      scene.add(spr);
      this.particles.push({ spr, vel: new THREE.Vector3(), age: 0, life: 1, size: 0.3, gravity: 3, active: false });
    }
    const ringGeo = new THREE.RingGeometry(0.42, 0.5, 48);
    for (let i = 0; i < MAX_RINGS; i++) {
      const mat = new THREE.MeshBasicMaterial({
        transparent: true, opacity: 0, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const mesh = new THREE.Mesh(ringGeo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      scene.add(mesh);
      this.rings.push({ mesh, age: 0, life: 0.7, maxR: 1.4, active: false });
    }
  }

  burst(pos: THREE.Vector3, opts: BurstOptions) {
    const { color, count = 14, speed = 2.4, up = 2.2, life = 0.8, size = 0.32, gravity = 4.5 } = opts;
    // low tier throws fewer sparks — same shapes, smaller crowds
    const want = Math.max(1, Math.round(count * Q.particleMul));
    let spawned = 0;
    for (const p of this.particles) {
      if (p.active) continue;
      p.active = true;
      p.age = 0;
      p.life = life * (0.6 + Math.random() * 0.7);
      p.size = size * (0.7 + Math.random() * 0.7);
      p.gravity = gravity;
      p.spr.visible = true;
      p.spr.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.2, Math.random() * 0.15, (Math.random() - 0.5) * 0.2));
      const a = Math.random() * Math.PI * 2;
      const r = speed * (0.35 + Math.random() * 0.85);
      p.vel.set(Math.cos(a) * r, up * (0.5 + Math.random()), Math.sin(a) * r);
      (p.spr.material as THREE.SpriteMaterial).color.setHex(color);
      (p.spr.material as THREE.SpriteMaterial).opacity = 1;
      if (++spawned >= want) break;
    }
  }

  ring(pos: THREE.Vector3, color = 0xffe1a1, maxR = 1.4, life = 0.7) {
    const r = this.rings.find((x) => !x.active) ?? this.rings[0];
    r.active = true;
    r.age = 0;
    r.life = life;
    r.maxR = maxR;
    r.mesh.visible = true;
    r.mesh.position.set(pos.x, pos.y + 0.04, pos.z);
    (r.mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
    (r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9;
  }

  /** Themed one-shots ---------------------------------------------------- */
  dust(pos: THREE.Vector3) {
    this.burst(pos, { color: 0xd8c9a8, count: 8, speed: 1.4, up: 1.2, life: 0.55, size: 0.26, gravity: 2.2 });
  }
  landPoof(pos: THREE.Vector3, color: number) {
    this.burst(pos, { color, count: 16, speed: 2.2, up: 2.4, life: 0.7, size: 0.3 });
    this.ring(pos, color, 1.1, 0.55);
  }
  ladderSparkle(pos: THREE.Vector3) {
    this.burst(pos, { color: 0xffd76e, count: 26, speed: 1.8, up: 3.4, life: 1.0, size: 0.3, gravity: 2.4 });
    this.ring(pos, 0xffd76e, 1.5, 0.8);
  }
  snakePoof(pos: THREE.Vector3) {
    this.burst(pos, { color: 0xff3d5a, count: 24, speed: 2.6, up: 2.0, life: 0.9, size: 0.34 });
    this.ring(pos, 0xff3d5a, 1.3, 0.7);
  }
  crownFountain(pos: THREE.Vector3) {
    this.burst(pos, { color: 0xffe1a1, count: 42, speed: 3.2, up: 5.2, life: 1.4, size: 0.36, gravity: 5 });
    this.burst(pos, { color: 0xff5f8f, count: 22, speed: 2.4, up: 4.2, life: 1.2, size: 0.3, gravity: 5 });
    this.ring(pos, 0xffe1a1, 2.4, 1.1);
  }

  update(dt: number) {
    for (const p of this.particles) {
      if (!p.active) continue;
      p.age += dt;
      const k = p.age / p.life;
      if (k >= 1) {
        p.active = false;
        p.spr.visible = false;
        continue;
      }
      p.vel.y -= p.gravity * dt;
      p.spr.position.addScaledVector(p.vel, dt);
      if (p.spr.position.y < 0.05) {
        p.spr.position.y = 0.05;
        p.vel.y *= -0.3;
        p.vel.x *= 0.7;
        p.vel.z *= 0.7;
      }
      const s = p.size * (1 - k * 0.55);
      p.spr.scale.set(s, s, 1);
      (p.spr.material as THREE.SpriteMaterial).opacity = 1 - k;
    }
    for (const r of this.rings) {
      if (!r.active) continue;
      r.age += dt;
      const k = Math.min(1, r.age / r.life);
      const rad = 0.2 + (r.maxR - 0.2) * (1 - Math.pow(1 - k, 2.4));
      r.mesh.scale.set(rad, rad, 1);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k);
      if (k >= 1) {
        r.active = false;
        r.mesh.visible = false;
      }
    }
  }
}
