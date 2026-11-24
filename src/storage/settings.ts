// ============================================================================
// Settings persistence (localStorage wrapper) — offline friendly.
// ============================================================================
import { STORAGE_KEYS } from '../game/constants';

export interface Settings {
  musicVolume: number; // 0..1
  sfxVolume: number; // 0..1
  screenShake: boolean;
  showScanlines: boolean;
  reduceMotion: boolean;
  lastFaction: string;
}

export const DEFAULT_SETTINGS: Settings = {
  musicVolume: 0.4,
  sfxVolume: 0.7,
  screenShake: true,
  showScanlines: true,
  reduceMotion: false,
  lastFaction: 'coalition',
};

const read = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

const write = (key: string, value: unknown): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage may be unavailable (private mode) — ignore */
  }
};

export const loadSettings = (): Settings => ({
  ...DEFAULT_SETTINGS,
  ...read<Partial<Settings>>(STORAGE_KEYS.settings, {}),
});

export const saveSettings = (settings: Settings): void =>
  write(STORAGE_KEYS.settings, settings);