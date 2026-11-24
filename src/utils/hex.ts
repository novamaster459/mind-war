// ============================================================================
// Hex grid math (axial coordinates, pointy-top hexes).
// Pure functions — used by renderer, engine, AI and pathfinding.
// ============================================================================
import { HEX_DIRECTIONS, HEX_SIZE } from '../game/constants';
import type { HexCoord } from '../game/types';

export const hexKey = (h: HexCoord): string => `${h.q},${h.r}`;

export const parseHexKey = (k: string): HexCoord => {
  const [q, r] = k.split(',').map(Number);
  return { q, r };
};

export const hexEquals = (a: HexCoord, b: HexCoord): boolean =>
  a.q === b.q && a.r === b.r;

export const hexAdd = (a: HexCoord, b: HexCoord): HexCoord => ({
  q: a.q + b.q,
  r: a.r + b.r,
});

export const hexDistance = (a: HexCoord, b: HexCoord): number => {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
};

export const hexNeighbors = (h: HexCoord): HexCoord[] =>
  HEX_DIRECTIONS.map((d) => ({ q: h.q + d.q, r: h.r + d.r }));

/** All hexes within `range` (inclusive) of center. */
export const hexesInRange = (center: HexCoord, range: number): HexCoord[] => {
  const results: HexCoord[] = [];
  for (let q = -range; q <= range; q++) {
    for (let r = -range; r <= range; r++) {
      const s = -q - r;
      if (Math.abs(q) + Math.abs(r) + Math.abs(s) <= range * 2 && Math.max(Math.abs(q), Math.abs(r), Math.abs(s)) <= range) {
        results.push({ q: center.q + q, r: center.r + r });
      }
    }
  }
  return results;
};

/** Hex distance from origin (used for map-radius culling). */
export const hexRingDistance = (h: HexCoord): number =>
  Math.max(Math.abs(h.q), Math.abs(h.r), Math.abs(h.q + h.r));

// ---------------------------------------------------------------------------
// Pixel conversion (pointy-top axial -> pixel)
// ---------------------------------------------------------------------------
export const hexToPixel = (h: HexCoord, size = HEX_SIZE): { x: number; y: number } => {
  const x = size * Math.sqrt(3) * (h.q + h.r / 2);
  const y = size * (3 / 2) * h.r;
  return { x, y };
};

/** Pixel -> nearest axial hex (rounded). */
export const pixelToHex = (x: number, y: number, size = HEX_SIZE): HexCoord => {
  const q = ((Math.sqrt(3) / 3) * x - (1 / 3) * y) / size;
  const r = ((2 / 3) * y) / size;
  return hexRound(q, r);
};

export const hexRound = (qf: number, rf: number): HexCoord => {
  const sf = -qf - rf;
  let q = Math.round(qf);
  let r = Math.round(rf);
  const s = Math.round(sf);
  const dq = Math.abs(q - qf);
  const dr = Math.abs(r - rf);
  const ds = Math.abs(s - sf);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return { q, r };
};

/** The six corner points of a pointy-top hex, in world space. */
export const hexCorners = (center: { x: number; y: number }, size = HEX_SIZE): { x: number; y: number }[] => {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30); // pointy-top
    pts.push({ x: center.x + size * Math.cos(angle), y: center.y + size * Math.sin(angle) });
  }
  return pts;
};

/** Line of hexes between two points (for LoS & movement paths). */
export const hexLine = (a: HexCoord, b: HexCoord): HexCoord[] => {
  const N = hexDistance(a, b);
  if (N === 0) return [a];
  const results: HexCoord[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const qf = a.q + (b.q - a.q) * t + 1e-6;
    const rf = a.r + (b.r - a.r) * t + 1e-6;
    results.push(hexRound(qf, rf));
  }
  return results;
};