// ============================================================================
// Authoritative multiplayer server (Socket.IO).
//
// Runs the SAME Engine reducer the client/AI use, so every action a player
// sends is validated server-side before it mutates the canonical GameState.
// Clients are thin: they send intents, the server decides the truth and
// broadcasts the resulting state + effects back to both seats.
//
// Rooms use 4-letter shareable codes. Seat 0 is the host. A match begins when
// the host fires `game:start` with both seats connected.
//
// Run with:  npm run server   (tsx server/index.ts)
// In production this can serve the built client too (see SERVE_DIST below).
// ============================================================================
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { Server } from 'socket.io';
import { Engine } from '../src/game/engine/Engine';
import type {
  GameState,
  Seat,
} from '../src/game/types';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
  LobbySnapshot,
  LobbyPlayer,
} from '../src/net/protocol';

const PORT = Number(process.env.PORT) || 8080;
const MAP_RADIUS = 7;

interface Room {
  code: string;
  hostSeat: Seat;
  /** Per-seat lobby player (null = empty seat). */
  players: [LobbyPlayer | null, LobbyPlayer | null];
  /** Socket ids keyed by seat. */
  sockets: [string | null, string | null];
  engine: Engine | null;
  state: GameState | null;
  seed: number;
  started: boolean;
}

const rooms = new Map<string, Room>();
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no easily-confused chars

function makeRoomCode(): string {
  for (let attempt = 0; attempt < 1000; attempt++) {
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
    if (!rooms.has(code)) return code;
  }
  // Astronomically unlikely; fall back to a longer suffix.
  return Math.random().toString(36).slice(2, 6).toUpperCase();
}

function newSeed(): number {
  return (Math.floor(Math.random() * 0xffffff) ^ Date.now()) & 0xffffff || 1;
}

function broadcastLobby(code: string): void {
  const room = rooms.get(code);
  if (!room) return;
  const snap: LobbySnapshot = {
    code: room.code,
    hostSeat: room.hostSeat,
    players: room.players,
  };
  io.to(code).emit('lobby:update', snap);
}

