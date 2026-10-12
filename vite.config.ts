import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

declare const process: { env: Record<string, string | undefined> };

// BASE_PATH is set by the GitHub Pages workflow (e.g. /Wills/); Vercel and Netlify serve from /.
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [react()],
  build: { chunkSizeWarningLimit: 600 },
});
