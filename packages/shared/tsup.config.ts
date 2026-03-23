import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/types/index.ts', 'src/constants/index.ts', 'src/utils/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  outDir: 'dist',
})
