import { useEffect, useState } from 'react'
import { apiFetch, type Stats } from '../lib/admin-api'

function StatCard({
  label,
  value,
  color,
}: {
  label: string
  value: number | string
  color: string
}) {
  return (
    <div className="bg-zinc-900 rounded-xl p-5 border border-zinc-800">
      <p className="text-zinc-400 text-sm mb-1">{label}</p>
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
    </div>
  )
}

export function StatsTab() {
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    apiFetch<Stats>('/stats')
      .then(setStats)
      .catch(() => {})
  }, [])

  if (!stats) return <div className="text-zinc-500 text-sm py-8 text-center">加载中…</div>

  return (
    <div>
      <h2 className="text-lg font-bold mb-4">数据看板</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="总用户数" value={stats.totalUsers} color="text-blue-400" />
        <StatCard label="在线用户" value={stats.onlineUsers} color="text-green-400" />
        <StatCard label="总服务器" value={stats.totalServers} color="text-purple-400" />
        <StatCard label="总频道数" value={stats.totalChannels} color="text-pink-400" />
        <StatCard label="总消息数" value={stats.totalMessages} color="text-orange-400" />
        <StatCard label="邀请码总数" value={stats.totalInviteCodes} color="text-amber-400" />
        <StatCard label="已使用邀请码" value={stats.usedInviteCodes} color="text-cyan-400" />
        <StatCard
          label="未使用邀请码"
          value={stats.totalInviteCodes - stats.usedInviteCodes}
          color="text-emerald-400"
        />
      </div>
    </div>
  )
}
