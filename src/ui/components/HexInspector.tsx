// Hex terrain inspector — shows details of the hovered or selected hex.
import type { BoardMap } from '../../game/map/generator';
import type { HexCoord } from '../../game/types';
import { terrainOf } from '../../game/terrain/terrain';
import { hexKey } from '../../utils/hex';

interface Props {
  map: BoardMap | null;
  hex: HexCoord | null;
  pinned: boolean; // true if this is a selected (pinned) hex
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-slate-700/50 py-1 text-xs">
      <span className="uppercase tracking-wide text-slate-500">{label}</span>
      <span className="font-mono text-slate-200">{value}</span>
    </div>
  );
}

export function HexInspector({ map, hex, pinned }: Props) {
  if (!hex || !map) {
    return (
      <div className="panel p-4">
        <div className="panel-title -m-4 mb-3">Hex Intel</div>
        <p className="font-mono text-xs text-slate-600">Hover a hex to inspect terrain.</p>
      </div>
    );
  }

  const terrain = terrainOf(map.tiles.get(hexKey(hex)) ?? 'plains');
  const node = map.nodes.find((n) => n.pos.q === hex.q && n.pos.r === hex.r);

  return (
    <div className="panel p-4">
      <div className="panel-title -m-4 mb-3 flex items-center justify-between">
        <span>Hex Intel</span>
        <span className={`chip ${pinned ? 'border-holo/60 text-holo' : 'border-slate-600 text-slate-500'}`}>
          {pinned ? 'LOCKED' : 'SCAN'}
        </span>
      </div>

      <div className="mb-3 flex items-center gap-2">
        <span className="h-6 w-6 rounded border border-white/20" style={{ background: terrain.color }} />
        <div>
          <div className="font-display font-bold uppercase text-white">{terrain.name}</div>
          <div className="font-mono text-xs text-slate-500">
            HEX {hex.q}, {hex.r}
          </div>
        </div>
      </div>

      <Stat label="Defense" value={`×${terrain.defense.toFixed(2)}`} />
      <Stat label="Move Cost" value={terrain.moveCost === Infinity ? 'Impassable' : `×${terrain.moveCost}`} />
      <Stat label="Vision Bonus" value={`+${terrain.visionBonus}`} />
      <Stat label="Range Bonus" value={`+${terrain.rangeBonus}`} />
      {terrain.concealmentRange > 0 && <Stat label="Concealment" value="Yes" />}
      {terrain.blocksLos && <Stat label="Blocks LoS" value="Yes" />}
      {node && (
        <div className="mt-3 rounded border border-amber-500/40 bg-amber-500/5 p-2">
          <div className="font-mono text-xs uppercase text-amber-400">
            ◈ {terrain.name} — {node.owner === null ? 'NEUTRAL' : `SEAT ${node.owner}`}
          </div>
          <div className="font-mono text-xs text-slate-400">
            +{terrain.income} supplies / +{terrain.commandIncome} CP per turn
          </div>
        </div>
      )}
    </div>
  );
}