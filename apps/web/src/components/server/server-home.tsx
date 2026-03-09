import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../lib/api'
import { useChatStore } from '../../stores/chat.store'

interface ServerDetail {
  id: string
  name: string
  description: string | null
  iconUrl: string | null
  bannerUrl: string | null
  homepageHtml: string | null
  isPublic: boolean
}

export function ServerHome() {
  const { t } = useTranslation()
  const { activeServerId } = useChatStore()

  const { data: server } = useQuery({
    queryKey: ['server', activeServerId],
    queryFn: () => fetchApi<ServerDetail>(`/api/servers/${activeServerId}`),
    enabled: !!activeServerId,
  })

  if (!server) {
    return (
      <div className="flex-1 flex items-center justify-center bg-bg-primary">
        <div className="text-center">
          <img src="/Logo.svg" alt="Shadow" className="w-16 h-16 mx-auto mb-4 opacity-30" />
          <p className="text-text-muted text-lg">{t('common.loading')}</p>
        </div>
      </div>
    )
  }

  // If server has custom homepage HTML, render it
  if (server.homepageHtml) {
    return (
      <div className="flex-1 flex flex-col bg-bg-primary overflow-hidden">
        {/* Header bar */}
        <div className="h-12 px-4 flex items-center border-b border-white/5 shrink-0">
          <img src="/Logo.svg" alt="" className="w-5 h-5 mr-2 opacity-60" />
          <h2 className="font-semibold text-text-primary text-sm truncate">{server.name}</h2>
        </div>
        {/* Custom HTML content in sandboxed iframe */}
        <div className="flex-1 overflow-auto">
          <iframe
            srcDoc={server.homepageHtml}
            title={`${server.name} homepage`}
            className="w-full h-full border-0"
            sandbox="allow-scripts allow-same-origin"
          />
        </div>
      </div>
    )
  }

  // Default server home — show welcome info
  return (
    <div className="flex-1 flex flex-col bg-bg-primary overflow-auto">
      {/* Banner */}
      {server.bannerUrl ? (
        <div className="h-40 shrink-0 relative overflow-hidden">
          <img src={server.bannerUrl} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-bg-primary/80 to-transparent" />
        </div>
      ) : (
        <div className="h-28 shrink-0 bg-gradient-to-br from-[#5865F2]/30 via-[#5865F2]/10 to-transparent" />
      )}

      {/* Server info */}
      <div className="px-8 -mt-8 relative z-10 max-w-2xl mx-auto w-full">
        <div className="flex items-end gap-4 mb-6">
          {server.iconUrl ? (
            <img
              src={server.iconUrl}
              alt=""
              className="w-20 h-20 rounded-2xl border-4 border-bg-primary shadow-lg object-cover"
            />
          ) : (
            <div className="w-20 h-20 rounded-2xl border-4 border-bg-primary shadow-lg bg-[#5865F2] flex items-center justify-center text-white text-3xl font-bold">
              {server.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="pb-1">
            <h1 className="text-2xl font-bold text-text-primary">{server.name}</h1>
            {server.isPublic && (
              <span className="text-xs text-green-400 font-medium">{t('server.publicBadge')}</span>
            )}
          </div>
        </div>

        {server.description && (
          <div className="mb-6">
            <p className="text-text-secondary text-sm leading-relaxed">{server.description}</p>
          </div>
        )}

        <div className="text-text-muted text-sm">
          <p>{t('server.homeWelcome')}</p>
        </div>
      </div>
    </div>
  )
}
