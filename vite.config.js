import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { devApiPlugin } from './vite-api-plugin.js';

export default defineConfig(({ command }) => ({
  plugins: [react(), devApiPlugin()],
  // Production build is served under /games (see server/server.js) by the merged
  // Fly.io app; dev server still serves from root for `npm run dev`.
  base: command === 'build' ? '/games/' : '/',
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
