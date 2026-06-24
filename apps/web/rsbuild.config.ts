import path from 'node:path'
import { defineConfig, loadEnv } from '@rsbuild/core'
import { pluginReact } from '@rsbuild/plugin-react'

// Absolute path to @shadowob/cloud-ui source
const cloudUiRoot = path.resolve(__dirname, '../cloud/packages/ui')
const cloudUiSrc = path.resolve(__dirname, '../cloud/packages/ui/src')
const defaultStandaloneDevApiTarget = 'http://127.0.0.1:3002'

loadEnv({ cwd: path.resolve(__dirname, '../..') })

function normalizeHttpOrigin(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const input = value.trim()
  if (!input) return null
  try {
    const url = new URL(input)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.origin
  } catch {
    return null
  }
}

function getDevApiTarget(): string {
  return normalizeHttpOrigin(process.env.SHADOWOB_DEV_API_BASE) ?? defaultStandaloneDevApiTarget
}

const devApiTarget = getDevApiTarget()
const googleClientId = process.env.GOOGLE_CLIENT_ID ?? ''

function handleDevProxyError(error: NodeJS.ErrnoException) {
  if (error.code === 'EPIPE' || error.code === 'ECONNRESET') {
    return
  }
  console.error('[dev proxy] request failed:', error)
}

function apiProxyOptions(options: { ws?: boolean } = {}) {
  return {
    target: devApiTarget,
    ws: options.ws,
    changeOrigin: true,
    onError: handleDevProxyError,
  }
}

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
      // Explicitly deduplicate cloud-ui lib modules to avoid dual-module issues.
      // router.tsx imports via '@shadowob/cloud-ui/lib/*' (package exports)
      // while pages import via '@/lib/*' (NormalModuleReplacementPlugin -> cloudUiSrc).
      // Without this, ApiClientContext can be two different instances.
      '@shadowob/cloud-ui/lib': path.join(cloudUiSrc, 'lib'),
      '@shadowob/cloud-ui/components': path.join(cloudUiSrc, 'components'),
      '@shadowob/cloud-ui/pages': path.join(cloudUiSrc, 'pages'),
      '@shadowob/cloud-ui/hooks': path.join(cloudUiSrc, 'hooks'),
      '@shadowob/cloud-ui/stores': path.join(cloudUiSrc, 'stores'),
      '@shadowob/cloud-ui/styles': path.join(cloudUiSrc, 'styles'),
      '@shadowob/cloud-ui/i18n': path.join(cloudUiSrc, 'i18n/index.ts'),
      '@shadowob/cloud-ui/web-saas': path.join(cloudUiRoot, 'web-saas/index.tsx'),
    },
    conditionNames: ['development', 'import', 'module', 'default'],
  },
  html: {
    template: './index.html',
    title: 'Shadow',
  },
  server: {
    port: 3000,
    proxy: {
      '/api': apiProxyOptions(),
      '/desktop': apiProxyOptions(),
      '/socket.io': apiProxyOptions({ ws: true }),
      '/shadow': apiProxyOptions(),
    },
  },
  output: {
    assetPrefix: '/app/',
  },
  tools: {
    rspack: (config, { rspack }) => {
      // When cloud-ui source files (or web-saas files) import `@/xxx`,
      // resolve those to cloud-ui's own src directory instead of apps/web/src.
      config.plugins ??= []
      config.plugins.push(
        new rspack.DefinePlugin({
          __SHADOW_GOOGLE_CLIENT_ID__: JSON.stringify(googleClientId),
        }),
        new rspack.NormalModuleReplacementPlugin(/^@\//, (resource) => {
          const issuer = (resource.contextInfo?.issuer ?? resource.context ?? '').replaceAll(
            '\\',
            '/',
          )
          const isCloudFile =
            issuer.includes('/cloud/packages/ui/src/') ||
            issuer.includes('/cloud/packages/ui/web-saas/') ||
            issuer.includes('/cloud/src/interfaces/web-saas/')
          if (isCloudFile) {
            resource.request = path.join(cloudUiSrc, resource.request.replace(/^@\//, ''))
          }
        }),
      )
      return config
    },
  },
})
