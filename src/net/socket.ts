// ============================================================================
// Browser socket client (lazy singleton). Connects to the authoritative game
// server. The server URL is configurable (env override at build, a saved
// setting, or same-origin) so the PWA can target a deployed server.
//
// This module is transport only — it owns the Socket.IO connection. Higher
// layers (the multiplayer store) subscribe to events and map them to app state.
// ============================================================================
import { io, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from './protocol';

// socket.io-client's Socket type carries (listen ← server→client, emit → client→server).
type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: GameSocket | null = null;

/** Resolve the server URL: explicit override → saved setting → same origin. */
export function resolveServerUrl(): string {
  // 1) Build-time env (Vite exposes import.meta.env.VITE_*).
  const envUrl = (import.meta as { env?: Record<string, string> }).env?.VITE_SERVER_URL;
  if (envUrl) return envUrl;
  // 2) Saved preference.
  try {
    const saved = localStorage.getItem('wrt_server_url');
    if (saved) return saved;
  } catch {
    /* ignore */
  }
  // 3) Same origin (e.g. server serving the built client via SERVE_DIST=1).
  return window.location.origin;
}

/** Get (or lazily create) the shared socket and ensure it's connected. */
export function getSocket(): GameSocket {
  if (socket) return socket;
  const url = resolveServerUrl();
  socket = io(url, {
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: 8,
    reconnectionDelay: 600,
    transports: ['websocket', 'polling'],
  });
  return socket;
}

/** Connect if not already connected. Returns the socket. */
export function connectSocket(): GameSocket {
  const s = getSocket();
  if (!s.connected) s.connect();
  return s;
}

/** Disconnect and drop the singleton (used on quit / leaving a match). */
export function disconnectSocket(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}

export function isSocketConnected(): boolean {
  return !!socket?.connected;
}

/** Persist a custom server URL for next time. */
export function saveServerUrl(url: string): void {
  try {
    localStorage.setItem('wrt_server_url', url.trim());
  } catch {
    /* ignore */
  }
}