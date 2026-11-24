// Build menu — lists the active faction's units to produce.
import type { FactionId } from '../../game/types';
import { unitsForFaction, classIcon, CLASS_LABEL } from '../../game/units/units';

interface Props {
  faction: FactionId;
  supplies: number;
  command: number;
  onBuild: (defId: string) => void;
}

export function BuildMenu({ faction, supplies, command, onBuild }: Props) {
  const units = unitsForFaction(faction);
  return (
    <div className="panel p-3">
      <div className="panel-title -m-3 mb-2">Build Units</div>
      <div className="flex flex-col gap-1.5">
        {units.map((u) => {
          const affordable = supplies >= u.cost && command >= u.commandCost;
          return (
            <button
              key={u.id}
              disabled={!affordable}
              onClick={() => onBuild(u.id)}
              title={u.description}
              className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-all ${
                affordable
                  ? 'border-slate-600 bg-slate-800/40 hover:border-coalition/50 hover:bg-slate-700/50'
                  : 'cursor-not-allowed border-slate-800 bg-slate-900/30 opacity-40'
              }`}
            >
              <span className="text-lg">{classIcon[u.cls]}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-display text-sm font-semibold text-slate-200">
                  {u.name}
                </span>
                <span className="block font-mono text-[10px] uppercase text-slate-500">
                  {CLASS_LABEL[u.cls]} · {u.buildTurns}T
                </span>
              </span>
              <span className="text-right font-mono text-xs">
                <span className={supplies >= u.cost ? 'text-amber-400' : 'text-danger'}>{u.cost}S</span>
                {u.commandCost > 0 && (
                  <span className={command >= u.commandCost ? 'text-amber-300' : 'text-danger'}>
                    {' '}
                    {u.commandCost}CP
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}