// ============================================================================
// Phase 5 end-to-end multiplayer test. Spins up the REAL authoritative server
// on an ephemeral port, connects two socket.io clients, and verifies:
//   - room create/join with 4-letter codes
//   - lobby updates propagate to both seats
//   - host-only start gating
//   - match start sends full state + per-seat perspective + seed
//   - only the active seat's actions are accepted (server authority)
//   - state broadcasts stay in sync across both clients
//   - disconnect handling
// ============================================================================
import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { io as ioc, type Socket } from 'socket.io-client';
import type { GameState } from '../src/game/types';
import type { GameAction } from '../src/game/types';

let passed = 0;
let failed = 0;
const fails: string[] = [];
function ok(cond: boolean, msg: string): void {
  if (cond) passed++;
  else {
    failed++;
    fails.push(msg);
    console.error(`  \u2717 ${msg}`);
  }
}
function section(n: string): void {
  console.log(`\n== ${n} ==`);
}

const PORT = 8099 + Math.floor(Math.random() * 200);
const URL = `http://127.0.0.1:${PORT}`;

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForLobby<T>(fn: () => T | undefined, timeoutMs = 3000): Promise<T | undefined> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const v = fn();
    if (v) return v;
    await wait(25);
  }
  return undefined;
}

function connectClient(): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = ioc(URL, { transports: ['websocket'], forceNew: true });
    s.on('connect', () => resolve(s));
    s.on('connect_error', (e) => reject(e));
    setTimeout(() => reject(new Error('connect timeout')), 5000);
  });
}

// One-shot emit that resolves on the matching ack event.
function once<T>(s: Socket, event: string): Promise<T> {
  return new Promise((resolve) => s.once(event, (payload: T) => resolve(payload)));
}

