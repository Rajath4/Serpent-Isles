// ── Shared game data & board math ────────────────────────────────────────────

export const BOARD_N = 10;
export const CELL = 1.06;
export const BOARD_SIZE = BOARD_N * CELL;
export const TILE_H = 0.22;
export const TOP_Y = TILE_H; // top surface of tiles

/** Classic, play-tested layout — snakes & ladders never share a square. */
export const SNAKES: Record<number, number> = {
  16: 6,
  47: 26,
  49: 11,
  56: 53,
  62: 19,
  64: 60,
  87: 24,
  93: 73,
  95: 75,
  98: 78,
};

export const LADDERS: Record<number, number> = {
  1: 38,
  4: 14,
  9: 31,
  21: 42,
  28: 84,
  36: 44,
  51: 67,
  71: 91,
  80: 100,
};

export interface PlayerDef {
  id: number;
  name: string;
  color: number;
  accent: number;
  glow: string;
}

export const PLAYER_DEFS: PlayerDef[] = [
  { id: 0, name: 'Ruby', color: 0xff3d5a, accent: 0xff8fa0, glow: '#ff3d5a' },
  { id: 1, name: 'Azure', color: 0x2fb8ff, accent: 0x9be7ff, glow: '#2fb8ff' },
  { id: 2, name: 'Ember', color: 0xffa41b, accent: 0xffd98a, glow: '#ffa41b' },
  { id: 3, name: 'Jade', color: 0x38e08c, accent: 0xa5f3c4, glow: '#38e08c' },
];

export interface Rules {
  exactFinish: boolean;
  extraOnSix: boolean;
  startOnSix: boolean;
}

export const DEFAULT_RULES: Rules = {
  exactFinish: true,
  extraOnSix: true,
  startOnSix: false,
};

/** Board square 1..100 → world position (y = tile top). Square 0 = "off board" staging. */
export function cellCenter(n: number): { x: number; z: number } {
  if (n < 1) return { x: -BOARD_SIZE / 2 - 1.1, z: BOARD_SIZE / 2 + 1.1 };
  const idx = n - 1;
  const row = Math.floor(idx / BOARD_N);
  const inRow = idx % BOARD_N;
  const col = row % 2 === 0 ? inRow : BOARD_N - 1 - inRow;
  return {
    x: (col - (BOARD_N - 1) / 2) * CELL,
    z: ((BOARD_N - 1) / 2 - row) * CELL,
  };
}

/** Small per-token offset so stacked tokens fan out instead of z-fighting. */
export function stackOffset(slot: number): { dx: number; dz: number } {
  const spots = [
    { dx: -0.2, dz: -0.18 },
    { dx: 0.2, dz: -0.18 },
    { dx: -0.2, dz: 0.2 },
    { dx: 0.2, dz: 0.2 },
  ];
  return spots[slot % 4];
}

export const easeInOut = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeOutBack = (t: number) => {
  const c = 1.70158;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};
