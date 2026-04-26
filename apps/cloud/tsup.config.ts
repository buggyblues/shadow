import UnpluginTypia from '@typia/unplugin'
import { defineConfig } from 'tsup'

const emitDts = process.env.SHADOW_BUILD_DTS !== '0'

export default defineConfig([
  // SDK entry
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    target: 'es2022',
    noExternal: [/^@shadowob\/shared$/],
    clean: true,
    dts: emitDts,
    esbuildPlugins: [UnpluginTypia.esbuild({ cache: false })],
  },
  // CLI entry
  {
    entry: ['src/cli.ts'],
    format: ['esm'],
    target: 'es2022',
    noExternal: [/^@shadowob\/shared$/],
    clean: false,
    dts: false,
    banner: {
      js: '#!/usr/bin/env node',
    },
    esbuildPlugins: [UnpluginTypia.esbuild({ cache: false })],
  },
])
