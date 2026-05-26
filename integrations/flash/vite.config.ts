import { resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      {
        find: '@shadowob/flash-cards/plugins',
        replacement: fileURLToPath(
          new URL('./packages/cards/src/plugins/index.ts', import.meta.url),
        ),
      },
      {
        find: '@shadowob/flash-cards',
        replacement: fileURLToPath(new URL('./packages/cards/src/index.ts', import.meta.url)),
      },
      {
        find: '@shadowob/flash-types/server-app',
        replacement: fileURLToPath(new URL('./packages/types/src/server-app.ts', import.meta.url)),
      },
      {
        find: '@shadowob/flash-types',
        replacement: fileURLToPath(new URL('./packages/types/src/index.ts', import.meta.url)),
      },
    ],
  },
  server: {
    cors: true,
    watch: {
      usePolling: true,
      interval: 250,
    },
  },
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        app: resolve(__dirname, 'src/client/main.tsx'),
      },
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
})
