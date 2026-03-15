import { ArrowLeft, Download, Loader2, Monitor, RefreshCw, RotateCcw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface DesktopSettingsAPI {
  platform: string
  getVersion: () => Promise<string>
  checkForUpdate: () => Promise<{
    hasUpdate: boolean
    version: string
    downloadUrl: string
    releaseNotes: string
  }>
  downloadUpdate: (url: string) => Promise<boolean>
  setOpenAtLogin: (v: boolean) => void
  getOpenAtLogin: () => Promise<boolean>
  quitAndRestart: () => void
}

function getAPI(): DesktopSettingsAPI | null {
  if ('desktopAPI' in window) {
    const api = (window as Record<string, unknown>).desktopAPI as Record<string, unknown>
    return {
      platform: api.platform as string,
      getVersion: api.getVersion as DesktopSettingsAPI['getVersion'],
      checkForUpdate: api.checkForUpdate as DesktopSettingsAPI['checkForUpdate'],
      downloadUpdate: api.downloadUpdate as DesktopSettingsAPI['downloadUpdate'],
      setOpenAtLogin: api.setOpenAtLogin as DesktopSettingsAPI['setOpenAtLogin'],
      getOpenAtLogin: api.getOpenAtLogin as DesktopSettingsAPI['getOpenAtLogin'],
      quitAndRestart: api.quitAndRestart as DesktopSettingsAPI['quitAndRestart'],
    }
  }
  return null
}

export function DesktopSettingsPage({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation()
  const api = getAPI()

  const [version, setVersion] = useState('')
  const [openAtLogin, setOpenAtLogin] = useState(false)
  const [checking, setChecking] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<{
    hasUpdate: boolean
    version: string
    downloadUrl: string
    releaseNotes: string
  } | null>(null)

  useEffect(() => {
    api?.getVersion().then(setVersion)
    api?.getOpenAtLogin().then(setOpenAtLogin)
  }, [api])

  const handleCheckUpdate = useCallback(async () => {
    if (!api || checking) return
    setChecking(true)
    try {
      const info = await api.checkForUpdate()
      setUpdateInfo(info)
    } finally {
      setChecking(false)
    }
  }, [api, checking])

  const handleDownload = useCallback(() => {
    if (!updateInfo?.downloadUrl || !api) return
    api.downloadUpdate(updateInfo.downloadUrl)
  }, [api, updateInfo])

  const handleOpenAtLoginToggle = useCallback(
    (v: boolean) => {
      setOpenAtLogin(v)
      api?.setOpenAtLogin(v)
    },
    [api],
  )

  const platformLabel =
    api?.platform === 'darwin' ? 'macOS' : api?.platform === 'win32' ? 'Windows' : 'Linux'

  return (
    <div className="flex flex-col h-full bg-bg-primary">
      {/* Header */}
      <div className="desktop-drag-titlebar h-12 px-4 flex items-center gap-3 border-b-2 border-bg-tertiary shrink-0">
        <button
          type="button"
          onClick={onBack}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-bg-secondary transition"
        >
          <ArrowLeft size={18} />
        </button>
        <Monitor size={20} className="text-text-muted" />
        <h2 className="font-bold text-text-primary text-[15px]">
          {t('desktop.settingsTitle', '桌面端设置')}
        </h2>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 max-w-2xl">
        {/* Version Info */}
        <section className="mb-8">
          <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-3">
            {t('desktop.about', '关于')}
          </h3>
          <div className="bg-bg-secondary rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-secondary">
                {t('desktop.currentVersion', '当前版本')}
              </span>
              <span className="text-sm font-mono text-text-primary">v{version || '...'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-secondary">{t('desktop.platform', '平台')}</span>
              <span className="text-sm text-text-primary">{platformLabel}</span>
            </div>
          </div>
        </section>

        {/* Auto Update */}
        <section className="mb-8">
          <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-3">
            {t('desktop.update', '应用更新')}
          </h3>
          <div className="bg-bg-secondary rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-text-primary">
                  {t('desktop.checkUpdate', '检查更新')}
                </p>
                <p className="text-xs text-text-muted mt-0.5">
                  {t('desktop.checkUpdateDesc', '检查是否有新版本可用')}
                </p>
              </div>
              <button
                type="button"
                onClick={handleCheckUpdate}
                disabled={checking}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover disabled:opacity-50 transition"
              >
                {checking ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <RefreshCw size={16} />
                )}
                {checking ? t('desktop.checking', '检查中...') : t('desktop.checkNow', '立即检查')}
              </button>
            </div>

            {/* Update result */}
            {updateInfo && (
              <div
                className={`rounded-lg p-3 ${
                  updateInfo.hasUpdate
                    ? 'bg-primary/10 border border-primary/20'
                    : 'bg-green-500/10 border border-green-500/20'
                }`}
              >
                {updateInfo.hasUpdate ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-text-primary">
                      🎉 {t('desktop.newVersion', '发现新版本')}: v{updateInfo.version}
                    </p>
                    {updateInfo.releaseNotes && (
                      <p className="text-xs text-text-secondary">{updateInfo.releaseNotes}</p>
                    )}
                    <button
                      type="button"
                      onClick={handleDownload}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover transition"
                    >
                      <Download size={14} />
                      {t('desktop.downloadUpdate', '下载更新')}
                    </button>
                  </div>
                ) : (
                  <p className="text-sm text-green-600 dark:text-green-400">
                    ✓ {t('desktop.upToDate', '已是最新版本')}
                  </p>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Startup */}
        <section className="mb-8">
          <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-3">
            {t('desktop.startup', '启动')}
          </h3>
          <div className="bg-bg-secondary rounded-xl p-4 space-y-4">
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <p className="text-sm font-medium text-text-primary">
                  {t('desktop.openAtLogin', '登录时启动')}
                </p>
                <p className="text-xs text-text-muted mt-0.5">
                  {t('desktop.openAtLoginDesc', '开机后自动启动 Shadow')}
                </p>
              </div>
              <div
                role="switch"
                aria-checked={openAtLogin}
                tabIndex={0}
                onClick={() => handleOpenAtLoginToggle(!openAtLogin)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    handleOpenAtLoginToggle(!openAtLogin)
                  }
                }}
                className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${
                  openAtLogin ? 'bg-primary' : 'bg-bg-tertiary'
                }`}
              >
                <div
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                    openAtLogin ? 'translate-x-5' : ''
                  }`}
                />
              </div>
            </label>
          </div>
        </section>

        {/* Actions */}
        <section className="mb-8">
          <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-3">
            {t('desktop.actions', '操作')}
          </h3>
          <div className="bg-bg-secondary rounded-xl p-4">
            <button
              type="button"
              onClick={() => api?.quitAndRestart()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-bg-tertiary text-text-primary text-sm font-medium hover:bg-bg-modifier-hover transition"
            >
              <RotateCcw size={16} />
              {t('desktop.restart', '重启应用')}
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
