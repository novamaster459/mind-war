// Shared animated "war room" background: radar sweep + grid + vignette.
interface Props {
  accent?: string; // faction accent color
}

export function WarRoomBackground({ accent = '#22d3ee' }: Props) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* vignette */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.65) 100%)',
        }}
      />
      {/* radar sweep */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div
          className="h-[140vmax] w-[140vmax] animate-scan-sweep"
          style={{
            background: `conic-gradient(from 0deg, ${accent}00 0deg, ${accent}00 320deg, ${accent}22 350deg, ${accent}66 360deg)`,
            borderRadius: '50%',
          }}
        />
      </div>
      {/* radar rings */}
      {[0.5, 0.75, 1].map((s) => (
        <div
          key={s}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border"
          style={{
            width: `${s * 120}vmax`,
            height: `${s * 120}vmax`,
            borderColor: `${accent}22`,
          }}
        />
      ))}
      {/* horizon glow line */}
      <div
        className="absolute inset-x-0 top-1/2 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${accent}44, transparent)` }}
      />
    </div>
  );
}