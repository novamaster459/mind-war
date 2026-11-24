// Unit detail panel — shown when a friendly unit is selected.
import type { Unit } from '../../game/types';
import { unitDef, classIcon, CLASS_LABEL } from '../../game/units/units';
import { rankForXp } from '../../game/powers/powers';

interface Props {
  unit: Unit;
  generalXp: number;
}

export function UnitPanel({ unit, generalXp }: Props) {
  const def = unitDef(unit.defId);
  const hpFrac = Math.max(0, unit.hp / def.maxHp);

  return (
    <div className="panel p-4">
      <div className="panel-title -m-4 mb-3 flex items-center justify-between">
        <span>Selected Unit</span>
        <span className="chip border-coalition/40 text-coalition">{CLASS_LABEL[def.cls]}</span>
      </div>

      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-coalition/40 bg-coalition/10 text-2xl">
          {classIcon[def.cls]}
        </div>
        <div>
          <div className="font-display text-lg font-bold text-white">{def.name}</div>
          <div className="font-mono text-xs text-slate-500">
            {unit.garrisoned ? 'GARRISONED' : unit.stance.toUpperCase()}
          </div>
        </div>
      </div>

      {/* HP bar */}
      <div className="mb-1 flex justify-between font-mono text-xs">
        <span className="text-slate-500">HP</span>
        <span className={hpFrac > 0.3 ? 'text-holo' : 'text-danger'}>
          {Math.max(0, unit.hp)} / {def.maxHp}
        </span>
      </div>
      <div className="mb-3 h-2 overflow-hidden rounded bg-slate-800">
        <div
          className={`h-full transition-all ${hpFrac > 0.6 ? 'bg-holo' : hpFrac > 0.3 ? 'bg-warning' : 'bg-danger'}`}
          style={{ width: `${hpFrac * 100}%` }}
        />
      </div>

      <div className="grid grid-cols-2 gap-1.5 text-xs">
        <Stat label="Attack" value={String(def.attack)} />
        <Stat label="Armor" value={String(def.armor)} />
        <Stat label="Range" value={String(def.range)} />
        <Stat label="Move" value={String(def.movement)} />
        <Stat label="Vision" value={String(def.vision)} />
        <Stat label="Cost" value={`${def.cost}S`} />
      </div>

      <div className="mt-3 flex gap-2 font-mono text-[11px] uppercase">
        <span className={`chip ${unit.moved ? 'border-slate-600 text-slate-600' : 'border-holo/50 text-holo'}`}>
          {unit.moved ? 'MOVED' : 'CAN MOVE'}
        </span>
        <span className={`chip ${unit.attacked ? 'border-slate-600 text-slate-600' : 'border-warning/50 text-warning'}`}>
          {unit.attacked ? 'FIRED' : 'CAN FIRE'}
        </span>
      </div>

      {generalXp > 0 && (
        <div className="mt-3 border-t border-slate-700 pt-2 font-mono text-xs text-slate-500">
          General: <span className="text-amber-400">{rankForXp(generalXp)}</span> ({generalXp} XP)
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between rounded bg-slate-800/40 px-2 py-1">
      <span className="text-slate-500">{label}</span>
      <span className="font-mono text-slate-200">{value}</span>
    </div>
  );
}