async function main() {
  // --- Boot the server ----------------------------------------------------
  section('Server boots');
  // Resolve the tsx CLI entry so we can run the TS server via plain node.
  const require = createRequire(import.meta.url);
  const tsxCli = require.resolve('tsx/cli');
  const server: ChildProcess = spawn(
    process.execPath, // node
    [tsxCli, 'server/index.ts'],
    {
      cwd: process.cwd(),
      env: { ...process.env, PORT: String(PORT), SERVE_DIST: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  server.stdout?.on('data', () => {});
  server.stderr?.on('data', (d) => console.error('[server]', d.toString().trim()));

  // Health check.
  try {
    let healthOk = false;
    for (let i = 0; i < 40 && !healthOk; i++) {
      try {
        const r = await fetch(`${URL}/health`);
        healthOk = r.ok;
      } catch {
        await wait(75);
      }
    }
    ok(healthOk, 'server /health is reachable');
  } catch {
    ok(false, 'server became reachable');
  }

  try {
    // --- Two clients connect ---------------------------------------------
    section('Clients connect');
    const a = await connectClient();
    const b = await connectClient();
    ok(a.connected && b.connected, 'both clients connected');

    // --- Host creates a room ---------------------------------------------
    section('Room create');
    const createdP = once<{ code: string; seat: number }>(a, 'room:created');
    a.emit('room:create', { name: 'Alpha' });
    const created = await createdP;
    ok(/^[A-Z]{4}$/.test(created.code), `room code is 4 letters (${created.code})`);
    ok(created.seat === 0, 'host is seat 0');

    const code = created.code;

    // --- Guest joins ------------------------------------------------------
    section('Room join');
    const joinedP = once<{ code: string; seat: number }>(b, 'room:joined');
    // Collect lobby updates on the host until both seats are connected.
    const lobbyUpdates: any[] = [];
    const lobbyListener = (snap: any) => lobbyUpdates.push(snap);
    a.on('lobby:update', lobbyListener);
    b.emit('room:join', { code: code.toLowerCase(), name: 'Bravo' });
    const joined = await joinedP;
    ok(joined.seat === 1, 'guest is seat 1');
    // Wait for a lobby snapshot showing both seats connected.
    const bothConnected = await waitForLobby(() =>
      lobbyUpdates.find((s) => s.players[0]?.connected && s.players[1]?.connected),
    );
    a.off('lobby:update', lobbyListener);
    ok(!!bothConnected, 'host sees both players connected');

    // --- Start gating: guest cannot start --------------------------------
    section('Start gating');
    let guestStartErr: { message: string } | null = null;
    b.once('room:error', (e) => (guestStartErr = e));
    b.emit('game:start');
    await wait(150);
    ok(guestStartErr !== null, 'guest is rejected from starting the match');

    // --- Host starts the match -------------------------------------------
    section('Match start');
    const startA = once<any>(a, 'game:started');
    const startB = once<any>(b, 'game:started');
    a.emit('game:start');
    const [sA, sB] = await Promise.all([startA, startB]);
    ok(sA.yourSeat === 0, 'host receives yourSeat=0');
    ok(sB.yourSeat === 1, 'guest receives yourSeat=1');
    ok(typeof sA.seed === 'number' && sA.radius === 7, 'seed + radius provided for map rebuild');
    ok(sA.state && sA.state.matchId, 'full authoritative state delivered');

    let stateA: GameState = sA.state;
    let stateB: GameState = sB.state;
    ok(stateA.units.length > 0 && stateB.units.length > 0, 'both seats have starting units');

    // --- Turn enforcement: guest (seat1) cannot act on seat0's turn ------
    section('Server authority');
    const stateP = once<{ state: GameState; effects: unknown[] }>(a, 'game:state');
    // Guest tries to end turn out of order — should be ignored (no broadcast).
    let gotState = false;
    const stateP2 = once<{ state: GameState }>(b, 'game:state');
    b.emit('game:action', { action: { type: 'endTurn' } });
    const ignored = await Promise.race([stateP2.then(() => 'state'), wait(300).then(() => 'ignored')]);
    ok(ignored === 'ignored', 'out-of-turn action is rejected by server (no broadcast)');
    void stateP;

    // Host performs a legal action (end turn) and both clients sync.
    const aState = once<{ state: GameState }>(a, 'game:state');
    const bState = once<{ state: GameState }>(b, 'game:state');
    const endTurn: GameAction = { type: 'endTurn' };
    a.emit('game:action', { action: endTurn });
    const [aS, bS] = await Promise.all([aState, bState]);
    stateA = aS.state;
    stateB = bS.state;
    ok(stateA.activeSeat === 1, 'after host endTurn, active seat is 1');
    ok(JSON.stringify(stateA.units) === JSON.stringify(stateB.units), 'both clients see identical state');

    // Now guest can act: move one of its units if possible, else end turn.
    const guestState = once<{ state: GameState }>(a, 'game:state');
    const guestStateB = once<{ state: GameState }>(b, 'game:state');
    b.emit('game:action', { action: { type: 'endTurn' } });
    const [gA, gB] = await Promise.all([guestState, guestStateB]);
    stateA = gA.state;
    stateB = gB.state;
    ok(stateA.activeSeat === 0, 'after guest endTurn, active seat returns to 0');
    ok(JSON.stringify(stateA.units) === JSON.stringify(stateB.units), 'state stays in sync across seats');

    // --- Bad room join ---------------------------------------------------
    section('Error handling');
    let joinErr: { message: string } | null = null;
    const c = await connectClient();
    c.once('room:error', (e) => (joinErr = e));
    c.emit('room:join', { code: 'ZZZZ', name: 'Ghost' });
    await wait(150);
    ok(joinErr !== null && /not found/i.test(joinErr!.message), 'joining a missing room yields an error');

    // --- Disconnect ------------------------------------------------------
    section('Disconnect');
    let oppLeft = false;
    a.once('opponent:left', () => (oppLeft = true));
    b.disconnect();
    await wait(200);
    ok(oppLeft, 'remaining seat is notified when opponent leaves');

    a.disconnect();
    c.disconnect();
  } finally {
    server.kill('SIGTERM');
    await wait(100);
  }

  console.log(`\n== RESULT: ${passed} passed, ${failed} failed ==`);
  if (failed > 0) {
    console.log('\nFailures:');
    for (const f of fails) console.log(`  - ${f}`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});