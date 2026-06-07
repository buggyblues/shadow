import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { MakerDMG } from '@electron-forge/maker-dmg'
import { MakerSquirrel, type MakerSquirrelConfig } from '@electron-forge/maker-squirrel'
import { MakerWix, type MakerWixConfig } from '@electron-forge/maker-wix'
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
const desktopPackage = requireFromDesktop('./package.json') as {
  description?: string
  version?: string
}
const productName = 'Shadow'
const companyName = 'ShadowOB Team'
const copyright = `Copyright © ${new Date().getFullYear()} ${companyName}`
const desktopUpdateBaseUrl = process.env.DESKTOP_UPDATE_BASE_URL?.replace(/\/+$/, '')
const dmgBackgroundPath = resolve(__dirname, 'assets', 'dmg-background.png')
const windowsAppUserModelId = 'com.squirrel.Shadow.Shadow'
const windowsMsiUpgradeCode = 'A2A5547B-71E9-492A-8C10-E2F66D4F29C0'
const localizedChineseProductName = '虾豆'

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
    resolve(__dirname, 'assets', 'zh-Hant.lproj'),
    resolve(__dirname, 'assets', 'zh_CN.lproj'),
    resolve(__dirname, 'assets', 'zh_TW.lproj'),
    resolve(__dirname, 'assets', 'zh.lproj'),
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

function nonEmptyEnv(name: string): string | undefined {
  const value = process.env[name]
  return value && value.trim() ? value : undefined
}

type WindowsSignConfig = NonNullable<MakerSquirrelConfig['windowsSign']> &
  NonNullable<MakerWixConfig['windowsSign']>

function windowsSignConfig(): WindowsSignConfig | undefined {
  const certificateFile = nonEmptyEnv('WINDOWS_CERTIFICATE_FILE')
  const certificatePassword = nonEmptyEnv('WINDOWS_CERTIFICATE_PASSWORD')
  const signToolPath = nonEmptyEnv('WINDOWS_SIGNTOOL_PATH')
  const signWithParams = nonEmptyEnv('WINDOWS_SIGN_WITH_PARAMS')
  const hookModulePath = nonEmptyEnv('WINDOWS_SIGN_HOOK_MODULE_PATH')

  if (!certificateFile && !signWithParams && !hookModulePath && !signToolPath) return undefined

  const config: WindowsSignConfig = {
    description: nonEmptyEnv('WINDOWS_SIGN_DESCRIPTION') ?? productName,
    website: nonEmptyEnv('WINDOWS_SIGN_WEBSITE') ?? 'https://shadowob.com',
    timestampServer: nonEmptyEnv('WINDOWS_TIMESTAMP_SERVER') ?? 'http://timestamp.digicert.com',
  }

  if (certificateFile) config.certificateFile = certificateFile
  if (certificatePassword) config.certificatePassword = certificatePassword
  if (signToolPath) config.signToolPath = signToolPath
  if (signWithParams) config.signWithParams = signWithParams
  if (hookModulePath) config.hookModulePath = hookModulePath

  return config
}

const windowsSign = windowsSignConfig()

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
    name: productName,
    executableName: isLinux ? 'shadow' : productName,
    icon: iconPath,
    overwrite: true,
    prune: true,
    appBundleId: 'com.shadowob.app',
    appCopyright: copyright,
    appCategoryType: 'public.app-category.social-networking',
    darwinDarkModeSupport: true,
    win32metadata: {
      CompanyName: companyName,
      FileDescription: productName,
      InternalName: productName,
      LegalCopyright: copyright,
      OriginalFilename: `${productName}.exe`,
      ProductName: productName,
    },
    // Ensure icon is referenced in Info.plist
    extendInfo: {
      CFBundleDevelopmentRegion: 'en',
      CFBundleDisplayName: productName,
      CFBundleIconFile: 'icon.icns',
      CFBundleLocalizations: ['en', 'zh', 'zh-Hans', 'zh-Hant', 'zh_CN', 'zh_TW'],
      CFBundleName: productName,
      LSHasLocalizedDisplayName: true,
      CFBundleURLTypes: [
        {
          CFBundleURLName: productName,
          CFBundleURLSchemes: ['shadow'],
        },
      ],
      NSHighResolutionCapable: true,
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
      name: productName,
      title: productName,
      authors: companyName,
      copyright,
      description: desktopPackage.description ?? 'Shadow Desktop',
      exe: `${productName}.exe`,
      setupExe: `${productName}-${desktopPackage.version ?? '0.0.0'}-windows-x64-setup.exe`,
      setupMsi: `${productName}-${desktopPackage.version ?? '0.0.0'}-windows-x64-setup.msi`,
      noMsi: true,
      setupIcon: resolve(__dirname, 'assets', 'icon.ico'),
      iconUrl:
        'https://raw.githubusercontent.com/buggyblues/shadow/main/apps/desktop/assets/icon.ico',
      ...(windowsSign ? { windowsSign } : {}),
    }),
    new MakerWix({
      name: productName,
      shortName: productName,
      manufacturer: companyName,
      description: desktopPackage.description ?? 'Shadow Desktop',
      exe: `${productName}.exe`,
      icon: resolve(__dirname, 'assets', 'icon.ico'),
      appUserModelId: windowsAppUserModelId,
      upgradeCode: windowsMsiUpgradeCode,
      programFilesFolderName: productName,
      shortcutFolderName: localizedChineseProductName,
      shortcutName: localizedChineseProductName,
      language: 1033,
      defaultInstallMode: 'perUser',
      installLevel: 3,
      features: {
        autoUpdate: true,
        autoLaunch: false,
      },
      autoRun: true,
      ui: {
        chooseDirectory: true,
      },
      ...(windowsSign ? { windowsSign } : {}),
    }),
    new MakerDMG(
      {
        format: 'ULFO',
        background: dmgBackgroundPath,
        iconSize: 96,
        icon: resolve(__dirname, 'assets', 'icon.icns'),
        name: productName,
        title: productName,
        overwrite: true,
        contents: (opts) => [
          { x: 176, y: 242, type: 'file', path: opts.appPath },
          { x: 388, y: 242, type: 'link', path: '/Applications' },
        ],
        additionalDMGOptions: {
          window: {
            size: { width: 544, height: 408 },
          },
        },
      },
      ['darwin'],
    ),
    new MakerZIP(desktopUpdateBaseUrl ? { macUpdateManifestBaseUrl: desktopUpdateBaseUrl } : {}, [
      'darwin',
      'linux',
    ]),
  ],
  plugins: [new AutoUnpackNativesPlugin({})],
}

export default config
