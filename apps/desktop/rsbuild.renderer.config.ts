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
        process.env.VITE_API_BASE || 'https://shadowob.app',
      ),
    },
    conditionNames: ['development', 'import', 'module', 'default'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer'),
    },
  },
  html: {
    template: './src/renderer/index.html',
    title: 'XiaDou',
  },
  server: {
    port: 3100,
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
    proxy: {
      '/api': {
        target: process.env.VITE_API_BASE || 'https://shadowob.app',
        changeOrigin: true,
      },
      '/shadow': {
        target: 'https://shadowob.app',
        changeOrigin: true,
      },
      '/socket.io': {
        target: process.env.VITE_API_BASE || 'https://shadowob.app',
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
        from: resolve(__dirname, 'assets/pet/animations'),
        to: 'pet/animations',
      },
      {
        from: resolve(__dirname, 'assets/pet/manifest.json'),
        to: 'pet/manifest.json',
      },
    ],
  },
})
