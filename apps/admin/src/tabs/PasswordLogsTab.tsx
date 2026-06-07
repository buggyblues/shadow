import { useEffect, useState } from 'react'
import { apiFetch, type PaginatedResponse, type PasswordChangeLog } from '../lib/admin-api'

const PAGE_SIZE = 50

export function PasswordLogsTab() {
  const [logs, setLogs] = useState<PasswordChangeLog[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const load = (nextPage = page) =>
    apiFetch<PaginatedResponse<PasswordChangeLog>>(
      `/password-logs?includeTotal=1&limit=${PAGE_SIZE}&offset=${(nextPage - 1) * PAGE_SIZE}`,
    )
      .then((data) => {
        setLogs(data.items)
        setTotal(data.total)
      })
      .catch(() => {})

  useEffect(() => {
    load(page)
  }, [page])

  return (
    <div>
      <h2 className="text-lg font-bold mb-2">密码修改日志</h2>
      <p className="text-zinc-400 text-sm mb-4">
        记录所有用户的密码修改操作，包括成功和失败的尝试。
      </p>
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-400 text-left">
              <th className="px-4 py-3">用户</th>
              <th className="px-4 py-3">状态</th>
              <th className="px-4 py-3">IP 地址</th>
              <th className="px-4 py-3">User Agent</th>
              <th className="px-4 py-3">时间</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                <td className="px-4 py-3">
                  {log.user ? (
                    <div>
                      <p className="font-medium">{log.user.displayName ?? log.user.username}</p>
                      <p className="text-xs text-zinc-500">{log.user.email}</p>
                    </div>
                  ) : (
                    <span className="text-zinc-500">未知用户</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {log.success ? (
                    <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">
                      成功
                    </span>
                  ) : (
                    <div>
                      <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full">
                        失败
                      </span>
                      {log.failureReason && (
                        <p className="text-xs text-red-300 mt-1">{log.failureReason}</p>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-zinc-400 font-mono text-xs">
                  {log.ipAddress ?? '—'}
                </td>
                <td className="px-4 py-3 text-zinc-500 text-xs max-w-xs truncate">
                  {log.userAgent ?? '—'}
                </td>
                <td className="px-4 py-3 text-zinc-500">
                  {log.createdAt ? new Date(log.createdAt).toLocaleString() : '—'}
                </td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                  暂无密码修改记录
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex items-center justify-between text-xs text-zinc-500">
        <span>
          共 {total} 条，第 {page} / {totalPages} 页
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded bg-zinc-800 px-3 py-1 text-zinc-200 disabled:opacity-50"
          >
            上一页
          </button>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="rounded bg-zinc-800 px-3 py-1 text-zinc-200 disabled:opacity-50"
          >
            下一页
          </button>
        </div>
      </div>
    </div>
  )
}
