import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from '@rsbuild/core'
import { pluginReact } from '@rsbuild/plugin-react'

const __dirname = dirname(fileURLToPath(import.meta.url))
const desktopLocalDevPort = Number(process.env.DESKTOP_LOCAL_DEV_PORT || 39110)

export default defineConfig({
  plugins: [pluginReact()],
  source: {
    entry: {
      'desktop-local': './src/renderer/desktop-local.tsx',
    },
  },
  resolve: {
    alias: {
      '@web': resolve(__dirname, '../web/src'),
    },
    conditionNames: ['development', 'import', 'module', 'default'],
  },
  html: {
    template: './src/renderer/index.html',
    title: 'Shadow Desktop',
  },
  server: {
    port: desktopLocalDevPort,
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
  },
  dev: {
    assetPrefix: '/',
  },
  output: {
    assetPrefix: './',
    distPath: {
      root: 'dist/desktop-local',
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
