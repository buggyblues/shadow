import { defineConfig } from '@rsbuild/core'
import { pluginReact } from '@rsbuild/plugin-react'

const devApiTarget = process.env.SHADOW_DEV_API_BASE ?? 'http://localhost:3002'

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
    conditionNames: ['development', 'import', 'module', 'default'],
  },
  html: {
    template: './index.html',
    title: 'Shadow Admin',
  },
  server: {
    port: 3001,
    proxy: {
      '/api': devApiTarget,
    },
  },
  output: {
    assetPrefix: '/',
  },
})
