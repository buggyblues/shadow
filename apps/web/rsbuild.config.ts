import path from 'node:path'
import { defineConfig } from '@rsbuild/core'
import { pluginReact } from '@rsbuild/plugin-react'

// Absolute path to @shadowob/cloud-ui source
const cloudUiSrc = path.resolve(__dirname, '../cloud/packages/ui/src')
const devApiTarget = process.env.SHADOW_DEV_API_BASE ?? 'http://[::1]:3002'

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
      '/api': {
        target: devApiTarget,
        changeOrigin: true,
      },
      '/socket.io': {
        target: devApiTarget,
        ws: true,
      },
      '/shadow': {
        target: 'http://localhost:9000',
        changeOrigin: true,
      },
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
        new rspack.NormalModuleReplacementPlugin(/^@\//, (resource) => {
          const issuer: string = resource.contextInfo?.issuer ?? resource.context ?? ''
          const isCloudFile =
            issuer.includes('/cloud/packages/ui/src/') ||
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
