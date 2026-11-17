import { defineConfig } from 'vite';
export default defineConfig({
  build: {
    rollupOptions: {
      input: { game: 'index.html', admin: 'admin.html' },
      output: { manualChunks: { phaser: ['phaser'] } },
    },
    chunkSizeWarningLimit: 1600,
  },
});
