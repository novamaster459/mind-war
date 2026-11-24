// ============================================================================
// PixiJS hex-grid battlefield renderer.
// - Draws a 2.5D extruded hex board (terrain fills, depth shadows, grid lines).
// - Renders capturable resource nodes.
// - Handles camera (pan / zoom / pinch / keyboard), picking and hover/select.
// - Exposes a small imperative API the React layer drives each state change.
// Phase 3 will add units, fog-of-war and combat overlays on top of this.
// ============================================================================
import { Application, Container, Graphics, Text, Color } from 'pixi.js';
import type { HexCoord, ResourceNode, Unit } from '../game/types';
import type { BoardMap } from '../game/map/generator';
import { terrainOf } from '../game/terrain/terrain';
import { unitDef } from '../game/units/units';
import { Camera } from './camera';
import { hexToPixel, pixelToHex, hexCorners, hexKey } from '../utils/hex';
import { HEX_SIZE, CAMERA } from '../game/constants';

interface RendererCallbacks {
  onHover?: (hex: HexCoord | null) => void;
  onSelect?: (hex: HexCoord | null) => void;
  onZoom?: (zoom: number) => void;
}

/** Per-terrain extrusion depth (px) for the 2.5D look. */
const DEPTH: Record<string, number> = {
  water: 2,
  plains: 6,
  road: 4,
  forest: 8,
  hills: 12,
  urban: 14,
  supplyDepot: 9,
  oilDerrick: 9,
};

const shade = (hex: string, amt: number): number => {
  // amt < 0 darkens, > 0 lightens (operates on 0..255 channels)
  const n = new Color(hex).toNumber();
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const r = clamp(((n >> 16) & 0xff) + amt);
  const g = clamp(((n >> 8) & 0xff) + amt);
  const b = clamp((n & 0xff) + amt);
  return (r << 16) | (g << 8) | b;
};

const toColor = (hex: string): number => new Color(hex).toNumber();

export class HexRenderer {
  private app = new Application();
  private camera = new Camera();
  private world = new Container();
  private gfxTiles = new Graphics(); // static terrain + extrusion
  private gfxGrid = new Graphics(); // hex outlines
  private gfxOverlay = new Graphics(); // hover / selection / highlights
  private nodeLayer = new Container();
  private unitLayer = new Container();
  private host: HTMLElement | null = null;
  private map: BoardMap | null = null;
  /** True once `app.init()` has resolved and the Pixi renderer exists. */
  private ready = false;
  /** True once init finished wiring the canvas + listeners. */
  private initialized = false;
  /** Map requested before init finished; applied as soon as it's ready. */
  private pendingMap: BoardMap | null = null;
  private destroyed = false;
  private callbacks: RendererCallbacks;

  // Interaction state
  private hovered: HexCoord | null = null;
  private selected: HexCoord | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private dragStart: { x: number; y: number } | null = null;
  private lastClient: { x: number; y: number } | null = null;
  private dragging = false;
  private lastPinchDist = 0;
  private resizeObs: ResizeObserver | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  // bound handlers
  private onPointerDown = (e: PointerEvent) => this.handleDown(e);
  private onPointerMove = (e: PointerEvent) => this.handleMove(e);
  private onPointerUp = (e: PointerEvent) => this.handleUp(e);
  private onWheel = (e: WheelEvent) => this.handleWheel(e);

  constructor(callbacks: RendererCallbacks = {}) {
    this.callbacks = callbacks;
  }

