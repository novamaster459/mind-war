// Engine / rules tests — verifies the full match loop headlessly.
import { Engine } from '../src/game/engine/Engine.ts';
import { hexDistance } from '../src/utils/hex.ts';
import { unitDef } from '../src/game/units/units.ts';
import { computeDamage, canAttack, counterDamage } from '../src/game/combat/combat.ts';
import { reachableHexes } from '../src/game/combat/movement.ts';
import { generateMap } from '../src/game/map/generator.ts';
import { hasLineOfSight } from '../src/game/combat/los.ts';
import { seatIncome } from '../src/game/economy/economy.ts';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = '') => {
  if (cond) pass++;
  else { fail++; console.error('  FAIL:', name, extra); }
};

console.log('== New game ==');
const engine = new Engine(12345, 7);
const { state: s0 } = engine.newGame({ faction0: 'coalition', faction1: 'syndicate' });
ok('match active', s0.status === 'active');
ok('two players', s0.players.length === 2);
ok('seat 0 coalition', s0.players[0].faction === 'coalition');
ok('seat 1 syndicate', s0.players[1].faction === 'syndicate');
ok('starting units > 0', s0.units.length >= 4, `units=${s0.units.length}`);
ok('each seat has units', s0.units.some(u => u.owner === 0) && s0.units.some(u => u.owner === 1));
ok('starting supplies', s0.players[0].supplies >= 600);
ok('nodes present', s0.nodes.length === 6);

console.log('== Movement ==');
const mover = s0.units.find(u => u.owner === 0)!;
const range = engine.moveRange(s0, mover.id);
ok('unit has move range', range.size > 0, `range=${range.size}`);
ok('cannot move onto occupied', !range.has(mover.pos.q + ',' + mover.pos.r));

console.log('== Move execution ==');
// Pick a reachable hex and move there.
let target = null, targetKey = null;
for (const k of range.keys()) { target = k; break; }
if (target) {
  const [q, r] = target.split(',').map(Number);
  targetKey = { q, r };
  const res = engine.dispatch(s0, { type: 'move', unitId: mover.id, to: targetKey! });
  const movedUnit = res.state.units.find(u => u.id === mover.id)!;
  ok('unit moved', movedUnit.pos.q === q && movedUnit.pos.r === r);
  ok('unit flagged moved', movedUnit.moved === true);
  ok('move effect emitted', res.effects.some(e => e.kind === 'move'));
}

console.log('== End turn / economy ==');
const before0 = engine.nodeControl(s0);
const res2 = engine.dispatch(s0, { type: 'endTurn' });
ok('turn passed to seat 1', res2.state.activeSeat === 1);
ok('turnStart effect', res2.effects.some(e => e.kind === 'turnStart'));
// Seat 1 got income
ok('seat 1 got command income', res2.state.players[1].commandPoints >= s0.players[1].commandPoints);

console.log('== Combat math ==');
// Two adjacent units, one attacks the other.
const atkDef = unitDef('coa_abrams');
const turretPos = { q: 0, r: 0 };
const tgtUnit = {
  id: 't1', defId: 'syn_conscripts', faction: 'syndicate' as const, owner: 1 as const,
  pos: { q: 1, r: 0 }, hp: 110, moved: false, attacked: false, garrisoned: false, stance: 'aggressive' as const,
};
const atkUnit = {
  id: 'a1', defId: 'coa_abrams', faction: 'coalition' as const, owner: 0 as const,
  pos: { q: 0, r: 0 }, hp: atkDef.maxHp, moved: false, attacked: false, garrisoned: false, stance: 'aggressive' as const,
};
const map = generateMap(12345, 7);
const canShoot = canAttack(map, atkUnit, tgtUnit, true);
ok('adjacent attack legal', canShoot.ok, JSON.stringify(canShoot));

const dmg = computeDamage(map, atkUnit, tgtUnit, () => 0.5);
ok('damage positive', dmg.damage > 0, `dmg=${dmg.damage}`);
ok('damage has breakdown', dmg.breakdown.base === atkDef.attack);
// vs infantry conscript with no bonus (abrams bonuses heavyArmor/lightArmor), base ~110
ok('damage reasonable vs infantry', dmg.damage > 40 && dmg.damage < 200, `dmg=${dmg.damage}`);

// Out of range check
const farTgt = { ...tgtUnit, pos: { q: 5, r: 0 } };
ok('far target out of range', !canAttack(map, atkUnit, farTgt, true).ok);

// Counter damage (target is infantry range 1, attacker at dist 1)
const counter = counterDamage(map, atkUnit, tgtUnit);
ok('counterattack when in range', counter >= 1, `counter=${counter}`);

console.log('== Line of sight ==');
ok('LOS same hex', hasLineOfSight(map, { q: 0, r: 0 }, { q: 0, r: 0 }));
// Find two hexes with an urban blocker between them if possible; else just sanity check symmetry
const losAB = hasLineOfSight(map, { q: -3, r: 0 }, { q: 3, r: 0 });
const losBA = hasLineOfSight(map, { q: 3, r: 0 }, { q: -3, r: 0 });
ok('LOS symmetric', losAB === losBA);

console.log('== Income ==');
const nodes = s0.nodes.map(n => ({ ...n, owner: 0 as const }));
const income = seatIncome(nodes, 0);
ok('owns all nodes -> supply income', income.supplies > 0, `sup=${income.supplies}`);
ok('passive command income', income.command >= 2);

console.log('== Reachability respects budget ==');
const heavy = { ...mover, defId: 'syn_t80', pos: { q: 0, r: 0 } };
const heavyRange = reachableHexes(map, heavy, new Set());
// T-80 moves 2; reachable should be small
ok('heavy has limited range', heavyRange.size <= 40, `range=${heavyRange.size}`);

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail === 0 ? 0 : 1);