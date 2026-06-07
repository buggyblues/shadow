import { spawnSync } from 'node:child_process'
import { basename, dirname, join, resolve } from 'node:path'

const windowsAppId = 'Shadow'
const windowsExeName = 'Shadow.exe'
const englishDisplayName = 'Shadow'
const chineseDisplayName = '虾豆'
const companyName = 'ShadowOB Team'

function powershellPath(): string {
  const systemRoot = process.env.SystemRoot
  return systemRoot
    ? join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    : 'powershell.exe'
}

function ps(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function runPowerShell(script: string): string {
  const result = spawnSync(
    powershellPath(),
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    {
      encoding: 'utf8',
      windowsHide: true,
    },
  )

  if (result.error || result.status !== 0) {
    const detail = result.stderr || result.error?.message || `exit ${result.status}`
    console.warn('[squirrel] PowerShell helper failed:', detail.trim())
    return ''
  }

  return result.stdout.trim()
}

function windowsUiLocale(): string {
  return runPowerShell('[System.Globalization.CultureInfo]::CurrentUICulture.Name')
}

function windowsDisplayName(): string {
  return windowsUiLocale().toLowerCase().startsWith('zh') ? chineseDisplayName : englishDisplayName
}

function updateExePath(): string {
  const appFolder = dirname(process.execPath)
  const rootFolder = resolve(appFolder, '..')
  return join(rootFolder, 'Update.exe')
}

function runUpdateExe(args: string[]): void {
  const result = spawnSync(updateExePath(), args, {
    stdio: 'ignore',
    windowsHide: true,
  })

  if (result.error || result.status !== 0) {
    const detail = result.error?.message || `exit ${result.status}`
    console.warn('[squirrel] Update.exe helper failed:', detail)
  }
}

function syncLocalizedShellEntries(displayName: string): void {
  const updateExe = updateExePath()
  const appDir = dirname(process.execPath)
  const exeName = basename(process.execPath) || windowsExeName
  const exePath = process.execPath
  const legacyNames = [englishDisplayName, chineseDisplayName, 'Shadow Desktop']

  runPowerShell(`
$ErrorActionPreference = 'SilentlyContinue'
$displayName = ${ps(displayName)}
$publisher = ${ps(companyName)}
$updateExe = ${ps(updateExe)}
$appDir = ${ps(appDir)}
$exePath = ${ps(exePath)}
$exeName = ${ps(exeName)}
$legacyNames = @(${legacyNames.map(ps).join(', ')})
$shell = New-Object -ComObject WScript.Shell

function Test-ShadowShortcut($file) {
  try {
    $shortcut = $shell.CreateShortcut($file.FullName)
    $target = [System.IO.Path]::GetFullPath($shortcut.TargetPath).TrimEnd('\\')
    $expected = [System.IO.Path]::GetFullPath($updateExe).TrimEnd('\\')
    return ($target -ieq $expected) -and ($shortcut.Arguments -like "*$exeName*")
  } catch {
    return $false
  }
}

function New-ShadowShortcut($path) {
  $shortcut = $shell.CreateShortcut($path)
  $shortcut.TargetPath = $updateExe
  $shortcut.Arguments = "--processStart \`"$exeName\`""
  $shortcut.WorkingDirectory = $appDir
  $shortcut.IconLocation = "$exePath,0"
  $shortcut.Description = $displayName
  $shortcut.Save()
}

function Sync-ShortcutFolder($folder) {
  if ([string]::IsNullOrWhiteSpace($folder)) { return }
  New-Item -ItemType Directory -Force -Path $folder | Out-Null
  $targetPath = Join-Path $folder "$displayName.lnk"
  $matches = @(Get-ChildItem -LiteralPath $folder -Filter '*.lnk' -File | Where-Object { Test-ShadowShortcut $_ })
  if ($matches.Count -gt 0) {
    $primary = $matches | Sort-Object FullName | Select-Object -First 1
    if ($primary.FullName -ine $targetPath) {
      Move-Item -LiteralPath $primary.FullName -Destination $targetPath -Force
    }
  } else {
    New-ShadowShortcut $targetPath
  }
  Get-ChildItem -LiteralPath $folder -Filter '*.lnk' -File |
    Where-Object { ($_.FullName -ine $targetPath) -and (Test-ShadowShortcut $_) } |
    Remove-Item -Force
}

Sync-ShortcutFolder ([Environment]::GetFolderPath('DesktopDirectory'))
Sync-ShortcutFolder ([Environment]::GetFolderPath('Programs'))

$uninstallRoots = @(
  'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
)
foreach ($root in $uninstallRoots) {
  if (!(Test-Path $root)) { continue }
  Get-ChildItem $root | ForEach-Object {
    $props = Get-ItemProperty -LiteralPath $_.PSPath
    $text = @($props.DisplayName, $props.UninstallString, $props.QuietUninstallString, $props.DisplayIcon) -join ' '
    if (($text -like "*$updateExe*") -or ($legacyNames -contains $props.DisplayName)) {
      Set-ItemProperty -LiteralPath $_.PSPath -Name DisplayName -Value $displayName
      Set-ItemProperty -LiteralPath $_.PSPath -Name Publisher -Value $publisher
    }
  }
}
`)
}

function cleanupLocalizedShellEntries(): void {
  const updateExe = updateExePath()
  const exeName = basename(process.execPath) || windowsExeName
  const legacyNames = [englishDisplayName, chineseDisplayName, 'Shadow Desktop']

  runPowerShell(`
$ErrorActionPreference = 'SilentlyContinue'
$updateExe = ${ps(updateExe)}
$exeName = ${ps(exeName)}
$legacyNames = @(${legacyNames.map(ps).join(', ')})
$shell = New-Object -ComObject WScript.Shell

function Test-ShadowShortcut($file) {
  try {
    $shortcut = $shell.CreateShortcut($file.FullName)
    $target = [System.IO.Path]::GetFullPath($shortcut.TargetPath).TrimEnd('\\')
    $expected = [System.IO.Path]::GetFullPath($updateExe).TrimEnd('\\')
    return ($target -ieq $expected) -and ($shortcut.Arguments -like "*$exeName*")
  } catch {
    return $false
  }
}

$folders = @(
  [Environment]::GetFolderPath('DesktopDirectory'),
  [Environment]::GetFolderPath('Programs')
)
foreach ($folder in $folders) {
  if ([string]::IsNullOrWhiteSpace($folder) -or !(Test-Path $folder)) { continue }
  Get-ChildItem -LiteralPath $folder -Filter '*.lnk' -File |
    Where-Object { Test-ShadowShortcut $_ } |
    Remove-Item -Force
}
`)
}

function handleSquirrelStartupEvent(): boolean {
  if (process.platform !== 'win32') return false

  const squirrelEvent = process.argv.find((arg) => arg.startsWith('--squirrel-'))
  if (!squirrelEvent || squirrelEvent === '--squirrel-firstrun') return false

  switch (squirrelEvent) {
    case '--squirrel-install':
    case '--squirrel-updated':
      runUpdateExe(['--createShortcut', basename(process.execPath) || windowsExeName])
      syncLocalizedShellEntries(windowsDisplayName())
      return true
    case '--squirrel-uninstall':
      cleanupLocalizedShellEntries()
      runUpdateExe(['--removeShortcut', basename(process.execPath) || windowsExeName])
      return true
    case '--squirrel-obsolete':
      return true
    default:
      return false
  }
}

function windowsSquirrelAppUserModelId(): string {
  return `com.squirrel.${windowsAppId}.${windowsAppId}`
}

export class SquirrelService {
  handleStartupEvent(): boolean {
    return handleSquirrelStartupEvent()
  }

  windowsAppUserModelId(): string {
    return windowsSquirrelAppUserModelId()
  }
}

export const squirrelService = new SquirrelService()
