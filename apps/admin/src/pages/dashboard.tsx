import { useEffect, useState } from 'react'
import { ConfigManagementPage } from './config-management'

const API_BASE = '/api/admin'

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = localStorage.getItem('admin_token') ?? ''
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(opts?.headers ?? {}),
    },
  })
  if (res.status === 403) {
    localStorage.removeItem('admin_token')
    window.location.reload()
    throw new Error('Admin access denied')
  }
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<T>
}

/* ── Login ─────────────────────────────────────────── */
function LoginPanel({ onLogin }: { onLogin: (token: string) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr('')
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!res.ok) throw new Error('Login failed')
      const data = (await res.json()) as { accessToken: string }
      // Verify admin access
      const checkRes = await fetch(`${API_BASE}/stats`, {
        headers: { Authorization: `Bearer ${data.accessToken}` },
      })
      if (checkRes.status === 403) {
        throw new Error('此账号没有管理员权限')
      }
      if (!checkRes.ok) {
        throw new Error('Admin verification failed')
      }
      localStorage.setItem('admin_token', data.accessToken)
      onLogin(data.accessToken)
    } catch (e) {
      const msg = e instanceof Error ? e.message : '登录失败'
      setErr(msg === 'Login failed' ? '登录失败，请检查邮箱和密码' : msg)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950">
      <form
        onSubmit={handleLogin}
        className="bg-zinc-900 rounded-2xl p-8 w-full max-w-sm border border-zinc-800 space-y-4"
      >
        <h1 className="text-2xl font-bold text-white text-center">🛡️ Shadow Admin</h1>
        <p className="text-zinc-400 text-center text-sm">管理员登录</p>
        {err && <p className="text-red-400 text-sm bg-red-500/10 rounded-lg p-2">{err}</p>}
        <input
          type="email"
          placeholder="邮箱"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full bg-zinc-800 text-white rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500"
          required
        />
        <input
          type="password"
          placeholder="密码"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full bg-zinc-800 text-white rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500"
          required
        />
        <button
          type="submit"
          className="w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg py-3 font-bold transition"
        >
          登录
        </button>
      </form>
    </div>
  )
}

/* ── Stats Card ─────────────────────────────────────── */
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

/* ── Tabs ────────────────────────────────────────────── */
type Tab =
  | 'stats'
  | 'invites'
  | 'users'
  | 'servers'
  | 'agents'
  | 'passwordLogs'
  | 'templates'
  | 'config'

interface Stats {
  totalUsers: number
  onlineUsers: number
  totalServers: number
  totalMessages: number
  totalChannels: number
  totalInviteCodes: number
  usedInviteCodes: number
}

interface InviteCode {
  id: string
  code: string
  isActive: boolean
  usedBy: string | null
  usedAt: string | null
  note: string | null
  createdAt: string
  createdByUser: { id: string; username: string; displayName: string | null } | null
}

interface User {
  id: string
  email: string
  username: string
  displayName: string | null
  avatarUrl: string | null
  status: string
  isBot: boolean
  createdAt: string
}

interface Server {
  id: string
  name: string
  slug: string | null
  description: string | null
  iconUrl: string | null
  bannerUrl: string | null
  isPublic: boolean
  createdAt: string
}

interface Channel {
  id: string
  name: string
  type: string
  serverId: string
}

interface Message {
  id: string
  content: string
  channelId: string
  authorId: string
  createdAt: string
  author?: { username: string; displayName: string | null } | null
}

interface AdminAgent {
  id: string
  userId: string
  kernelType: string
  config: Record<string, unknown>
  ownerId: string
  status: 'running' | 'stopped' | 'error'
  containerId: string | null
  updatedAt: string
  botUser?: {
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
    email: string
  } | null
  owner?: {
    id: string
    username: string
    displayName: string | null
  } | null
}

interface CloudTemplate {
  id: string
  slug: string
  name: string
  description: string | null
  source: 'official' | 'community'
  reviewStatus: 'draft' | 'pending' | 'approved' | 'rejected'
  reviewNote: string | null
  tags: string[]
  category: string | null
  baseCost: number | null
  deployCount: number
  content: Record<string, unknown>
  createdAt: string
  updatedAt: string
  authorId: string | null
}

type TplStatusFilter = 'all' | 'draft' | 'pending' | 'approved' | 'rejected'

interface PasswordChangeLog {
  id: string
  userId: string
  ipAddress: string | null
  userAgent: string | null
  success: boolean
  failureReason: string | null
  createdAt: string
  user?: {
    id: string
    email: string
    username: string
    displayName: string | null
  } | null
}

