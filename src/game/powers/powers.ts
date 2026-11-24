// ============================================================================
// General Powers — tactical abilities unlocked via combat experience (XP).
// Paid for with Command Points, subject to per-power cooldowns.
// Effects are applied by the engine (combat/powers resolver); here is data only.
// ============================================================================
import type { PowerDef, PowerId } from '../types';

export const POWERS: Record<PowerId, PowerDef> = {
  airstrike: {
    id: 'airstrike',
    name: 'Airstrike',
    cost: 4,
    cooldown: 3,
    unlockAt: 0,
    radius: 1,
    description: 'Call a precision bombing run on a target area. Heavy damage to all units in radius.',
    targetType: 'ground',
  },
  empBlast: {
    id: 'empBlast',
    name: 'EMP Blast',
    cost: 3,
    cooldown: 4,
    unlockAt: 50,
    radius: 2,
    description: 'Electromagnetic pulse disables enemy units in the area for a turn (skip their next activation).',
    targetType: 'ground',
  },
  supplyDrop: {
    id: 'supplyDrop',
    name: 'Supply Drop',
    cost: 2,
    cooldown: 3,
    unlockAt: 0,
    radius: 0,
    description: 'Airdrop supplies at a target location: instantly gain supplies.',
    targetType: 'ground',
  },
  artilleryBarrage: {
    id: 'artilleryBarrage',
    name: 'Artillery Barrage',
    cost: 5,
    cooldown: 4,
    unlockAt: 100,
    radius: 2,
    description: 'Saturation bombardment over a wide area. Devastating vs infantry & light armor.',
    targetType: 'ground',
  },
  reconSweep: {
    id: 'reconSweep',
    name: 'Recon Sweep',
    cost: 2,
    cooldown: 2,
    unlockAt: 0,
    radius: 4,
    description: 'Recon aircraft reveal a large area of the map for several turns.',
    targetType: 'ground',
  },
  repairField: {
    id: 'repairField',
    name: 'Repair Field',
    cost: 3,
    cooldown: 4,
    unlockAt: 150,
    radius: 1,
    description: 'Deploy a repair zone that heals friendly units in the area each turn.',
    targetType: 'ground',
  },
};

export const POWER_LIST: PowerDef[] = Object.values(POWERS);

export const powerDef = (id: PowerId): PowerDef => POWERS[id];

/** Powers available to a general at a given XP level. */
export const powersForXp = (xp: number): PowerDef[] =>
  POWER_LIST.filter((p) => p.unlockAt <= xp);

/** XP thresholds for general ranks. */
export const RANKS = [
  { name: 'Recruit', xp: 0 },
  { name: 'Corporal', xp: 50 },
  { name: 'Sergeant', xp: 100 },
  { name: 'Lieutenant', xp: 150 },
  { name: 'Captain', xp: 250 },
  { name: 'Major', xp: 400 },
  { name: 'General', xp: 600 },
] as const;

export const rankForXp = (xp: number): string => {
  let rank = RANKS[0].name as string;
  for (const r of RANKS) if (xp >= r.xp) rank = r.name;
  return rank;
};