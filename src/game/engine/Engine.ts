// ============================================================================
// Match engine — pure, deterministic reducer. Given (state, action) it returns
// a NEW state plus a list of "effects" (for the renderer: sounds, animations,
// floating damage numbers). No side effects, no timers. This same reducer will
// run on the server (Phase 5) for authoritative validation.
//
// The engine never touches React/Pixi/DOM. The UI dispatches GameActions; the
// renderer reads the resulting state and plays back effects.
// ============================================================================
import type {
  BoardMap,
} from '../map/generator';
import type {
  GameState,
  GameAction,
  HexCoord,
  Unit,
  Seat,
  LogEntry,
  PowerId,
  ProductionItem,
} from '../types';
import { generateMap } from '../map/generator';
import { createPlayer, applyIncome, nodeControl } from '../economy/economy';
import {
  reachableHexes,
  findPath,
  occupiedHexes,
  visionHexes,
} from '../combat/movement';
import {
  computeSeatVisibility,
  isUnitVisibleTo,
  hasLineOfSight,
  enemyUnitsInRadius,
} from '../combat/los';
import { canAttack, computeDamage, counterDamage, canCapture } from '../combat/combat';
import { unitDef } from '../units/units';
import { UNITS } from '../units/units';
import { terrainOf } from '../terrain/terrain';
import { hexKey, hexDistance, hexNeighbors } from '../../utils/hex';
import { powerDef, powersForXp } from '../powers/powers';
import { mulberry32 } from '../../utils/rng';
import { XP_PER_KILL, XP_PER_WIN } from '../constants';

// ---------------------------------------------------------------------------
// Effect types (consumed by renderer for juice / sound)
// ---------------------------------------------------------------------------
export type Effect =
  | { kind: 'move'; unitId: string; path: HexCoord[] }
  | { kind: 'attack'; attackerId: string; targetId: string; damage: number; counter: number; killed: boolean; at: HexCoord }
  | { kind: 'capture'; unitId: string; nodeId: string; owner: Seat }
  | { kind: 'power'; powerId: PowerId; at: HexCoord; affected: string[] }
  | { kind: 'turnStart'; seat: Seat; income: { supplies: number; command: number } }
  | { kind: 'deploy'; unitId: string; at: HexCoord }
  | { kind: 'destroyed'; unitId: string; at: HexCoord }
  | { kind: 'victory'; winner: Seat }
  | { kind: 'log'; entry: LogEntry };

export interface EngineResult {
  state: GameState;
  effects: Effect[];
}

// ---------------------------------------------------------------------------
// Engine wrapper: holds the board map (not part of serializable state) + RNG.
// ---------------------------------------------------------------------------
export class Engine {
  map: BoardMap;
  private rng: () => number;

  constructor(seed = 1337, radius = 7) {
    this.map = generateMap(seed, radius);
    this.rng = mulberry32(seed ^ 0x9e3779b9);
  }

  /** Start a brand-new match. */
  newGame(opts: {
    faction0: GameState['players'][0]['faction'];
    faction1: GameState['players'][1]['faction'];
    mode?: GameState['mode'];
    difficulty?: GameState['difficulty'];
    name0?: string;
    name1?: string;
  }): EngineResult {
    const p0 = createPlayer(0, opts.faction0, opts.name0 ?? 'Commander', false);
    const p1 = createPlayer(1, opts.faction1, opts.name1 ?? 'Enemy', opts.mode === 'skirmish');

    const state: GameState = {
      matchId: `m_${Date.now().toString(36)}`,
      mode: opts.mode ?? 'skirmish',
      difficulty: opts.difficulty ?? 'skirmish',
      turn: 1,
      activeSeat: 0,
      players: [p0, p1],
      units: [],
      nodes: this.map.nodes.map((n) => ({ ...n })),
      visibility: [{}, {}],
      explored: [{}, {}],
      selectedUnitId: null,
      hoveredHex: null,
      log: [],
      status: 'active',
      winner: null,
      production: [],
    };

    // Starting forces: a small balanced opening for each seat near their spawn.
    const effects: Effect[] = [];
    this.grantStartingUnits(state, 0);
    this.grantStartingUnits(state, 1);

    this.refreshVisibility(state);
    this.log(state, null, `Operation begins — ${opts.faction0} vs ${opts.faction1}.`, 'system');
    effects.push({ kind: 'turnStart', seat: 0, income: { supplies: 0, command: 0 } });
    return { state, effects };
  }

