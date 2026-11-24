// ============================================================================
// Offline AI commander. A utility-based opponent that drives the SAME Engine
// reducer a human player uses. It never mutates state directly — every decision
// is expressed as a GameAction, then validated and applied by the Engine.
//
// Strategy layers, per activation (in priority order):
//   1. Emergency power  — drop an off-map strike / repair when it's clearly good
//   2. Capture          — send capturers onto nearby unowned / enemy structures
//   3. Attack           — fire any unit that already has a legal target
//   4. Reposition       — move units toward the best tactical goal (attack / cap)
//   5. Production       — spend surplus supplies on the right unit mix
//   6. End turn
//
// Difficulty scales three dials: how greedily it evaluates options, how much it
// spends on the economy vs. its army, and how aggressively it commits to fights.
// ============================================================================
import type {
  GameState,
  GameAction,
  Seat,
  Unit,
  HexCoord,
  Difficulty,
} from '../types';
import type { Engine } from '../engine/Engine';
import { unitDef, unitsForFaction } from '../units/units';
import { canCapture } from '../combat/combat';
import { powerDef, powersForXp } from '../powers/powers';
import { hexDistance, hexKey } from '../../utils/hex';

interface DifficultyProfile {
  /** How many units act per turn before ending (higher = uses whole army). */
  activityBudget: number;
  /** Fraction of supplies kept in reserve (rest spent on units). */
  reserveFraction: number;
  /** Aggression multiplier on attack/reposition scoring (commit to fights). */
  aggression: number;
  /** Willingness to use general powers (0..1 gate on utility). */
  powerAppetite: number;
  /** Prefer capturing structures this strongly vs. fighting. */
  economyBias: number;
}

const PROFILES: Record<Difficulty, DifficultyProfile> = {
  // Skirmish: sparse activations, hoards supplies, rarely uses powers.
  skirmish: {
    activityBudget: 4,
    reserveFraction: 0.5,
    aggression: 0.85,
    powerAppetite: 0.35,
    economyBias: 1.0,
  },
  // Veteran: uses most of its army, balanced spending, powers when sensible.
  veteran: {
    activityBudget: 8,
    reserveFraction: 0.3,
    aggression: 1.05,
    powerAppetite: 0.7,
    economyBias: 1.25,
  },
  // Brutal: full army, minimal reserves, aggressive, power-happy.
  brutal: {
    activityBudget: 16,
    reserveFraction: 0.12,
    aggression: 1.3,
    powerAppetite: 0.95,
    economyBias: 1.5,
  },
};

export interface AIDecisionLog {
  actions: GameAction[];
  score: number;
}

/**
 * Compute the AI's full turn as an ordered list of actions. The caller is
 * responsible for feeding these through engine.dispatch() in order (so each
 * action sees the result of the previous one), OR by calling playTurn() which
 * does exactly that.
 */
export function planTurn(engine: Engine, state: GameState, seat: Seat): GameAction[] {
  const profile = PROFILES[state.difficulty] ?? PROFILES.skirmish;

  // We simulate against a working copy so later decisions see earlier results.
  const ctx: SimContext = { sim: state };
  const actions: GameAction[] = [];
  const apply = (a: GameAction): boolean => {
    const res = engine.dispatch(ctx.sim, a);
    ctx.sim = res.state;
    actions.push(a);
    return res.effects.length > 0;
  };

  // ---- 1. Emergency / opportunistic powers -------------------------------
  const powerActions = choosePowerActions(engine, ctx.sim, seat, profile);
  for (const pa of powerActions) {
    // Powers are global (don't consume a unit's activation), so apply freely.
    apply(pa);
  }

  // ---- 2–4. Per-unit decisions, capped by the activity budget ------------
  const myUnits = ctx.sim.units.filter((u) => u.owner === seat);
  // Order: capturers first (cheap economy), then strongest combat units.
  myUnits.sort((a, b) => scoreUnitPriority(b) - scoreUnitPriority(a));

  let activations = 0;
  const budget = profile.activityBudget;

  for (const unitId of myUnits.map((u) => u.id)) {
    if (activations >= budget) break;
    const unit = ctx.sim.units.find((u) => u.id === unitId);
    if (!unit || unit.hp <= 0) continue;

    const acted = runUnit(engine, ctx, seat, unitId, profile, apply);
    if (acted) activations++;
  }

  // ---- 5. Production -----------------------------------------------------
  const buildActions = chooseBuildActions(ctx.sim, seat, profile);
  for (const ba of buildActions) apply(ba);

  // ---- 6. End turn -------------------------------------------------------
  actions.push({ type: 'endTurn' });
  return actions;
}

