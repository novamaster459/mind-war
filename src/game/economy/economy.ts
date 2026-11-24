// ============================================================================
// Turn economy: supplies & command points. Income is generated at the start of
// each of a seat's turns from owned nodes + a small passive command trickle.
// ============================================================================
import type { BoardMap } from '../map/generator';
import type { PlayerState, ResourceNode, Seat } from '../types';
import { TERRAIN, terrainOf } from '../terrain/terrain';
import { BASE_COMMAND_INCOME, STARTING_COMMAND, STARTING_SUPPLIES } from '../constants';

/** Compute per-turn income for a seat from its owned nodes. */
export function seatIncome(
  nodes: ResourceNode[],
  seat: Seat,
): { supplies: number; command: number } {
  let supplies = 0;
  let command = BASE_COMMAND_INCOME;
  for (const node of nodes) {
    if (node.owner !== seat) continue;
    const def = terrainOf(node.terrain);
    supplies += def.income;
    command += def.commandIncome;
  }
  return { supplies, command };
}

/** Apply start-of-turn income to a player. Returns the new player object. */
export function applyIncome(player: PlayerState, nodes: ResourceNode[]): PlayerState {
  const income = seatIncome(nodes, player.seat);
  return {
    ...player,
    supplies: player.supplies + income.supplies,
    commandPoints: player.commandPoints + income.command,
  };
}

/** Create a fresh player state. */
export function createPlayer(
  seat: Seat,
  faction: PlayerState['faction'],
  name: string,
  isAI: boolean,
): PlayerState {
  return {
    seat,
    faction,
    name,
    isAI,
    supplies: STARTING_SUPPLIES,
    commandPoints: STARTING_COMMAND,
    generalXp: 0,
    powerCooldowns: {},
    defeated: false,
  };
}

/** Resource income contributed by a specific node. */
export function nodeIncome(node: ResourceNode): { supplies: number; command: number } {
  const def = terrainOf(node.terrain);
  return { supplies: def.income, command: def.commandIncome };
}

/** Total capturable nodes on a map. */
export function capturableNodes(map: BoardMap): ResourceNode[] {
  return map.nodes.filter((n) => terrainOf(n.terrain).capturable);
}

/** Tally how many nodes each seat (and neutral) owns. */
export function nodeControl(nodes: ResourceNode[]): { seat0: number; seat1: number; neutral: number } {
  let seat0 = 0, seat1 = 0, neutral = 0;
  for (const n of nodes) {
    if (n.owner === 0) seat0++;
    else if (n.owner === 1) seat1++;
    else neutral++;
  }
  return { seat0, seat1, neutral };
}

export { STARTING_SUPPLIES, STARTING_COMMAND, TERRAIN };