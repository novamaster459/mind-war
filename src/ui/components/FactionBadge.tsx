import type { FactionId } from '../../game/types';

export interface FactionMeta {
  id: FactionId;
  name: string;
  short: string;
  motto: string;
  color: string; // hex
  dim: string;
  text: string; // tailwind text class
  border: string;
  bg: string;
  shadow: string;
}

export const FACTIONS: Record<FactionId, FactionMeta> = {
  coalition: {
    id: 'coalition',
    name: 'Coalition',
    short: 'COA',
    motto: 'Precision. Technology. Air Superiority.',
    color: '#22d3ee',
    dim: '#0e7490',
    text: 'text-coalition',
    border: 'border-coalition/60',
    bg: 'bg-coalition/10',
    shadow: 'shadow-glow-cyan',
  },
  syndicate: {
    id: 'syndicate',
    name: 'Syndicate',
    short: 'SYN',
    motto: 'Heavy Armor. Overwhelming Firepower.',
    color: '#ef4444',
    dim: '#991b1b',
    text: 'text-syndicate',
    border: 'border-syndicate/60',
    bg: 'bg-syndicate/10',
    shadow: 'shadow-glow-red',
  },
  insurgent: {
    id: 'insurgent',
    name: 'Insurgents',
    short: 'INS',
    motto: 'Guerrilla Tactics. Hit and Run.',
    color: '#f59e0b',
    dim: '#92400e',
    text: 'text-insurgent',
    border: 'border-insurgent/60',
    bg: 'bg-insurgent/10',
    shadow: 'shadow-glow-amber',
  },
};

export const FACTION_LIST = Object.values(FACTIONS);

interface Props {
  faction: FactionId;
  size?: 'sm' | 'md' | 'lg';
  showName?: boolean;
}

export function FactionBadge({ faction, size = 'md', showName = true }: Props) {
  const f = FACTIONS[faction];
  const dims =
    size === 'lg' ? 'w-14 h-14' : size === 'sm' ? 'w-8 h-8' : 'w-11 h-11';
  return (
    <div className="flex items-center gap-3">
      <div
        className={`${dims} relative flex items-center justify-center rounded-lg border ${f.border} ${f.bg}`}
        style={{ boxShadow: `inset 0 0 18px ${f.color}33` }}
      >
        <span className={`font-display font-bold ${f.text} ${size === 'lg' ? 'text-xl' : 'text-sm'}`}>
          {f.short}
        </span>
        <span
          className="absolute inset-0 rounded-lg animate-pulse-glow"
          style={{ boxShadow: `0 0 8px ${f.color}55` }}
        />
      </div>
      {showName && (
        <div className="leading-tight">
          <div className={`font-display font-bold ${f.text} ${size === 'lg' ? 'text-2xl' : 'text-lg'}`}>
            {f.name}
          </div>
          <div className="text-xs text-slate-600 uppercase tracking-wider">{f.motto}</div>
        </div>
      )}
    </div>
  );
}