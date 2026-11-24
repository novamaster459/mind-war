// ============================================================================
// Line of Sight & Fog of War.
// - LOS: hexes are visible if no intervening terrain "blocksLos" (urban).
// - Visibility: a unit sees hexes within its vision radius + terrain bonus,
//   minus any blocked by intervening urban tiles.
// - Concealment: enemy units in forests are hidden unless a friendly unit is
//   within the concealment range of that tile.
// ============================================================================
import type { BoardMap } from '../map/generator';
import type { HexCoord, Unit } from '../types';
import { hexKey, hexLine, hexDistance } from '../../utils/hex';
import { terrainOf } from '../terrain/terrain';
import { unitDef } from '../units/units';

/** Does an unobstructed line exist between two hexes (ignoring units)? */
export function hasLineOfSight(map: BoardMap, from: HexCoord, to: HexCoord): boolean {
  const line = hexLine(from, to);
  // Check intermediate hexes (skip endpoints).
  for (let i = 1; i < line.length - 1; i++) {
    const k = hexKey(line[i]);
    const terrainId = map.tiles.get(k);
    if (terrainId && terrainOf(terrainId).blocksLos) return false;
  }
  return true;
}

/** Vision radius for a unit standing on a given hex. */
export function unitVisionRadius(map: BoardMap, unit: Unit): number {
  const def = unitDef(unit.defId);
  const terrainId = map.tiles.get(hexKey(unit.pos));
  const bonus = terrainId ? terrainOf(terrainId).visionBonus : 0;
  return def.vision + bonus;
}

/** All hexes a single unit can currently see. */
export function computeUnitVisibility(map: BoardMap, unit: Unit): Set<string> {
  const visible = new Set<string>();
  const radius = unitVisionRadius(map, unit);
  visible.add(hexKey(unit.pos));

  for (const k of map.tiles.keys()) {
    const [q, r] = k.split(',').map(Number);
    const h: HexCoord = { q, r };
    if (hexDistance(unit.pos, h) <= radius && hasLineOfSight(map, unit.pos, h)) {
      visible.add(k);
    }
  }
  return visible;
}

/** Combined visibility for a seat across all its living units. */
export function computeSeatVisibility(map: BoardMap, units: Unit[], seat: number): Set<string> {
  const visible = new Set<string>();
  for (const u of units) {
    if (u.owner !== seat || u.hp <= 0) continue;
    for (const k of computeUnitVisibility(map, u)) visible.add(k);
  }
  // Owned resource nodes always grant vision of their own hex.
  for (const node of map.nodes) {
    if (node.owner === seat) visible.add(hexKey(node.pos));
  }
  return visible;
}

/**
 * Determine whether `target` unit is visible to `seat`, accounting for forest
 * concealment: a concealed enemy is only spotted if a friendly unit is within
 * the tile's concealmentRange.
 */
export function isUnitVisibleTo(
  map: BoardMap,
  units: Unit[],
  target: Unit,
  seat: number,
  visibility: Set<string>,
): boolean {
  if (target.owner === seat) return true;
  const tKey = hexKey(target.pos);
  if (!visibility.has(tKey)) return false;

  // Concealment check for forest tiles.
  const terrainId = map.tiles.get(tKey);
  const conceal = terrainId ? terrainOf(terrainId).concealmentRange : 0;
  if (conceal > 0 && !unitDef(target.defId).ignoresTerrain) {
    // Need a friendly unit close enough to spot it.
    for (const u of units) {
      if (u.owner !== seat || u.hp <= 0) continue;
      if (hexDistance(u.pos, target.pos) <= conceal) return true;
    }
    return false; // concealed and no friendly close enough
  }
  return true;
}

/** Friendly units within a given radius of a hex. */
export function friendlyUnitsInRadius(
  units: Unit[],
  seat: number,
  center: HexCoord,
  radius: number,
): Unit[] {
  return units.filter(
    (u) => u.owner === seat && u.hp > 0 && hexDistance(u.pos, center) <= radius,
  );
}

/** Enemy units within a given radius (optionally only visible ones). */
export function enemyUnitsInRadius(
  units: Unit[],
  seat: number,
  center: HexCoord,
  radius: number,
  visibility?: Set<string>,
): Unit[] {
  return units.filter((u) => {
    if (u.owner === seat || u.hp <= 0) return false;
    if (hexDistance(u.pos, center) > radius) return false;
    if (visibility && !visibility.has(hexKey(u.pos))) return false;
    return true;
  });
}