import { defineConfig } from 'vite';
export default defineConfig({
  server: { proxy: { '/api/teams': { target: 'http://127.0.0.1:8787', ws: true } } },
  build: {
    rollupOptions: {
      input: {
        game: 'index.html',
        admin: 'admin.html',
        teams: 'teams.html',
        teamsAdmin: 'teams-admin.html',
        teamsDemo: 'teams-demo.html',
      },
      output: { manualChunks: { phaser: ['phaser'] } },
    },
    chunkSizeWarningLimit: 1600,
  },
});
