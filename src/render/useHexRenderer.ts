// ============================================================================
// React hook that mounts the PixiJS HexRenderer into a div and keeps it in sync.
// The renderer's init() is async, so state pushed during the first frames is
// buffered by the renderer itself (see HexRenderer.setMap / pendingMap).
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
  // Keep latest callbacks + map in refs so we don't re-init on every render.
  const cb = useRef({ onHover, onSelect, onZoom });
  cb.current = { onHover, onSelect, onZoom };
  const latestMap = useRef<BoardMap | null>(map);
  latestMap.current = map;

  useEffect(() => {
    let disposed = false;
    const host = hostRef.current;
    if (!host) return;
    host.style.height = '100%';
    host.style.width = '100%';

    const renderer = new HexRenderer({
      onHover: (h) => cb.current.onHover?.(h),
      onSelect: (h) => cb.current.onSelect?.(h),
      onZoom: (z) => cb.current.onZoom?.(z),
    });
    rendererRef.current = renderer;

    renderer.init(host).then(() => {
      if (disposed) return;
      // init() applies any map that arrived early; this covers the case where
      // the map became available *after* init resolved.
      if (latestMap.current) renderer.setMap(latestMap.current);
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