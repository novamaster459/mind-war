import { useState } from 'react';
import { useAppStore } from '../../state/appStore';
import { WarRoomBackground } from '../components/WarRoomBackground';
import { FACTION_LIST, FactionBadge, type FactionMeta } from '../components/FactionBadge';
import { audio } from '../../audio/AudioEngine';
import { BUILD_ID, BUILD_DATE, BUILD_LABEL } from '../../buildInfo';

export function MainMenu() {
  const go = useAppStore((s) => s.go);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const settings = useAppStore((s) => s.settings);
  const setMatchMode = useAppStore((s) => s.setMatchMode);
  const [hovered, setHovered] = useState<FactionMeta | null>(null);
  const accent = hovered?.color ?? '#22d3ee';

  const click = (screen: 'skirmish' | 'lobby' | 'settings') => {
    audio.resume();
    audio.play('uiClick');
    setMatchMode(screen === 'lobby' ? 'online' : 'skirmish');
    go(screen);
  };

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center">
      <WarRoomBackground accent={accent} />

      {/* scanlines toggle respected via body overlay; menu content: */}
      <div className="relative z-10 flex w-full max-w-5xl flex-col items-center px-6">
        {/* Title block */}
        <div className="mb-2 text-center">
          <div className="text-xs uppercase tracking-[0.6em] text-coalition/70 animate-flicker">
            TACTICAL COMMAND INTERFACE // v0.1
          </div>
          <h1
            className="mt-1 font-display text-6xl font-bold uppercase tracking-tight text-white sm:text-7xl"
            style={{ textShadow: `0 0 24px ${accent}66` }}
          >
            WAR ROOM
          </h1>
          <div
            className="mx-auto mt-1 h-1 w-40 rounded-full"
            style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }}
          />
          <div className="mt-2 font-mono text-sm uppercase tracking-[0.4em] text-slate-600">
            T A C T I C S
          </div>
        </div>

        {/* Faction selector preview */}
        <div className="my-8 flex flex-wrap items-center justify-center gap-3">
          {FACTION_LIST.map((f) => (
            <button
              key={f.id}
              onMouseEnter={() => {
                setHovered(f);
                audio.play('uiHover');
              }}
              onMouseLeave={() => setHovered(null)}
              onClick={() => {
                updateSettings({ lastFaction: f.id });
                audio.play('unitSelect');
              }}
              className={`rounded-xl p-2 transition-all duration-200 ${
                settings.lastFaction === f.id ? `${f.bg} ${f.shadow} scale-105` : 'hover:scale-105'
              }`}
            >
              <FactionBadge faction={f.id} />
            </button>
          ))}
        </div>

        {/* Main action buttons */}
        <div className="flex w-full max-w-sm flex-col gap-3">
          <button className="btn-primary group relative overflow-hidden py-3 text-base" onClick={() => click('skirmish')}>
            <span className="relative z-10">▶ SKIRMISH vs AI</span>
            <span className="absolute inset-0 -translate-x-full bg-coalition/10 transition-transform duration-300 group-hover:translate-x-0" />
          </button>
          <button
            className="btn-tac border-slate-600 bg-slate-800/40 text-slate-300 hover:border-coalition/50 hover:text-white py-3 text-base"
            onClick={() => click('lobby')}
          >
            ◈ ONLINE MULTIPLAYER
          </button>
          <button
            className="btn-tac border-slate-700 bg-slate-900/40 text-slate-400 hover:text-white py-3 text-base"
            onClick={() => click('settings')}
          >
            ⚙ SETTINGS
          </button>
        </div>

        {/* Footer status */}
        <div className="mt-10 flex items-center gap-4 font-mono text-xs uppercase tracking-widest text-slate-600">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-holo animate-pulse-glow" />
            SYSTEM ONLINE
          </span>
          <span>•</span>
          <span>OFFLINE READY</span>
          <span>•</span>
          <span>{BUILD_LABEL}</span>
          <span title={BUILD_DATE}>{BUILD_ID}</span>
        </div>
      </div>
    </div>
  );
}