// ── Adaptive quality: pick detail for the device, not against it ────────────
// Decided ONCE at boot (geometry is baked then); the fps governor still trims
// resolution live. Choice persists; Auto re-detects every visit.
import * as THREE from 'three';

export type QualityTier = 'low' | 'balanced' | 'high';
export type QualityChoice = 'auto' | QualityTier;

export interface Quality {
  tier: QualityTier;
  /** render-pixel cap (× device pixels) */
  pixelCap: number;
  /** shadow map edge */
  shadow: 1024 | 2048;
  /** particle spawn multiplier */
  particleMul: number;
  /** tube/lathe segment density multiplier */
  tubeDetail: number;
  antialias: boolean;
  anisotropy: number;
  /** clearcoat + iridescence jewel shaders (big fragment cost) */
  fancy: boolean;
  clouds: number;
  fireflies: number;
}

const PRESETS: Record<QualityTier, Omit<Quality, 'tier'>> = {
  low: {
    pixelCap: 1, shadow: 1024, particleMul: 0.5, tubeDetail: 0.6,
    antialias: false, anisotropy: 2, fancy: false, clouds: 6, fireflies: 70,
  },
  balanced: {
    pixelCap: 1.5, shadow: 2048, particleMul: 0.8, tubeDetail: 0.85,
    antialias: true, anisotropy: 4, fancy: true, clouds: 8, fireflies: 100,
  },
  high: {
    pixelCap: 2, shadow: 2048, particleMul: 1, tubeDetail: 1,
    antialias: true, anisotropy: 4, fancy: true, clouds: 10, fireflies: 130,
  },
};

/** Live quality — set once via applyQuality() before the scene is built. */
export const Q: Quality = { tier: 'balanced', ...PRESETS.balanced };

export function detectQuality(): QualityTier {
  try {
    const canvas = document.createElement('canvas');
    const gl2 = !!canvas.getContext('webgl2');
    if (!gl2) return 'low';
    const coarse =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: coarse)').matches;
    const cores = navigator.hardwareConcurrency ?? 4;
    const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 0;
    if (coarse && (cores <= 4 || (mem > 0 && mem <= 4))) return 'low';
    if (!coarse && cores >= 8 && (mem === 0 || mem >= 8)) return 'high';
    return 'balanced';
  } catch {
    return 'balanced';
  }
}

export function applyQuality(tier: QualityTier) {
  Object.assign(Q, PRESETS[tier], { tier });
}

export function resolveChoice(c: QualityChoice): QualityTier {
  return c === 'auto' ? detectQuality() : c;
}

const KEY = 'serpent-quality';

export function loadChoice(): QualityChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'low' || v === 'balanced' || v === 'high' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

export function saveChoice(c: QualityChoice) {
  try {
    localStorage.setItem(KEY, c);
  } catch {
    /* ignore */
  }
}

/** Cheap capability line for the pause menu (proves the GPU path). */
export function glLine(renderer: THREE.WebGLRenderer): string {
  try {
    const gl = renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const name = dbg
      ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)).split('/').pop()
      : 'WebGL';
    return `${gl instanceof WebGL2RenderingContext ? 'WebGL2' : 'WebGL'} · ${name ?? 'GPU'}`.slice(0, 48);
  } catch {
    return 'WebGL';
  }
}
