import { MakerSquirrel } from '@electron-forge/maker-squirrel'
import { MakerZIP } from '@electron-forge/maker-zip'
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives'
import type { ForgeConfig } from '@electron-forge/shared-types'

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    name: 'Shadow',
    executableName: process.platform === 'linux' ? 'shadow' : 'Shadow',
    icon: './assets/icon',
    appBundleId: 'com.shadowob.app',
    appCopyright: `Copyright © ${new Date().getFullYear()} ShadowOB Team`,
    appCategoryType: 'public.app-category.social-networking',
    darwinDarkModeSupport: true,
    protocols: [
      {
        name: 'Shadow',
        schemes: ['shadow'],
      },
    ],
    ignore: [
      // Only include dist/, assets/, and package.json in the asar archive
      /^\/(?!dist|assets|package\.json)/,
    ],
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({
      name: 'Shadow',
      setupIcon: './assets/icon.ico',
    }),
    new MakerZIP({}, ['darwin', 'linux']),
  ],
  plugins: [new AutoUnpackNativesPlugin({})],
}

export default config
