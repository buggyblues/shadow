import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from '@rsbuild/core'
import { pluginReact } from '@rsbuild/plugin-react'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [pluginReact()],
  source: {
    entry: {
      index: './src/renderer/index.tsx',
    },
    define: {
      'import.meta.env.VITE_API_BASE': JSON.stringify(
        process.env.VITE_API_BASE || 'https://shadowob.com',
      ),
    },
    alias: {
      '@': resolve(__dirname, 'src/renderer'),
      '@web': resolve(__dirname, '../web/src'),
      // Desktop-specific overrides
      [resolve(__dirname, '../web/src/lib/socket')]: resolve(
        __dirname,
        'src/renderer/lib/socket.ts',
      ),
      [resolve(__dirname, '../web/src/lib/api')]: resolve(__dirname, 'src/renderer/lib/api.ts'),
    },
    conditionNames: ['development', 'import', 'module', 'default'],
  },
  html: {
    template: './src/renderer/index.html',
    title: 'Shadow',
  },
  server: {
    port: 3100,
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
    proxy: {
      '/api': {
        target: process.env.VITE_API_BASE || 'https://shadowob.com',
        changeOrigin: true,
      },
      '/shadow': {
        target: 'https://shadowob.com',
        changeOrigin: true,
      },
      '/socket.io': {
        target: process.env.VITE_API_BASE || 'https://shadowob.com',
        ws: true,
      },
    },
  },
  dev: {
    assetPrefix: '/',
  },
  output: {
    assetPrefix: './',
    distPath: {
      root: 'dist/renderer',
    },
    copy: [
      {
        from: resolve(__dirname, '../web/public'),
        to: '.',
      },
    ],
  },
})
