import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const args = process.argv.slice(2)
const arg = (name, fallback) => {
  const prefix = `--${name}=`
  const found = args.find((value) => value.startsWith(prefix))
  return found ? found.slice(prefix.length) : fallback
}

const platform = arg('platform', process.platform)
const arch = arg('arch', process.arch)
const root = resolve(import.meta.dirname, '..')
const outDir = join(root, 'out')

function assertFile(path, label) {
  if (!existsSync(path)) throw new Error(`[verify-package-assets] Missing ${label}: ${path}`)
  if (statSync(path).size <= 0) throw new Error(`[verify-package-assets] Empty ${label}: ${path}`)
}

function findFirstFile(dir, predicate) {
  if (!existsSync(dir)) return null
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      const found = findFirstFile(path, predicate)
      if (found) return found
    } else if (predicate(path)) {
      return path
    }
  }
  return null
}

function findMacApp() {
  if (!existsSync(outDir)) return null
  const expected = join(outDir, `Shadow-darwin-${arch}`, 'Shadow.app')
  if (existsSync(expected)) return expected
  return findFirstFile(outDir, (path) => path.endsWith('/Shadow.app/Contents/Info.plist'))?.replace(
    /\/Contents\/Info\.plist$/,
    '',
  )
}

function plistValue(infoPlistPath, key) {
  return execFileSync('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, infoPlistPath], {
    encoding: 'utf8',
  }).trim()
}

