// Minimap: a compact top-down overview of the whole board.
import { useEffect, useRef } from 'react';
import type { BoardMap } from '../../game/map/generator';
import type { HexCoord } from '../../game/types';
import { terrainOf } from '../../game/terrain/terrain';
import { hexToPixel, hexKey } from '../../utils/hex';

interface Props {
  map: BoardMap | null;
  selected: HexCoord | null;
  onJump?: (hex: HexCoord) => void;
}

export function Minimap({ map, selected, onJump }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !map) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;

    // Compute bounds in pixel space.
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const pts = new Map<string, { x: number; y: number }>();
    for (const k of map.tiles.keys()) {
      const [q, r] = k.split(',').map(Number);
      const p = hexToPixel({ q, r });
      pts.set(k, p);
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    const scale = Math.min((W - 8) / (maxX - minX || 1), (H - 8) / (maxY - minY || 1));
    const offX = (W - (maxX - minX) * scale) / 2 - minX * scale;
    const offY = (H - (maxY - minY) * scale) / 2 - minY * scale;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#05070b';
    ctx.fillRect(0, 0, W, H);

    const hexR = Math.max(1.5, 34 * scale * 0.9);
    for (const [k, p] of pts) {
      const terrain = terrainOf(map.tiles.get(k) ?? 'plains');
      const x = p.x * scale + offX;
      const y = p.y * scale + offY;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 180) * (60 * i - 30);
        const px = x + hexR * Math.cos(a);
        const py = y + hexR * Math.sin(a);
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = terrain.color;
      ctx.fill();
    }

    // Resource nodes.
    for (const node of map.nodes) {
      const p = pts.get(hexKey(node.pos));
      if (!p) continue;
      ctx.fillStyle = node.owner === 0 ? '#22d3ee' : node.owner === 1 ? '#ef4444' : '#e0b93a';
      ctx.beginPath();
      ctx.arc(p.x * scale + offX, p.y * scale + offY, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Selected highlight.
    if (selected) {
      const p = pts.get(hexKey(selected));
      if (p) {
        ctx.strokeStyle = '#4ade80';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x * scale + offX, p.y * scale + offY, hexR + 1, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }, [map, selected]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!map || !onJump) return;
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const sx = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const sy = ((e.clientY - rect.top) / rect.height) * canvas.height;

    // Find nearest tile pixel.
    let best: HexCoord | null = null;
    let bestD = Infinity;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const pts = new Map<string, { x: number; y: number }>();
    for (const k of map.tiles.keys()) {
      const [q, r] = k.split(',').map(Number);
      const p = hexToPixel({ q, r });
      pts.set(k, p);
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
    const scale = Math.min((canvas.width - 8) / (maxX - minX || 1), (canvas.height - 8) / (maxY - minY || 1));
    const offX = (canvas.width - (maxX - minX) * scale) / 2 - minX * scale;
    const offY = (canvas.height - (maxY - minY) * scale) / 2 - minY * scale;

    for (const [k, p] of pts) {
      const x = p.x * scale + offX;
      const y = p.y * scale + offY;
      const d = (x - sx) ** 2 + (y - sy) ** 2;
      if (d < bestD) {
        bestD = d;
        const [q, r] = k.split(',').map(Number);
        best = { q, r };
      }
    }
    if (best) onJump(best);
  };

  return (
    <div className="panel p-2">
      <div className="panel-title -m-2 mb-2 text-center">Tactical Map</div>
      <canvas
        ref={canvasRef}
        width={200}
        height={160}
        onClick={handleClick}
        className="w-full cursor-crosshair rounded"
      />
    </div>
  );
}