// ============================================================================
// Multiplayer protocol — shared event names + payload types used by BOTH the
// authoritative Socket.IO server (server/index.ts) and the browser client
// (src/net/*). Keeping these in one place prevents drift between the two ends.
//
// The server is authoritative: it owns the canonical GameState and runs the
// shared Engine reducer. Clients only send *intents* (GameActions) and render
// the state the server broadcasts back.
// ============================================================================
import type { FactionId, GameState, GameAction } from '../game/types';
import type { Effect } from '../game/engine/Engine';

/** A seat's lobby presence. */
export interface LobbyPlayer {
  seat: 0 | 1;
  name: string;
  faction: FactionId;
  connected: boolean;
}

/** Snapshot of a room's lobby (pre-match). */
export interface LobbySnapshot {
  code: string;
  hostSeat: 0 | 1;
  players: (LobbyPlayer | null)[]; // index = seat
}

// --- Client → Server -------------------------------------------------------
export interface ClientToServerEvents {
  'room:create': (data: { name: string }) => void;
  'room:join': (data: { code: string; name: string }) => void;
  'faction:pick': (data: { faction: FactionId }) => void;
  'game:start': () => void;
  'game:action': (data: { action: GameAction }) => void;
  'game:rematch': () => void;
  'room:leave': () => void;
}

// --- Server → Client -------------------------------------------------------
export interface ServerToClientEvents {
  'room:created': (data: { code: string; seat: 0 | 1 }) => void;
  'room:joined': (data: { code: string; seat: 0 | 1 }) => void;
  'room:error': (data: { message: string }) => void;
  'lobby:update': (data: LobbySnapshot) => void;
  'opponent:left': () => void;
  /** Match begins: full authoritative state + the seed so the client can
   *  reconstruct the identical board map locally for rendering. */
  'game:started': (data: {
    state: GameState;
    yourSeat: 0 | 1;
    seed: number;
    radius: number;
  }) => void;
  /** Authoritative state after any action, with effects for client playback. */
  'game:state': (data: { state: GameState; effects: Effect[] }) => void;
}

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  socketId: string;
  roomCode: string | null;
  seat: 0 | 1 | null;
}