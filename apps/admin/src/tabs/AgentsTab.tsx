import { useEffect, useState } from 'react'
import { type AdminAgent, apiFetch } from '../lib/admin-api'

export function AgentsTab() {
  const [agents, setAgents] = useState<AdminAgent[]>([])

  const load = () =>
    apiFetch<AdminAgent[]>('/agents')
      .then(setAgents)
      .catch(() => {})

  useEffect(() => {
    load()
  }, [])

  const del = async (id: string) => {
    if (!confirm('确定要删除该 Buddy 吗？')) return
    await apiFetch(`/agents/${id}`, { method: 'DELETE' })
    load()
  }

  return (
    <div>
      <h2 className="text-lg font-bold mb-4">Buddy 管理</h2>
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-400 text-left">
              <th className="px-4 py-3">Buddy</th>
              <th className="px-4 py-3">所有者</th>
              <th className="px-4 py-3">引擎</th>
              <th className="px-4 py-3">状态</th>
              <th className="px-4 py-3">更新时间</th>
              <th className="px-4 py-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((a) => (
              <tr key={a.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {a.botUser?.avatarUrl ? (
                      <img src={a.botUser.avatarUrl} alt="" className="w-7 h-7 rounded-full" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-purple-600 flex items-center justify-center text-xs font-bold">
                        {(a.botUser?.displayName ?? 'A')[0]?.toUpperCase()}
                      </div>
                    )}
                    <div>
                      <p className="font-medium">
                        {a.botUser?.displayName ?? a.botUser?.username ?? 'Buddy'}
                      </p>
                      <p className="text-xs text-zinc-500">@{a.botUser?.username ?? '—'}</p>
                    </div>
                    <span className="text-[10px] bg-indigo-500/20 text-indigo-400 px-1.5 py-0.5 rounded-full font-bold">
                      Buddy
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 text-zinc-400">
                  {a.owner ? (
                    <span>@{a.owner.username}</span>
                  ) : (
                    <span className="text-zinc-600">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-zinc-400 font-mono text-xs">{a.kernelType}</td>
                <td className="px-4 py-3">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      a.status === 'running'
                        ? 'bg-green-500/20 text-green-400'
                        : a.status === 'error'
                          ? 'bg-red-500/20 text-red-400'
                          : 'bg-zinc-700 text-zinc-300'
                    }`}
                  >
                    {a.status === 'running' ? '在线' : a.status === 'error' ? '异常' : '离线'}
                  </span>
                </td>
                <td className="px-4 py-3 text-zinc-500">
                  {a.updatedAt ? new Date(a.updatedAt).toLocaleString() : '—'}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => del(a.id)}
                    className="text-red-400 hover:text-red-300 text-xs transition"
                  >
                    删除
                  </button>
                </td>
              </tr>
            ))}
            {agents.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
                  暂无 Buddy
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
