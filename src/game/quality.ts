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
    antialias: true, anisotropy: 8, fancy: true, clouds: 10, fireflies: 130,
  },
};

/** Live quality — set once via applyQuality() before the scene is built. */
export const Q: Quality = { tier: 'balanced', ...PRESETS.balanced };

export function detectQuality(): QualityTier {
  try {
    // One probe, one context — renderer string + capability caps together.
    // (Old code created two contexts and judged iPhones by a core count
    // that iOS always clamps to 4, so EVERY iPhone booted 'low'.)
    const probe = probeGL();
    if (!probe.webgl2) return 'low';
    const gpu = probe.renderer.toLowerCase();
    // Software rasterizers must never carry full detail.
    if (/swiftshader|llvmpipe|software|basic render|gdi generic/i.test(probe.renderer)) return 'low';
    // Museum-piece mobile GPUs: kindness is low poly.
    if (/mali-t|mali-4|adreno \([34]|adreno [34]|powervr sgx|videocore iv/i.test(gpu)) return 'low';

    const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
    const coarse =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: coarse)').matches;
    const cores =
      typeof navigator !== 'undefined' && typeof navigator.hardwareConcurrency === 'number'
        ? navigator.hardwareConcurrency
        : 4;
    const mem =
      (typeof navigator !== 'undefined' &&
        (navigator as unknown as { deviceMemory?: number }).deviceMemory) ||
      0;
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    const maxTex = probe.maxTexture || 0;

    const isiOS = /iphone|ipad|ipod/i.test(ua) || isIPadOSDesktop(ua);
    const isAndroid = /android/i.test(ua);
    const iosMajor = isiOS ? iosMajorVersion(ua) : 0;

    // ── iOS: hardwareConcurrency is ALWAYS 4 (WebKit fingerprint clamp),
    // so cores must never decide here. Any WebGL2 iPhone from the last ~7
    // years sails 'high' — the fps governor still trims resolution live if
    // thermals bite, but geometry/shaders boot at their best.
    if (isiOS) {
      if (iosMajor > 0 && iosMajor <= 12) return 'low'; // iPhone 6 era and older
      if (maxTex > 0 && maxTex <= 4096) return 'balanced'; // A9/A10 era fallback
      if (iosMajor >= 15) return 'high'; // iPhone XS/XR and newer (kept updated)
      if (maxTex >= 8192) return 'high'; // modern Apple GPU, regardless of OS parse
      if (dpr >= 3) return 'high'; // all Pro/Max phones ship 3x panels
      return 'balanced'; // safe floor — modern iOS never boots 'low'
    }

    // ── Android / other touch: demand CORROBORATED weakness for 'low',
    // and CORROBORATED strength for 'high'. A single hint is 'balanced'.
    // Capable mids land balanced (90% of max visuals, smooth); true
    // flagships land high. Users can still force Max in pause — it persists.
    if (coarse || isAndroid) {
      if (mem > 0 && mem <= 2) return 'low'; // Go-edition / ultra-budget
      if (maxTex > 0 && maxTex <= 4096) return 'low'; // decade-old GPU
      if (cores <= 4 && mem > 0 && mem <= 3) return 'low'; // weak cores + weak RAM together
      // Flagship GPUs only — not every Mali-G / Adreno. Mid-range 610–639,
      // G31/G51/G52/G57 stay balanced even with 8 cores (fill-rate bound).
      const flagshipGPU =
        /adreno\s*(6[4-9]\d|7\d\d|8\d\d)|adreno\s*\(.*(6[4-9]|7\d|8\d)|mali-g(6[189]|7\d|9\d)|immortalis|xclipse/i.test(
          gpu,
        );
      const hasMobileGPU = /adreno|mali|powervr|videocore|xclipse|immortalis/i.test(gpu);
      if (flagshipGPU && (cores >= 6 || mem >= 4 || maxTex >= 8192)) return 'high';
      // GPU masked (privacy browsers, WebView): trust strong specs alone.
      if (!hasMobileGPU) {
        if (cores >= 8 && mem >= 6 && maxTex >= 8192) return 'high';
        if (cores >= 8 && mem >= 8) return 'high';
      }
      return 'balanced';
    }

    // ── Desktop: optimistic by default. 'low' only for proven weaklings.
    if (/mac/i.test(ua) && /apple (m[1-9]|a1[6-9])|apple gpu/i.test(gpu)) return 'high';
    if (/rtx|radeon rx|rx [567]|gtx 1[067]|gtx 2|arc a|radeon pro|apple m[1-9]/i.test(gpu)) return 'high';
    if (cores >= 8 && (mem === 0 || mem >= 8)) return 'high';
    if (cores >= 6 && (mem === 0 || mem >= 8) && maxTex >= 8192) return 'high';
    if (cores <= 2 && mem > 0 && mem <= 4) return 'low'; // genuine museum desktop
    return 'balanced';
  } catch {
    return 'balanced';
  }
}

interface GLProbe {
  webgl2: boolean;
  renderer: string;
  maxTexture: number;
}

/** Single probe context: WebGL2 flag + GPU string + texture cap, then release. */
function probeGL(): GLProbe {
  const out: GLProbe = { webgl2: false, renderer: '', maxTexture: 0 };
  try {
    const canvas = document.createElement('canvas');
    // Try WebGL2 first — a non-null context IS the flag (no instanceof needed).
    const gl2 = canvas.getContext('webgl2') as WebGL2RenderingContext | null;
    const gl = (gl2 ||
      canvas.getContext('webgl')) as WebGLRenderingContext | WebGL2RenderingContext | null;
    if (!gl) return out;
    out.webgl2 = gl2 !== null;
    try {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      out.renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
    } catch {
      /* masked (iOS Safari) — caps below still guide us */
    }
    try {
      out.maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    } catch {
      /* ignore */
    }
    try {
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    } catch {
      /* ignore */
    }
  } catch {
    /* ignore — caller falls back to balanced */
  }
  return out;
}

/** iPadOS 13+ reports as desktop "Macintosh" — touch points give it away. */
function isIPadOSDesktop(ua: string): boolean {
  try {
    return (
      /macintosh/i.test(ua) &&
      typeof navigator !== 'undefined' &&
      (navigator as unknown as { maxTouchPoints?: number }).maxTouchPoints !== undefined &&
      ((navigator as unknown as { maxTouchPoints: number }).maxTouchPoints > 2)
    );
  } catch {
    return false;
  }
}

/** "CPU iPhone OS 17_4 like Mac OS X" → 17. 0 when unparseable (unknown → optimistic). */
function iosMajorVersion(ua: string): number {
  try {
    // iPadOS 13+ masquerades as "Macintosh … Mac OS X 10_15" — its OS token
    // is frozen at 10, so judge it by the Safari Version/xx instead.
    if (isIPadOSDesktop(ua)) {
      const v = ua.match(/Version\/(\d+)\./);
      return v ? parseInt(v[1], 10) || 0 : 0;
    }
    const m = ua.match(/OS (\d+)[_.]/i);
    return m ? parseInt(m[1], 10) || 0 : 0;
  } catch {
    return 0;
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
