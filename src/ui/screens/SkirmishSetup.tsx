import { useState } from 'react';
import { useAppStore } from '../../state/appStore';
import { useMatchStore } from '../../state/matchStore';
import { WarRoomBackground } from '../components/WarRoomBackground';
import { FACTION_LIST } from '../components/FactionBadge';
import { FactionBadge } from '../components/FactionBadge';
import type { FactionId, Difficulty } from '../../game/types';
import { audio } from '../../audio/AudioEngine';

const DIFFICULTIES: { id: Difficulty; name: string; desc: string; color: string }[] = [
  { id: 'skirmish', name: 'Skirmish', desc: 'A relaxed tactical sandbox.', color: '#22d3ee' },
  { id: 'veteran', name: 'Veteran', desc: 'The AI punishes mistakes.', color: '#f59e0b' },
  { id: 'brutal', name: 'Brutal', desc: 'No mercy. Perfect play required.', color: '#ef4444' },
];

export function SkirmishSetup() {
  const go = useAppStore((s) => s.go);
  const settings = useAppStore((s) => s.settings);
  const setMatchMode = useAppStore((s) => s.setMatchMode);
  const startGame = useMatchStore((s) => s.startGame);
  const [faction, setFaction] = useState<FactionId>((settings.lastFaction as FactionId) ?? 'coalition');
  const [difficulty, setDifficulty] = useState<Difficulty>('skirmish');

  const start = () => {
    audio.play('turnStart');
    // Enemy is always a different faction for visual contrast.
    const enemy: FactionId =
      faction === 'coalition' ? 'syndicate' : faction === 'syndicate' ? 'insurgent' : 'coalition';
    setMatchMode('skirmish');
    startGame({ faction0: faction, faction1: enemy, difficulty, mode: 'skirmish' });
    go('game');
  };

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-y-auto">
      <WarRoomBackground accent={FACTION_LIST.find((f) => f.id === faction)?.color} />
      <div className="relative z-10 w-full max-w-4xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="font-display text-3xl font-bold uppercase tracking-wider text-white">
            Skirmish Setup
          </h2>
          <button className="btn-tac border-slate-600 text-slate-300" onClick={() => go('menu')}>
            ← Back
          </button>
        </div>

        <div className="panel mb-6 p-5">
          <div className="panel-title -m-5 mb-5">01 // Choose Your Faction</div>
          <div className="grid gap-3 sm:grid-cols-3">
            {FACTION_LIST.map((f) => (
              <button
                key={f.id}
                onClick={() => {
                  setFaction(f.id);
                  audio.play('unitSelect');
                }}
                className={`rounded-lg border p-4 text-left transition-all ${
                  faction === f.id
                    ? `${f.border} ${f.bg} ${f.shadow}`
                    : 'border-slate-700 bg-slate-900/40 hover:border-slate-500'
                }`}
              >
                <FactionBadge faction={f.id} />
              </button>
            ))}
          </div>
        </div>

        <div className="panel mb-6 p-5">
          <div className="panel-title -m-5 mb-5">02 // Threat Level</div>
          <div className="grid gap-3 sm:grid-cols-3">
            {DIFFICULTIES.map((d) => (
              <button
                key={d.id}
                onClick={() => {
                  setDifficulty(d.id);
                  audio.play('uiClick');
                }}
                className={`rounded-lg border p-4 text-left transition-all ${
                  difficulty === d.id
                    ? 'border-white/40 bg-slate-700/50'
                    : 'border-slate-700 bg-slate-900/40 hover:border-slate-500'
                }`}
                style={difficulty === d.id ? { boxShadow: `0 0 14px ${d.color}44` } : undefined}
              >
                <div className="font-display text-lg font-bold uppercase" style={{ color: d.color }}>
                  {d.name}
                </div>
                <div className="mt-1 text-xs text-slate-500">{d.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <button className="btn-primary w-full py-4 text-lg" onClick={start}>
          ⚔ DEPLOY TO BATTLEFIELD
        </button>
        <p className="mt-3 text-center font-mono text-xs uppercase tracking-widest text-slate-600">
          The battle engine &amp; hex-grid renderer come online in Phase 2–3.
        </p>
      </div>
    </div>
  );
}