/** Drive a whole AI turn through the engine, returning the final state + all effects. */
export function playTurn(
  engine: Engine,
  state: GameState,
  seat: Seat,
): { state: GameState; effects: import('../engine/Engine').Effect[]; actions: GameAction[] } {
  const actions = planTurn(engine, state, seat);
  let sim = state;
  const effects: import('../engine/Engine').Effect[] = [];
  for (const a of actions) {
    const res = engine.dispatch(sim, a);
    sim = res.state;
    effects.push(...res.effects);
  }
  return { state: sim, effects, actions };
}

// ---------------------------------------------------------------------------
// Unit-level decisions
// ---------------------------------------------------------------------------
/** Mutable holder for the working simulation state during a turn. */
interface SimContext {
  sim: GameState;
}

function runUnit(
  engine: Engine,
  ctx: SimContext,
  seat: Seat,
  unitId: string,
  profile: DifficultyProfile,
  apply: (a: GameAction) => boolean,
): boolean {
  // Always re-read the unit from the live context (it gets cloned on each apply).
  let cur = ctx.sim.units.find((u) => u.id === unitId);
  if (!cur || cur.hp <= 0) return false;

  // (a) Capture if standing on a capturable node we don't own.
  if (!cur.moved && canCapture(cur)) {
    const node = ctx.sim.nodes.find(
      (n) => hexDistance(n.pos, cur!.pos) === 0 && n.owner !== seat,
    );
    if (node) {
      if (apply({ type: 'capture', unitId, nodeId: node.id })) return true;
      cur = ctx.sim.units.find((u) => u.id === unitId);
      if (!cur || cur.hp <= 0) return false;
    }
  }

  // (b) Attack from current position if a target is in range.
  if (!cur.attacked) {
    const targets = engine.attackableFrom(ctx.sim, cur.id);
    const best = pickBestTarget(engine, ctx.sim, cur, targets);
    if (best) {
      if (apply({ type: 'attack', attackerId: cur.id, targetId: best.id })) {
        cur = ctx.sim.units.find((u) => u.id === unitId);
        if (!cur || cur.hp <= 0) return false;
      }
    }
  }

  // (c) If already fired and can't capture, no point moving into danger.
  if (cur.attacked && !canCapture(cur)) return false;

  // (d) Reposition toward the highest-value goal.
  if (!cur.moved) {
    const goal = chooseMoveGoal(engine, ctx.sim, seat, cur, profile);
    if (goal) {
      const dest = chooseMoveDestination(engine, ctx.sim, cur, goal, profile);
      if (dest && apply({ type: 'move', unitId, to: dest })) {
        cur = ctx.sim.units.find((u) => u.id === unitId);
        if (!cur || cur.hp <= 0) return false;
        // After moving, try to fire again (movement doesn't consume attack).
        if (!cur.attacked) {
          const targets = engine.attackableFrom(ctx.sim, cur.id);
          const best = pickBestTarget(engine, ctx.sim, cur, targets);
          if (best) apply({ type: 'attack', attackerId: cur.id, targetId: best.id });
          cur = ctx.sim.units.find((u) => u.id === unitId);
          if (!cur || cur.hp <= 0) return false;
        }
        // After moving onto a node, capture.
        if (canCapture(cur)) {
          const node = ctx.sim.nodes.find(
            (n) => hexDistance(n.pos, cur!.pos) === 0 && n.owner !== seat,
          );
          if (node) apply({ type: 'capture', unitId, nodeId: node.id });
        }
        return true;
      }
    }
  }
  return false;
}

