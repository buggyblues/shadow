import { defineConfig } from 'tsup'

const emitDts = process.env.SHADOW_BUILD_DTS !== '0'

export default defineConfig({
  entry: ['src/index.ts', 'src/types/index.ts', 'src/constants/index.ts', 'src/utils/index.ts'],
  format: ['esm', 'cjs'],
  dts: emitDts,
  clean: true,
  outDir: 'dist',
})
