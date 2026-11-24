// ============================================================================
// Camera: world<->screen transform with pan (drag), zoom (wheel / pinch),
// keyboard panning, and clamping to board bounds. Framework-agnostic; the
// renderer reads `offset`/`zoom` each frame.
// ============================================================================
import { CAMERA } from '../game/constants';

export interface CameraState {
  /** World-space point shown at the center of the viewport (px). */
  x: number;
  y: number;
  zoom: number;
}

interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export class Camera {
  state: CameraState = { x: 0, y: 0, zoom: CAMERA.defaultZoom };
  private bounds: Bounds = { minX: -Infinity, maxX: Infinity, minY: -Infinity, maxY: Infinity };
  private viewport = { width: 0, height: 0 };

  setViewport(w: number, h: number): void {
    this.viewport = { width: w, height: h };
  }

  setBounds(b: Bounds): void {
    this.bounds = b;
    this.clamp();
  }

  /** Center the camera on a world point (reset pan). */
  centerOn(wx: number, wy: number): void {
    this.state.x = wx;
    this.state.y = wy;
    this.clamp();
  }

  private clamp(): void {
    const s = this.state;
    s.zoom = Math.min(CAMERA.maxZoom, Math.max(CAMERA.minZoom, s.zoom));
    const halfW = this.viewport.width / 2 / s.zoom;
    const halfH = this.viewport.height / 2 / s.zoom;
    if (this.bounds.minX <= this.bounds.maxX) {
      s.x = Math.min(this.bounds.maxX - halfW, Math.max(this.bounds.minX + halfW, s.x));
    }
    if (this.bounds.minY <= this.bounds.maxY) {
      s.y = Math.min(this.bounds.maxY - halfH, Math.max(this.bounds.minY + halfH, s.y));
    }
  }

  /** Pan by a screen-space delta (pixels). */
  panByScreen(dx: number, dy: number): void {
    this.state.x -= dx / this.state.zoom;
    this.state.y -= dy / this.state.zoom;
    this.clamp();
  }

  /** Zoom around a screen point (anchor stays under cursor). */
  zoomAt(screenX: number, screenY: number, factor: number): void {
    const s = this.state;
    const before = this.screenToWorld(screenX, screenY);
    s.zoom = Math.min(CAMERA.maxZoom, Math.max(CAMERA.minZoom, s.zoom * factor));
    const after = this.screenToWorld(screenX, screenY);
    s.x += before.x - after.x;
    s.y += before.y - after.y;
    this.clamp();
  }

  zoomBy(factor: number): void {
    this.zoomAt(this.viewport.width / 2, this.viewport.height / 2, factor);
  }

  /** Keyboard pan in world units. */
  nudge(dx: number, dy: number): void {
    this.state.x += dx / this.state.zoom;
    this.state.y += dy / this.state.zoom;
    this.clamp();
  }

  /** Convert screen px (relative to canvas) to world px. */
  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    const s = this.state;
    return {
      x: (sx - this.viewport.width / 2) / s.zoom + s.x,
      y: (sy - this.viewport.height / 2) / s.zoom + s.y,
    };
  }

  /** Convert world px to screen px (relative to canvas). */
  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    const s = this.state;
    return {
      x: (wx - s.x) * s.zoom + this.viewport.width / 2,
      y: (wy - s.y) * s.zoom + this.viewport.height / 2,
    };
  }

  /** Apply this camera to a Pixi container (or anything with .position/.scale). */
  applyTo(target: { position: { set: (x: number, y: number) => void }; scale: { set: (x: number) => void }; pivot: { set: (x: number, y: number) => void } }): void {
    const s = this.state;
    target.scale.set(s.zoom);
    target.pivot.set(s.x, s.y);
    target.position.set(this.viewport.width / 2, this.viewport.height / 2);
  }
}