/* ── Dashboard Content ──────────────────────────────── */
function DashboardContent() {
  const [tab, setTab] = useState<Tab>('stats')
  const [stats, setStats] = useState<Stats | null>(null)
  const [invites, setInvites] = useState<InviteCode[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [servers, setServers] = useState<Server[]>([])
  const [genCount, setGenCount] = useState(1)
  const [genNote, setGenNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [selectedServer, setSelectedServer] = useState<Server | null>(null)
  const [serverChannels, setServerChannels] = useState<Channel[]>([])
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null)
  const [channelMessages, setChannelMessages] = useState<Message[]>([])
  const [editingServer, setEditingServer] = useState<Server | null>(null)
  const [editServerForm, setEditServerForm] = useState<{
    name: string
    slug: string
    description: string
    isPublic: boolean
  }>({ name: '', slug: '', description: '', isPublic: false })
  const [adminAgents, setAdminAgents] = useState<AdminAgent[]>([])
  const [passwordLogs, setPasswordLogs] = useState<PasswordChangeLog[]>([])

  // Templates state
  const [templates, setTemplates] = useState<CloudTemplate[]>([])
  const [tplFilter, setTplFilter] = useState<TplStatusFilter>('all')
  const [tplLoading, setTplLoading] = useState(false)
  const [tplSelected, setTplSelected] = useState<CloudTemplate | null>(null)
  const [tplActionLoading, setTplActionLoading] = useState<string | null>(null)
  const [tplRejectDialogOpen, setTplRejectDialogOpen] = useState(false)
  const [tplRejectNote, setTplRejectNote] = useState('')
  const [tplRejectTargetId, setTplRejectTargetId] = useState<string | null>(null)
  const [tplEditOpen, setTplEditOpen] = useState(false)
  const [tplEditTarget, setTplEditTarget] = useState<CloudTemplate | null>(null)
  const [tplCreateOpen, setTplCreateOpen] = useState(false)
  type TplForm = {
    slug: string
    name: string
    description: string
    source: 'official' | 'community'
    reviewStatus: 'draft' | 'pending' | 'approved' | 'rejected'
    tags: string
    category: string
    baseCost: string
    content: string
  }
  const emptyTplForm: TplForm = {
    slug: '',
    name: '',
    description: '',
    source: 'official',
    reviewStatus: 'approved',
    tags: '',
    category: '',
    baseCost: '',
    content: '{}',
  }
  const [tplForm, setTplForm] = useState<TplForm>(emptyTplForm)

  const loadStats = async () => {
    try {
      setStats(await apiFetch<Stats>('/stats'))
    } catch {
      /* */
    }
  }

  const loadInvites = async () => {
    try {
      setInvites(await apiFetch<InviteCode[]>('/invite-codes'))
    } catch {
      /* */
    }
  }

  const loadUsers = async () => {
    try {
      setUsers(await apiFetch<User[]>('/users'))
    } catch {
      /* */
    }
  }

  const loadServers = async () => {
    try {
      setServers(await apiFetch<Server[]>('/servers'))
    } catch {
      /* */
    }
  }

  const loadServerChannels = async (serverId: string) => {
    try {
      setServerChannels(await apiFetch<Channel[]>(`/servers/${serverId}/channels`))
    } catch {
      /* */
    }
  }

  const loadChannelMessages = async (serverId: string, channelId: string) => {
    try {
      setChannelMessages(
        await apiFetch<Message[]>(`/servers/${serverId}/channels/${channelId}/messages`),
      )
    } catch {
      /* */
    }
  }

  const loadAgents = async () => {
    try {
      setAdminAgents(await apiFetch<AdminAgent[]>('/agents'))
    } catch {
      /* */
    }
  }

  const loadTemplates = async (status: TplStatusFilter = tplFilter) => {
    setTplLoading(true)
    try {
      const qs = status === 'all' ? '' : `?status=${status}`
      const data = await apiFetch<CloudTemplate[]>(`/cloud-templates${qs}`)
      setTemplates(data)
    } catch {
      /* */
    } finally {
      setTplLoading(false)
    }
  }

  const loadPasswordLogs = async () => {
    try {
      setPasswordLogs(await apiFetch<PasswordChangeLog[]>('/password-logs'))
    } catch {
      /* */
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional load on mount
  useEffect(() => {
    loadStats()
  }, [])

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional load on tab change
  useEffect(() => {
    if (tab === 'invites') loadInvites()
    if (tab === 'users') loadUsers()
    if (tab === 'servers') loadServers()
    if (tab === 'agents') loadAgents()
    if (tab === 'passwordLogs') loadPasswordLogs()
    if (tab === 'templates') loadTemplates(tplFilter)
  }, [tab])

  const generateCodes = async () => {
    setLoading(true)
    try {
      await apiFetch('/invite-codes', {
        method: 'POST',
        body: JSON.stringify({ count: genCount, note: genNote || undefined }),
      })
      setGenNote('')
      loadInvites()
      loadStats()
    } catch {
      /* */
    }
    setLoading(false)
  }

  const deleteInvite = async (id: string) => {
    await apiFetch(`/invite-codes/${id}`, { method: 'DELETE' })
    loadInvites()
    loadStats()
  }

  const deleteUser = async (id: string) => {
    if (!confirm('确定要删除该用户吗？')) return
    await apiFetch(`/users/${id}`, { method: 'DELETE' })
    loadUsers()
    loadStats()
  }

  const deleteServer = async (id: string) => {
    if (!confirm('确定要删除该服务器吗？')) return
    await apiFetch(`/servers/${id}`, { method: 'DELETE' })
    loadServers()
    loadStats()
    if (selectedServer?.id === id) {
      setSelectedServer(null)
      setServerChannels([])
      setSelectedChannel(null)
      setChannelMessages([])
    }
  }

  const deleteChannel = async (id: string) => {
    if (!confirm('确定要删除该频道吗？')) return
    await apiFetch(`/channels/${id}`, { method: 'DELETE' })
    if (selectedServer) loadServerChannels(selectedServer.id)
    loadStats()
    if (selectedChannel?.id === id) {
      setSelectedChannel(null)
      setChannelMessages([])
    }
  }

  const deleteMessage = async (id: string) => {
    if (!confirm('确定要删除该消息吗？')) return
    await apiFetch(`/messages/${id}`, { method: 'DELETE' })
    if (selectedServer && selectedChannel) {
      loadChannelMessages(selectedServer.id, selectedChannel.id)
    }
  }

  const deleteAgent = async (id: string) => {
    if (!confirm('确定要删除该 Buddy 吗？')) return
    await apiFetch(`/agents/${id}`, { method: 'DELETE' })
    loadAgents()
  }

  const openEditServer = (s: Server) => {
    setEditingServer(s)
    setEditServerForm({
      name: s.name,
      slug: s.slug ?? '',
      description: s.description ?? '',
      isPublic: s.isPublic,
    })
  }

  const saveEditServer = async () => {
    if (!editingServer) return
    try {
      await apiFetch(`/servers/${editingServer.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editServerForm.name,
          slug: editServerForm.slug || null,
          description: editServerForm.description || null,
          isPublic: editServerForm.isPublic,
        }),
      })
      setEditingServer(null)
      loadServers()
    } catch {
      /* */
    }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'stats', label: '📊 数据看板' },
    { key: 'invites', label: '🎟️ 邀请码' },
    { key: 'users', label: '👤 用户管理' },
    { key: 'servers', label: '🖥️ 服务器管理' },
    { key: 'agents', label: '🐱 Buddy 管理' },
    { key: 'passwordLogs', label: '🔐 密码日志' },
    { key: 'templates', label: '🛍️ 商店模版' },
    { key: 'config', label: '🔧 Config Platform' },
  ]

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="bg-zinc-900 border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🛡️</span>
          <h1 className="text-xl font-bold">Shadow Admin</h1>
        </div>
        <button
          onClick={() => {
            localStorage.removeItem('admin_token')
            window.location.reload()
          }}
          className="text-zinc-400 hover:text-white text-sm transition"
        >
          退出登录
        </button>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className="w-56 bg-zinc-900/50 min-h-[calc(100vh-61px)] p-4 border-r border-zinc-800">
          <nav className="space-y-1">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`w-full text-left px-4 py-2.5 rounded-lg text-sm font-medium transition ${
                  tab === t.key
                    ? 'bg-indigo-600 text-white'
                    : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Main */}
        <main className="flex-1 p-6">
          {/* Stats Tab */}
          {tab === 'stats' && stats && (
            <div>
              <h2 className="text-lg font-bold mb-4">数据看板</h2>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="总用户数" value={stats.totalUsers} color="text-blue-400" />
                <StatCard label="在线用户" value={stats.onlineUsers} color="text-green-400" />
                <StatCard label="总服务器" value={stats.totalServers} color="text-purple-400" />
                <StatCard label="总频道数" value={stats.totalChannels} color="text-pink-400" />
                <StatCard label="总消息数" value={stats.totalMessages} color="text-orange-400" />
                <StatCard
                  label="邀请码总数"
                  value={stats.totalInviteCodes}
                  color="text-amber-400"
                />
                <StatCard
                  label="已使用邀请码"
                  value={stats.usedInviteCodes}
                  color="text-cyan-400"
                />
                <StatCard
                  label="未使用邀请码"
                  value={stats.totalInviteCodes - stats.usedInviteCodes}
                  color="text-emerald-400"
                />
              </div>
            </div>
          )}

          {/* Invites Tab */}
          {tab === 'invites' && (
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
                  onClick={generateCodes}
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
                        <td className="px-4 py-3 text-zinc-400">
                          {inv.createdByUser?.username ?? '-'}
                        </td>
                        <td className="px-4 py-3 text-zinc-400">{inv.note ?? '-'}</td>
                        <td className="px-4 py-3 text-zinc-500">
                          {inv.createdAt ? new Date(inv.createdAt).toLocaleString() : '-'}
                        </td>
                        <td className="px-4 py-3">
                          {!inv.usedBy && (
                            <button
                              onClick={() => deleteInvite(inv.id)}
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
          )}

          {/* Users Tab */}
          {tab === 'users' && (
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
                            onClick={() => deleteUser(u.id)}
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
          )}

          {/* Servers Tab */}
          {tab === 'servers' && (
            <div>
              {/* Breadcrumb */}
              <div className="flex items-center gap-2 mb-4">
                <button
                  onClick={() => {
                    setSelectedServer(null)
                    setServerChannels([])
                    setSelectedChannel(null)
                    setChannelMessages([])
                  }}
                  className={`text-lg font-bold ${selectedServer ? 'text-indigo-400 hover:underline cursor-pointer' : 'text-white'}`}
                >
                  服务器管理
                </button>
                {selectedServer && (
                  <>
                    <span className="text-zinc-500">/</span>
                    <button
                      onClick={() => {
                        setSelectedChannel(null)
                        setChannelMessages([])
                      }}
                      className={`text-lg font-bold ${selectedChannel ? 'text-indigo-400 hover:underline cursor-pointer' : 'text-white'}`}
                    >
                      {selectedServer.name}
                    </button>
                  </>
                )}
                {selectedChannel && (
                  <>
                    <span className="text-zinc-500">/</span>
                    <span className="text-lg font-bold text-white">#{selectedChannel.name}</span>
                  </>
                )}
              </div>

              {/* Messages list */}
              {selectedServer && selectedChannel && (
                <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-800 text-zinc-400 text-left">
                        <th className="px-4 py-3">发送者</th>
                        <th className="px-4 py-3">内容</th>
                        <th className="px-4 py-3">时间</th>
                        <th className="px-4 py-3">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {channelMessages.map((msg) => (
                        <tr
                          key={msg.id}
                          className="border-b border-zinc-800/50 hover:bg-zinc-800/30"
                        >
                          <td className="px-4 py-3 text-zinc-300">
                            {msg.author?.displayName ?? msg.author?.username ?? msg.authorId}
                          </td>
                          <td className="px-4 py-3 text-zinc-300 max-w-sm truncate">
                            {msg.content}
                          </td>
                          <td className="px-4 py-3 text-zinc-500">
                            {msg.createdAt ? new Date(msg.createdAt).toLocaleString() : '-'}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => deleteMessage(msg.id)}
                              className="text-red-400 hover:text-red-300 text-xs transition"
                            >
                              删除
                            </button>
                          </td>
                        </tr>
                      ))}
                      {channelMessages.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-4 py-8 text-center text-zinc-500">
                            暂无消息
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Channels list for a server */}
              {selectedServer && !selectedChannel && (
                <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-800 text-zinc-400 text-left">
                        <th className="px-4 py-3">频道</th>
                        <th className="px-4 py-3">类型</th>
                        <th className="px-4 py-3">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {serverChannels.map((ch) => (
                        <tr
                          key={ch.id}
                          className="border-b border-zinc-800/50 hover:bg-zinc-800/30 cursor-pointer"
                          onClick={() => {
                            setSelectedChannel(ch)
                            loadChannelMessages(selectedServer.id, ch.id)
                          }}
                        >
                          <td className="px-4 py-3">
                            <span className="text-zinc-300 font-medium">#{ch.name}</span>
                          </td>
                          <td className="px-4 py-3 text-zinc-400">{ch.type}</td>
                          <td className="px-4 py-3">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                deleteChannel(ch.id)
                              }}
                              className="text-red-400 hover:text-red-300 text-xs transition"
                            >
                              删除
                            </button>
                          </td>
                        </tr>
                      ))}
                      {serverChannels.length === 0 && (
                        <tr>
                          <td colSpan={3} className="px-4 py-8 text-center text-zinc-500">
                            暂无频道
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Server list */}
              {!selectedServer && (
                <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-800 text-zinc-400 text-left">
                        <th className="px-4 py-3">服务器</th>
                        <th className="px-4 py-3">Slug</th>
                        <th className="px-4 py-3">公开</th>
                        <th className="px-4 py-3">创建时间</th>
                        <th className="px-4 py-3">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {servers.map((s) => (
                        <tr
                          key={s.id}
                          className="border-b border-zinc-800/50 hover:bg-zinc-800/30 cursor-pointer"
                          onClick={() => {
                            setSelectedServer(s)
                            setSelectedChannel(null)
                            setChannelMessages([])
                            loadServerChannels(s.id)
                          }}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {s.iconUrl ? (
                                <img src={s.iconUrl} alt="" className="w-7 h-7 rounded-lg" />
                              ) : (
                                <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-xs font-bold">
                                  {s.name[0]?.toUpperCase()}
                                </div>
                              )}
                              <span className="font-medium">{s.name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-zinc-400 font-mono">{s.slug ?? '-'}</td>
                          <td className="px-4 py-3">{s.isPublic ? '✅' : '❌'}</td>
                          <td className="px-4 py-3 text-zinc-500">
                            {s.createdAt ? new Date(s.createdAt).toLocaleString() : '-'}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  openEditServer(s)
                                }}
                                className="text-indigo-400 hover:text-indigo-300 text-xs transition"
                              >
                                编辑
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  deleteServer(s.id)
                                }}
                                className="text-red-400 hover:text-red-300 text-xs transition"
                              >
                                删除
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {servers.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                            暂无服务器
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Edit server dialog */}
              {editingServer && (
                <div
                  className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
                  onClick={() => setEditingServer(null)}
                >
                  <div
                    className="bg-zinc-900 rounded-xl p-6 w-[440px] border border-zinc-800 space-y-4"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <h3 className="text-lg font-bold text-white">编辑服务器</h3>
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">名称</label>
                      <input
                        type="text"
                        value={editServerForm.name}
                        onChange={(e) => setEditServerForm((f) => ({ ...f, name: e.target.value }))}
                        className="w-full bg-zinc-800 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">Slug</label>
                      <input
                        type="text"
                        value={editServerForm.slug}
                        onChange={(e) => setEditServerForm((f) => ({ ...f, slug: e.target.value }))}
                        placeholder="例如: my-server"
                        className="w-full bg-zinc-800 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">描述</label>
                      <textarea
                        value={editServerForm.description}
                        onChange={(e) =>
                          setEditServerForm((f) => ({ ...f, description: e.target.value }))
                        }
                        rows={3}
                        placeholder="服务器描述..."
                        className="w-full bg-zinc-800 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-zinc-300">公开服务器</span>
                      <button
                        type="button"
                        onClick={() => setEditServerForm((f) => ({ ...f, isPublic: !f.isPublic }))}
                        className={`relative w-11 h-6 rounded-full transition-colors ${
                          editServerForm.isPublic ? 'bg-indigo-600' : 'bg-zinc-700'
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                            editServerForm.isPublic ? 'translate-x-5' : ''
                          }`}
                        />
                      </button>
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                      <button
                        onClick={() => setEditingServer(null)}
                        className="px-4 py-2 text-zinc-400 hover:text-white transition"
                      >
                        取消
                      </button>
                      <button
                        onClick={saveEditServer}
                        disabled={!editServerForm.name.trim()}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition disabled:opacity-50"
                      >
                        保存
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Agents Tab */}
          {tab === 'agents' && (
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
                    {adminAgents.map((agent) => (
                      <tr
                        key={agent.id}
                        className="border-b border-zinc-800/50 hover:bg-zinc-800/30"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {agent.botUser?.avatarUrl ? (
                              <img
                                src={agent.botUser.avatarUrl}
                                alt=""
                                className="w-7 h-7 rounded-full"
                              />
                            ) : (
                              <div className="w-7 h-7 rounded-full bg-purple-600 flex items-center justify-center text-xs font-bold">
                                {(agent.botUser?.displayName ?? 'A')[0]?.toUpperCase()}
                              </div>
                            )}
                            <div>
                              <p className="font-medium">
                                {agent.botUser?.displayName ?? agent.botUser?.username ?? 'Buddy'}
                              </p>
                              <p className="text-xs text-zinc-500">
                                @{agent.botUser?.username ?? '—'}
                              </p>
                            </div>
                            <span className="text-[10px] bg-indigo-500/20 text-indigo-400 px-1.5 py-0.5 rounded-full font-bold">
                              Buddy
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-zinc-400">
                          {agent.owner ? (
                            <span>@{agent.owner.username}</span>
                          ) : (
                            <span className="text-zinc-600">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-zinc-400 font-mono text-xs">
                          {agent.kernelType}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full ${
                              agent.status === 'running'
                                ? 'bg-green-500/20 text-green-400'
                                : agent.status === 'error'
                                  ? 'bg-red-500/20 text-red-400'
                                  : 'bg-zinc-700 text-zinc-300'
                            }`}
                          >
                            {agent.status === 'running'
                              ? '在线'
                              : agent.status === 'error'
                                ? '异常'
                                : '离线'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-zinc-500">
                          {agent.updatedAt ? new Date(agent.updatedAt).toLocaleString() : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => deleteAgent(agent.id)}
                            className="text-red-400 hover:text-red-300 text-xs transition"
                          >
                            删除
                          </button>
                        </td>
                      </tr>
                    ))}
                    {adminAgents.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
                          暂无 Agent
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Password Logs Tab */}
          {tab === 'passwordLogs' && (
            <div>
              <h2 className="text-lg font-bold mb-4">密码修改日志</h2>
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
                    {passwordLogs.map((log) => (
                      <tr key={log.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                        <td className="px-4 py-3">
                          {log.user ? (
                            <div>
                              <p className="font-medium">
                                {log.user.displayName ?? log.user.username}
                              </p>
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
                    {passwordLogs.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                          暂无密码修改记录
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {/* Templates Tab */}
          {tab === 'templates' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold">商店模版管理</h2>
                <button
                  onClick={() => {
                    setTplForm(emptyTplForm)
                    setTplCreateOpen(true)
                  }}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition"
                >
                  + 新建模版
                </button>
              </div>

              {/* Filter */}
              <div className="flex gap-2 mb-4">
                {(['all', 'pending', 'approved', 'rejected', 'draft'] as TplStatusFilter[]).map(
                  (s) => (
                    <button
                      key={s}
                      onClick={() => {
                        setTplFilter(s)
                        void loadTemplates(s)
                      }}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${tplFilter === s ? 'bg-indigo-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'}`}
                    >
                      {s === 'all'
                        ? '全部'
                        : s === 'pending'
                          ? '待审核'
                          : s === 'approved'
                            ? '已上架'
                            : s === 'rejected'
                              ? '已拒绝'
                              : '草稿'}
                    </button>
                  ),
                )}
              </div>

              <div className="flex gap-4">
                {/* List */}
                <div className="flex-1 min-w-0">
                  {tplLoading ? (
                    <div className="text-zinc-500 text-sm py-8 text-center">加载中…</div>
                  ) : templates.length === 0 ? (
                    <div className="text-zinc-500 text-sm py-8 text-center">暂无模版</div>
                  ) : (
                    <div className="space-y-2">
                      {templates.map((t) => {
                        const badge: Record<string, string> = {
                          draft: 'bg-zinc-500/20 text-zinc-300',
                          pending: 'bg-yellow-500/20 text-yellow-300',
                          approved: 'bg-green-500/20 text-green-300',
                          rejected: 'bg-red-500/20 text-red-300',
                        }
                        return (
                          <div
                            key={t.id}
                            onClick={() => setTplSelected(t)}
                            className={`p-4 rounded-xl border cursor-pointer transition ${tplSelected?.id === t.id ? 'border-indigo-500 bg-zinc-800' : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700'}`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium text-white">{t.name}</span>
                                  <span
                                    className={`px-2 py-0.5 rounded text-xs font-medium ${badge[t.reviewStatus]}`}
                                  >
                                    {t.reviewStatus}
                                  </span>
                                  <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded">
                                    {t.source}
                                  </span>
                                  {t.category && (
                                    <span className="text-xs text-zinc-500">{t.category}</span>
                                  )}
                                </div>
                                <p className="text-xs text-zinc-500 font-mono mt-0.5">{t.slug}</p>
                                {t.description && (
                                  <p className="text-sm text-zinc-400 mt-1 line-clamp-1">
                                    {t.description}
                                  </p>
                                )}
                                {t.reviewStatus === 'rejected' && t.reviewNote && (
                                  <p className="text-xs text-red-400 mt-1">✕ {t.reviewNote}</p>
                                )}
                              </div>
                              <div
                                className="flex gap-2 shrink-0"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {t.reviewStatus === 'pending' && (
                                  <>
                                    <button
                                      onClick={() => {
                                        setTplActionLoading(t.id)
                                        apiFetch(`/cloud-templates/${t.id}/approve`, {
                                          method: 'POST',
                                        })
                                          .then(() => {
                                            setTemplates((p) =>
                                              p.map((x) =>
                                                x.id === t.id
                                                  ? {
                                                      ...x,
                                                      reviewStatus: 'approved',
                                                      reviewNote: null,
                                                    }
                                                  : x,
                                              ),
                                            )
                                            if (tplSelected?.id === t.id)
                                              setTplSelected(
                                                (s) =>
                                                  s && {
                                                    ...s,
                                                    reviewStatus: 'approved',
                                                    reviewNote: null,
                                                  },
                                              )
                                          })
                                          .catch(() => {})
                                          .finally(() => setTplActionLoading(null))
                                      }}
                                      disabled={tplActionLoading === t.id}
                                      className="px-3 py-1 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-medium disabled:opacity-50 transition"
                                    >
                                      通过
                                    </button>
                                    <button
                                      onClick={() => {
                                        setTplRejectTargetId(t.id)
                                        setTplRejectNote('')
                                        setTplRejectDialogOpen(true)
                                      }}
                                      disabled={tplActionLoading === t.id}
                                      className="px-3 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium disabled:opacity-50 transition"
                                    >
                                      拒绝
                                    </button>
                                  </>
                                )}
                                <button
                                  onClick={() => {
                                    setTplForm({
                                      slug: t.slug,
                                      name: t.name,
                                      description: t.description ?? '',
                                      source: t.source,
                                      reviewStatus: t.reviewStatus,
                                      tags: t.tags.join(', '),
                                      category: t.category ?? '',
                                      baseCost: t.baseCost != null ? String(t.baseCost) : '',
                                      content: JSON.stringify(t.content, null, 2),
                                    })
                                    setTplEditTarget(t)
                                    setTplEditOpen(true)
                                  }}
                                  className="px-3 py-1 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white text-xs font-medium transition"
                                >
                                  编辑
                                </button>
                                <button
                                  onClick={() => {
                                    if (!confirm('确定要删除该模版？')) return
                                    apiFetch(`/cloud-templates/${t.id}`, { method: 'DELETE' })
                                      .then(() => {
                                        setTemplates((p) => p.filter((x) => x.id !== t.id))
                                        if (tplSelected?.id === t.id) setTplSelected(null)
                                      })
                                      .catch(() => {})
                                  }}
                                  className="px-3 py-1 rounded-lg bg-red-900/40 hover:bg-red-700 text-red-400 hover:text-white text-xs font-medium transition"
                                >
                                  删除
                                </button>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Detail panel */}
                {tplSelected && (
                  <div className="w-80 shrink-0 bg-zinc-900 rounded-xl border border-zinc-800 p-5 self-start sticky top-6">
                    <div className="flex items-start justify-between mb-3">
                      <h3 className="font-semibold text-white text-sm">{tplSelected.name}</h3>
                      <button
                        onClick={() => setTplSelected(null)}
                        className="text-zinc-500 hover:text-white transition text-lg leading-none"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="space-y-2.5 text-xs">
                      {[
                        [
                          'Slug',
                          <span className="font-mono text-zinc-300">{tplSelected.slug}</span>,
                        ],
                        ['Source', tplSelected.source],
                        ['Category', tplSelected.category ?? '—'],
                        [
                          'Base Cost',
                          tplSelected.baseCost != null ? `${tplSelected.baseCost} coins` : '—',
                        ],
                        ['Deploy Count', tplSelected.deployCount],
                        ['Created', new Date(tplSelected.createdAt).toLocaleString()],
                        ['Updated', new Date(tplSelected.updatedAt).toLocaleString()],
                      ].map(([label, val]) => (
                        <div key={String(label)}>
                          <span className="text-zinc-500">{label}</span>
                          <div className="mt-0.5 text-zinc-300">{val}</div>
                        </div>
                      ))}
                      {tplSelected.tags.length > 0 && (
                        <div>
                          <span className="text-zinc-500">Tags</span>
                          <div className="mt-0.5 flex flex-wrap gap-1">
                            {tplSelected.tags.map((tag) => (
                              <span
                                key={tag}
                                className="px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-300"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {tplSelected.description && (
                        <div>
                          <span className="text-zinc-500">Description</span>
                          <p className="mt-0.5 text-zinc-300">{tplSelected.description}</p>
                        </div>
                      )}
                      {tplSelected.reviewStatus === 'rejected' && tplSelected.reviewNote && (
                        <div className="rounded-lg bg-red-900/20 border border-red-800/40 p-2">
                          <span className="text-red-400 font-semibold">拒绝原因</span>
                          <p className="mt-1 text-red-300">{tplSelected.reviewNote}</p>
                        </div>
                      )}
                    </div>
                    {tplSelected.reviewStatus === 'pending' && (
                      <div className="mt-4 flex gap-2">
                        <button
                          onClick={() => {
                            setTplActionLoading(tplSelected.id)
                            apiFetch(`/cloud-templates/${tplSelected.id}/approve`, {
                              method: 'POST',
                            })
                              .then(() => {
                                setTemplates((p) =>
                                  p.map((x) =>
                                    x.id === tplSelected.id
                                      ? { ...x, reviewStatus: 'approved', reviewNote: null }
                                      : x,
                                  ),
                                )
                                setTplSelected(
                                  (s) => s && { ...s, reviewStatus: 'approved', reviewNote: null },
                                )
                              })
                              .catch(() => {})
                              .finally(() => setTplActionLoading(null))
                          }}
                          disabled={tplActionLoading === tplSelected.id}
                          className="flex-1 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-medium disabled:opacity-50 transition"
                        >
                          通过
                        </button>
                        <button
                          onClick={() => {
                            setTplRejectTargetId(tplSelected.id)
                            setTplRejectNote('')
                            setTplRejectDialogOpen(true)
                          }}
                          disabled={tplActionLoading === tplSelected.id}
                          className="flex-1 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium disabled:opacity-50 transition"
                        >
                          拒绝
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Create/Edit modal */}
              {(tplCreateOpen || tplEditOpen) && (
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
                  onClick={() => {
                    setTplCreateOpen(false)
                    setTplEditOpen(false)
                  }}
                >
                  <div
                    className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <h3 className="text-lg font-semibold text-white mb-4">
                      {tplCreateOpen ? '新建模版' : '编辑模版'}
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-zinc-400 mb-1">Slug *</label>
                        <input
                          value={tplForm.slug}
                          onChange={(e) => setTplForm((f) => ({ ...f, slug: e.target.value }))}
                          placeholder="my-template"
                          className="w-full bg-zinc-800 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                          disabled={tplEditOpen}
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-zinc-400 mb-1">名称 *</label>
                        <input
                          value={tplForm.name}
                          onChange={(e) => setTplForm((f) => ({ ...f, name: e.target.value }))}
                          placeholder="模版名称"
                          className="w-full bg-zinc-800 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs text-zinc-400 mb-1">描述</label>
                        <input
                          value={tplForm.description}
                          onChange={(e) =>
                            setTplForm((f) => ({ ...f, description: e.target.value }))
                          }
                          placeholder="模版简介"
                          className="w-full bg-zinc-800 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-zinc-400 mb-1">Source</label>
                        <select
                          value={tplForm.source}
                          onChange={(e) =>
                            setTplForm((f) => ({
                              ...f,
                              source: e.target.value as 'official' | 'community',
                            }))
                          }
                          className="w-full bg-zinc-800 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          <option value="official">official</option>
                          <option value="community">community</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-zinc-400 mb-1">状态</label>
                        <select
                          value={tplForm.reviewStatus}
                          onChange={(e) =>
                            setTplForm((f) => ({
                              ...f,
                              reviewStatus: e.target.value as CloudTemplate['reviewStatus'],
                            }))
                          }
                          className="w-full bg-zinc-800 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          <option value="approved">approved</option>
                          <option value="pending">pending</option>
                          <option value="draft">draft</option>
                          <option value="rejected">rejected</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-zinc-400 mb-1">Category</label>
                        <input
                          value={tplForm.category}
                          onChange={(e) => setTplForm((f) => ({ ...f, category: e.target.value }))}
                          placeholder="demo / starter / advanced…"
                          className="w-full bg-zinc-800 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-zinc-400 mb-1">
                          Base Cost (coins)
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={tplForm.baseCost}
                          onChange={(e) => setTplForm((f) => ({ ...f, baseCost: e.target.value }))}
                          placeholder="0"
                          className="w-full bg-zinc-800 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs text-zinc-400 mb-1">Tags (逗号分隔)</label>
                        <input
                          value={tplForm.tags}
                          onChange={(e) => setTplForm((f) => ({ ...f, tags: e.target.value }))}
                          placeholder="chat, ai, productivity"
                          className="w-full bg-zinc-800 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs text-zinc-400 mb-1">模版内容 (JSON)</label>
                        <textarea
                          value={tplForm.content}
                          onChange={(e) => setTplForm((f) => ({ ...f, content: e.target.value }))}
                          rows={10}
                          className="w-full bg-zinc-800 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 font-mono resize-y"
                          spellCheck={false}
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-3 mt-6">
                      <button
                        onClick={() => {
                          setTplCreateOpen(false)
                          setTplEditOpen(false)
                        }}
                        className="px-4 py-2 text-zinc-400 hover:text-white transition text-sm"
                      >
                        取消
                      </button>
                      <button
                        disabled={!tplForm.slug.trim() || !tplForm.name.trim()}
                        onClick={async () => {
                          let content: Record<string, unknown> = {}
                          try {
                            content = JSON.parse(tplForm.content)
                          } catch {
                            alert('模版内容 JSON 格式错误')
                            return
                          }
                          const body = {
                            slug: tplForm.slug,
                            name: tplForm.name,
                            description: tplForm.description || undefined,
                            source: tplForm.source,
                            reviewStatus: tplForm.reviewStatus,
                            tags: tplForm.tags
                              .split(',')
                              .map((s) => s.trim())
                              .filter(Boolean),
                            category: tplForm.category || undefined,
                            baseCost: tplForm.baseCost ? Number(tplForm.baseCost) : undefined,
                            content,
                          }
                          try {
                            if (tplCreateOpen) {
                              const created = await apiFetch<CloudTemplate>('/cloud-templates', {
                                method: 'POST',
                                body: JSON.stringify(body),
                              })
                              setTemplates((p) => [created, ...p])
                            } else if (tplEditTarget) {
                              const updated = await apiFetch<CloudTemplate>(
                                `/cloud-templates/${tplEditTarget.id}`,
                                { method: 'PATCH', body: JSON.stringify(body) },
                              )
                              setTemplates((p) =>
                                p.map((x) => (x.id === tplEditTarget.id ? updated : x)),
                              )
                              if (tplSelected?.id === tplEditTarget.id) setTplSelected(updated)
                            }
                            setTplCreateOpen(false)
                            setTplEditOpen(false)
                          } catch (e) {
                            alert(e instanceof Error ? e.message : '操作失败')
                          }
                        }}
                        className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
                      >
                        {tplCreateOpen ? '创建' : '保存'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Reject dialog */}
              {tplRejectDialogOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
                  <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
                    <h3 className="text-lg font-semibold text-white mb-3">拒绝模版</h3>
                    <p className="text-sm text-zinc-400 mb-3">
                      填写拒绝原因（可选），作者将收到该反馈。
                    </p>
                    <textarea
                      value={tplRejectNote}
                      onChange={(e) => setTplRejectNote(e.target.value)}
                      placeholder="例如：模版内容不完整，缺少必要的 Agent 配置…"
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800 text-white text-sm p-3 resize-none h-28 focus:outline-none focus:border-red-500"
                      maxLength={500}
                    />
                    <p className="text-xs text-zinc-500 mt-1 text-right">
                      {tplRejectNote.length}/500
                    </p>
                    <div className="flex gap-3 mt-4">
                      <button
                        onClick={() => {
                          setTplRejectDialogOpen(false)
                          setTplRejectNote('')
                          setTplRejectTargetId(null)
                        }}
                        className="flex-1 py-2 rounded-lg border border-zinc-700 text-zinc-300 text-sm hover:bg-zinc-800 transition"
                      >
                        取消
                      </button>
                      <button
                        onClick={async () => {
                          if (!tplRejectTargetId) return
                          const id = tplRejectTargetId
                          setTplRejectDialogOpen(false)
                          setTplActionLoading(id)
                          const body = tplRejectNote.trim() ? { note: tplRejectNote.trim() } : {}
                          try {
                            await apiFetch(`/cloud-templates/${id}/reject`, {
                              method: 'POST',
                              body: JSON.stringify(body),
                            })
                            setTemplates((p) =>
                              p.map((x) =>
                                x.id === id
                                  ? {
                                      ...x,
                                      reviewStatus: 'rejected',
                                      reviewNote: tplRejectNote.trim() || null,
                                    }
                                  : x,
                              ),
                            )
                            if (tplSelected?.id === id)
                              setTplSelected((s) =>
                                s
                                  ? {
                                      ...s,
                                      reviewStatus: 'rejected',
                                      reviewNote: tplRejectNote.trim() || null,
                                    }
                                  : s,
                              )
                          } catch {
                            /* */
                          } finally {
                            setTplActionLoading(null)
                            setTplRejectTargetId(null)
                            setTplRejectNote('')
                          }
                        }}
                        className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition"
                      >
                        确认拒绝
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Config Platform Tab */}
          {tab === 'config' && <ConfigManagementPage />}
        </main>
      </div>
    </div>
  )
}

/* ── Root ────────────────────────────────────────────── */
export function DashboardPage() {
  const [authed, setAuthed] = useState(!!localStorage.getItem('admin_token'))

  if (!authed) {
    return <LoginPanel onLogin={() => setAuthed(true)} />
  }

  return <DashboardContent />
}