  // -------------------------------------------------------------------------
  // Starting units
  // -------------------------------------------------------------------------
  private grantStartingUnits(state: GameState, seat: Seat): void {
    const faction = state.players[seat].faction;
    const spawn = this.map.spawns[seat];
    // Pick 3 cheap core units: infantry + light + one more infantry.
    const roster = this.rosterFor(faction);
    const infantry = roster.find((u) => u.cls === 'infantry')!;
    const light = roster.find((u) => u.cls === 'lightArmor')!;

    const placements: { defId: string; offset: HexCoord }[] = [
      { defId: infantry.id, offset: { q: 0, r: 0 } },
      { defId: infantry.id, offset: { q: 1, r: 0 } },
      { defId: light.id, offset: { q: 0, r: 1 } },
    ];
    let i = 0;
    for (const p of placements) {
      const pos = { q: spawn.q + p.offset.q, r: spawn.r + p.offset.r };
      if (!this.map.tiles.has(hexKey(pos))) continue;
      // avoid water
      if (!isFinite(terrainOf(this.map.tiles.get(hexKey(pos))!).moveCost)) continue;
      state.units.push(this.makeUnit(p.defId, faction, seat, pos, `u${seat}_${i++}`));
    }
  }

  private rosterFor(faction: GameState['players'][0]['faction']) {
    return UNITS[faction];
  }

  private makeUnit(defId: string, faction: Unit['faction'], owner: Seat, pos: HexCoord, id: string): Unit {
    const def = unitDef(defId);
    return {
      id,
      defId,
      faction,
      owner,
      pos,
      hp: def.maxHp,
      moved: false,
      attacked: false,
      garrisoned: false,
      stance: 'aggressive',
    };
  }

  // -------------------------------------------------------------------------
  // Logging + visibility helpers
  // -------------------------------------------------------------------------
  private log(state: GameState, seat: Seat | null, message: string, kind: LogEntry['kind']): void {
    state.log = [{ turn: state.turn, seat, message, kind }, ...state.log].slice(0, 60);
  }

  refreshVisibility(state: GameState): void {
    for (const seat of [0, 1] as Seat[]) {
      const vis = computeSeatVisibility(this.map, state.units, seat);
      const visObj: Record<string, boolean> = {};
      const explored = { ...state.explored[seat] };
      for (const k of vis) {
        visObj[k] = true;
        explored[k] = true;
      }
      state.visibility[seat] = visObj;
      state.explored[seat] = explored;
    }
  }

  /** Visible enemy units to a seat. */
  visibleEnemies(state: GameState, seat: Seat): Unit[] {
    const vis = this.seatVisibilitySet(state, seat);
    return state.units.filter(
      (u) => u.hp > 0 && u.owner !== seat && isUnitVisibleTo(this.map, state.units, u, seat, vis),
    );
  }

  private seatVisibilitySet(state: GameState, seat: Seat): Set<string> {
    const visObj = state.visibility[seat];
    return new Set(Object.keys(visObj));
  }

  // -------------------------------------------------------------------------
  // Action dispatch
  // -------------------------------------------------------------------------
  dispatch(state: GameState, action: GameAction): EngineResult {
    // Work on a deep-ish clone so the reducer is pure.
    const next: GameState = structuredClone(state);
    const effects: Effect[] = [];
    const seat = next.activeSeat;

    switch (action.type) {
      case 'select':
        next.selectedUnitId = action.unitId;
        break;

      case 'setStance':
        this.doSetStance(next, action.unitId, action.stance);
        break;

      case 'move':
        this.doMove(next, seat, action.unitId, action.to, effects);
        break;

      case 'attack':
        this.doAttack(next, seat, action.attackerId, action.targetId, effects);
        break;

      case 'capture':
        this.doCapture(next, seat, action.unitId, action.nodeId, effects);
        break;

      case 'build':
        this.doBuild(next, seat, action.unitDefId, effects);
        break;

      case 'usePower':
        this.doUsePower(next, seat, action.powerId, action.at, action.targetId, effects);
        break;

      case 'endTurn':
        this.doEndTurn(next, effects);
        break;
    }

    this.refreshVisibility(next);
    this.checkVictory(next, effects);
    return { state: next, effects };
  }

  // -------------------------------------------------------------------------
  // Stance
  // -------------------------------------------------------------------------
  private doSetStance(state: GameState, unitId: string, stance: Unit['stance']): void {
    const u = state.units.find((x) => x.id === unitId);
    if (u) u.stance = stance;
  }

