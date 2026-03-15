import { resolve } from 'node:path'
import { defineConfig } from '@rsbuild/core'
import { pluginReact } from '@rsbuild/plugin-react'

const __dirname = new URL('.', import.meta.url).pathname

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
      'import.meta.env.VITE_APP_PROXY_HOST_SUFFIX': JSON.stringify(
        process.env.VITE_APP_PROXY_HOST_SUFFIX || '',
      ),
      'import.meta.env.VITE_APP_PROXY_SUBDOMAIN_PREFIX': JSON.stringify(
        process.env.VITE_APP_PROXY_SUBDOMAIN_PREFIX || '',
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
      '/shadow': {
        target: 'https://shadowob.com',
        changeOrigin: true,
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
