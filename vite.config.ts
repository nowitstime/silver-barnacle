/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'node:path';

// GitHub Pages serves the site from /<repo-name>/. Change this if the repo is renamed.
const base = process.env.BASE_PATH ?? '/silver-barnacle/';

export default defineConfig({
  base,
  build: {
    rollupOptions: {
      // Two pages: the game and its wiki.
      input: { main: resolve(__dirname, 'index.html'), wiki: resolve(__dirname, 'wiki.html') },
    },
  },
  plugins: [
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Ricochet Press',
        short_name: 'Ricochet',
        description: 'A turn-based brick-breaking roguelike, printed in two inks.',
        theme_color: '#f4efe4',
        background_color: '#f4efe4',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
  ],
  test: {
    // `npm run balance` runs the slow bot simulations instead of the unit tests.
    include: process.env.BALANCE ? ['balance/**/*.test.ts'] : ['tests/**/*.test.ts'],
    testTimeout: process.env.BALANCE ? 60 * 60 * 1000 : 5000,
  },
});