  // -------------------------------------------------------------------------
  // Movement
  // -------------------------------------------------------------------------
  private doMove(state: GameState, seat: Seat, unitId: string, to: HexCoord, effects: Effect[]): void {
    const u = state.units.find((x) => x.id === unitId);
    if (!u || u.owner !== seat || u.hp <= 0) return;
    if (u.moved) return;
    if (u.garrisoned) return;

    const occupied = occupiedHexes(state.units, unitId);
    const path = findPath(this.map, u, to, occupied);
    if (!path || path.length === 0) return;

    u.pos = to;
    u.moved = true;
    // Moving reveals and breaks concealment naturally (position changed).
    effects.push({ kind: 'move', unitId, path });
    this.log(state, seat, `${unitDef(u.defId).name} repositioned.`, 'info');
  }

  // -------------------------------------------------------------------------
  // Attack
  // -------------------------------------------------------------------------
  private doAttack(state: GameState, seat: Seat, attackerId: string, targetId: string, effects: Effect[]): void {
    const attacker = state.units.find((x) => x.id === attackerId);
    const target = state.units.find((x) => x.id === targetId);
    if (!attacker || !target) return;
    if (attacker.owner !== seat || target.owner === seat) return;

    const los = hasLineOfSight(this.map, attacker.pos, target.pos);
    const check = canAttack(this.map, attacker, target, los);
    if (!check.ok) {
      this.log(state, seat, `Cannot fire: ${check.reason}.`, 'info');
      return;
    }

    const result = computeDamage(this.map, attacker, target, this.rng);
    target.hp -= result.damage;
    attacker.attacked = true;

    // Counterattack if target survives and can retaliate.
    let counter = 0;
    if (target.hp > 0) {
      counter = counterDamage(this.map, attacker, target);
      attacker.hp -= counter;
    }

    const killed = target.hp <= 0;
    effects.push({
      kind: 'attack',
      attackerId,
      targetId,
      damage: result.damage,
      counter,
      killed,
      at: { ...target.pos },
    });
    this.log(
      state,
      seat,
      `${unitDef(attacker.defId).name} hits ${unitDef(target.defId).name} for ${result.damage}${killed ? ' — DESTROYED' : ''}.`,
      'combat',
    );

    // Award XP for a kill.
    if (killed) {
      const killer = state.players[attacker.owner];
      killer.generalXp += XP_PER_KILL;
      target.hp = 0;
      effects.push({ kind: 'destroyed', unitId: target.id, at: { ...target.pos } });
    }
    if (attacker.hp <= 0) {
      effects.push({ kind: 'destroyed', unitId: attacker.id, at: { ...attacker.pos } });
      state.players[target.owner].generalXp += XP_PER_KILL;
    }

    // Clean up dead units.
    state.units = state.units.filter((x) => x.hp > 0);
  }

  // -------------------------------------------------------------------------
  // Capture
  // -------------------------------------------------------------------------
  private doCapture(state: GameState, seat: Seat, unitId: string, nodeId: string, effects: Effect[]): void {
    const u = state.units.find((x) => x.id === unitId);
    const node = state.nodes.find((n) => n.id === nodeId);
    if (!u || !node) return;
    if (u.owner !== seat) return;
    if (!canCapture(u)) {
      this.log(state, seat, `${unitDef(u.defId).name} cannot capture.`, 'info');
      return;
    }
    if (hexDistance(u.pos, node.pos) > 0) return; // must be on the node
    if (node.owner === seat) return;

    node.owner = seat;
    node.captureProgress = 1;
    u.moved = true;
    effects.push({ kind: 'capture', unitId, nodeId, owner: seat });
    this.log(state, seat, `${terrainOf(node.terrain).name} captured! +${terrainOf(node.terrain).income} supplies/turn.`, 'capture');
  }

  // -------------------------------------------------------------------------
  // Build (production queue)
  // -------------------------------------------------------------------------
  private doBuild(state: GameState, seat: Seat, unitDefId: string, effects: Effect[]): void {
    void effects;
    const player = state.players[seat];
    const def = unitDef(unitDefId);
    if (def.faction !== player.faction) return;
    if (player.supplies < def.cost) {
      this.log(state, seat, 'Insufficient supplies.', 'info');
      return;
    }
    if (player.commandPoints < def.commandCost) {
      this.log(state, seat, 'Insufficient command points.', 'info');
      return;
    }
    player.supplies -= def.cost;
    player.commandPoints -= def.commandCost;
    const item: ProductionItem = {
      id: `p_${seat}_${state.production.length}_${state.turn}`,
      owner: seat,
      unitDefId,
      turnsRemaining: def.buildTurns,
    };
    state.production.push(item);
    this.log(state, seat, `${def.name} queued (${def.buildTurns} turns).`, 'info');
  }

