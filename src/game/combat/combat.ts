// ============================================================================
// Combat math. Pure functions: given attacker, defender, board and rules,
// compute damage and whether the attack is legal. No mutation.
// ============================================================================
import type { BoardMap } from '../map/generator';
import type { HexCoord, Unit } from '../types';
import { hexDistance } from '../../utils/hex';
import { terrainOf } from '../terrain/terrain';
import { unitDef } from '../units/units';
import { hexKey } from '../../utils/hex';

export interface AttackCheck {
  ok: boolean;
  reason?: string;
}

/** Can `attacker` legally attack `target` right now (range, LoS, stance)? */
export function canAttack(
  map: BoardMap,
  attacker: Unit,
  target: Unit,
  hasLoS: boolean,
): AttackCheck {
  const aDef = unitDef(attacker.defId);
  const tDef = unitDef(target.defId);
  if (attacker.owner === target.owner) return { ok: false, reason: 'friendly' };
  if (attacker.hp <= 0 || target.hp <= 0) return { ok: false, reason: 'dead' };
  if (attacker.attacked) return { ok: false, reason: 'already attacked this turn' };
  if (attacker.stance === 'hold') {
    // hold stance: may only fire at units in range without moving (already handled)
  }

  const dist = hexDistance(attacker.pos, target.pos);
  const aTerrain = map.tiles.get(hexKey(attacker.pos));
  const rangeBonus = aTerrain ? terrainOf(aTerrain).rangeBonus : 0;
  const maxRange = aDef.range + rangeBonus;

  if (dist > maxRange) return { ok: false, reason: `out of range (${dist}>${maxRange})` };
  if (dist < aDef.minRange) return { ok: false, reason: `too close (min ${aDef.minRange})` };

  // Artillery/air arcs: artillery needs LoS; direct-fire needs LoS too except air.
  if (!aDef.ignoresTerrain && !hasLoS) return { ok: false, reason: 'line of sight blocked' };

  // Air can be hit by anything, but only air or units that can target air...
  // (kept simple: everything can target everything for now).
  void tDef;
  return { ok: true };
}

/** Effective attack range of a unit on its current hex. */
export function effectiveRange(map: BoardMap, unit: Unit): number {
  const def = unitDef(unit.defId);
  const terrainId = map.tiles.get(hexKey(unit.pos));
  const bonus = terrainId ? terrainOf(terrainId).rangeBonus : 0;
  return def.range + bonus;
}

export interface DamageResult {
  damage: number;
  breakdown: {
    base: number;
    classBonus: number; // multiplier applied
    coverMultiplier: number;
    armorReduction: number;
    final: number;
  };
}

/**
 * Compute damage dealt by `attacker` to `target` standing on `map`.
 * Formula:
 *   base = attacker.attack
 *   * class matchup bonus (asymmetric unit counters)
 *   * target terrain defense (cover)
 *   - target armor (flat reduction, min 1)
 */
export function computeDamage(
  map: BoardMap,
  attacker: Unit,
  target: Unit,
  rng: () => number = () => 0.5,
): DamageResult {
  const aDef = unitDef(attacker.defId);
  const tDef = unitDef(target.defId);

  const base = aDef.attack;

  // Class bonus (attacker bonuses keyed by target class).
  const classMult = aDef.bonuses[tDef.cls] ?? 1;

  // Target cover from its tile.
  const tTerrainId = map.tiles.get(hexKey(target.pos));
  const coverMult = tTerrainId ? terrainOf(tTerrainId).defense : 1;

  // Garrisoned units get an extra cover bump.
  const garrisonMult = target.garrisoned ? 1.3 : 1;

  // Small variance for game feel (±12%), deterministic via injected rng.
  const variance = 0.88 + rng() * 0.24;

  let dmg = base * classMult * (1 / (coverMult * garrisonMult)) * variance;
  // Flat armor reduction (can't reduce below 15% of computed).
  const armorReduction = tDef.armor;
  dmg = Math.max(dmg * 0.15, dmg - armorReduction);
  // Air targets take reduced damage from non-air/non-artillery (simplified: armor already covers).
  const final = Math.max(1, Math.round(dmg));

  return {
    damage: final,
    breakdown: {
      base,
      classBonus: classMult,
      coverMultiplier: coverMult * garrisonMult,
      armorReduction,
      final,
    },
  };
}

/** Can this unit capture structures? (infantry-type) */
export function canCapture(unit: Unit): boolean {
  return unitDef(unit.defId).canCapture;
}

/** Can this unit garrison into urban? */
export function canGarrison(unit: Unit): boolean {
  return unitDef(unit.defId).canGarrison;
}

/** Counter-attack damage if defender survives and is in range (simplified). */
export function counterDamage(map: BoardMap, attacker: Unit, target: Unit): number {
  const tDef = unitDef(target.defId);
  const aDef = unitDef(attacker.defId);
  const dist = hexDistance(attacker.pos, target.pos);
  const tTerrainId = map.tiles.get(hexKey(target.pos));
  const rangeBonus = tTerrainId ? terrainOf(tTerrainId).rangeBonus : 0;
  if (dist > tDef.range + rangeBonus) return 0; // can't retaliate
  if (dist < tDef.minRange) return 0;
  // Counterattack is weaker (50%) and reduced by attacker armor.
  const raw = tDef.attack * 0.5 - aDef.armor;
  return Math.max(1, Math.round(raw));
}

/** A hex is within weapon range of a unit (for threat overlays). */
export function isInWeaponRange(map: BoardMap, unit: Unit, hex: HexCoord): boolean {
  const dist = hexDistance(unit.pos, hex);
  const range = effectiveRange(map, unit);
  return dist >= unitDef(unit.defId).minRange && dist <= range;
}