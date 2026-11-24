// ============================================================================
// useBattleController — unifies the two ways a match can run:
//
//   • skirmish: a local Engine + Zustand matchStore drive everything (incl. AI).
//   • online:   an authoritative server owns the GameState; the client renders
//               the broadcast state and sends intents over the socket.
//
// Both expose the same surface to BattleScreen: { engine, game, mySeat,
// isMyTurn, dispatch, shiftEffect, pending, quit, rematch, roomCode }.
//
// For online play, `engine` is a local view-only Engine rebuilt from the seed
// (used purely to render the board map & compute move/attack overlays); the
// authoritative state still comes from the server.
// ============================================================================
import { useMemo } from 'react';
import type { GameAction, GameState, Seat } from '../../game/types';
import type { Effect, Engine } from '../../game/engine/Engine';
import { useMatchStore } from '../../state/matchStore';
import { useMultiplayerStore } from '../../state/multiplayerStore';
import type { MatchMode } from '../../state/appStore';

export interface BattleController {
  engine: Engine | null;
  game: GameState | null;
  mySeat: Seat;
  isMyTurn: boolean;
  dispatch: (action: GameAction) => void;
  shiftEffect: () => Effect | undefined;
  pending: Effect[];
  quit: () => void;
  rematch: () => void;
  roomCode: string | null;
}

/** Skirmish adapter — reads the local matchStore. */
function useSkirmishController(): BattleController {
  const engine = useMatchStore((s) => s.engine);
  const game = useMatchStore((s) => s.game);
  const dispatch = useMatchStore((s) => s.dispatch);
  const shiftEffect = useMatchStore((s) => s.shiftEffect);
  const pending = useMatchStore((s) => s.pending);
  const quit = useMatchStore((s) => s.quit);
  const startGame = useMatchStore((s) => s.startGame);

  return useMemo(() => {
    const mySeat: Seat = 0;
    return {
      engine,
      game,
      mySeat,
      isMyTurn: game?.activeSeat === mySeat && game?.status === 'active',
      dispatch,
      shiftEffect,
      pending,
      quit,
      rematch: () => {
        if (!game) return;
        const faction = game.players[mySeat].faction;
        quit();
        startGame({
          faction0: faction,
          faction1: faction === 'coalition' ? 'syndicate' : 'coalition',
          difficulty: game.difficulty,
        });
      },
      roomCode: null,
    };
  }, [engine, game, dispatch, shiftEffect, pending, quit, startGame]);
}

/** Online adapter — reads the multiplayer store (server-authoritative). */
function useOnlineController(): BattleController {
  const viewEngine = useMultiplayerStore((s) => s.viewEngine);
  const game = useMultiplayerStore((s) => s.game);
  const mySeat = useMultiplayerStore((s) => s.mySeat);
  const sendAction = useMultiplayerStore((s) => s.sendAction);
  const shiftEffect = useMultiplayerStore((s) => s.shiftEffect);
  const pending = useMultiplayerStore((s) => s.pending);
  const leave = useMultiplayerStore((s) => s.leave);
  const rematchReq = useMultiplayerStore((s) => s.rematch);
  const roomCode = useMultiplayerStore((s) => s.roomCode);

  return useMemo(
    () => ({
      engine: viewEngine,
      game,
      mySeat,
      isMyTurn: game?.activeSeat === mySeat && game?.status === 'active',
      dispatch: sendAction,
      shiftEffect,
      pending,
      quit: leave,
      rematch: rematchReq,
      roomCode,
    }),
    [viewEngine, game, mySeat, sendAction, shiftEffect, pending, leave, rematchReq, roomCode],
  );
}

export function useBattleController(mode: MatchMode): BattleController {
  // Hooks can't be conditional, so call both adapters and pick one. Both are
  // cheap (just Zustand selectors); only the active one's data is used.
  const skirmish = useSkirmishController();
  const online = useOnlineController();
  return mode === 'online' ? online : skirmish;
}