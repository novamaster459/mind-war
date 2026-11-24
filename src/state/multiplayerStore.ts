// ============================================================================
// Multiplayer store (Zustand). Bridges the authoritative Socket.IO server to
// the UI. For ONLINE matches the client does NOT run the engine — it renders
// the canonical GameState the server broadcasts and sends intents (GameActions)
// that the server validates and applies.
//
// The board MAP is rebuilt locally from the seed the server sends (map gen is
// deterministic), which is all the renderer needs; the authoritative game state
// still comes from the server.
// ============================================================================
import { create } from 'zustand';
import { connectSocket, getSocket, disconnectSocket } from '../net/socket';
import type { LobbySnapshot, LobbyPlayer } from '../net/protocol';
import type { GameState, GameAction, FactionId, Seat } from '../game/types';
import type { Effect } from '../game/engine/Engine';
import { Engine } from '../game/engine/Engine';

export type NetStatus = 'idle' | 'connecting' | 'lobby' | 'playing' | 'error';

interface MultiplayerState {
  status: NetStatus;
  error: string | null;
  /** Our own seat in the current room. */
  mySeat: Seat;
  roomCode: string | null;
  lobby: LobbySnapshot | null;
  /** Authoritative game state (online). */
  game: GameState | null;
  /** Local engine instance used ONLY to rebuild the map for rendering. */
  viewEngine: Engine | null;
  /** Effects from the latest server broadcast (for sound/animation). */
  effects: Effect[];
  pending: Effect[];

  // Actions
  createRoom: (name: string) => void;
  joinRoom: (code: string, name: string) => void;
  pickFaction: (faction: FactionId) => void;
  startMatch: () => void;
  sendAction: (action: GameAction) => void;
  rematch: () => void;
  leave: () => void;
  shiftEffect: () => Effect | undefined;
  clearEffects: () => void;
  /** Internal: wire socket listeners. Called once. */
  bindEvents: () => void;
}

let bound = false;

export const useMultiplayerStore = create<MultiplayerState>((set, get) => ({
  status: 'idle',
  error: null,
  mySeat: 0,
  roomCode: null,
  lobby: null,
  game: null,
  viewEngine: null,
  effects: [],
  pending: [],

  bindEvents: () => {
    if (bound) return;
    bound = true;
    const s = connectSocket();

    s.on('connect', () => {
      set({ status: get().status === 'playing' ? 'playing' : get().lobby ? 'lobby' : 'connecting', error: null });
    });
    s.on('disconnect', () => {
      // If we were mid-match, surface it.
      if (get().status === 'playing') set({ error: 'Disconnected from server.' });
    });
    s.on('room:created', ({ code, seat }) => {
      set({ status: 'lobby', roomCode: code, mySeat: seat, error: null });
    });
    s.on('room:joined', ({ code, seat }) => {
      set({ status: 'lobby', roomCode: code, mySeat: seat, error: null });
    });
    s.on('room:error', ({ message }) => {
      set({ error: message, status: get().game ? 'playing' : 'lobby' });
    });
    s.on('lobby:update', (lobby) => {
      set({ lobby });
    });
    s.on('opponent:left', () => {
      set({ error: 'Your opponent left the match.' });
    });
    s.on('game:started', ({ state, yourSeat, seed, radius }) => {
      // Rebuild the board map locally (deterministic) for the renderer.
      const engine = new Engine(seed, radius);
      set({
        status: 'playing',
        game: state,
        mySeat: yourSeat,
        viewEngine: engine,
        effects: [],
        pending: [],
        error: null,
      });
    });
    s.on('game:state', ({ state, effects }) => {
      set({ game: state, effects, pending: effects });
    });
  },

  createRoom: (name) => {
    const st = get();
    st.bindEvents();
    set({ error: null, status: 'connecting' });
    connectSocket().emit('room:create', { name });
  },

  joinRoom: (code, name) => {
    const st = get();
    st.bindEvents();
    set({ error: null, status: 'connecting' });
    connectSocket().emit('room:join', { code: code.toUpperCase(), name });
  },

  pickFaction: (faction) => {
    getSocket().emit('faction:pick', { faction });
  },

  startMatch: () => {
    getSocket().emit('game:start');
  },

  sendAction: (action) => {
    if (get().status !== 'playing') return;
    getSocket().emit('game:action', { action });
  },

  rematch: () => {
    getSocket().emit('game:rematch');
  },

  leave: () => {
    const s = getSocket();
    s.emit('room:leave');
    set({
      status: 'idle',
      error: null,
      mySeat: 0,
      roomCode: null,
      lobby: null,
      game: null,
      viewEngine: null,
      effects: [],
      pending: [],
    });
    disconnectSocket();
    bound = false;
  },

  shiftEffect: () => {
    const { pending } = get();
    if (pending.length === 0) return undefined;
    const [head, ...rest] = pending;
    set({ pending: rest });
    return head;
  },

  clearEffects: () => set({ effects: [], pending: [] }),
}));

export type { LobbyPlayer };