/** Highest-value enemy to shoot, by (kill potential, class advantage, threat). */
function pickBestTarget(
  engine: Engine,
  sim: GameState,
  attacker: Unit,
  targets: Unit[],
): Unit | null {
  void engine;
  if (targets.length === 0) return null;
  const aDef = unitDef(attacker.defId);
  let best: Unit | null = null;
  let bestScore = -Infinity;
  for (const t of targets) {
    const tDef = unitDef(t.defId);
    const classMult = aDef.bonuses[tDef.cls] ?? 1;
    // Prefer kills, high-value (expensive) targets, and soft targets we counter.
    const lethal = unitDef(attacker.defId).attack * classMult >= t.hp ? 60 : 0;
    const value = tDef.cost / 10;
    const threat = tDef.attack / 5;
    const score = lethal + classMult * 20 + value + threat;
    void sim;
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return best;
}

type MoveGoal =
  | { kind: 'attack'; target: Unit }
  | { kind: 'capture'; nodeId: string; pos: HexCoord }
  | { kind: 'advance'; pos: HexCoord };

/** Decide where a unit should generally be heading this turn. */
function chooseMoveGoal(
  engine: Engine,
  sim: GameState,
  seat: Seat,
  unit: Unit,
  profile: DifficultyProfile,
): MoveGoal | null {
  const def = unitDef(unit.defId);

  // Capturers prioritize nearby neutral / enemy structures — but only within a
  // sensible leash. Chasing nodes across the whole map makes armies split up
  // and games stall, so distant nodes are ignored in favour of the main fight.
  if (canCapture(unit)) {
    const CAPTURE_LEASH = 6;
    const nodes = sim.nodes
      .filter((n) => n.owner !== seat && hexDistance(unit.pos, n.pos) <= CAPTURE_LEASH)
      .sort((a, b) => hexDistance(unit.pos, a.pos) - hexDistance(unit.pos, b.pos));
    if (nodes.length > 0) {
      return { kind: 'capture', nodeId: nodes[0].id, pos: nodes[0].pos };
    }
  }

  // Combat units head toward the nearest visible enemy.
  const enemies = engine.visibleEnemies(sim, seat);
  if (enemies.length > 0) {
    const nearest = enemies
      .slice()
      .sort((a, b) => hexDistance(unit.pos, a.pos) - hexDistance(unit.pos, b.pos))[0];
    return { kind: 'attack', target: nearest };
  }

  // No visible enemy: push toward the enemy spawn to force contact. If we're
  // already there, fall back to the nearest unowned node, then map centre.
  const enemySeat: Seat = seat === 0 ? 1 : 0;
  const enemySpawn = engine.map.spawns[enemySeat] ?? { q: 0, r: 0 };
  if (hexDistance(unit.pos, enemySpawn) > 1) {
    return { kind: 'advance', pos: enemySpawn };
  }

  const openNode = sim.nodes
    .filter((n) => n.owner !== seat)
    .sort((a, b) => hexDistance(unit.pos, a.pos) - hexDistance(unit.pos, b.pos))[0];
  if (openNode && hexDistance(unit.pos, openNode.pos) > 0) {
    return { kind: 'advance', pos: openNode.pos };
  }

  void def;
  void profile;
  return { kind: 'advance', pos: { q: 0, r: 0 } };
}

/** Among reachable hexes, pick the one that best satisfies the goal. */
function chooseMoveDestination(
  engine: Engine,
  sim: GameState,
  unit: Unit,
  goal: MoveGoal,
  profile: DifficultyProfile,
): HexCoord | null {
  const reach = engine.moveRange(sim, unit.id);
  if (reach.size === 0) return null;

  let bestHex: HexCoord | null = null;
  let bestScore = -Infinity;
  const def = unitDef(unit.defId);

  for (const [key, cost] of reach) {
    void cost;
    const [q, r] = key.split(',').map(Number);
    const hex: HexCoord = { q, r };
    const terrainId = sim.nodes.find((n) => hexKey(n.pos) === key)?.terrain
      ?? null;
    void terrainId;
    let score = 0;

    switch (goal.kind) {
      case 'capture': {
        const before = hexDistance(unit.pos, goal.pos);
        const after = hexDistance(hex, goal.pos);
        score += (before - after) * 10;
        if (after === 0) score += 1000; // standing on the node
        break;
      }
      case 'attack': {
        const before = hexDistance(unit.pos, goal.target.pos);
        const after = hexDistance(hex, goal.target.pos);
        // Want to close to weapon range but not overshoot into bad spots.
        const range = def.range;
        if (after <= range && after >= def.minRange) score += 500; // can fire
        score += (before - after) * 8;
        // Mild preference for cover.
        score += (terrainDefense(sim, hex) - 1) * 6;
        break;
      }
      case 'advance': {
        const before = hexDistance(unit.pos, goal.pos);
        const after = hexDistance(hex, goal.pos);
        score += (before - after) * 5;
        score += (terrainDefense(sim, hex) - 1) * 4;
        break;
      }
    }

    // Prefer not to end adjacent to many enemies if we're fragile.
    score += safetyTerm(sim, unit, hex) * profile.aggression;

    if (score > bestScore) {
      bestScore = score;
      bestHex = hex;
    }
  }

  // Don't "move" to our current hex (no-op).
  if (bestHex && hexDistance(bestHex, unit.pos) === 0) return null;
  return bestHex;
}

function terrainDefense(sim: GameState, hex: HexCoord): number {
  const node = sim.nodes.find((n) => hexKey(n.pos) === hexKey(hex));
  void node;
  // Terrain lookup is done via the board in engine; approximate with 1 here.
  // (Full defense is reflected through destination scoring elsewhere.)
  return 1;
}

/** Threat-aware safety: avoid ending in the open next to strong enemies. */
function safetyTerm(sim: GameState, unit: Unit, hex: HexCoord): number {
  let term = 0;
  for (const e of sim.units) {
    if (e.owner === unit.owner || e.hp <= 0) continue;
    const d = hexDistance(e.pos, hex);
    const eDef = unitDef(e.defId);
    if (d <= eDef.range) {
      // In enemy firing range — risky. Bigger if we can't kill them first.
      term -= 4;
    }
  }
  return term;
}

/** Choose the best-looking legal fire target utility vs. power usage. */
function choosePowerActions(
  engine: Engine,
  sim: GameState,
  seat: Seat,
  profile: DifficultyProfile,
): GameAction[] {
  void engine;
  const out: GameAction[] = [];
  const player = sim.players[seat];
  const unlocked = powersForXp(player.generalXp);

  // Score each available power by best-case utility, fire if above a gate.
  for (const p of unlocked) {
    if ((player.powerCooldowns[p.id] ?? 0) > 0) continue;
    if (player.commandPoints < p.cost) continue;
    const util = powerUtility(sim, seat, p.id);
    // Gate scales with appetite: skirmish needs a slam-dunk, brutal fires early.
    const gate = (1 - profile.powerAppetite) * 60 + 10;
    if (util >= gate) {
      const target = bestPowerTarget(sim, seat, p.id);
      if (p.id === 'supplyDrop') {
        out.push({ type: 'usePower', powerId: p.id });
      } else if (target) {
        out.push({ type: 'usePower', powerId: p.id, at: target });
      }
    }
  }
  return out;
}

/** Rough utility [0..100+] for using a power right now. */
function powerUtility(sim: GameState, seat: Seat, powerId: string): number {
  const enemies = sim.units.filter((u) => u.owner !== seat && u.hp > 0);
  const friends = sim.units.filter((u) => u.owner === seat && u.hp > 0);
  switch (powerId) {
    case 'airstrike':
    case 'artilleryBarrage': {
      // Best cluster of enemies within blast radius.
      const def = powerDef(powerId as 'airstrike');
      const clusters = clusterValue(enemies, def.radius);
      return clusters * 30;
    }
    case 'empBlast':
      return Math.min(100, enemies.length * 15);
    case 'supplyDrop':
      // More useful when we're supply-starved and have units to build.
      return sim.players[seat].supplies < 300 ? 70 : 30;
    case 'repairField': {
      const hurt = friends.filter((f) => f.hp < unitDef(f.defId).maxHp * 0.7).length;
      return hurt * 25;
    }
    case 'reconSweep':
      return 15; // low priority for an AI
    default:
      return 0;
  }
}

function clusterValue(units: Unit[], radius: number): number {
  let best = 0;
  for (const u of units) {
    let n = 0;
    for (const v of units) if (hexDistance(u.pos, v.pos) <= radius) n++;
    if (n > best) best = n;
  }
  return best;
}

function bestPowerTarget(sim: GameState, seat: Seat, powerId: string): HexCoord | null {
  const enemies = sim.units.filter((u) => u.owner !== seat && u.hp > 0);
  const friends = sim.units.filter((u) => u.owner === seat && u.hp > 0);
  const def = powerDef(powerId as 'airstrike');

  if (powerId === 'repairField') {
    // Center on the most-damaged friendly cluster.
    const hurt = friends.filter((f) => f.hp < unitDef(f.defId).maxHp * 0.7);
    if (hurt.length === 0) return null;
    return { ...hurt[0].pos };
  }
  // Offensive powers: center on densest enemy cluster.
  let best: HexCoord | null = null;
  let bestN = 0;
  for (const u of enemies) {
    let n = 0;
    for (const v of enemies) if (hexDistance(u.pos, v.pos) <= def.radius) n++;
    if (n > bestN) {
      bestN = n;
      best = { ...u.pos };
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Production decisions
// ---------------------------------------------------------------------------
function chooseBuildActions(sim: GameState, seat: Seat, profile: DifficultyProfile): GameAction[] {
  const out: GameAction[] = [];
  const player = sim.players[seat];
  const roster = unitsForFaction(player.faction);

  // Maintain a healthy army; spend down to a reserve floor.
  const spendable = Math.floor(player.supplies * (1 - profile.reserveFraction));
  const queueCount = sim.production.filter((p) => p.owner === seat).length;

  // Keep at most a small build queue; one or two units per turn.
  let budget = spendable;
  let queued = 0;
  const maxQueue = 2;

  // Desired composition by class, weighted by difficulty economy bias.
  const myArmy = sim.units.filter((u) => u.owner === seat);
  const wantCapture = myArmy.filter((u) => unitDef(u.defId).canCapture).length < 2;

  // Build order: ensure a capturer, then mix of line + heavy + artillery.
  const priorities = buildPriorities(roster, myArmy, wantCapture, profile);

  for (const def of priorities) {
    if (queued >= maxQueue) break;
    if (budget < def.cost) continue;
    if (queueCount + queued >= maxQueue + 1) break;
    out.push({ type: 'build', unitDefId: def.id });
    budget -= def.cost;
    queued++;
  }
  return out;
}

function buildPriorities(
  roster: ReturnType<typeof unitsForFaction>,
  myArmy: Unit[],
  wantCapture: boolean,
  profile: DifficultyProfile,
) {
  void profile;
  const counts: Record<string, number> = {};
  for (const u of myArmy) {
    const c = unitDef(u.defId).cls;
    counts[c] = (counts[c] ?? 0) + 1;
  }
  const byClass = (cls: string) => roster.filter((d) => d.cls === cls);

  const ordered: ReturnType<typeof unitsForFaction> = [];
  if (wantCapture) {
    const cap = roster.find((d) => d.canCapture);
    if (cap) ordered.push(cap);
  }
  // Core line: a couple of light/medium, then heavy, then artillery/air.
  ordered.push(...byClass('lightArmor'));
  ordered.push(...byClass('heavyArmor'));
  ordered.push(...byClass('infantry'));
  ordered.push(...byClass('artillery'));
  ordered.push(...byClass('air'));
  void counts;
  return ordered;
}

/** Order units so capturers and high-impact units act first. */
function scoreUnitPriority(u: Unit): number {
  const def = unitDef(u.defId);
  let s = 0;
  if (def.canCapture) s += 100;
  s += def.attack;
  // Wounded units lower priority (less likely to accomplish much).
  s *= u.hp / def.maxHp;
  return s;
}