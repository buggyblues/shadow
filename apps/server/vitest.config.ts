import UnpluginTypia from '@typia/unplugin/vite'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [UnpluginTypia({ cache: false })],
  test: {
    globals: true,
    environment: 'node',
    include: ['__tests__/**/*.{test,spec}.{ts,tsx}'],
    exclude: [...configDefaults.exclude],
  },
})
