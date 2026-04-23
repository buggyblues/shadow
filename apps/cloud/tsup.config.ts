import UnpluginTypia from '@typia/unplugin'
import { defineConfig } from 'tsup'

const emitDts = process.env.SHADOW_BUILD_DTS !== '0'

export default defineConfig([
  // CLI entry
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    target: 'es2022',
    noExternal: [/^@shadowob\/shared$/],
    clean: true,
    dts: emitDts,
    banner: {
      js: '#!/usr/bin/env node',
    },
    esbuildPlugins: [UnpluginTypia.esbuild({ cache: false })],
  },
  // Worker entry — imports from apps/server/src/, keep server deps external
  {
    entry: ['src/worker.ts'],
    format: ['cjs'],
    target: 'es2022',
    noExternal: [/^@shadowob\/shared$/, 'postgres', 'drizzle-orm', /^drizzle-orm\//],
    dts: false,
    esbuildPlugins: [UnpluginTypia.esbuild({ cache: false })],
  },
])
