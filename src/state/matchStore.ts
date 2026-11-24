// ============================================================================
// Match store (Zustand). Wraps the pure Engine; holds the current GameState and
// exposes dispatch helpers. Effects (sound/animation) are buffered here so the
// UI can play them. This is the single source of truth for a skirmish match.
// ============================================================================
import { create } from 'zustand';
import { Engine, type EngineResult, type Effect } from '../game/engine/Engine';
import type { GameState, GameAction, FactionId, Difficulty } from '../game/types';

interface MatchState {
  engine: Engine | null;
  game: GameState | null;
  /** Most recent effects produced by a dispatch (consumed by UI). */
  effects: Effect[];
  /** Effects queue for sequential playback. */
  pending: Effect[];

  startGame: (opts: {
    faction0: FactionId;
    faction1: FactionId;
    difficulty?: Difficulty;
    mode?: GameState['mode'];
  }) => void;

  dispatch: (action: GameAction) => void;
  /** Replace the whole game state + effects (used by the AI driver / server). */
  setState: (state: GameState, effects: Effect[]) => void;
  /** Drain one effect from the playback queue. */
  shiftEffect: () => Effect | undefined;
  clearEffects: () => void;
  quit: () => void;
}

export const useMatchStore = create<MatchState>((set, get) => ({
  engine: null,
  game: null,
  effects: [],
  pending: [],

  startGame: (opts) => {
    const engine = new Engine((Date.now() & 0xffffff) || 1, 7);
    const { state, effects } = engine.newGame({
      faction0: opts.faction0,
      faction1: opts.faction1,
      mode: opts.mode ?? 'skirmish',
      difficulty: opts.difficulty ?? 'skirmish',
      name1: 'Enemy AI',
    });
    set({ engine, game: state, effects, pending: effects });
  },

  dispatch: (action) => {
    const { engine, game } = get();
    if (!engine || !game) return;
    const result: EngineResult = engine.dispatch(game, action);
    set({ game: result.state, effects: result.effects, pending: result.effects });
  },

  setState: (state, effects) => {
    set({ game: state, effects, pending: effects });
  },

  shiftEffect: () => {
    const { pending } = get();
    if (pending.length === 0) return undefined;
    const [head, ...rest] = pending;
    set({ pending: rest });
    return head;
  },

  clearEffects: () => set({ effects: [], pending: [] }),

  quit: () => set({ engine: null, game: null, effects: [], pending: [] }),
}));