// ---------------------------------------------------------------------------
// HTTP + Socket.IO server. Optionally serves the built PWA from /dist.
// ---------------------------------------------------------------------------
const httpServer = createServer((req, res) => {
  // Lightweight health check.
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }

  const SERVE_DIST = process.env.SERVE_DIST === '1';
  const distDir = resolve(process.cwd(), 'dist');
  if (SERVE_DIST && existsSync(distDir)) {
    let urlPath = (req.url || '/').split('?')[0];
    if (urlPath === '/') urlPath = '/index.html';
    // Prevent path traversal.
    const filePath = join(distDir, urlPath.replace(/^\/+/, ''));
    if (filePath.startsWith(distDir) && existsSync(filePath)) {
      res.writeHead(200);
      res.end(readFileSafe(filePath));
      return;
    }
    // SPA fallback.
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(readFileSafe(join(distDir, 'index.html')));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

// Tiny sync file reader (avoid extra fs import surface).
import { readFileSync } from 'node:fs';
function readFileSafe(p: string): Buffer {
  try {
    return readFileSync(p);
  } catch {
    return Buffer.from('');
  }
}

const io = new Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function findRoomForSocket(socketId: string): Room | null {
  for (const room of rooms.values()) {
    if (room.sockets[0] === socketId || room.sockets[1] === socketId) return room;
  }
  return null;
}

function seatForSocket(room: Room, socketId: string): Seat | null {
  if (room.sockets[0] === socketId) return 0;
  if (room.sockets[1] === socketId) return 1;
  return null;
}

function otherSeat(seat: Seat): Seat {
  return seat === 0 ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Connection handling
// ---------------------------------------------------------------------------
io.on('connection', (socket) => {
  socket.data.roomCode = null;
  socket.data.seat = null;
  console.log(`[net] socket connected: ${socket.id}`);

  // --- Create a room ------------------------------------------------------
  socket.on('room:create', ({ name }) => {
    leaveCurrentRoom(socket);
    const code = makeRoomCode();
    const cleanName = sanitizeName(name);
    const room: Room = {
      code,
      hostSeat: 0,
      players: [
        { seat: 0, name: cleanName, faction: 'coalition', connected: true },
        null,
      ],
      sockets: [socket.id, null],
      engine: null,
      state: null,
      seed: newSeed(),
      started: false,
    };
    rooms.set(code, room);
    socket.data.roomCode = code;
    socket.data.seat = 0;
    socket.join(code);
    socket.emit('room:created', { code, seat: 0 });
    broadcastLobby(code);
    console.log(`[net] room ${code} created by ${cleanName}`);
  });

  // --- Join an existing room ---------------------------------------------
  socket.on('room:join', ({ code, name }) => {
    const room = rooms.get((code || '').toUpperCase());
    if (!room) {
      socket.emit('room:error', { message: 'Room not found. Check the code.' });
      return;
    }
    if (room.started) {
      socket.emit('room:error', { message: 'That match has already started.' });
      return;
    }
    const openSeat: Seat | null =
      room.sockets[0] === null ? 0 : room.sockets[1] === null ? 1 : null;
    if (openSeat === null) {
      socket.emit('room:error', { message: 'Room is full.' });
      return;
    }
    leaveCurrentRoom(socket);
    const cleanName = sanitizeName(name);
    room.players[openSeat] = { seat: openSeat, name: cleanName, faction: openSeat === 0 ? 'coalition' : 'syndicate', connected: true };
    room.sockets[openSeat] = socket.id;
    socket.data.roomCode = room.code;
    socket.data.seat = openSeat;
    socket.join(room.code);
    socket.emit('room:joined', { code: room.code, seat: openSeat });
    broadcastLobby(room.code);
    console.log(`[net] ${cleanName} joined room ${room.code} as seat ${openSeat}`);
  });

  // --- Faction pick (lobby only) -----------------------------------------
  socket.on('faction:pick', ({ faction }) => {
    const room = findRoomForSocket(socket.id);
    if (!room) return;
    const seat = seatForSocket(room, socket.id);
    if (seat === null) return;
    if (room.started) return; // locked once the match begins
    const player = room.players[seat];
    if (player) player.faction = faction;
    broadcastLobby(room.code);
  });

  // --- Host starts the match ---------------------------------------------
  socket.on('game:start', () => {
    const room = findRoomForSocket(socket.id);
    if (!room) return;
    const seat = seatForSocket(room, socket.id);
    if (seat !== room.hostSeat) {
      socket.emit('room:error', { message: 'Only the host can start the match.' });
      return;
    }
    if (room.sockets[0] === null || room.sockets[1] === null) {
      socket.emit('room:error', { message: 'Waiting for an opponent to join.' });
      return;
    }
    if (room.started) return;

    const f0 = room.players[0]?.faction ?? 'coalition';
    const f1 = room.players[1]?.faction ?? 'syndicate';
    const engine = new Engine(room.seed, MAP_RADIUS);
    const { state } = engine.newGame({
      faction0: f0,
      faction1: f1,
      mode: 'online',
      difficulty: 'skirmish',
      name0: room.players[0]?.name ?? 'Commander',
      name1: room.players[1]?.name ?? 'Opponent',
    });
    room.engine = engine;
    room.state = state;
    room.started = true;

    // Tell each seat its own perspective + the seed to rebuild the map.
    // (Per-socket emit so each client gets its own yourSeat; no room-wide
    //  generic event, which would race with the per-seat one.)
    for (const s of [0, 1] as Seat[]) {
      const sid = room.sockets[s];
      if (sid) io.to(sid).emit('game:started', { state, yourSeat: s, seed: room.seed, radius: MAP_RADIUS });
    }
    console.log(`[net] match started in room ${room.code} (${f0} vs ${f1})`);
  });

  // --- Authoritative action handling -------------------------------------
  socket.on('game:action', ({ action }) => {
    const room = findRoomForSocket(socket.id);
    if (!room || !room.engine || !room.state) return;
    const seat = seatForSocket(room, socket.id);
    if (seat === null) return;

    const state = room.state;
    // Only the active seat may act; turn order is enforced by the engine.
    if (state.activeSeat !== seat) return; // not your turn — ignore silently
    if (state.status !== 'active') return;

    // Re-validate the action against the live authoritative state.
    const result = room.engine.dispatch(state, action);
    room.state = result.state;

    // Broadcast the new truth + effects to both seats.
    io.to(room.code).emit('game:state', { state: result.state, effects: result.effects });
  });

  // --- Rematch -----------------------------------------------------------
  socket.on('game:rematch', () => {
    const room = findRoomForSocket(socket.id);
    if (!room || !room.engine) return;
    // Only meaningful once a match has finished; reset to a fresh game.
    if (!room.state || room.state.status !== 'finished') return;
    room.seed = newSeed();
    const f0 = room.players[0]?.faction ?? 'coalition';
    const f1 = room.players[1]?.faction ?? 'syndicate';
    const engine = new Engine(room.seed, MAP_RADIUS);
    const { state } = engine.newGame({
      faction0: f0,
      faction1: f1,
      mode: 'online',
      name0: room.players[0]?.name ?? 'Commander',
      name1: room.players[1]?.name ?? 'Opponent',
    });
    room.engine = engine;
    room.state = state;
    for (const s of [0, 1] as Seat[]) {
      const sid = room.sockets[s];
      if (sid) io.to(sid).emit('game:started', { state, yourSeat: s, seed: room.seed, radius: MAP_RADIUS });
    }
  });

  // --- Leave -------------------------------------------------------------
  socket.on('room:leave', () => leaveCurrentRoom(socket));

  socket.on('disconnect', () => {
    console.log(`[net] socket disconnected: ${socket.id}`);
    leaveCurrentRoom(socket);
  });
});

function sanitizeName(name: string | undefined): string {
  const n = (name ?? '').trim().slice(0, 16);
  return n || 'Commander';
}

/** Remove a socket from whatever room it's in, notifying the other seat. */
function leaveCurrentRoom(socket: { id: string; data: SocketData; leave: (r: string) => void }): void {
  const code = socket.data.roomCode;
  if (!code) return;
  const room = rooms.get(code);
  if (room) {
    const seat = seatForSocket(room, socket.id);
    if (seat !== null) {
      room.sockets[seat] = null;
      if (room.players[seat]) room.players[seat]!.connected = false;
      const other = otherSeat(seat);
      const otherSid = room.sockets[other];
      if (otherSid) {
        io.to(otherSid).emit('opponent:left');
        broadcastLobby(code);
      }
      // If the match never started and the room is now empty, clean it up.
      if (!room.started && room.sockets[0] === null && room.sockets[1] === null) {
        rooms.delete(code);
      }
      console.log(`[net] seat ${seat} left room ${code}`);
    }
  }
  socket.leave(code);
  socket.data.roomCode = null;
  socket.data.seat = null;
}

httpServer.listen(PORT, () => {
  console.log(`[net] War Room Tactics server listening on :${PORT}`);
  console.log(`[net] health: http://localhost:${PORT}/health`);
  console.log(`[net] SERVE_DIST=${process.env.SERVE_DIST === '1' ? 'on (serving /dist)' : 'off (API only)'}`);
});