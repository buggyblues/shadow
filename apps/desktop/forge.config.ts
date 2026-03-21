import { existsSync } from 'node:fs'
import { MakerDMG } from '@electron-forge/maker-dmg'
import { MakerSquirrel } from '@electron-forge/maker-squirrel'
import { MakerZIP } from '@electron-forge/maker-zip'
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives'
import type { ForgeConfig } from '@electron-forge/shared-types'

const isMac = process.platform === 'darwin'
const hasNotaryApiKey =
  !!process.env.APPLE_API_KEY && !!process.env.APPLE_API_KEY_ID && !!process.env.APPLE_API_ISSUER
const shouldSignAndNotarize = isMac && hasNotaryApiKey

// Collect extraResource entries for OpenClaw bundles (created by scripts/bundle-openclaw.mjs)
const extraResource: string[] = []
if (existsSync('./build/openclaw')) extraResource.push('./build/openclaw')
if (existsSync('./build/shadowob')) extraResource.push('./build/shadowob')
if (existsSync('./build/openclaw-config')) extraResource.push('./build/openclaw-config')

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
        name: 'Shadow',
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
      name: 'Shadow',
    }),
    new MakerDMG(
      {
        format: 'ULFO',
      },
      ['darwin'],
    ),
    new MakerZIP({}, ['darwin', 'linux']),
  ],
  plugins: [new AutoUnpackNativesPlugin({})],
}

export default config
