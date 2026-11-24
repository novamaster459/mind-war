// Headless logic tests for Phase 2 — verifies the pure game math without a browser.
// Run: node --experimental-strip-types scripts/test-logic.mts  (Node 22.14 supports --experimental-strip-types)
// Or: npx tsx scripts/test-logic.mts
import { generateMap, mapHexes } from '../src/game/map/generator.ts';
import { hexToPixel, pixelToHex, hexDistance, hexCorners, hexKey } from '../src/utils/hex.ts';
import { TERRAIN } from '../src/game/terrain/terrain.ts';
import { mulberry32 } from '../src/utils/rng.ts';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = '') => {
  if (cond) { pass++; }
  else { fail++; console.error('  FAIL:', name, extra); }
};

console.log('== Map generation ==');
const map = generateMap(12345, 7);
ok('map radius', map.radius === 7);
ok('map has tiles', map.tiles.size > 100, `size=${map.tiles.size}`);
ok('map has nodes', map.nodes.length === 6, `nodes=${map.nodes.length}`);
ok('nodes are capturable', map.nodes.every((n) => TERRAIN[n.terrain].capturable));
ok('spawns exist', map.spawns.length === 2);
ok('spawns on board', map.spawns.every((s) => map.tiles.has(hexKey(s))));
ok('deterministic', JSON.stringify(generateMap(12345, 7).tiles) === JSON.stringify(map.tiles));

const hexes = mapHexes(7);
ok('hex count (radius 7 = 169)', hexes.length === 169, `got ${hexes.length}`);

console.log('== Terrain ==');
ok('plains defined', TERRAIN.plains.moveCost === 1);
ok('water impassable', TERRAIN.water.moveCost === Infinity);
ok('urban blocks LoS', TERRAIN.urban.blocksLos === true);
ok('forest conceals', TERRAIN.forest.concealmentRange > 0);
ok('hills give vision', TERRAIN.hills.visionBonus > 0);
ok('supplyDepot income', TERRAIN.supplyDepot.income === 75);

console.log('== Hex math ==');
ok('distance origin->origin', hexDistance({ q: 0, r: 0 }, { q: 0, r: 0 }) === 0);
ok('distance adjacent = 1', hexDistance({ q: 0, r: 0 }, { q: 1, r: 0 }) === 1);
ok('distance across = 4', hexDistance({ q: 0, r: 0 }, { q: 2, r: 2 }) === 4);

// Pixel round-trip
let roundtripOk = true;
const rng = mulberry32(99);
for (let i = 0; i < 500; i++) {
  const h = { q: Math.floor(rng() * 15) - 7, r: Math.floor(rng() * 15) - 7 };
  const p = hexToPixel(h);
  const back = pixelToHex(p.x, p.y);
  if (back.q !== h.q || back.r !== h.r) { roundtripOk = false; break; }
}
ok('pixel round-trip 500 hexes', roundtripOk);

// Corners
const corners = hexCorners({ x: 0, y: 0 }, 34);
ok('hex has 6 corners', corners.length === 6);
ok('corner distance ~ size', Math.abs(Math.hypot(corners[0].x, corners[0].y) - 34) < 0.5);

console.log('== RNG ==');
const a = mulberry32(1), b = mulberry32(1), c = mulberry32(2);
ok('same seed -> same seq', a() === b());
ok('diff seed -> diff seq', mulberry32(1)() !== mulberry32(2)());

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail === 0 ? 0 : 1);