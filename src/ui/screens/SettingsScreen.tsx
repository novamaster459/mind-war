import { useAppStore } from '../../state/appStore';
import { WarRoomBackground } from '../components/WarRoomBackground';
import { audio } from '../../audio/AudioEngine';

function Slider({
  label,
  value,
  onChange,
  onCommit,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  onCommit?: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between font-mono text-xs uppercase tracking-widest text-slate-400">
        <span>{label}</span>
        <span className="text-coalition">{Math.round(value * 100)}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        onMouseUp={onCommit}
        onTouchEnd={onCommit}
        className="w-full accent-coalition"
      />
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (b: boolean) => void;
}) {
  return (
    <button
      onClick={() => {
        onChange(!checked);
        audio.play('uiClick');
      }}
      className="flex items-center justify-between rounded-md border border-slate-700 bg-slate-800/40 px-4 py-2.5 text-left hover:border-coalition/40"
    >
      <span className="text-sm uppercase tracking-wide text-slate-300">{label}</span>
      <span
        className={`relative h-5 w-10 rounded-full transition-colors ${
          checked ? 'bg-coalition/70' : 'bg-slate-600'
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
            checked ? 'left-5' : 'left-0.5'
          }`}
        />
      </span>
    </button>
  );
}

export function SettingsScreen() {
  const go = useAppStore((s) => s.go);
  const settings = useAppStore((s) => s.settings);
  const update = useAppStore((s) => s.updateSettings);

  return (
    <div className="relative flex h-full w-full items-center justify-center">
      <WarRoomBackground />
      <div className="panel relative z-10 w-full max-w-lg p-6">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="font-display text-2xl font-bold uppercase tracking-wider text-white">
            ⚙ Settings
          </h2>
          <button className="btn-tac border-slate-600 text-slate-300" onClick={() => go('menu')}>
            ← Back
          </button>
        </div>

        <div className="flex flex-col gap-5">
          <Slider
            label="Master / Music Volume"
            value={settings.musicVolume}
            onChange={(v) => update({ musicVolume: v })}
          />
          <Slider
            label="Sound Effects"
            value={settings.sfxVolume}
            onChange={(v) => update({ sfxVolume: v })}
            onCommit={() => audio.play('unitAck')}
          />
          <div className="my-1 h-px bg-slate-700" />
          <Toggle label="Screen Shake" checked={settings.screenShake} onChange={(b) => update({ screenShake: b })} />
          <Toggle label="CRT Scanlines" checked={settings.showScanlines} onChange={(b) => update({ showScanlines: b })} />
          <Toggle label="Reduce Motion" checked={settings.reduceMotion} onChange={(b) => update({ reduceMotion: b })} />
        </div>

        <p className="mt-6 font-mono text-xs leading-relaxed text-slate-600">
          Settings are saved locally and available offline. Scanline &amp; motion preferences apply
          instantly across the command table.
        </p>
      </div>
    </div>
  );
}