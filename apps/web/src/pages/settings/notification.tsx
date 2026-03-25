import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '../../lib/api'

export function NotificationSettings() {
  const queryClient = useQueryClient()

  const { data: pref } = useQuery({
    queryKey: ['notification-preferences'],
    queryFn: () =>
      fetchApi<{
        strategy: 'all' | 'mention_only' | 'none'
        mutedServerIds: string[]
        mutedChannelIds: string[]
      }>('/api/notifications/preferences'),
  })

  const { data: servers = [] } = useQuery({
    queryKey: ['servers'],
    queryFn: () =>
      fetchApi<
        Array<{ server: { id: string; name: string; slug: string | null; iconUrl: string | null } }>
      >('/api/servers'),
  })

  const updatePref = useMutation({
    mutationFn: (
      payload: Partial<{
        strategy: 'all' | 'mention_only' | 'none'
        mutedServerIds: string[]
        mutedChannelIds: string[]
      }>,
    ) =>
      fetchApi('/api/notifications/preferences', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-preferences'] })
      queryClient.invalidateQueries({ queryKey: ['notification-scoped-unread'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  const mutedServers = servers.filter((s) => (pref?.mutedServerIds ?? []).includes(s.server.id))

  return (
    <>
      <h2 className="text-2xl font-bold text-text-primary mb-2">通知设置</h2>
      <p className="text-text-muted text-sm mb-6">管理通知策略、频道/服务器静音。</p>

      <div className="bg-bg-secondary rounded-xl border border-border-subtle p-6 mb-6">
        <label className="block text-xs font-bold uppercase text-text-secondary mb-4 tracking-wide">
          通知策略
        </label>
        <div className="space-y-2">
          {[
            {
              value: 'all' as const,
              title: '全部通知',
              desc: '接收提及、回复与系统通知。',
            },
            {
              value: 'mention_only' as const,
              title: '仅提及',
              desc: '只接收@提及和系统通知。',
            },
            {
              value: 'none' as const,
              title: '仅系统',
              desc: '屏蔽消息类通知，仅保留系统通知。',
            },
          ].map((item) => {
            const checked = (pref?.strategy ?? 'all') === item.value
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => updatePref.mutate({ strategy: item.value })}
                className={`w-full text-left p-3 rounded-lg border transition ${
                  checked
                    ? 'border-primary bg-primary/10'
                    : 'border-border-subtle hover:border-border-dim bg-bg-tertiary'
                }`}
              >
                <p
                  className={`text-sm font-bold ${checked ? 'text-primary' : 'text-text-primary'}`}
                >
                  {item.title}
                </p>
                <p className="text-xs text-text-muted mt-0.5">{item.desc}</p>
              </button>
            )
          })}
        </div>
      </div>

      <div className="bg-bg-secondary rounded-xl border border-border-subtle p-6">
        <h3 className="text-lg font-bold text-text-primary mb-3">已静音服务器</h3>
        {mutedServers.length === 0 ? (
          <p className="text-sm text-text-muted">暂无已静音服务器</p>
        ) : (
          <div className="space-y-2">
            {mutedServers.map((s) => (
              <div
                key={s.server.id}
                className="flex items-center justify-between rounded-lg bg-bg-tertiary px-3 py-2"
              >
                <span className="text-sm text-text-primary truncate">{s.server.name}</span>
                <button
                  type="button"
                  onClick={() =>
                    updatePref.mutate({
                      mutedServerIds: (pref?.mutedServerIds ?? []).filter(
                        (id) => id !== s.server.id,
                      ),
                    })
                  }
                  className="text-xs px-2 py-1 rounded bg-bg-modifier-hover hover:bg-bg-modifier-active text-text-secondary"
                >
                  取消静音
                </button>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-text-muted mt-4">频道静音可在频道列表右键菜单中设置。</p>
      </div>
    </>
  )
}
