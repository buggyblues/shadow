import { useEffect, useState } from 'react'
import { apiFetch, type InviteCode } from '../lib/admin-api'

export function InvitesTab() {
  const [invites, setInvites] = useState<InviteCode[]>([])
  const [genCount, setGenCount] = useState(1)
  const [genNote, setGenNote] = useState('')
  const [loading, setLoading] = useState(false)

  const load = () =>
    apiFetch<InviteCode[]>('/invite-codes')
      .then(setInvites)
      .catch(() => {})

  useEffect(() => {
    load()
  }, [])

  const generate = async () => {
    setLoading(true)
    try {
      await apiFetch('/invite-codes', {
        method: 'POST',
        body: JSON.stringify({ count: genCount, note: genNote || undefined }),
      })
      setGenNote('')
      load()
    } catch {
      /* */
    } finally {
      setLoading(false)
    }
  }

  const del = async (id: string) => {
    await apiFetch(`/invite-codes/${id}`, { method: 'DELETE' })
    load()
  }

  return (
    <div>
      <h2 className="text-lg font-bold mb-4">邀请码管理</h2>

      {/* Generate form */}
      <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800 mb-6 flex items-end gap-4 flex-wrap">
        <div>
          <label className="block text-xs text-zinc-400 mb-1">生成数量</label>
          <input
            type="number"
            min={1}
            max={100}
            value={genCount}
            onChange={(e) => setGenCount(Number(e.target.value))}
            className="bg-zinc-800 text-white rounded-lg px-3 py-2 w-24 outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs text-zinc-400 mb-1">备注 (可选)</label>
          <input
            type="text"
            value={genNote}
            onChange={(e) => setGenNote(e.target.value)}
            placeholder="例如：测试用户"
            className="w-full bg-zinc-800 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <button
          onClick={generate}
          disabled={loading}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg px-5 py-2 font-medium transition"
        >
          {loading ? '生成中...' : '生成邀请码'}
        </button>
      </div>

      {/* Table */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-400 text-left">
              <th className="px-4 py-3">邀请码</th>
              <th className="px-4 py-3">状态</th>
              <th className="px-4 py-3">创建者</th>
              <th className="px-4 py-3">备注</th>
              <th className="px-4 py-3">创建时间</th>
              <th className="px-4 py-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {invites.map((inv) => (
              <tr key={inv.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                <td className="px-4 py-3 font-mono font-bold text-amber-400">{inv.code}</td>
                <td className="px-4 py-3">
                  {inv.usedBy ? (
                    <span className="text-xs bg-zinc-700 text-zinc-300 px-2 py-0.5 rounded-full">
                      已使用
                    </span>
                  ) : inv.isActive ? (
                    <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">
                      可用
                    </span>
                  ) : (
                    <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full">
                      已停用
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-zinc-400">{inv.createdByUser?.username ?? '-'}</td>
                <td className="px-4 py-3 text-zinc-400">{inv.note ?? '-'}</td>
                <td className="px-4 py-3 text-zinc-500">
                  {inv.createdAt ? new Date(inv.createdAt).toLocaleString() : '-'}
                </td>
                <td className="px-4 py-3">
                  {!inv.usedBy && (
                    <button
                      onClick={() => del(inv.id)}
                      className="text-red-400 hover:text-red-300 text-xs transition"
                    >
                      删除
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {invites.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
                  暂无邀请码
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
