// Production queue — shows units currently being built for a seat.
import type { ProductionItem } from '../../game/types';
import { unitDef, classIcon } from '../../game/units/units';

interface Props {
  queue: ProductionItem[];
  seat: number;
}

export function ProductionQueue({ queue, seat }: Props) {
  const items = queue.filter((q) => q.owner === seat);
  return (
    <div className="panel p-3">
      <div className="panel-title -m-3 mb-2 flex items-center justify-between">
        <span>Production</span>
        <span className="font-mono text-[10px] text-slate-500">{items.length} queued</span>
      </div>
      {items.length === 0 ? (
        <p className="font-mono text-xs text-slate-600">No units in production.</p>
      ) : (
        <div className="flex flex-col gap-1">
          {items.map((q) => {
            const def = unitDef(q.unitDefId);
            return (
              <div key={q.id} className="flex items-center gap-2 rounded bg-slate-800/40 px-2 py-1">
                <span>{classIcon[def.cls]}</span>
                <span className="flex-1 truncate text-xs text-slate-300">{def.name}</span>
                <span className="font-mono text-[10px] text-coalition">
                  {q.turnsRemaining <= 0 ? 'READY' : `${q.turnsRemaining}T`}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}