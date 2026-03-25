import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['index.ts', 'setup-entry.ts'],
  format: ['esm'],
  dts: false,
  clean: true,
  outDir: 'dist',
  // The openclaw host provides plugin-sdk modules at runtime
  external: [/^openclaw\//],
})
