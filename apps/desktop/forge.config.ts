import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
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
const connectorPackagePath = resolve(__dirname, '../../packages/connector')
const requireFromDesktop = createRequire(resolve(__dirname, 'package.json'))

const extraResource: string[] = []
extraResource.push(
  resolve(connectorPackagePath, 'dist'),
  resolve(connectorPackagePath, 'skills'),
  resolve(connectorPackagePath, 'hermes-shadowob-plugin'),
  resolve(connectorPackagePath, 'package.json'),
  resolve(connectorPackagePath, 'README.md'),
)

// macOS localization: lproj directories for display name per locale
if (isMac) {
  extraResource.push(
    resolve(__dirname, 'assets', 'en.lproj'),
    resolve(__dirname, 'assets', 'zh-Hans.lproj'),
  )
}

function resolveDependencyDir(packageName: string) {
  try {
    return dirname(requireFromDesktop.resolve(`${packageName}/package.json`))
  } catch (error) {
    if (!packageName.startsWith('sherpa-onnx-') || packageName === 'sherpa-onnx-node') {
      throw error
    }

    const sherpaRequire = createRequire(requireFromDesktop.resolve('sherpa-onnx-node/package.json'))
    return dirname(sherpaRequire.resolve(`${packageName}/package.json`))
  }
}

function sherpaNativePackageName(platform: string, arch: string) {
  const normalizedPlatform = platform === 'win32' ? 'win' : platform
  if (normalizedPlatform === 'darwin' && (arch === 'arm64' || arch === 'x64')) {
    return `sherpa-onnx-darwin-${arch}`
  }
  if (normalizedPlatform === 'linux' && (arch === 'arm64' || arch === 'x64')) {
    return `sherpa-onnx-linux-${arch}`
  }
  if (normalizedPlatform === 'win' && (arch === 'x64' || arch === 'ia32')) {
    return `sherpa-onnx-win-${arch}`
  }
  throw new Error(`Unsupported sherpa-onnx target: ${platform}-${arch}`)
}

function copyDependencyToBuild(buildPath: string, packageName: string) {
  const source = resolveDependencyDir(packageName)
  if (!existsSync(source)) {
    throw new Error(`Missing dependency package for desktop voice: ${packageName}`)
  }
  const targetNodeModules = resolve(buildPath, 'node_modules')
  mkdirSync(targetNodeModules, { recursive: true })
  cpSync(source, resolve(targetNodeModules, packageName), {
    dereference: true,
    force: true,
    recursive: true,
  })
}

const config: ForgeConfig = {
  hooks: {
    packageAfterCopy: async (_config, buildPath, _electronVersion, platform, arch) => {
      copyDependencyToBuild(buildPath, 'sherpa-onnx-node')
      copyDependencyToBuild(buildPath, sherpaNativePackageName(platform, arch))
    },
  },
  packagerConfig: {
    asar: {
      unpack: '**/node_modules/sherpa-onnx-*/**/*',
    },
    name: 'Shadow',
    executableName: isLinux ? 'shadow' : 'Shadow',
    icon: iconPath,
    appBundleId: 'com.shadowob.app',
    appCopyright: `Copyright © ${new Date().getFullYear()} ShadowOB Team`,
    appCategoryType: 'public.app-category.social-networking',
    darwinDarkModeSupport: true,
    // Ensure icon is referenced in Info.plist
    extendInfo: {
      CFBundleIconFile: 'icon',
      NSCameraUseContinuityCameraDeviceType: true,
      NSCameraUsageDescription:
        'Shadow uses camera access only when a community or runtime feature requests it.',
      NSMicrophoneUsageDescription: 'Shadow uses microphone access for desktop pet voice input.',
    },
    extendHelperInfo: {
      NSCameraUseContinuityCameraDeviceType: true,
      NSCameraUsageDescription:
        'Shadow uses camera access only when a community or runtime feature requests it.',
      NSMicrophoneUsageDescription: 'Shadow uses microphone access for desktop pet voice input.',
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
        name: 'Shadow',
        schemes: ['shadow'],
      },
    ],
    extraResource,
    ignore: [
      // Include the bundled app plus the native sherpa-onnx runtime used by local voice.
      /^\/(?!dist|assets|package\.json|node_modules\/(?:sherpa-onnx-node|sherpa-onnx-(?:darwin-arm64|darwin-x64|linux-x64|linux-arm64|win-x64|win-ia32)))/,
    ],
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({
      name: 'Shadow',
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
