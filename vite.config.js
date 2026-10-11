import { defineConfig } from 'vite';

// Relative base so dist/ works from any static host path (GitHub Pages project
// sites, Netlify, Vercel) and inside a Notion /embed iframe.
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 900,
  },
});
