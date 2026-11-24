import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Serve the web manifest in dev too — otherwise the <link rel="manifest">
      // 404s and falls through to the SPA index.html (manifest parse error).
      devOptions: {
        enabled: true,
        type: 'module',
      },
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'War Room Tactics',
        short_name: 'WRT',
        description:
          'A turn-based tactical war board game. Command your faction across a contested hex-grid battlefield.',
        theme_color: '#0a0e14',
        background_color: '#0a0e14',
        display: 'standalone',
        orientation: 'any',
        scope: '/',
        start_url: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        categories: ['games', 'strategy'],
      },
      workbox: {
        // Cache app shell, JS/CSS, images and audio so the game runs offline.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,mp3,wav,ogg,json}'],
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            // Cache game assets and audio on first load.
            urlPattern: ({ url }) => url.pathname.startsWith('/assets/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'wrt-assets',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    host: true,
    port: 5173,
  },
});