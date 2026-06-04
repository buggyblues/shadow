import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: ['src/index.ts', 'src/browser.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    outDir: 'dist',
  },
  {
    entry: ['src/runtime-sessions.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    clean: false,
    platform: 'node',
    outDir: 'dist',
  },
  {
    entry: ['src/cli.ts'],
    format: ['esm'],
    dts: true,
    clean: false,
    platform: 'node',
    banner: {
      js: "import { createRequire } from 'node:module';\nconst require = createRequire(import.meta.url);",
    },
    noExternal: ['dotenv', 'smol-toml', 'yaml'],
    outDir: 'dist',
  },
])
