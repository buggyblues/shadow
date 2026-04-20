import { useEffect, useState } from 'react'
import { apiFetch, type User } from '../lib/admin-api'

export function UsersTab() {
  const [users, setUsers] = useState<User[]>([])

  const load = () =>
    apiFetch<User[]>('/users')
      .then(setUsers)
      .catch(() => {})

  useEffect(() => {
    load()
  }, [])

  const del = async (id: string) => {
    if (!confirm('确定要删除该用户吗？')) return
    await apiFetch(`/users/${id}`, { method: 'DELETE' })
    load()
  }

  return (
    <div>
      <h2 className="text-lg font-bold mb-4">用户管理</h2>
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-400 text-left">
              <th className="px-4 py-3">用户</th>
              <th className="px-4 py-3">邮箱</th>
              <th className="px-4 py-3">状态</th>
              <th className="px-4 py-3">类型</th>
              <th className="px-4 py-3">注册时间</th>
              <th className="px-4 py-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {u.avatarUrl ? (
                      <img src={u.avatarUrl} alt="" className="w-7 h-7 rounded-full" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center text-xs">
                        {u.username[0]?.toUpperCase()}
                      </div>
                    )}
                    <div>
                      <p className="font-medium">{u.displayName ?? u.username}</p>
                      <p className="text-xs text-zinc-500">@{u.username}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-zinc-400">{u.email}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block w-2 h-2 rounded-full mr-1 ${
                      u.status === 'online'
                        ? 'bg-green-400'
                        : u.status === 'idle'
                          ? 'bg-amber-400'
                          : 'bg-zinc-500'
                    }`}
                  />
                  {u.status}
                </td>
                <td className="px-4 py-3">
                  {u.isBot ? (
                    <span className="text-xs bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded-full">
                      Buddy
                    </span>
                  ) : (
                    '用户'
                  )}
                </td>
                <td className="px-4 py-3 text-zinc-500">
                  {u.createdAt ? new Date(u.createdAt).toLocaleString() : '-'}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => del(u.id)}
                    className="text-red-400 hover:text-red-300 text-xs transition"
                  >
                    删除
                  </button>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
                  暂无用户
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
