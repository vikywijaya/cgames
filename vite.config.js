import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { devApiPlugin } from './vite-api-plugin.js';

export default defineConfig(({ command }) => ({
  plugins: [react(), devApiPlugin()],
  // Production build is served under /games (see server/server.js) by the merged
  // Fly.io app; dev server still serves from root for `npm run dev`. Vercel
  // (which sets VERCEL=1 during its build) serves the app from the site root.
  base: command === 'build' && !process.env.VERCEL ? '/games/' : '/',
  server: { port: Number(process.env.PORT) || 5173 },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
        },
      },
    },
  },
}));
