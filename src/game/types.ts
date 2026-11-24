// ============================================================================
// WAR ROOM TACTICS — Core Domain Types
// Shared across engine, renderer, AI and networking. Keep this file pure
// (no runtime side-effects) so it can be imported anywhere.
// ============================================================================

/** The three asymmetric factions. */
export type FactionId = 'coalition' | 'syndicate' | 'insurgent';

/** A point in the local player's seat (0 or 1). */
export type Seat = 0 | 1;

/** Axial hex coordinates (pointy-top hexes). */
export interface HexCoord {
  q: number;
  r: number;
}

/** Square-grid / canvas pixel-ish position (used for picking & rendering). */
export interface Vec2 {
  x: number;
  y: number;
}

// ---------------------------------------------------------------------------
// Terrain
// ---------------------------------------------------------------------------
export type TerrainId =
  | 'plains'
  | 'forest'
  | 'hills'
  | 'urban'
  | 'water'
  | 'road'
  | 'supplyDepot'
  | 'oilDerrick';

export interface TerrainDef {
  id: TerrainId;
  name: string;
  /** Movement cost multiplier applied to a unit's base movement. */
  moveCost: number;
  /** Multiplier on incoming damage when standing here (defense). */
  defense: number;
  /** Bonus vision radius granted by this tile. */
  visionBonus: number;
  /** Bonus attack range granted by this tile. */
  rangeBonus: number;
  /** Concealment: hidden unless an enemy is within this range. */
  concealmentRange: number;
  /** Blocks line of sight entirely (e.g. tall urban). */
  blocksLos: boolean;
  /** Capturable structure? */
  capturable: boolean;
  /** Supplies generated per turn when owned. */
  income: number;
  /** Command points generated per turn when owned. */
  commandIncome: number;
  /** Base fill color. */
  color: string;
  /** Accent / overlay color. */
  accent: string;
}

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------
export type UnitClass = 'infantry' | 'lightArmor' | 'heavyArmor' | 'artillery' | 'air';

export interface UnitDef {
  id: string;
  faction: FactionId;
  name: string;
  cls: UnitClass;
  cost: number; // supplies
  commandCost: number; // command points to deploy (usually 0)
  buildTurns: number;
  maxHp: number;
  attack: number;
  armor: number; // flat damage reduction
  range: number; // in hexes
  minRange: number; // artillery can't hit adjacent
  movement: number; // hexes per turn
  vision: number; // hexes
  /** Can traverse / benefits. e.g. air ignores terrain. */
  ignoresTerrain: boolean;
  /** Can capture structures. */
  canCapture: boolean;
  /** Can garrison urban tiles. */
  canGarrison: boolean;
  /** Bonus damage multiplier vs a given unit class (asymmetric matchups). */
  bonuses: Partial<Record<UnitClass, number>>;
  description: string;
}

/** A unit instance on the board. */
export interface Unit {
  id: string;
  defId: string;
  faction: FactionId;
  owner: Seat;
  pos: HexCoord;
  hp: number;
  /** Has this unit moved / attacked this turn? */
  moved: boolean;
  attacked: boolean;
  /** Garrisoned in an urban tile (defense bonus, can't move until ungarrisoned). */
  garrisoned: boolean;
  /** Stance affects behavior. */
  stance: UnitStance;
}

export type UnitStance = 'aggressive' | 'defensive' | 'hold';

// ---------------------------------------------------------------------------
// General Powers
// ---------------------------------------------------------------------------
export type PowerId =
  | 'airstrike'
  | 'empBlast'
  | 'supplyDrop'
  | 'artilleryBarrage'
  | 'reconSweep'
  | 'repairField';

export interface PowerDef {
  id: PowerId;
  name: string;
  cost: number; // command points
  cooldown: number; // turns
  unlockAt: number; // general experience required
  radius: number; // effect radius in hexes
  description: string;
  targetType: 'ground' | 'unit' | 'none';
}

// ---------------------------------------------------------------------------
// Match / state
// ---------------------------------------------------------------------------
export type GameMode = 'skirmish' | 'online';
export type Difficulty = 'skirmish' | 'veteran' | 'brutal';

export interface PlayerState {
  seat: Seat;
  faction: FactionId;
  name: string;
  isAI: boolean;
  supplies: number;
  commandPoints: number;
  generalXp: number;
  /** Cooldowns keyed by power id -> turns remaining. */
  powerCooldowns: Partial<Record<PowerId, number>>;
  defeated: boolean;
}

/** A node on the map (capturable structure). */
export interface ResourceNode {
  id: string;
  pos: HexCoord;
  terrain: TerrainId;
  owner: Seat | null;
  /** Progress toward capture [0..1] while being captured. */
  captureProgress: number;
}

export type TurnPhase = 'player' | 'enemy' | 'gameover';

export interface GameState {
  matchId: string;
  mode: GameMode;
  difficulty: Difficulty;
  turn: number; // round counter
  activeSeat: Seat;
  players: [PlayerState, PlayerState];
  /** Units on the board. */
  units: Unit[];
  /** Resource nodes. */
  nodes: ResourceNode[];
  /** Per-seat fog-of-war visibility cache: "q,r" -> visible boolean. */
  visibility: [Record<string, boolean>, Record<string, boolean>];
  /** Explored tiles (ever seen) per seat. */
  explored: [Record<string, boolean>, Record<string, boolean>];
  /** Selected unit id (UI). */
  selectedUnitId: string | null;
  /** Hex under cursor (UI). */
  hoveredHex: HexCoord | null;
  log: LogEntry[];
  /** victory conditions etc. */
  status: 'active' | 'finished';
  winner: Seat | null;
  /** Production queue (base builds). */
  production: ProductionItem[];
}

export interface ProductionItem {
  id: string;
  owner: Seat;
  unitDefId: string;
  turnsRemaining: number;
}

export interface LogEntry {
  turn: number;
  seat: Seat | null;
  message: string;
  kind: 'info' | 'combat' | 'capture' | 'power' | 'system';
}

export type GameAction =
  | { type: 'select'; unitId: string | null }
  | { type: 'move'; unitId: string; to: HexCoord }
  | { type: 'attack'; attackerId: string; targetId: string }
  | { type: 'capture'; unitId: string; nodeId: string }
  | { type: 'endTurn' }
  | { type: 'usePower'; powerId: PowerId; at?: HexCoord; targetId?: string }
  | { type: 'build'; unitDefId: string }
  | { type: 'setStance'; unitId: string; stance: UnitStance };