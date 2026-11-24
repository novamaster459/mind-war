// ============================================================================
// Global configuration & balance constants.
// ============================================================================

export const APP_NAME = 'War Room Tactics';
export const APP_SHORT = 'WRT';

/** Map size in axial hexes. */
export const MAP_RADIUS = 7; // hex-shaped map

/** Economy defaults. */
export const STARTING_SUPPLIES = 600;
export const STARTING_COMMAND = 5;
export const SUPPLY_PER_NODE = 75; // per owned supply node per turn
export const COMMAND_PER_NODE = 1;
export const BASE_COMMAND_INCOME = 2; // passive command points per turn
export const XP_PER_KILL = 25;
export const XP_PER_WIN = 100;

/** Rendering / camera. */
export const HEX_SIZE = 34; // radius of a hex in px (pointy-top)
export const CAMERA = {
  minZoom: 0.5,
  maxZoom: 2.5,
  defaultZoom: 1,
  panSpeed: 1,
  zoomStep: 1.1,
};

/** Tile coordinate helpers config. */
export const HEX_DIRECTIONS: ReadonlyArray<{ q: number; r: number }> = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

/** Colors for seats / ownership. */
export const SEAT_COLORS: Record<number, string> = {
  0: '#22d3ee',
  1: '#ef4444',
};

/** PWA / storage keys. */
export const STORAGE_KEYS = {
  settings: 'wrt:settings',
  campaign: 'wrt:campaign',
  skirmish: 'wrt:skirmish',
} as const;