import { defineConfig } from 'tsup'

const emitDts = process.env.SHADOWOB_BUILD_DTS !== '0'

export default defineConfig({
  entry: ['src/index.ts', 'src/bridge.ts', 'src/space-app.ts', 'src/space-app-node.ts'],
  format: ['esm', 'cjs'],
  dts: emitDts,
  clean: true,
  outDir: 'dist',
})
