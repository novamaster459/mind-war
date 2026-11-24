# War Room Tactics — Architecture

A turn-based tactical war board game PWA inspired by *Command & Conquer: Generals*.
Three asymmetric factions fight over a contested hex-grid battlefield with terrain
mechanics, fog of war, a dual-resource economy and General Powers.

---

## Tech Stack

| Concern            | Choice                                             |
| ------------------ | -------------------------------------------------- |
| UI framework       | **React 18** + **TypeScript**                       |
| Build tool         | **Vite 6**                                          |
| Styling            | **Tailwind CSS 3** (+ custom War Room theme)        |
| State management   | **Zustand** (UI/app) + pure engine for match state  |
| 2.5D renderer      | **PixiJS 8** (WebGL, isometric-look hex grid)        |
| PWA / SW caching   | **vite-plugin-pwa** (Workbox, `autoUpdate`)          |
| Audio              | **Web Audio API** (procedural, offline)             |
| Persistence        | **localStorage** (settings) → **IndexedDB** (saves)  |
| Online multiplayer | **Socket.IO** (server-authoritative) — Phase 5       |
| Offline AI         | Utility-based evaluation + alpha-beta (Phase 4)      |

---

## Folder Structure

```
src/
├─ main.tsx                # React entry
├─ App.tsx                 # Screen router + global settings effect
├─ styles/index.css        # Tailwind + War Room theme, CRT overlay
├─ game/                   # Pure, UI-agnostic game domain
│  ├─ types.ts             # All shared domain types (board, units, state)
│  ├─ constants.ts         # Balance/config constants
│  ├─ factions/            # Faction & unit definitions (Phase 3)
│  ├─ terrain/             # Terrain definitions (Phase 2/3)
│  ├─ units/               # Unit defs & stats (Phase 3)
│  ├─ hex/                 # Grid math wrapper (Phase 2)
│  ├─ combat/              # Damage, LoS, fog-of-war (Phase 3)
│  ├─ economy/             # Resource/turn economy (Phase 3)
│  ├─ powers/              # General Powers (Phase 3)
│  ├─ ai/                  # Utility AI bot (Phase 4)
│  └─ engine/              # Match state machine + reducer (Phase 3)
├─ render/                 # PixiJS renderer, camera, picking (Phase 2)
├─ net/                    # Socket.IO client + protocol (Phase 5)
├─ audio/AudioEngine.ts    # Procedural Web Audio SFX
├─ state/appStore.ts       # Zustand app/UI store
├─ storage/                # Settings + save/load (localStorage → IndexedDB)
├─ ui/
│  ├─ screens/             # MainMenu, SkirmishSetup, Lobby, Game, Settings
│  └─ components/          # FactionBadge, WarRoomBackground, HUD widgets
└─ utils/                  # hex math, cn(), helpers
```

### Architectural principles

1. **Pure domain core.** Everything in `src/game/` is framework-agnostic and
   deterministic given `(state, action)`. This makes the AI, the renderer, the
   online validator and tests all reuse the *same* logic.
2. **Server-authoritative validation (Phase 5)** reuses the pure reducer on the
   server, so client and server never disagree on rules.
3. **One-way data flow.** UI dispatches `GameAction`s → engine reduces →
   renderer reads immutable state → HUD re-renders.
4. **Offline-first.** No runtime network calls for skirmish; all assets cached by
   the service worker.

---

## Game Model (summary)

- **Grid:** axial hex coordinates, pointy-top, map radius 7 (`hexRingDistance`).
- **Factions:** Coalition (cyan / tech+air), Syndicate (crimson / heavy armor),
  Insurgents (amber / guerrilla, stealth).
- **Resources:** **Supplies** (build units) + **Command Points** (powers), both
  generated per turn, boosted by captured **Supply Depots / Oil Derricks**.
- **Terrain:** plains, forest (concealment + heavy penalty), hills (range/vision),
  urban (cover, garrison), water (impassable), road (fast), plus capturable nodes.
- **Fog of War:** per-seat `visible` + `explored` maps; LoS blocked by urban.
- **Victory:** destroy all enemy units / hold majority of nodes, etc.

---

## Phase Roadmap

1. **Phase 1 — Architecture & Setup** ✅ (this milestone)
   - Vite + React + TS + Tailwind, Zustand store, PWA manifest + icons, service
     worker via Workbox, procedural audio engine, themed app shell, screen router.
2. **Phase 2 — Grid Engine & Rendering** — PixiJS hex renderer, camera
   (pan/zoom/pinch), picking, terrain painting, radar/scanline overlays.
3. **Phase 3 — Combat & Rules** — unit stats, movement/pathfinding, LoS, fog of
   war, damage math, economy, General Powers, full match loop.
4. **Phase 4 — Offline AI** — utility AI (Skirmish/Veteran/Brutal) with terrain,
   capture, counter-composition & fair fog handling.
5. **Phase 5 — Online + Polish** — Socket.IO backend, 4-letter room codes,
   server-authoritative validation, reconnection, final PWA offline audit.

---

## Getting Started

```bash
npm install
npm run dev       # dev server (http://localhost:5173)
npm run build     # type-check + production build (PWA)
npm run preview   # preview the production build
```

> The environment this was scaffolded in has **Node.js supplied via the Goose
> portable runtime** at `%LOCALAPPDATA%\Goose\node`. Prepend it to `PATH` if
> `node`/`npm` are not globally available.