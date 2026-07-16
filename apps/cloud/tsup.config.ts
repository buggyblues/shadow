import UnpluginTypia from '@typia/unplugin'
import { defineConfig } from 'tsup'
import { copyRuntimeSkills } from './scripts/copy-runtime-skills.js'

const emitDts = process.env.SHADOWOB_BUILD_DTS !== '0'
const cleanOutput = process.env.SHADOWOB_BUILD_CLEAN !== '0'

export default defineConfig([
  // SDK entry
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    target: 'es2022',
    noExternal: [/^@shadowob\/shared$/],
    clean: cleanOutput,
    dts: emitDts,
    onSuccess: async () => {
      copyRuntimeSkills()
    },
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
