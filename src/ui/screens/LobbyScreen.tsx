import { useEffect, useState } from 'react';
import { useAppStore } from '../../state/appStore';
import { useMultiplayerStore } from '../../state/multiplayerStore';
import { WarRoomBackground } from '../components/WarRoomBackground';
import { FactionBadge } from '../components/FactionBadge';
import { saveServerUrl, resolveServerUrl } from '../../net/socket';
import type { FactionId } from '../../game/types';

const FACTIONS: { id: FactionId; name: string; color: string }[] = [
  { id: 'coalition', name: 'Coalition', color: '#22d3ee' },
  { id: 'syndicate', name: 'Syndicate', color: '#ef4444' },
  { id: 'insurgent', name: 'Insurgents', color: '#f59e0b' },
];

const randomName = (): string => {
  const a = ['Iron', 'Ghost', 'Viper', 'Steel', 'Shadow', 'Falcon', 'Rogue', 'Wolf'];
  const b = ['Commander', 'Actual', 'Six', 'Lead', 'Prime'];
  return `${a[Math.floor(Math.random() * a.length)]} ${b[Math.floor(Math.random() * b.length)]}`;
};

export function LobbyScreen() {
  const go = useAppStore((s) => s.go);
  const setMatchMode = useAppStore((s) => s.setMatchMode);
  const setRoomCode = useAppStore((s) => s.setRoomCode);

  const mp = useMultiplayerStore();
  const { status, error, roomCode, lobby, mySeat } = mp;

  const [name, setName] = useState(randomName);
  const [joinCode, setJoinCode] = useState('');
  const [serverUrl, setServerUrl] = useState(resolveServerUrl);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);

  // When the server reports a started match, jump into the battle screen.
  useEffect(() => {
    if (status === 'playing' && mp.game) {
      setMatchMode('online');
      go('game');
    }
  }, [status, mp.game, go, setMatchMode]);

  // Persist room code in app store when known (for reconnect / display).
  useEffect(() => {
    setRoomCode(roomCode);
  }, [roomCode, setRoomCode]);

  const connectThen = (fn: () => void) => {
    saveServerUrl(serverUrl);
    setBusy(true);
    fn();
    // Reset busy shortly after; status/error drive the real UI.
    setTimeout(() => setBusy(false), 1200);
  };

  const back = () => {
    mp.leave();
    go('menu');
  };

  const inRoom = status === 'lobby' && lobby;

  return (
    <div className="relative flex h-full w-full items-center justify-center p-4">
      <WarRoomBackground />
      <div className="panel relative z-10 w-full max-w-lg p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl font-bold uppercase tracking-wider text-white">
            ◈ Online Lobby
          </h2>
          <button className="btn-tac border-slate-600 text-slate-300" onClick={back}>
            ← Back
          </button>
        </div>

        {/* Connection / error banner */}
        {error && (
          <div className="mt-4 rounded-md border border-red-500/50 bg-red-500/10 px-3 py-2 font-mono text-sm text-red-300">
            {error}
          </div>
        )}
        {status === 'connecting' && (
          <div className="mt-4 rounded-md border border-holo/40 bg-holo/10 px-3 py-2 font-mono text-sm text-holo animate-pulse-glow">
            Connecting to war room uplink…
          </div>
        )}

        {/* Advanced: server URL */}
        <div className="mt-4">
          <button
            className="font-mono text-xs uppercase tracking-widest text-slate-500 hover:text-slate-300"
            onClick={() => setShowAdvanced((v) => !v)}
          >
            {showAdvanced ? '▾' : '▸'} Server settings
          </button>
          {showAdvanced && (
            <div className="mt-2">
              <label className="mb-1 block font-mono text-xs uppercase text-slate-500">Server URL</label>
              <input
                className="input-tac w-full"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder="https://your-server.example.com"
              />
              <p className="mt-1 font-mono text-[11px] text-slate-600">
                Defaults to same origin. Set this to reach a remote match server.
              </p>
            </div>
          )}
        </div>

        {/* Name entry (when not in a room) */}
        {!inRoom && (
          <div className="mt-4">
            <label className="mb-1 block font-mono text-xs uppercase text-slate-500">Callsign</label>
            <input
              className="input-tac w-full"
              value={name}
              maxLength={16}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
            />
          </div>
        )}

        {/* Not in a room: create / join */}
        {!inRoom && (
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-700 p-4">
              <h3 className="font-display text-sm font-bold uppercase tracking-wider text-white">Host a Match</h3>
              <p className="mt-1 font-mono text-xs text-slate-500">Create a room and share the 4-letter code.</p>
              <button
                className="btn-primary mt-3 w-full"
                disabled={busy}
                onClick={() => connectThen(() => mp.createRoom(name || randomName()))}
              >
                ＋ Create Room
              </button>
            </div>
            <div className="rounded-lg border border-slate-700 p-4">
              <h3 className="font-display text-sm font-bold uppercase tracking-wider text-white">Join a Match</h3>
              <input
                className="input-tac mt-2 w-full text-center font-mono text-lg uppercase tracking-[0.3em]"
                value={joinCode}
                maxLength={4}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
                placeholder="CODE"
              />
              <button
                className="btn-tac mt-3 w-full border-holo/50 text-holo"
                disabled={busy || joinCode.length !== 4}
                onClick={() => connectThen(() => mp.joinRoom(joinCode, name || randomName()))}
              >
                ⚡ Join Room
              </button>
            </div>
          </div>
        )}

        {/* In a room: show lobby */}
        {inRoom && (
          <div className="mt-6">
            <div className="rounded-lg border border-holo/40 bg-holo/5 p-4 text-center">
              <div className="font-mono text-xs uppercase tracking-widest text-slate-500">Room Code — share to invite</div>
              <div className="mt-1 font-display text-4xl font-bold tracking-[0.4em] text-holo animate-pulse-glow">
                {roomCode}
              </div>
            </div>

            {/* Players */}
            <div className="mt-4 grid grid-cols-2 gap-3">
              {[0, 1].map((seat) => {
                const p = lobby!.players[seat];
                const isMe = seat === mySeat;
                return (
                  <div
                    key={seat}
                    className={`rounded-lg border p-3 ${p && p.connected ? 'border-slate-600 bg-slate-800/50' : 'border-dashed border-slate-700'}`}
                  >
                    <div className="font-mono text-[11px] uppercase tracking-widest text-slate-500">
                      Seat {seat} {seat === lobby!.hostSeat ? '· Host' : ''}
                    </div>
                    {p && p.connected ? (
                      <>
                        <div className="mt-1 font-display text-sm font-bold text-white">
                          {p.name} {isMe && <span className="text-holo">(you)</span>}
                        </div>
                        <FactionBadge faction={p.faction} />
                        {isMe && lobby!.hostSeat !== undefined && (
                          <div className="mt-2 flex gap-1">
                            {FACTIONS.map((f) => (
                              <button
                                key={f.id}
                                title={f.name}
                                className={`h-6 flex-1 rounded border text-[10px] font-bold uppercase ${
                                  p.faction === f.id ? 'border-white' : 'border-slate-600'
                                }`}
                                style={{ color: f.color, borderColor: p.faction === f.id ? f.color : undefined }}
                                onClick={() => mp.pickFaction(f.id)}
                              >
                                {f.name.slice(0, 3)}
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="mt-1 font-mono text-sm text-slate-600">Waiting for player…</div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Start / status */}
            <div className="mt-5 flex gap-3">
              {mySeat === lobby!.hostSeat ? (
                <button
                  className="btn-primary flex-1"
                  disabled={!lobby!.players[0]?.connected || !lobby!.players[1]?.connected}
                  onClick={() => mp.startMatch()}
                >
                  ▶ Start Match
                </button>
              ) : (
                <div className="flex-1 rounded-md border border-slate-700 py-3 text-center font-mono text-sm text-slate-500">
                  Waiting for host to start…
                </div>
              )}
              <button className="btn-tac border-red-600/60 text-red-300" onClick={() => mp.leave()}>
                Leave
              </button>
            </div>
          </div>
        )}

        <p className="mt-6 text-center font-mono text-[11px] text-slate-600">
          Server-authoritative • deterministic hex battlefield • works behind the PWA offline cache for skirmish
        </p>
      </div>
    </div>
  );
}