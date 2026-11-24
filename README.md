# War Room Tactics

A turn-based tactical war board game PWA inspired by *C&C: Generals*. Three
asymmetric factions fight over a contested hex-grid battlefield with fog of war,
a dual-resource economy, and XP-unlocked General Powers. Built with a modern
military "War Room" aesthetic (dark gunmetal, holographic accents, CRT scanlines).

- **Coalition** (cyan) — precision tech & air superiority
- **Syndicate** (crimson) — heavy armor & overwhelming firepower
- **Insurgents** (amber) — guerrilla tactics & hit-and-run

## Features

- **Hex-grid battlefield** (axial coords, pointy-top) rendered with PixiJS in 2.5D
- **8 terrain types** with movement cost, cover, vision & capture mechanics
- **Fog of war** + line-of-sight (urban blocks LOS, forest conceals)
- **Dual economy** — supplies (build units) + command points (General Powers)
- **Asymmetric units** with class counters (infantry/light/heavy/artillery/air)
- **General Powers** — airstrike, EMP, supply drop, artillery barrage, recon, repair
- **Offline AI** — utility-based bot with Skirmish / Veteran / Brutal difficulties
- **Online multiplayer** — server-authoritative, 4-letter room codes (Socket.IO)
- **Installable PWA** — offline-first via service worker, no audio assets needed
  (all SFX synthesized with the Web Audio API)

## Tech Stack

Vite 6 · React 18 · TypeScript · Tailwind CSS 3 · Zustand · PixiJS 8 ·
Socket.IO · vite-plugin-pwa (Workbox) · tsx (headless tests)

## Getting Started

```bash
npm install

# Play offline (skirmish vs AI)
npm run dev            # http://localhost:5173

# Play online: run the authoritative server, then open the app
npm run server         # game server on :8080
#   optional: SERVE_DIST=1 npm run server  -> also serves the built client
#   set a custom server in the lobby's "Server settings" if not same-origin
```

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server (client) |
| `npm run build` | Type-check + production build to `dist/` (+ PWA service worker) |
| `npm run server` | Start the authoritative multiplayer server |
| `npm run test:logic` | Hex math / map / terrain / RNG tests |
| `npm run test:engine` | Reducer / combat / economy / LoS tests |
| `npm run test:ai` | AI legality, difficulty scaling, match termination |
| `npm run test:multiplayer` | End-to-end server: rooms, authority, sync, disconnect |

## Architecture

A single **pure, deterministic Engine reducer** (`src/game/engine/Engine.ts`) is
shared by all three front-ends:

- **Skirmish client** runs the engine locally and drives the AI bot.
- **Online server** runs the identical engine as the authority — clients send
  only `GameAction` intents and render the broadcast `GameState`.
- **Map generation is seeded & deterministic**, so online clients rebuild the
  exact same board locally for rendering while the server owns game truth.

```
src/
  game/        types, constants, terrain, units, powers, map gen
    combat/    movement (Dijkstra), line-of-sight, damage math
    economy/   supplies & command income
    engine/    Engine.ts — the deterministic reducer (effects + state)
    ai/        bot.ts — utility-based offline AI
  render/      PixiJS hex renderer + camera
  net/         protocol.ts (shared types), socket.ts (client transport)
  state/       appStore, matchStore (skirmish), multiplayerStore (online)
  ui/          screens (menu, setup, lobby, battle, settings) + components
server/
  index.ts     authoritative Socket.IO server (rooms + engine validation)
scripts/       headless test harnesses
```

## Controls

- Click a friendly unit to select; highlighted hexes show move range (cyan) and
  fire targets (red). Click to move, click an enemy to attack, click a node to capture.
- Use the sidebar to build units and fire General Powers (click power, then map).
- **End Turn** passes control; in skirmish the AI replies automatically.

## Notes

- All project files, npm cache, and temp live on the **D: drive** to spare the
  system disk. The production build uses `--max-old-space-size=4096` to bundle
  PixiJS without OOM.
- Fully offline-capable: the PWA caches the app shell, JS/CSS, and assets.