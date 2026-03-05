import { defineConfig } from '@rsbuild/core'
import { pluginReact } from '@rsbuild/plugin-react'

export default defineConfig({
  plugins: [pluginReact()],
  source: {
    entry: {
      index: './src/main.tsx',
    },
  },
  resolve: {
    alias: {
      '@': './src',
    },
  },
  html: {
    template: './index.html',
    title: 'Shadow Admin',
  },
  server: {
    port: 3001,
    proxy: {
      '/api': 'http://localhost:3002',
    },
  },
  output: {
    assetPrefix: '/',
  },
})
