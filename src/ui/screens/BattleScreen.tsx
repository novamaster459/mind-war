import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useAppStore } from '../../state/appStore';
import { useMatchStore } from '../../state/matchStore';
import { useHexRenderer } from '../../render/useHexRenderer';
import type { HexCoord, PowerId } from '../../game/types';
import { hexKey } from '../../utils/hex';
import { audio } from '../../audio/AudioEngine';
import { HexInspector } from '../components/HexInspector';
import { Minimap } from '../components/Minimap';
import { UnitPanel } from '../components/UnitPanel';
import { BuildMenu } from '../components/BuildMenu';
import { PowerBar } from '../components/PowerBar';
import { ProductionQueue } from '../components/ProductionQueue';
import { playTurn } from '../../game/ai/bot';
import { useBattleController } from './useBattleController';

export function BattleScreen() {
  const go = useAppStore((s) => s.go);
  const settings = useAppStore((s) => s.settings);
  const matchMode = useAppStore((s) => s.matchMode);

  // Unified controller abstracts skirmish (local engine) vs online (server).
  const ctrl = useBattleController(matchMode);

  const startGame = useMatchStore((s) => s.startGame);
  const skirmishSetState = useMatchStore((s) => s.setState);
  const skirmishEngine = useMatchStore((s) => s.engine);

  const { engine, game, mySeat, isMyTurn, dispatch, shiftEffect, pending, quit, rematch } = ctrl;

  const [hovered, setHovered] = useState<HexCoord | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<string | null>(null);
  const [targetingPower, setTargetingPower] = useState<PowerId | null>(null);
  const shakeRef = useRef<HTMLDivElement | null>(null);

  // Skirmish: start a match if none exists (e.g., entering via ?screen=game).
  useEffect(() => {
    if (matchMode !== 'skirmish') return;
    if (!game) {
      const faction = (settings.lastFaction as any) ?? 'coalition';
      startGame({ faction0: faction, faction1: faction === 'coalition' ? 'syndicate' : 'coalition', difficulty: 'skirmish' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchMode]);

  const me = game?.players[mySeat];

  // ---------------------------------------------------------------------------
  // AI driver (skirmish only): when it becomes the enemy AI seat's turn, think
  // for a beat, then play the whole turn through the shared engine.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (matchMode !== 'skirmish') return;
    if (!game || !skirmishEngine) return;
    if (game.status !== 'active') return;
    const active = game.players[game.activeSeat];
    if (!active.isAI) return;
    if (game.activeSeat === mySeat) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      const { state, effects } = playTurn(skirmishEngine, game, game.activeSeat);
      skirmishSetState(state, effects);
    }, 700);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [matchMode, game, skirmishEngine, mySeat, skirmishSetState]);

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------
  const onSelect = useCallback(
    (hex: HexCoord | null) => {
      if (!hex || !game) return;
      const k = hexKey(hex);

      if (targetingPower) {
        dispatch({ type: 'usePower', powerId: targetingPower, at: hex });
        setTargetingPower(null);
        audio.play('power');
        return;
      }

      const unitHere = game.units.find((u) => u.owner === mySeat && hexKey(u.pos) === k);
      if (unitHere) {
        setSelectedUnit(unitHere.id);
        audio.play('unitSelect');
        return;
      }

      const enemy = engine?.visibleEnemies(game, mySeat).find((u) => hexKey(u.pos) === k);
      if (enemy && selectedUnit) {
        dispatch({ type: 'attack', attackerId: selectedUnit, targetId: enemy.id });
        return;
      }

      const node = game.nodes.find((n) => hexKey(n.pos) === k);
      if (node && selectedUnit && node.owner !== mySeat) {
        dispatch({ type: 'capture', unitId: selectedUnit, nodeId: node.id });
        return;
      }

      if (selectedUnit && isMyTurn) {
        const u = game.units.find((x) => x.id === selectedUnit);
        if (u && !u.moved) {
          const range = engine?.moveRange(game, selectedUnit);
          if (range?.has(k)) {
            dispatch({ type: 'move', unitId: selectedUnit, to: hex });
            audio.play('move');
            return;
          }
        }
      }

      setSelectedUnit(null);
    },
    [game, engine, selectedUnit, targetingPower, dispatch, mySeat, isMyTurn],
  );

  const { hostRef, rendererRef } = useHexRenderer({
    map: engine?.map ?? null,
    onHover: setHovered,
    onSelect,
  });

  // Push state into the renderer whenever it changes.
  useEffect(() => {
    if (!game || !engine) return;
    rendererRef.current?.setUnits(game.units, game.visibility[mySeat], mySeat);
    rendererRef.current?.setSelection(
      selectedUnit ? game.units.find((u) => u.id === selectedUnit)?.pos ?? null : null,
    );
  }, [game, engine, selectedUnit, mySeat, rendererRef]);

  // Move-range / attack highlights for the selected unit.
  useEffect(() => {
    const r = rendererRef.current;
    if (!r || !game || !engine) return;
    const highlights: { hex: HexCoord; color: string }[] = [];
    if (selectedUnit && isMyTurn) {
      const unit = game.units.find((u) => u.id === selectedUnit);
      if (unit && !unit.moved) {
        const range = engine.moveRange(game, selectedUnit);
        for (const k of range.keys()) {
          const [q, rr] = k.split(',').map(Number);
          highlights.push({ hex: { q, r: rr }, color: '#22d3ee' });
        }
      }
      if (unit && !unit.attacked) {
        for (const t of engine.attackableFrom(game, selectedUnit)) {
          highlights.push({ hex: t.pos, color: '#ef4444' });
        }
      }
    }
    r.setHighlights(highlights);
  }, [selectedUnit, game, engine, isMyTurn, rendererRef]);

  // Play queued effects (sound + screen shake) one at a time.
  useEffect(() => {
    if (pending.length === 0) return;
    const effect = shiftEffect();
    if (!effect) return;
    switch (effect.kind) {
      case 'attack':
        if (effect.killed || effect.damage > 80) {
          audio.play('explosion');
          if (settings.screenShake && !settings.reduceMotion) {
            shakeRef.current?.classList.remove('shake');
            void shakeRef.current?.offsetWidth;
            shakeRef.current?.classList.add('shake');
          }
        } else {
          audio.play('gunfire');
        }
        break;
      case 'capture':
        audio.play('capture');
        break;
      case 'power':
        audio.play('power');
        break;
      case 'turnStart':
        if (effect.seat === mySeat) audio.play('turnStart');
        break;
      case 'victory':
        audio.play(effect.winner === mySeat ? 'victory' : 'defeat');
        break;
      case 'deploy':
      case 'move':
        break;
    }
  }, [pending, shiftEffect, settings, mySeat]);

  if (!game || !me) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-slate-950 text-slate-500">
        Initializing battlefield…
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  const onBuild = (defId: string) => {
    dispatch({ type: 'build', unitDefId: defId });
    audio.play('uiClick');
  };
  const onPower = (powerId: string) => {
    setTargetingPower((cur) => (cur === powerId ? null : (powerId as PowerId)));
    audio.play('uiHover');
  };
  const endTurn = () => {
    dispatch({ type: 'endTurn' });
    setSelectedUnit(null);
    setTargetingPower(null);
  };
  const restart = () => {
    setSelectedUnit(null);
    setTargetingPower(null);
    rematch();
  };
  const toMenu = () => {
    quit();
    go('menu');
  };

  const selUnitObj = useMemo(
    () => game.units.find((u) => u.id === selectedUnit) ?? null,
    [game, selectedUnit],
  );

  const oppSeat = mySeat === 0 ? 1 : 0;
  const opponent = game.players[oppSeat];

  return (
    <div ref={shakeRef} className="flex h-full w-full flex-col bg-slate-950">
      {/* Top command bar */}
      <div className="z-20 flex items-center justify-between gap-2 border-b border-slate-700 bg-slate-900/90 px-3 py-2 backdrop-blur">
        <div className="flex items-center gap-2">
          <button className="btn-tac border-slate-600 text-slate-300" onClick={toMenu}>
            ← Menu
          </button>
          <div className="font-display text-base font-bold uppercase tracking-wider text-white">
            {me.name}
          </div>
          <span className="hidden font-mono text-xs text-slate-500 sm:inline">vs {opponent.name}</span>
          {matchMode === 'online' && (
            <span className="chip border-holo/40 font-mono text-holo">
              ◈ {ctrl.roomCode}
            </span>
          )}
          <span className={`chip ${isMyTurn ? 'border-holo/60 text-holo animate-pulse-glow' : 'border-slate-600 text-slate-500'}`}>
            {game.status === 'finished' ? 'ENDED' : isMyTurn ? 'YOUR TURN' : 'ENEMY TURN'}
          </span>
        </div>
        <div className="flex items-center gap-1.5 font-mono text-sm">
          <span className="chip border-amber-500/40 text-amber-400">📦 {me.supplies}</span>
          <span className="chip border-amber-300/40 text-amber-300">⚡ {me.commandPoints} CP</span>
          <span className="chip border-slate-600 text-slate-400">T{game.turn}</span>
          <button
            className="btn-primary ml-1 px-3 py-1.5"
            disabled={!isMyTurn}
            onClick={endTurn}
          >
            End Turn ▸
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="relative flex min-h-0 flex-1">
        <div ref={hostRef} className="relative min-w-0 flex-1" />

        {targetingPower && (
          <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-md border border-amber-400 bg-amber-500/20 px-4 py-1.5 font-mono text-xs uppercase tracking-widest text-amber-300 animate-pulse-glow">
            Select target area for {targetingPower} — click the map
          </div>
        )}

        {/* Victory overlay */}
        {game.status === 'finished' && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70">
            <div className="panel p-8 text-center">
              <div className="font-display text-4xl font-bold uppercase" style={{ color: game.winner === mySeat ? '#4ade80' : '#ef4444' }}>
                {game.winner === mySeat ? 'VICTORY' : 'DEFEAT'}
              </div>
              <p className="mt-2 font-mono text-sm text-slate-400">
                {game.winner === mySeat ? 'The battlefield is yours, Commander.' : 'Your forces have been routed.'}
              </p>
              <div className="mt-6 flex justify-center gap-3">
                {matchMode === 'skirmish' ? (
                  <button className="btn-primary" onClick={restart}>↻ Play Again</button>
                ) : (
                  <button className="btn-primary" onClick={restart}>↻ Rematch</button>
                )}
                <button className="btn-tac border-slate-600 text-slate-300" onClick={toMenu}>
                  Main Menu
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Right sidebar */}
        <div className="hidden w-72 flex-col gap-2 overflow-y-auto border-l border-slate-700 bg-slate-900/60 p-2 md:flex">
          {selUnitObj ? (
            <UnitPanel unit={selUnitObj} generalXp={me.generalXp} />
          ) : (
            <HexInspector map={engine!.map} hex={hovered} pinned={false} />
          )}
          <BuildMenu faction={me.faction} supplies={me.supplies} command={me.commandPoints} onBuild={onBuild} />
          <PowerBar player={me} onUse={onPower} targeting={targetingPower} />
          <ProductionQueue queue={game.production} seat={mySeat} />
          <Minimap map={engine!.map} selected={selUnitObj?.pos ?? null} onJump={(h) => rendererRef.current?.focusHex(h)} />
        </div>
      </div>

      {/* Mobile bottom bar */}
      <div className="flex gap-2 overflow-x-auto border-t border-slate-700 bg-slate-900/90 p-2 md:hidden no-scrollbar">
        {selUnitObj && (
          <div className="flex-shrink-0">
            <UnitPanel unit={selUnitObj} generalXp={me.generalXp} />
          </div>
        )}
        <div className="flex-shrink-0">
          <BuildMenu faction={me.faction} supplies={me.supplies} command={me.commandPoints} onBuild={onBuild} />
        </div>
        <div className="flex-shrink-0">
          <PowerBar player={me} onUse={onPower} targeting={targetingPower} />
        </div>
      </div>
    </div>
  );
}