  async init(host: HTMLElement): Promise<void> {
    this.host = host;
    await this.app.init({
      background: '#05070b',
      antialias: true,
      resizeTo: host,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    });
    // The component may have unmounted while init was awaiting.
    if (this.destroyed) {
      this.app.destroy(true, { children: true });
      return;
    }
    this.ready = true;
    this.initialized = true;
    host.appendChild(this.app.canvas);
    this.app.canvas.style.display = 'block';
    this.app.canvas.style.touchAction = 'none';

    this.world.addChild(this.gfxTiles, this.gfxGrid, this.nodeLayer, this.unitLayer, this.gfxOverlay);
    this.app.stage.addChild(this.world);

    this.camera.setViewport(this.app.screen.width, this.app.screen.height);

    // Input listeners on the canvas.
    const c = this.app.canvas;
    c.addEventListener('pointerdown', this.onPointerDown);
    c.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    c.addEventListener('wheel', this.onWheel, { passive: false });

    this.keyHandler = (e: KeyboardEvent) => {
      const step = 48;
      if (e.key === 'ArrowLeft') this.camera.nudge(-step, 0);
      else if (e.key === 'ArrowRight') this.camera.nudge(step, 0);
      else if (e.key === 'ArrowUp') this.camera.nudge(0, -step);
      else if (e.key === 'ArrowDown') this.camera.nudge(0, step);
      else if (e.key === '+' || e.key === '=') this.camera.zoomBy(CAMERA.zoomStep);
      else if (e.key === '-' || e.key === '_') this.camera.zoomBy(1 / CAMERA.zoomStep);
    };
    window.addEventListener('keydown', this.keyHandler);

    this.resizeObs = new ResizeObserver(() => {
      if (!this.host) return;
      this.camera.setViewport(this.app.screen.width, this.app.screen.height);
      this.camera.zoomBy(1); // re-clamp with new viewport
      this.camera.applyTo(this.world);
    });
    this.resizeObs.observe(host);

    // Render loop (kept for future animations: pulses, fog shimmer, movement tweens).
    this.app.ticker.add(() => this.camera.applyTo(this.world));
    this.camera.applyTo(this.world);

    // A map may have been requested before the renderer existed (React effects
    // run before the async init resolves). Apply it now.
    if (this.pendingMap) {
      const m = this.pendingMap;
      this.pendingMap = null;
      this.setMap(m);
    }
  }

