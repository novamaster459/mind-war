// ============================================================================
// Procedural battlefield generator. Produces a hex-shaped map with clustered
// terrain, roads, and capturable resource nodes placed symmetrically.
// Deterministic for a given seed.
// ============================================================================
import type { HexCoord, ResourceNode, TerrainId, Seat } from '../types';
import { hexKey, hexRingDistance, hexDistance, hexNeighbors } from '../../utils/hex';
import { mulberry32, randInt, type RNG } from '../../utils/rng';

export interface BoardMap {
  radius: number;
  /** hexKey -> terrain */
  tiles: Map<string, TerrainId>;
  nodes: ResourceNode[];
  /** Suggested deployment hexes for each seat. */
  spawns: [HexCoord, HexCoord];
  seed: number;
}

const key = (q: number, r: number) => `${q},${r}`;

/** All hexes of a hex-shaped map of given radius. */
export function mapHexes(radius: number): HexCoord[] {
  const out: HexCoord[] = [];
  for (let q = -radius; q <= radius; q++) {
    for (let r = -radius; r <= radius; r++) {
      if (hexRingDistance({ q, r }) <= radius) out.push({ q, r });
    }
  }
  return out;
}

interface Paint {
  terrain: TerrainId;
  weight: number;
}

const BLEND: Paint[] = [
  { terrain: 'plains', weight: 46 },
  { terrain: 'forest', weight: 18 },
  { terrain: 'hills', weight: 10 },
  { terrain: 'urban', weight: 10 },
  { terrain: 'water', weight: 6 },
];

function weightedTerrain(rng: RNG): TerrainId {
  const total = BLEND.reduce((s, p) => s + p.weight, 0);
  let x = rng() * total;
  for (const p of BLEND) {
    if ((x -= p.weight) <= 0) return p.terrain;
  }
  return 'plains';
}

/**
 * Cluster-aware terrain: start from random seeds and grow patches via
 * neighbour infection so the map reads as regions rather than noise.
 */
function generateTerrain(rng: RNG, hexes: HexCoord[]): Map<string, TerrainId> {
  const tiles = new Map<string, TerrainId>();
  for (const h of hexes) tiles.set(key(h.q, h.r), 'plains');

  const setOf = new Set(hexes.map((h) => key(h.q, h.r)));
  const dirs = hexNeighbors({ q: 0, r: 0 }).map((n) => ({ q: n.q, r: n.r }));

  // Sprinkle seeds and grow regions.
  const seedCount = Math.floor(hexes.length / 14);
  for (let i = 0; i < seedCount; i++) {
    const h = hexes[randInt(rng, 0, hexes.length - 1)];
    const terrain = weightedTerrain(rng);
    const queue: HexCoord[] = [h];
    const target = randInt(rng, 4, 14); // patch size
    let grown = 0;
    while (queue.length && grown < target) {
      const idx = randInt(rng, 0, queue.length - 1);
      const cur = queue.splice(idx, 1)[0];
      const k = key(cur.q, cur.r);
      if (tiles.get(k) === terrain) continue;
      tiles.set(k, terrain);
      grown++;
      for (const d of dirs) {
        const n = { q: cur.q + d.q, r: cur.r + d.r };
        if (setOf.has(key(n.q, n.r)) && rng() < 0.6) queue.push(n);
      }
    }
  }

  // Carve a few roads across the middle latitudes for fast movement lanes.
  const roadCount = randInt(rng, 1, 2);
  for (let i = 0; i < roadCount; i++) {
    let cur = hexes[randInt(rng, 0, hexes.length - 1)];
    for (let step = 0; step < hexes.length; step++) {
      const k = key(cur.q, cur.r);
      if (tiles.get(k) === 'water') {
        // roads can bridge shallow water visually as causeways
      }
      tiles.set(k, 'road');
      const next = hexNeighbors(cur)[randInt(rng, 0, 5)];
      if (!setOf.has(key(next.q, next.r))) break;
      cur = next;
    }
  }

  return tiles;
}

/** Place resource nodes mirrored across the center for fairness. */
function placeNodes(rng: RNG, hexes: HexCoord[], tiles: Map<string, TerrainId>, radius: number): ResourceNode[] {
  const nodes: ResourceNode[] = [];
  const used = new Set<string>();
  const setOf = new Set(hexes.map((h) => key(h.q, h.r)));

  const tryPlace = (pos: HexCoord, terrain: TerrainId, id: string, owner: Seat | null) => {
    const k = key(pos.q, pos.r);
    if (!setOf.has(k) || used.has(k) || hexRingDistance(pos) < 2) return false;
    used.add(k);
    tiles.set(k, terrain);
    nodes.push({ id, pos, terrain, owner, captureProgress: 0 });
    return true;
  };

  // Mirrored pairs placed at random mid-radius positions.
  let placed = 0;
  let attempts = 0;
  while (placed < 3 && attempts < 200) {
    attempts++;
    const h = hexes[randInt(rng, 0, hexes.length - 1)];
    if (hexRingDistance(h) < 2 || hexRingDistance(h) > radius - 1) continue;
    const mirror: HexCoord = { q: -h.q, r: -h.r };
    const terrain: TerrainId = placed % 2 === 0 ? 'supplyDepot' : 'oilDerrick';
    if (tryPlace(h, terrain, `node-a${placed}`, null) && tryPlace(mirror, terrain, `node-b${placed}`, null)) {
      placed++;
    }
  }
  return nodes;
}

export function generateMap(seed: number, radius = 7): BoardMap {
  const rng = mulberry32(seed);
  const hexes = mapHexes(radius);
  const tiles = generateTerrain(rng, hexes);
  const nodes = placeNodes(rng, hexes, tiles, radius);

  // Clear + set spawns on opposite edges (axial).
  const spawns: [HexCoord, HexCoord] = [
    { q: -radius + 1, r: radius - 1 },
    { q: radius - 1, r: -radius + 1 },
  ];
  for (const s of spawns) {
    for (const h of [s, ...hexNeighbors(s)]) {
      const k = key(h.q, h.r);
      if (tiles.has(k)) tiles.set(k, 'plains');
    }
  }

  return { radius, tiles, nodes, spawns, seed };
}

/** Convenience: is a hex on the board? */
export function isOnBoard(map: BoardMap, h: HexCoord): boolean {
  return map.tiles.has(hexKey(h));
}

export { hexDistance };