function verifyCommand(command, args, label) {
  try {
    execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (error) {
    const stderr = error.stderr ? `\n${error.stderr}` : ''
    const stdout = error.stdout ? `\n${error.stdout}` : ''
    throw new Error(`[verify-package-assets] ${label} failed:${stderr}${stdout}`)
  }
}

function powershell(command) {
  return execFileSync(
    'powershell.exe',
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  ).trim()
}

function ps(value) {
  return `'${value.replace(/'/g, "''")}'`
}

function verifyMacIcon(iconPath) {
  assertFile(iconPath, 'macOS app icon')
  const iconInfo = execFileSync(
    'sips',
    ['-g', 'format', '-g', 'pixelWidth', '-g', 'pixelHeight', iconPath],
    {
      encoding: 'utf8',
    },
  )
  if (!iconInfo.includes('format: icns')) {
    throw new Error(`[verify-package-assets] Expected macOS icon to be icns: ${iconPath}`)
  }
  if (!iconInfo.includes('pixelWidth: 1024') || !iconInfo.includes('pixelHeight: 1024')) {
    throw new Error(
      `[verify-package-assets] Expected macOS icon to include a 1024x1024 image: ${iconPath}`,
    )
  }
}

function assertStringsValue(stringsPath, key, value) {
  const buffer = readFileSync(stringsPath)
  const content =
    buffer[0] === 0xff && buffer[1] === 0xfe
      ? buffer.subarray(2).toString('utf16le')
      : buffer.toString('utf8')
  const expected = `${key} = "${value}";`
  if (!content.includes(expected)) {
    throw new Error(`[verify-package-assets] Missing ${expected} in ${stringsPath}`)
  }
}

function verifyMacPackage() {
  const appPath = findMacApp()
  if (!appPath) throw new Error('[verify-package-assets] Missing packaged Shadow.app')
  const contents = join(appPath, 'Contents')
  const resources = join(contents, 'Resources')
  const infoPlist = join(contents, 'Info.plist')
  assertFile(infoPlist, 'macOS Info.plist')

  for (const locale of ['en', 'zh', 'zh-Hans', 'zh-Hant', 'zh_CN', 'zh_TW']) {
    const stringsPath = join(resources, `${locale}.lproj`, 'InfoPlist.strings')
    assertFile(stringsPath, `${locale}.lproj InfoPlist.strings`)
    assertStringsValue(stringsPath, 'CFBundleDisplayName', locale === 'en' ? 'Shadow' : '虾豆')
    assertStringsValue(stringsPath, 'CFBundleName', locale === 'en' ? 'Shadow' : '虾豆')
  }

  const iconFile = plistValue(infoPlist, 'CFBundleIconFile')
  if (iconFile !== 'icon.icns') {
    throw new Error(`[verify-package-assets] Expected CFBundleIconFile=icon.icns, got ${iconFile}`)
  }
  verifyMacIcon(join(resources, iconFile))
  const bundleName = plistValue(infoPlist, 'CFBundleName')
  if (bundleName !== 'Shadow') {
    throw new Error(`[verify-package-assets] Expected CFBundleName=Shadow, got ${bundleName}`)
  }
  const displayName = plistValue(infoPlist, 'CFBundleDisplayName')
  if (displayName !== 'Shadow') {
    throw new Error(
      `[verify-package-assets] Expected CFBundleDisplayName=Shadow, got ${displayName}`,
    )
  }
  const developmentRegion = plistValue(infoPlist, 'CFBundleDevelopmentRegion')
  if (developmentRegion !== 'en') {
    throw new Error(
      `[verify-package-assets] Expected CFBundleDevelopmentRegion=en, got ${developmentRegion}`,
    )
  }
  const hasLocalizedDisplayName = plistValue(infoPlist, 'LSHasLocalizedDisplayName')
  if (hasLocalizedDisplayName !== 'true') {
    throw new Error(
      `[verify-package-assets] Expected LSHasLocalizedDisplayName=true, got ${hasLocalizedDisplayName}`,
    )
  }
  const localizations = plistValue(infoPlist, 'CFBundleLocalizations')
  for (const locale of ['en', 'zh', 'zh-Hans', 'zh-Hant', 'zh_CN', 'zh_TW']) {
    if (!localizations.includes(locale)) {
      throw new Error(`[verify-package-assets] Missing CFBundleLocalizations entry: ${locale}`)
    }
  }

  verifyCommand('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath], 'codesign')
  verifyCommand(
    'spctl',
    ['--assess', '--type', 'execute', '--verbose=4', appPath],
    'Gatekeeper assessment',
  )
  verifyCommand('xcrun', ['stapler', 'validate', appPath], 'notarization staple validation')
}

function verifyWindowsPackage() {
  assertFile(join(root, 'assets', 'icon.ico'), 'Windows source icon')
  const makeDir = join(outDir, 'make')
  const setup = findFirstFile(makeDir, (path) => path.toLowerCase().endsWith('.exe'))
  const msi = findFirstFile(makeDir, (path) => path.toLowerCase().endsWith('.msi'))
  const releases = findFirstFile(makeDir, (path) => path.toLowerCase().endsWith('releases'))
  const fullNupkg = findFirstFile(makeDir, (path) => path.toLowerCase().endsWith('-full.nupkg'))
  const hasWindowsMakeOutput = Boolean(setup || msi || releases || fullNupkg)

  if (hasWindowsMakeOutput) {
    if (!setup) throw new Error('[verify-package-assets] Missing Windows Squirrel setup executable')
    if (!msi) throw new Error('[verify-package-assets] Missing Windows WiX MSI installer')
    if (!releases) throw new Error('[verify-package-assets] Missing Squirrel RELEASES metadata')
    if (!fullNupkg) throw new Error('[verify-package-assets] Missing Squirrel full NuGet package')
    assertFile(setup, 'Windows Squirrel setup executable')
    assertFile(msi, 'Windows WiX MSI installer')
    assertFile(releases, 'Squirrel RELEASES metadata')
    assertFile(fullNupkg, 'Squirrel full NuGet package')
  }

  if (process.env.WINDOWS_REQUIRE_SIGNED === '1') {
    if (process.platform !== 'win32') {
      throw new Error('[verify-package-assets] Windows signature verification requires win32 host')
    }
    if (!setup) throw new Error('[verify-package-assets] Missing Windows setup executable')
    if (!msi) throw new Error('[verify-package-assets] Missing Windows MSI installer')
    const appExe = findFirstFile(
      outDir,
      (path) =>
        path.toLowerCase().endsWith(`${arch}\\shadow.exe`) ||
        path.toLowerCase().endsWith(`${arch}/shadow.exe`) ||
        path.toLowerCase().endsWith('shadow.exe'),
    )
    if (!appExe) throw new Error('[verify-package-assets] Missing packaged Shadow.exe')
    for (const file of [setup, msi, appExe]) {
      const status = powershell(`(Get-AuthenticodeSignature -LiteralPath ${ps(file)}).Status`)
      if (status !== 'Valid') {
        throw new Error(
          `[verify-package-assets] Expected valid Authenticode signature for ${file}, got ${status}`,
        )
      }
    }
  }
}

function verifyLinuxPackage() {
  assertFile(join(root, 'assets', 'icon.png'), 'Linux source icon')
  const archive = findFirstFile(join(outDir, 'make'), (path) => path.toLowerCase().endsWith('.zip'))
  if (archive) assertFile(archive, 'Linux archive')
}

if (platform === 'darwin') verifyMacPackage()
else if (platform === 'win32') verifyWindowsPackage()
else if (platform === 'linux') verifyLinuxPackage()
else throw new Error(`[verify-package-assets] Unsupported platform: ${platform}`)

console.log(`[verify-package-assets] ${platform}-${arch} package assets verified`)
