import { dialog } from 'electron'
import type { DesktopContainer } from '../core/container'
import { type DesktopIPCServiceImplementation, registerDesktopIPCService } from './ipc-server'

export function registerPetAssetsHandlers(container: DesktopContainer): void {
  const { petAssetsService } = container.cradle

  const petAssets = {
    importDirectory: async (input) => {
      let packDir = input.path ?? ''
      if (!packDir) {
        const result = await dialog.showOpenDialog({
          title: 'Import Codex Pet Package',
          properties: ['openFile', 'openDirectory'],
          filters: [{ name: 'Codex Pet Package', extensions: ['zip'] }],
        })
        if (result.canceled) return petAssetsService.getSettings()
        packDir = result.filePaths[0] ?? ''
      }
      return petAssetsService.importDirectory(packDir)
    },
    importMarketplace: (input) => petAssetsService.importMarketplace(input),
    importArchiveBuffer: (input) => petAssetsService.importArchiveBuffer(input),
    setActive: (input) => petAssetsService.setActive(input.packId),
    remove: (input) => petAssetsService.remove(input.packId),
  } satisfies DesktopIPCServiceImplementation<'petAssets'>

  registerDesktopIPCService('petAssets', petAssets)
}
