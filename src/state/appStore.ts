// ============================================================================
// UI / app-level store (Zustand). Game-specific state lives in the engine;
// this holds cross-cutting app concerns: current screen, settings, network.
// ============================================================================
import { create } from 'zustand';
import { loadSettings, saveSettings, type Settings } from '../storage/settings';
import { audio } from '../audio/AudioEngine';

export type Screen = 'menu' | 'skirmish' | 'lobby' | 'game' | 'settings';

export type ConnectionStatus = 'offline' | 'connecting' | 'online';
export type MatchMode = 'skirmish' | 'online';

interface AppState {
  screen: Screen;
  settings: Settings;
  connection: ConnectionStatus;
  roomCode: string | null;
  matchMode: MatchMode;

  go: (screen: Screen) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  setConnection: (status: ConnectionStatus) => void;
  setRoomCode: (code: string | null) => void;
  setMatchMode: (mode: MatchMode) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  screen: 'menu',
  settings: loadSettings(),
  connection: navigator.onLine ? 'offline' : 'offline',
  roomCode: null,
  matchMode: 'skirmish',

  go: (screen) => set({ screen }),

  updateSettings: (patch) => {
    const next = { ...get().settings, ...patch };
    saveSettings(next);
    audio.setSfxVolume(next.sfxVolume);
    audio.setMusicVolume(next.musicVolume);
    set({ settings: next });
  },

  setConnection: (connection) => set({ connection }),
  setRoomCode: (roomCode) => set({ roomCode }),
  setMatchMode: (matchMode) => set({ matchMode }),
}));

// Apply saved audio settings on boot.
const boot = useAppStore.getState().settings;
audio.setSfxVolume(boot.sfxVolume);
audio.setMusicVolume(boot.musicVolume);