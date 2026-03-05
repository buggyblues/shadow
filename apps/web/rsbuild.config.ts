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
    title: 'Shadow',
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3002',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3002',
        ws: true,
      },
      '/shadow': {
        target: 'http://localhost:9000',
        changeOrigin: true,
      },
    },
  },
  output: {
    assetPrefix: '/',
  },
})
