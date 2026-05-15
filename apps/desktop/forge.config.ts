import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { MakerDMG } from '@electron-forge/maker-dmg'
import { MakerSquirrel } from '@electron-forge/maker-squirrel'
import { MakerZIP } from '@electron-forge/maker-zip'
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives'
import type { ForgeConfig } from '@electron-forge/shared-types'

const isMac = process.platform === 'darwin'
const isLinux = process.platform === 'linux'
const hasNotaryApiKey =
  !!process.env.APPLE_API_KEY && !!process.env.APPLE_API_KEY_ID && !!process.env.APPLE_API_ISSUER
const shouldSignAndNotarize = isMac && hasNotaryApiKey

// Resolve icon path absolutely so it works regardless of cwd
const iconPath = resolve(__dirname, 'assets', 'icon')

const extraResource: string[] = []
if (existsSync('./assets/pet')) extraResource.push('./assets/pet')

// macOS localization: lproj directories for display name per locale
if (isMac) {
  extraResource.push(
    resolve(__dirname, 'assets', 'en.lproj'),
    resolve(__dirname, 'assets', 'zh-Hans.lproj'),
  )
}

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    name: 'XiaDou',
    executableName: isLinux ? 'xiadou' : 'XiaDou',
    icon: iconPath,
    appBundleId: 'com.shadowob.xiadou',
    appCopyright: `Copyright © ${new Date().getFullYear()} ShadowOB Team`,
    appCategoryType: 'public.app-category.social-networking',
    darwinDarkModeSupport: true,
    // Ensure icon is referenced in Info.plist
    extendInfo: {
      CFBundleIconFile: 'icon.icns',
    },
    ...(shouldSignAndNotarize
      ? {
          osxSign: {
            identity: process.env.APPLE_CODESIGN_IDENTITY ?? 'Developer ID Application',
            'hardened-runtime': true,
            entitlements: './assets/entitlements.plist',
            'entitlements-inherit': './assets/entitlements.plist',
            'signature-flags': 'library',
            'gatekeeper-assess': false,
          },
          osxNotarize: hasNotaryApiKey
            ? {
                tool: 'notarytool',
                appleApiKey: process.env.APPLE_API_KEY,
                appleApiKeyId: process.env.APPLE_API_KEY_ID,
                appleApiIssuer: process.env.APPLE_API_ISSUER,
              }
            : undefined,
        }
      : {}),
    protocols: [
      {
        name: 'XiaDou',
        schemes: ['shadow'],
      },
    ],
    extraResource,
    ignore: [
      // Only include dist/, assets/, and package.json in the asar archive
      /^\/(?!dist|assets|package\.json)/,
    ],
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({
      name: 'XiaDou',
      setupIcon: resolve(__dirname, 'assets', 'icon.ico'),
      iconUrl:
        'https://raw.githubusercontent.com/buggyblues/shadow/main/apps/desktop/assets/icon.ico',
    }),
    new MakerDMG(
      {
        format: 'ULFO',
        icon: resolve(__dirname, 'assets', 'icon.icns'),
      },
      ['darwin'],
    ),
    new MakerZIP({}, ['darwin', 'linux']),
  ],
  plugins: [new AutoUnpackNativesPlugin({})],
}

export default config
