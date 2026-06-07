import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app, nativeImage } from 'electron'

export class AppIconService {
  desktopIconCandidates(extension: 'icns' | 'png' | 'ico'): string[] {
    const fileName = `icon.${extension}`
    const resourcesPath = process.resourcesPath || ''
    const currentAppPath = this.appPath()
    return this.unique([
      currentAppPath ? join(currentAppPath, 'assets', fileName) : '',
      join(__dirname, '../../assets', fileName),
      resourcesPath ? join(resourcesPath, 'assets', fileName) : '',
      resourcesPath ? join(resourcesPath, 'app', 'assets', fileName) : '',
      resourcesPath ? join(resourcesPath, 'app.asar', 'assets', fileName) : '',
      resourcesPath ? join(resourcesPath, fileName) : '',
    ])
  }

  resolveDesktopIconPathSync(
    preferredExtensions: Array<'icns' | 'png' | 'ico'> = ['png'],
  ): string | null {
    for (const extension of preferredExtensions) {
      for (const candidate of this.desktopIconCandidates(extension)) {
        if (existsSync(candidate)) return candidate
      }
    }
    return null
  }

  ensureDesktopDockIcon(): void {
    if (process.platform !== 'darwin') return
    app.setActivationPolicy('regular')
    const iconPath = this.resolveDesktopIconPathSync(['icns', 'png'])
    if (iconPath) {
      const dockIcon = nativeImage.createFromPath(iconPath)
      if (!dockIcon.isEmpty()) app.dock?.setIcon(dockIcon)
    }
    void app.dock?.show()
  }

  private unique(values: string[]): string[] {
    return [...new Set(values.filter(Boolean))]
  }

  private appPath(): string {
    try {
      return app.getAppPath()
    } catch {
      return ''
    }
  }
}

export const appIconService = new AppIconService()
