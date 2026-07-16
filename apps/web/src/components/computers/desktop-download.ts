import type { ShadowComputer } from '@shadowob/shared'

export function desktopDownloadPath(computer: Pick<ShadowComputer, 'device'>) {
  const os = computer.device.os?.toLowerCase() ?? ''
  const arch = computer.device.arch?.toLowerCase() ?? ''
  if (os.startsWith('win') || os.includes('windows')) return '/desktop/download/windows-x64'
  if (os.includes('linux')) return '/desktop/download/linux-x64'
  return arch.includes('arm') || arch.includes('aarch')
    ? '/desktop/download/macos-arm64'
    : '/desktop/download/macos-x64'
}