  /** Deploy finished production near the seat's spawn. */
  private deployProduction(state: GameState, seat: Seat, effects: Effect[]): void {
    const spawn = this.map.spawns[seat];
    for (const item of state.production.filter((p) => p.owner === seat && p.turnsRemaining <= 0)) {
      // Find a free adjacent hex.
      let placed: HexCoord | null = null;
      const occupied = occupiedHexes(state.units);
      for (const cand of this.freeHexesAround(spawn, occupied)) {
        const terrainId = this.map.tiles.get(hexKey(cand));
        if (terrainId && isFinite(terrainOf(terrainId).moveCost)) {
          placed = cand;
          break;
        }
      }
      if (!placed) continue; // no room; retry next turn
      const unit = this.makeUnit(item.unitDefId, state.players[seat].faction, seat, placed, `u${seat}_${item.id}`);
      state.units.push(unit);
      effects.push({ kind: 'deploy', unitId: unit.id, at: placed });
      this.log(state, seat, `${unitDef(item.unitDefId).name} deployed.`, 'info');
    }
    state.production = state.production.filter((p) => p.owner !== seat || p.turnsRemaining > 0);
  }

  private freeHexesAround(center: HexCoord, occupied: Set<string>): HexCoord[] {
    const out: HexCoord[] = [];
    for (const n of hexNeighbors(center)) {
      const k = hexKey(n);
      if (this.map.tiles.has(k) && !occupied.has(k)) out.push(n);
    }
    return out;
  }

  // -------------------------------------------------------------------------
  // General Powers
  // -------------------------------------------------------------------------
  private doUsePower(
    state: GameState,
    seat: Seat,
    powerId: PowerId,
    at: HexCoord | undefined,
    targetId: string | undefined,
    effects: Effect[],
  ): void {
    const player = state.players[seat];
    const def = powerDef(powerId);
    if (!powersForXp(player.generalXp).find((p) => p.id === powerId)) {
      this.log(state, seat, `${def.name} not yet unlocked.`, 'info');
      return;
    }
    if ((player.powerCooldowns[powerId] ?? 0) > 0) {
      this.log(state, seat, `${def.name} on cooldown.`, 'info');
      return;
    }
    if (player.commandPoints < def.cost) {
      this.log(state, seat, 'Insufficient command points.', 'info');
      return;
    }

    player.commandPoints -= def.cost;
    player.powerCooldowns[powerId] = def.cooldown;

    const center = at ?? state.units.find((u) => u.id === targetId)?.pos;
    if (!center) {
      // Refund if no valid target.
      player.commandPoints += def.cost;
      delete player.powerCooldowns[powerId];
      return;
    }

    const affected = this.applyPowerEffect(state, seat, powerId, center, effects);
    effects.push({ kind: 'power', powerId, at: center, affected });
    this.log(state, seat, `${def.name} executed.`, 'power');
  }

  private applyPowerEffect(
    state: GameState,
    seat: Seat,
    powerId: PowerId,
    center: HexCoord,
    effects: Effect[],
  ): string[] {
    const def = powerDef(powerId);
    const affected: string[] = [];

    switch (powerId) {
      case 'airstrike': {
        const targets = enemyUnitsInRadius(state.units, seat, center, def.radius);
        for (const t of targets) {
          const dmg = 140;
          t.hp -= dmg;
          affected.push(t.id);
          effects.push({ kind: 'attack', attackerId: 'power', targetId: t.id, damage: dmg, counter: 0, killed: t.hp <= 0, at: { ...t.pos } });
          if (t.hp <= 0) {
            effects.push({ kind: 'destroyed', unitId: t.id, at: { ...t.pos } });
            state.players[seat].generalXp += XP_PER_KILL;
          }
        }
        break;
      }
      case 'artilleryBarrage': {
        const targets = enemyUnitsInRadius(state.units, seat, center, def.radius);
        for (const t of targets) {
          const def2 = unitDef(t.defId);
          const mult = def2.cls === 'infantry' || def2.cls === 'lightArmor' ? 1.5 : 0.8;
          const dmg = Math.round(110 * mult);
          t.hp -= dmg;
          affected.push(t.id);
          effects.push({ kind: 'attack', attackerId: 'power', targetId: t.id, damage: dmg, counter: 0, killed: t.hp <= 0, at: { ...t.pos } });
          if (t.hp <= 0) {
            effects.push({ kind: 'destroyed', unitId: t.id, at: { ...t.pos } });
            state.players[seat].generalXp += XP_PER_KILL;
          }
        }
        break;
      }
      case 'empBlast': {
        const targets = enemyUnitsInRadius(state.units, seat, center, def.radius);
        for (const t of targets) {
          // Mark as "disrupted": skip next activation by setting moved+attacked.
          t.moved = true;
          t.attacked = true;
          affected.push(t.id);
        }
        break;
      }
      case 'supplyDrop': {
        state.players[seat].supplies += 300;
        break;
      }
      case 'reconSweep': {
        // Reveal the area for the player (temporary explore).
        for (const h of visionHexes(this.map, center, def.radius)) {
          state.explored[seat][hexKey(h)] = true;
          state.visibility[seat][hexKey(h)] = true;
        }
        break;
      }
      case 'repairField': {
        const friendlies = state.units.filter(
          (u) => u.owner === seat && hexDistance(u.pos, center) <= def.radius,
        );
        for (const f of friendlies) {
          f.hp = Math.min(unitDef(f.defId).maxHp, f.hp + 80);
          affected.push(f.id);
        }
        break;
      }
    }

    state.units = state.units.filter((u) => u.hp > 0);
    return affected;
  }

