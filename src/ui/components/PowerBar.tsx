// General Powers bar — shows unlocked powers with cooldown/affordability state.
import type { PlayerState } from '../../game/types';
import { POWER_LIST, rankForXp } from '../../game/powers/powers';

interface Props {
  player: PlayerState;
  onUse: (powerId: string) => void;
  /** Whether a power currently needs a ground target (awaiting click). */
  targeting: string | null;
}

const POWER_ICON: Record<string, string> = {
  airstrike: '✈️',
  empBlast: '⚡',
  supplyDrop: '📦',
  artilleryBarrage: '💥',
  reconSweep: '📡',
  repairField: '🔧',
};

export function PowerBar({ player, onUse, targeting }: Props) {
  return (
    <div className="panel p-3">
      <div className="panel-title -m-3 mb-2 flex items-center justify-between">
        <span>General Powers</span>
        <span className="font-mono text-[10px] normal-case text-amber-400">
          {rankForXp(player.generalXp)} · {player.generalXp} XP
        </span>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {POWER_LIST.map((p) => {
          const unlocked = player.generalXp >= p.unlockAt;
          const cd = player.powerCooldowns[p.id] ?? 0;
          const affordable = player.commandPoints >= p.cost;
          const active = targeting === p.id;
          const usable = unlocked && cd === 0 && affordable;

          return (
            <button
              key={p.id}
              disabled={!usable && !active}
              onClick={() => onUse(p.id)}
              title={unlocked ? `${p.description} (${p.cost} CP, ${p.cooldown}T cd)` : `Unlocks at ${p.unlockAt} XP`}
              className={`relative flex flex-col items-center gap-0.5 rounded-md border px-1 py-1.5 text-center transition-all ${
                active
                  ? 'border-amber-400 bg-amber-500/20 animate-pulse-glow'
                  : usable
                    ? 'border-slate-600 bg-slate-800/40 hover:border-amber-400/60 hover:bg-slate-700/50'
                    : 'cursor-not-allowed border-slate-800 bg-slate-900/30 opacity-40'
              }`}
            >
              <span className="text-base leading-none">
                {unlocked ? POWER_ICON[p.id] : '🔒'}
              </span>
              <span className="font-mono text-[9px] uppercase leading-tight text-slate-400">
                {p.name.split(' ')[0]}
              </span>
              <span className="font-mono text-[9px] text-amber-400">{p.cost}CP</span>
              {cd > 0 && (
                <span className="absolute inset-0 flex items-center justify-center rounded-md bg-black/60 font-mono text-lg font-bold text-white">
                  {cd}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}