// ============================================================================
// React hook that mounts the PixiJS HexRenderer into a div and keeps it in sync.
// Phase 3 will feed live game state; for Phase 2 it manages map + selection.
// ============================================================================
import { useEffect, useRef } from 'react';
import { HexRenderer } from './HexRenderer';
import type { BoardMap } from '../game/map/generator';
import type { HexCoord } from '../game/types';

interface Options {
  map: BoardMap | null;
  onHover?: (hex: HexCoord | null) => void;
  onSelect?: (hex: HexCoord | null) => void;
  onZoom?: (zoom: number) => void;
}

export function useHexRenderer({ map, onHover, onSelect, onZoom }: Options) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<HexRenderer | null>(null);
  // Keep latest callbacks in refs so we don't re-init on every render.
  const cb = useRef({ onHover, onSelect, onZoom });
  cb.current = { onHover, onSelect, onZoom };

  useEffect(() => {
    let disposed = false;
    const host = hostRef.current;
    if (!host) return;

    const renderer = new HexRenderer({
      onHover: (h) => cb.current.onHover?.(h),
      onSelect: (h) => cb.current.onSelect?.(h),
      onZoom: (z) => cb.current.onZoom?.(z),
    });
    rendererRef.current = renderer;

    renderer.init(host).then(() => {
      if (disposed) {
        renderer.destroy();
        return;
      }
      if (map) renderer.setMap(map);
    });

    return () => {
      disposed = true;
      renderer.destroy();
      rendererRef.current = null;
    };
    // Re-init only if host changes (map handled separately below).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (map && rendererRef.current) rendererRef.current.setMap(map);
  }, [map]);

  return { hostRef, rendererRef };
}