  // -------------------------------------------------------------------------
  // Turn flow
  // -------------------------------------------------------------------------
  private doEndTurn(state: GameState, effects: Effect[]): void {
    const prevSeat = state.activeSeat;

    // Tick cooldowns for the seat that just finished.
    this.tickCooldowns(state, prevSeat);

    const nextSeat: Seat = prevSeat === 0 ? 1 : 0;

    // If we've come back around to seat 0, increment the global turn counter.
    if (nextSeat === 0) state.turn++;

    // Start-of-turn for the new active seat: income, ready units, production.
    state.activeSeat = nextSeat;
    const player = state.players[nextSeat];

    if (!player.defeated) {
      // Ready all of this seat's units.
      for (const u of state.units) {
        if (u.owner === nextSeat) {
          u.moved = false;
          u.attacked = false;
        }
      }
      // Advance production.
      for (const item of state.production) {
        if (item.owner === nextSeat) item.turnsRemaining--;
      }
      // Income.
      const before = { s: player.supplies, c: player.commandPoints };
      const updated = applyIncome(player, state.nodes);
      state.players[nextSeat] = updated;
      const income = { supplies: updated.supplies - before.s, command: updated.commandPoints - before.c };
      effects.push({ kind: 'turnStart', seat: nextSeat, income });
      this.log(state, nextSeat, `Turn ${state.turn} — +${income.supplies} supplies, +${income.command} CP.`, 'system');

      // Deploy any finished units.
      this.deployProduction(state, nextSeat, effects);
    }
  }

  private tickCooldowns(state: GameState, seat: Seat): void {
    const player = state.players[seat];
    for (const key of Object.keys(player.powerCooldowns) as PowerId[]) {
      const v = player.powerCooldowns[key] ?? 0;
      if (v > 0) player.powerCooldowns[key] = v - 1;
      else delete player.powerCooldowns[key];
    }
  }

  // -------------------------------------------------------------------------
  // Victory
  // -------------------------------------------------------------------------
  private checkVictory(state: GameState, effects: Effect[]): void {
    if (state.status === 'finished') return;

    const p0Alive = state.units.some((u) => u.owner === 0) || state.production.some((p) => p.owner === 0);
    const p1Alive = state.units.some((u) => u.owner === 1) || state.production.some((p) => p.owner === 1);

    let winner: Seat | null = null;
    if (!p0Alive && !p1Alive) winner = null;
    else if (!p0Alive) winner = 1;
    else if (!p1Alive) winner = 0;

    if (winner !== null) {
      state.status = 'finished';
      state.winner = winner;
      state.players[winner].generalXp += XP_PER_WIN;
      effects.push({ kind: 'victory', winner });
      this.log(state, winner, `Seat ${winner} wins the engagement!`, 'system');
    }
  }

  // -------------------------------------------------------------------------
  // Query helpers for UI/AI
  // -------------------------------------------------------------------------
  /** Hexes a unit can move to (for move overlay). */
  moveRange(state: GameState, unitId: string): Map<string, number> {
    const u = state.units.find((x) => x.id === unitId);
    if (!u || u.moved) return new Map();
    const occupied = occupiedHexes(state.units, unitId);
    return reachableHexes(this.map, u, occupied);
  }

  /** Enemy units a unit could attack from its current position. */
  attackableFrom(state: GameState, unitId: string): Unit[] {
    const u = state.units.find((x) => x.id === unitId);
    if (!u || u.attacked) return [];
    return state.units.filter((t) => {
      if (t.owner === u.owner || t.hp <= 0) return false;
      const los = hasLineOfSight(this.map, u.pos, t.pos);
      return canAttack(this.map, u, t, los).ok;
    });
  }

  nodeControl(state: GameState) {
    return nodeControl(state.nodes);
  }
}