  // -------------------------------------------------------------------------
  // Board setup
  // -------------------------------------------------------------------------
  setMap(map: BoardMap): void {
    this.map = map;
    // The Pixi renderer doesn't exist until init() resolves. Stash the map and
    // apply it there instead of touching app.screen (which would throw).
    if (!this.ready) {
      this.pendingMap = map;
      return;
    }
    this.drawBoard();
    this.drawNodes();

    // Frame the board: center camera on origin and compute pan bounds.
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const k of map.tiles.keys()) {
      const [q, r] = k.split(',').map(Number);
      const p = hexToPixel({ q, r });
      minX = Math.min(minX, p.x - HEX_SIZE);
      maxX = Math.max(maxX, p.x + HEX_SIZE);
      minY = Math.min(minY, p.y - HEX_SIZE);
      maxY = Math.max(maxY, p.y + HEX_SIZE);
    }
    this.camera.setBounds({ minX, maxX, minY, maxY });
    this.camera.centerOn((minX + maxX) / 2, (minY + maxY) / 2);
    // Auto-fit zoom.
    const fitZoom = Math.min(
      this.app.screen.width / (maxX - minX + 120),
      this.app.screen.height / (maxY - minY + 120),
    );
    this.camera.state.zoom = Math.max(CAMERA.minZoom, Math.min(1.1, fitZoom));
    this.camera.applyTo(this.world);
  }

  private drawBoard(): void {
    const g = this.gfxTiles;
    const grid = this.gfxGrid;
    g.clear();
    grid.clear();
    if (!this.map) return;

    // Back-to-front ordering for correct overlap of extrusions.
    const tiles = [...this.map.tiles.entries()]
      .map(([k, terrain]) => {
        const [q, r] = k.split(',').map(Number);
        return { q, r, terrain, py: hexToPixel({ q, r }).y };
      })
      .sort((a, b) => a.r - b.r || a.py - b.py);

    for (const t of tiles) {
      const terrain = terrainOf(t.terrain);
      const center = hexToPixel({ q: t.q, r: t.r });
      const depth = DEPTH[t.terrain] ?? 6;
      const baseColor = toColor(terrain.color);

      // Extrusion side (dark), drawn slightly lower for depth.
      const sidePts = this.hexPoints(center.x, center.y + depth);
      g.poly(sidePts).fill({ color: shade(terrain.color, -48) });

      // Top face.
      const topPts = this.hexPoints(center.x, center.y);
      g.poly(topPts).fill({ color: baseColor });

      // Top-edge highlight for a crisp holographic rim.
      const rimPts = this.hexPoints(center.x, center.y - 0.5);
      grid.poly(rimPts).stroke({ width: 1, color: toColor(terrain.accent), alpha: 0.35 });

      // Subtle accent speckle for texture on notable terrain.
      if (t.terrain === 'forest' || t.terrain === 'hills' || t.terrain === 'urban') {
        grid.circle(center.x, center.y, HEX_SIZE * 0.28).fill({ color: toColor(terrain.accent), alpha: 0.18 });
      }
    }
  }

  private hexPoints(cx: number, cy: number): number[] {
    const pts = hexCorners({ x: cx, y: cy }, HEX_SIZE * 0.94);
    const flat: number[] = [];
    for (const p of pts) flat.push(p.x, p.y);
    return flat;
  }

  private drawNodes(): void {
    this.nodeLayer.removeChildren().forEach((c) => c.destroy());
    if (!this.map) return;
    for (const node of this.map.nodes) this.drawNode(node);
  }

  // -------------------------------------------------------------------------
  // Units
  // -------------------------------------------------------------------------
  private units: Unit[] = [];
  private visibility: Record<string, boolean> = {};
  private viewerSeat = 0;

  /** Update rendered units + fog. Called on each state change. */
  setUnits(units: Unit[], visibility: Record<string, boolean>, viewerSeat = 0): void {
    this.units = units;
    this.visibility = visibility;
    this.viewerSeat = viewerSeat;
    this.drawUnits();
  }

  private drawUnits(): void {
    this.unitLayer.removeChildren().forEach((c) => c.destroy());
    for (const u of this.units) {
      if (u.hp <= 0) continue;
      // Fog: enemy units only rendered if their hex is visible.
      if (u.owner !== this.viewerSeat && !this.visibility[hexKey(u.pos)]) continue;
      this.drawUnit(u);
    }
  }

  private drawUnit(u: Unit): void {
    const def = unitDef(u.defId);
    const c = hexToPixel(u.pos);
    const g = new Graphics();
    const isFriendly = u.owner === this.viewerSeat;
    const bodyColor = u.owner === 0 ? 0x22d3ee : 0xef4444;
    const ringColor = isFriendly ? 0x4ade80 : 0xef4444;

    // Shadow ellipse for grounding.
    g.ellipse(c.x, c.y + 6, HEX_SIZE * 0.42, HEX_SIZE * 0.22).fill({ color: 0x000000, alpha: 0.4 });

    // Body: class-shaped glyph.
    const r = HEX_SIZE * 0.34;
    switch (def.cls) {
      case 'infantry':
        g.circle(c.x, c.y, r * 0.7).fill({ color: bodyColor });
        break;
      case 'lightArmor':
        g.roundRect(c.x - r, c.y - r * 0.6, r * 2, r * 1.2, 3).fill({ color: bodyColor });
        break;
      case 'heavyArmor':
        g.roundRect(c.x - r, c.y - r * 0.7, r * 2, r * 1.4, 4).fill({ color: bodyColor });
        g.rect(c.x - r * 0.25, c.y - r * 1.1, r * 0.5, r * 0.8).fill({ color: bodyColor }); // turret
        break;
      case 'artillery':
        g.poly([c.x, c.y - r, c.x + r, c.y + r * 0.6, c.x - r, c.y + r * 0.6]).fill({ color: bodyColor });
        break;
      case 'air':
        g.poly([c.x, c.y - r, c.x + r * 0.8, c.y, c.x + r * 0.3, c.y + r * 0.7, c.x - r * 0.3, c.y + r * 0.7, c.x - r * 0.8, c.y]).fill({ color: bodyColor });
        break;
    }

    // Selection / ownership ring.
    g.circle(c.x, c.y, r + 3).stroke({ width: 2, color: ringColor, alpha: 0.9 });

    // Health bar.
    const w = HEX_SIZE * 0.9;
    const hpFrac = Math.max(0, u.hp / def.maxHp);
    const barY = c.y - r - 10;
    g.rect(c.x - w / 2, barY, w, 5).fill({ color: 0x000000, alpha: 0.7 });
    const hpColor = hpFrac > 0.6 ? 0x4ade80 : hpFrac > 0.3 ? 0xf59e0b : 0xef4444;
    g.rect(c.x - w / 2, barY, w * hpFrac, 5).fill({ color: hpColor });

    this.unitLayer.addChild(g);

    // Garrison / stance marker.
    if (u.garrisoned) {
      const mark = new Text({ text: '▣', style: { fontSize: 12, fill: '#f59e0b' } });
      mark.anchor.set(0.5);
      mark.position.set(c.x + r, c.y - r);
      this.unitLayer.addChild(mark);
    }
  }

  private drawNode(node: ResourceNode): void {
    const c = hexToPixel(node.pos);
    const g = new Graphics();
    const accent = toColor(terrainOf(node.terrain).accent);
    const ownerColor = node.owner === 0 ? 0x22d3ee : node.owner === 1 ? 0xef4444 : 0xe0b93a;

    // Base pad
    g.circle(c.x, c.y, HEX_SIZE * 0.5).fill({ color: 0x000000, alpha: 0.35 });
    g.circle(c.x, c.y, HEX_SIZE * 0.5).stroke({ width: 2, color: ownerColor, alpha: 0.9 });

    if (node.terrain === 'oilDerrick') {
      // derrick triangle
      g.poly([c.x, c.y - 14, c.x - 11, c.y + 9, c.x + 11, c.y + 9]).fill({ color: accent });
      g.poly([c.x, c.y - 14, c.x - 11, c.y + 9, c.x + 11, c.y + 9]).stroke({ width: 1.5, color: 0xffffff, alpha: 0.5 });
    } else {
      // supply crates
      g.rect(c.x - 12, c.y - 8, 11, 11).fill({ color: accent });
      g.rect(c.x + 1, c.y - 4, 11, 11).fill({ color: shade('#e0b93a', -20) });
      g.rect(c.x - 12, c.y - 8, 11, 11).stroke({ width: 1, color: 0x000000, alpha: 0.4 });
    }

    // Income label
    const label = new Text({
      text: `+${terrainOf(node.terrain).income}`,
      style: { fontFamily: 'monospace', fontSize: 11, fill: '#e0b93a', stroke: { color: '#000', width: 2 } },
    });
    label.anchor.set(0.5);
    label.position.set(c.x, c.y + 18);

    this.nodeLayer.addChild(g, label);
  }

  // -------------------------------------------------------------------------
  // Overlays (hover / selection / tactical highlights)
  // -------------------------------------------------------------------------
  private drawOverlay(): void {
    const g = this.gfxOverlay;
    g.clear();

    if (this.hovered) {
      const p = hexToPixel(this.hovered);
      const pts = this.hexPoints(p.x, p.y);
      g.poly(pts).fill({ color: 0x22d3ee, alpha: 0.1 });
      g.poly(pts).stroke({ width: 2, color: 0x22d3ee, alpha: 0.9 });
    }
    if (this.selected) {
      const p = hexToPixel(this.selected);
      const pts = this.hexPoints(p.x, p.y);
      g.poly(pts).fill({ color: 0x4ade80, alpha: 0.14 });
      g.poly(pts).stroke({ width: 2.5, color: 0x4ade80, alpha: 1 });
    }
  }

  setSelection(hex: HexCoord | null): void {
    this.selected = hex;
    this.drawOverlay();
  }

  /** Highlight a set of hexes (e.g. reachable/attackable) — used in Phase 3. */
  setHighlights(entries: { hex: HexCoord; color: string }[]): void {
    const g = this.gfxOverlay;
    // Re-draw base (hover/selection) then highlights.
    this.drawOverlay();
    for (const e of entries) {
      const p = hexToPixel(e.hex);
      const pts = this.hexPoints(p.x, p.y);
      g.poly(pts).fill({ color: toColor(e.color), alpha: 0.12 });
      g.poly(pts).stroke({ width: 1.5, color: toColor(e.color), alpha: 0.6 });
    }
  }

  // -------------------------------------------------------------------------
  // Picking & input
  // -------------------------------------------------------------------------
  private pick(clientX: number, clientY: number): HexCoord | null {
    if (!this.host || !this.map) return null;
    const rect = this.app.canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    const world = this.camera.screenToWorld(sx, sy);
    const hex = pixelToHex(world.x, world.y);
    return this.map.tiles.has(hexKey(hex)) ? hex : null;
  }

  private handleDown(e: PointerEvent): void {
    this.app.canvas.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 1) {
      this.dragStart = { x: e.clientX, y: e.clientY };
      this.lastClient = { x: e.clientX, y: e.clientY };
      this.dragging = false;
    } else if (this.pointers.size === 2) {
      const pts = [...this.pointers.values()];
      this.lastPinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      this.dragging = true; // pinch counts as a gesture (suppress click)
    }
  }

  private handleMove(e: PointerEvent): void {
    if (this.pointers.has(e.pointerId)) {
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    // Two-finger pinch zoom.
    if (this.pointers.size === 2) {
      const pts = [...this.pointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      if (this.lastPinchDist > 0) {
        const factor = dist / this.lastPinchDist;
        const rect = this.app.canvas.getBoundingClientRect();
        this.camera.zoomAt(mid.x - rect.left, mid.y - rect.top, factor);
      }
      this.lastPinchDist = dist;
      return;
    }

    // One-pointer drag to pan (incremental, using last event position).
    if (this.pointers.size === 1 && this.dragStart && this.lastClient) {
      const dx = e.clientX - this.lastClient.x;
      const dy = e.clientY - this.lastClient.y;
      if (!this.dragging && Math.hypot(e.clientX - this.dragStart.x, e.clientY - this.dragStart.y) > 5) {
        this.dragging = true;
      }
      if (this.dragging) this.camera.panByScreen(dx, dy);
      this.lastClient = { x: e.clientX, y: e.clientY };
      return;
    }

    // Hover picking.
    const hex = this.pick(e.clientX, e.clientY);
    if ((hex?.q ?? null) !== (this.hovered?.q ?? null) || (hex?.r ?? null) !== (this.hovered?.r ?? null)) {
      this.hovered = hex;
      this.drawOverlay();
      this.callbacks.onHover?.(hex);
    }
  }

  private handleUp(e: PointerEvent): void {
    const wasDragging = this.dragging;
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.lastPinchDist = 0;

    if (this.pointers.size === 0) {
      if (!wasDragging) {
        const hex = this.pick(e.clientX, e.clientY);
        this.selected = hex;
        this.drawOverlay();
        this.callbacks.onSelect?.(hex);
      }
      this.dragStart = null;
      this.dragging = false;
      this.lastClient = null;
    }
  }

  private handleWheel(e: WheelEvent): void {
    e.preventDefault();
    const rect = this.app.canvas.getBoundingClientRect();
    const factor = e.deltaY < 0 ? CAMERA.zoomStep : 1 / CAMERA.zoomStep;
    this.camera.zoomAt(e.clientX - rect.left, e.clientY - rect.top, factor);
    this.callbacks.onZoom?.(this.camera.state.zoom);
  }

  // -------------------------------------------------------------------------
  // Public helpers
  // -------------------------------------------------------------------------
  get zoom(): number {
    return this.camera.state.zoom;
  }

  /** Center the camera on a hex (used by minimap navigation). */
  focusHex(hex: HexCoord): void {
    const p = hexToPixel(hex);
    this.camera.centerOn(p.x, p.y);
    this.camera.applyTo(this.world);
  }

  resetView(): void {
    if (!this.map) return;
    // re-run fit from setMap math (cheap): center + fit zoom already clamped.
    this.camera.state.zoom = CAMERA.defaultZoom;
    this.camera.zoomBy(1);
  }

  destroy(): void {
    // Idempotent + safe to call before init() resolves (React StrictMode
    // unmounts effects immediately after mounting them).
    if (this.destroyed) return;
    this.destroyed = true;
    this.ready = false;

    if (!this.host) return;
    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
    this.resizeObs?.disconnect();

    if (this.initialized) {
      const c = this.app.canvas;
      c.removeEventListener('pointerdown', this.onPointerDown);
      c.removeEventListener('pointermove', this.onPointerMove);
      window.removeEventListener('pointerup', this.onPointerUp);
      c.removeEventListener('wheel', this.onWheel);
      this.app.destroy(true, { children: true });
    }
  }
}