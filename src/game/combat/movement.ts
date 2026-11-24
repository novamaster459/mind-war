// ============================================================================
// Movement & pathfinding. Dijkstra over the hex graph with terrain move costs,
// used for (a) computing reachable hexes for a unit and (b) building move paths.
// Respects water impassability and occupancy by other units.
// ============================================================================
import type { BoardMap } from '../map/generator';
import type { HexCoord, Unit } from '../types';
import { hexKey, hexNeighbors, hexDistance } from '../../utils/hex';
import { terrainOf } from '../terrain/terrain';
import { unitDef } from '../units/units';

/** A node in the Dijkstra search. */
interface Node {
  hex: HexCoord;
  cost: number; // movement points spent to reach
}

/**
 * Compute all hexes a unit can reach this activation, with the cheapest cost.
 * Returns a map of hexKey -> movement points spent.
 *
 * @param occupied  hexes blocked by other units (cannot end there, cannot pass)
 * @param budget    movement points available (unit's movement stat)
 */
export function reachableHexes(
  map: BoardMap,
  unit: Unit,
  occupied: Set<string>,
  budget = unitDef(unit.defId).movement,
): Map<string, number> {
  const dist = new Map<string, number>();
  const start = hexKey(unit.pos);
  dist.set(start, 0);

  // Simple priority frontier (small maps -> array scan is fine and fast enough).
  const frontier: Node[] = [{ hex: unit.pos, cost: 0 }];
  const def = unitDef(unit.defId);

  while (frontier.length > 0) {
    // Pop lowest-cost node.
    let bestIdx = 0;
    for (let i = 1; i < frontier.length; i++) {
      if (frontier[i].cost < frontier[bestIdx].cost) bestIdx = i;
    }
    const current = frontier.splice(bestIdx, 1)[0];

    for (const n of hexNeighbors(current.hex)) {
      const nKey = hexKey(n);
      if (!map.tiles.has(nKey)) continue; // off board

      const terrain = terrainOf(map.tiles.get(nKey)!);
      // Air units ignore terrain and occupancy costs entirely.
      let stepCost = def.ignoresTerrain ? 1 : terrain.moveCost;
      if (!isFinite(stepCost)) continue; // impassable (water)

      // Can't pass through hexes occupied by other units (air flies over).
      if (!def.ignoresTerrain && occupied.has(nKey) && nKey !== start) continue;

      const newCost = current.cost + stepCost;
      if (newCost > budget + 1e-6) continue;
      if (newCost < (dist.get(nKey) ?? Infinity) - 1e-6) {
        dist.set(nKey, newCost);
        frontier.push({ hex: n, cost: newCost });
      }
    }
  }

  // Remove the starting hex (can't "move" to where you already are).
  dist.delete(start);
  return dist;
}

/**
 * Reconstruct the cheapest path from unit start to a target using the same
 * cost model. Returns the ordered list of hexes (excluding start), or null.
 */
export function findPath(
  map: BoardMap,
  unit: Unit,
  target: HexCoord,
  occupied: Set<string>,
): HexCoord[] | null {
  const def = unitDef(unit.defId);
  const start = hexKey(unit.pos);
  const targetKey = hexKey(target);
  if (!map.tiles.has(targetKey)) return null;
  if (occupied.has(targetKey) && targetKey !== start) return null;

  const dist = new Map<string, number>();
  const prev = new Map<string, string>();
  const nodes = new Map<string, HexCoord>();
  dist.set(start, 0);

  const frontier: Node[] = [{ hex: unit.pos, cost: 0 }];
  const budget = def.movement;

  while (frontier.length > 0) {
    let bestIdx = 0;
    for (let i = 1; i < frontier.length; i++) {
      if (frontier[i].cost < frontier[bestIdx].cost) bestIdx = i;
    }
    const current = frontier.splice(bestIdx, 1)[0];
    const curKey = hexKey(current.hex);
    if (curKey === targetKey) break;

    for (const n of hexNeighbors(current.hex)) {
      const nKey = hexKey(n);
      if (!map.tiles.has(nKey)) continue;
      const terrain = terrainOf(map.tiles.get(nKey)!);
      const stepCost = def.ignoresTerrain ? 1 : terrain.moveCost;
      if (!isFinite(stepCost)) continue;
      if (!def.ignoresTerrain && occupied.has(nKey) && nKey !== start) continue;

      const newCost = current.cost + stepCost;
      if (newCost > budget + 1e-6) continue;
      if (newCost < (dist.get(nKey) ?? Infinity) - 1e-6) {
        dist.set(nKey, newCost);
        prev.set(nKey, curKey);
        nodes.set(nKey, n);
        frontier.push({ hex: n, cost: newCost });
      }
    }
  }

  if (!dist.has(targetKey)) return null;

  // Reconstruct.
  const path: HexCoord[] = [];
  let cur = targetKey;
  while (cur !== start) {
    const hex = nodes.get(cur);
    if (!hex) break;
    path.unshift(hex);
    const p = prev.get(cur);
    if (!p) break;
    cur = p;
  }
  return path;
}

/** Build the set of hex keys occupied by units other than `exceptId`. */
export function occupiedHexes(units: Unit[], exceptId?: string): Set<string> {
  const set = new Set<string>();
  for (const u of units) {
    if (u.id === exceptId) continue;
    set.add(hexKey(u.pos));
  }
  return set;
}

/** Total movement cost for a unit to traverse a path (for validation). */
export function pathCost(map: BoardMap, unit: Unit, path: HexCoord[]): number {
  const def = unitDef(unit.defId);
  let cost = 0;
  for (const h of path) {
    const terrain = terrainOf(map.tiles.get(hexKey(h)) ?? 'plains');
    cost += def.ignoresTerrain ? 1 : terrain.moveCost;
  }
  return cost;
}

/** Hexes within a unit's vision radius (used by fog of war). */
export function visionHexes(map: BoardMap, center: HexCoord, radius: number): HexCoord[] {
  const out: HexCoord[] = [];
  for (const k of map.tiles.keys()) {
    const [q, r] = k.split(',').map(Number);
    const h = { q, r };
    if (hexDistance(center, h) <= radius) out.push(h);
  }
  return out;
}