/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// GitHub Pages serves the site under /<repo>/ ; ATLAS_BASE overrides for other hosts.
export default defineConfig({
  base: process.env.ATLAS_BASE ?? './',
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
    // two pages: the atlas, and the grain.school brand book at /brand/
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        brand: fileURLToPath(new URL('./brand/index.html', import.meta.url)),
      },
    },
  },
  test: { environment: 'node' },
})
