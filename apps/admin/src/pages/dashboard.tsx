import {
  Input,
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  Search,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@shadowob/ui'
import { RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
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
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
          data-form-type="other"
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
  trends?: {
    periodDays: number
    points: Array<{
      date: string
      newUsers: number
      messages: number
      activeUsers: number
      usedInviteCodes: number
    }>
  }
}

interface TrendPoint {
  date: string
  newUsers: number
  messages: number
  activeUsers: number
  usedInviteCodes: number
  cumulativeUsers: number
}

interface StatsSummary {
  trendWindowDays: number
  periodNewUsers: number
  periodMessages: number
  avgDAU: number
  dauRatePct: number
  msgPerActiveUser: number
  growthVsPreviousPct: number | null
  inviteUseRatePct: number
  dailyTrendData: TrendPoint[]
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

type UserStatusFilter = 'all' | 'online' | 'offline' | 'idle'
type UserTypeFilter = 'all' | 'user' | 'bot'
type UserSortBy = 'createdAt' | 'username' | 'email' | 'status'
type SortOrder = 'asc' | 'desc'
type AgentStatusFilter = 'all' | 'running' | 'stopped' | 'error'
type AgentSortBy = 'updatedAt' | 'name' | 'owner' | 'kernelType' | 'status'
type TplSourceFilter = 'all' | 'official' | 'community'
type TplSortBy =
  | 'createdAt'
  | 'updatedAt'
  | 'name'
  | 'reviewStatus'
  | 'source'
  | 'deployCount'
  | 'baseCost'

const USER_STATUS_OPTIONS: { value: UserStatusFilter; label: string }[] = [
  { value: 'all', label: '全部状态' },
  { value: 'online', label: '在线' },
  { value: 'idle', label: '空闲' },
  { value: 'offline', label: '离线' },
]

const USER_TYPE_OPTIONS: { value: UserTypeFilter; label: string }[] = [
  { value: 'all', label: '全部类型' },
  { value: 'user', label: '普通用户' },
  { value: 'bot', label: 'Buddy' },
]

const USER_SORT_OPTIONS: { value: UserSortBy; label: string }[] = [
  { value: 'createdAt', label: '注册时间' },
  { value: 'username', label: '用户名' },
  { value: 'email', label: '邮箱' },
  { value: 'status', label: '状态' },
]

const USER_SORT_ORDER_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: 'desc', label: '降序' },
  { value: 'asc', label: '升序' },
]

const USER_PAGE_SIZE_OPTIONS = [10, 20, 50]
const AGENT_PAGE_SIZE_OPTIONS = [10, 20, 50]
const TEMPLATE_PAGE_SIZE_OPTIONS = [10, 20, 50]
const STATS_WINDOW_OPTIONS = [7, 14, 21, 30]

const AGENT_STATUS_OPTIONS: { value: AgentStatusFilter; label: string }[] = [
  { value: 'all', label: '全部状态' },
  { value: 'running', label: '在线' },
  { value: 'error', label: '异常' },
  { value: 'stopped', label: '离线' },
]

const AGENT_SORT_OPTIONS: { value: AgentSortBy; label: string }[] = [
  { value: 'updatedAt', label: '更新时间' },
  { value: 'name', label: '名称' },
  { value: 'owner', label: '所有者' },
  { value: 'kernelType', label: '引擎' },
  { value: 'status', label: '状态' },
]

const AGENT_SORT_ORDER_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: 'desc', label: '降序' },
  { value: 'asc', label: '升序' },
]

const TPL_STATUS_OPTIONS: { value: TplStatusFilter; label: string }[] = [
  { value: 'all', label: '全部状态' },
  { value: 'draft', label: '草稿' },
  { value: 'pending', label: '待审核' },
  { value: 'approved', label: '已上架' },
  { value: 'rejected', label: '已拒绝' },
]

const TPL_SOURCE_OPTIONS: { value: TplSourceFilter; label: string }[] = [
  { value: 'all', label: '全部来源' },
  { value: 'official', label: '官方' },
  { value: 'community', label: '社区' },
]

const TPL_SORT_OPTIONS: { value: TplSortBy; label: string }[] = [
  { value: 'updatedAt', label: '更新时间' },
  { value: 'createdAt', label: '创建时间' },
  { value: 'name', label: '名称' },
  { value: 'reviewStatus', label: '审核状态' },
  { value: 'source', label: '来源' },
  { value: 'deployCount', label: '部署次数' },
  { value: 'baseCost', label: 'Base Cost' },
]

const TPL_SORT_ORDER_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: 'desc', label: '降序' },
  { value: 'asc', label: '升序' },
]

function getPaginationWindow(page: number, totalPages: number, maxWindow = 5): number[] {
  if (totalPages <= 1) return []

  let start = Math.max(1, page - Math.floor(maxWindow / 2))
  const end = Math.min(totalPages, start + maxWindow - 1)

  if (end - start + 1 < maxWindow) {
    start = Math.max(1, end - maxWindow + 1)
  }

  return Array.from({ length: end - start + 1 }, (_, i) => start + i)
}

function formatTooltipValue(value?: unknown) {
  if (value === undefined || value === null) return '0'

  const normalized =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN

  if (!Number.isFinite(normalized)) return String(value)
  return normalized.toLocaleString()
}

function formatPercent(value: number | null | undefined): string {
  if (!Number.isFinite(value ?? NaN)) return '—'
  return `${(value ?? 0).toFixed(1)}%`
}

function formatChartDate(value: string) {
  return value.split('-').slice(1).join('-')
}

function buildTrendSummary(stats: Stats | null): StatsSummary | null {
  if (
    !stats ||
    !stats.trends ||
    !Array.isArray(stats.trends.points) ||
    !stats.trends.points.length
  ) {
    return null
  }

  const points = stats.trends.points
  const ordered = [...points].sort((a, b) => a.date.localeCompare(b.date))
  const totalNewUsersInWindow = ordered.reduce((sum, item) => sum + item.newUsers, 0)
  const periodMessages = ordered.reduce((sum, item) => sum + item.messages, 0)
  const totalActiveByMessageWindow = ordered.reduce((sum, item) => sum + item.activeUsers, 0)
  const avgDAU = ordered.length ? totalActiveByMessageWindow / ordered.length : 0
  const dauRatePct = stats.totalUsers > 0 ? (avgDAU / stats.totalUsers) * 100 : 0

  const splitIndex = Math.floor(ordered.length / 2)
  const firstWindow = ordered.slice(0, splitIndex)
  const secondWindow = ordered.slice(splitIndex)
  const firstWindowUsers = firstWindow.reduce((sum, item) => sum + item.newUsers, 0)
  const secondWindowUsers = secondWindow.reduce((sum, item) => sum + item.newUsers, 0)
  const growthVsPreviousPct = (() => {
    if (firstWindowUsers === 0) return secondWindowUsers > 0 ? 100 : 0
    return ((secondWindowUsers - firstWindowUsers) / firstWindowUsers) * 100
  })()

  const msgPerActiveUser =
    totalActiveByMessageWindow > 0 ? periodMessages / totalActiveByMessageWindow : 0

  const inviteUseRatePct =
    stats.totalInviteCodes > 0 ? (stats.usedInviteCodes / stats.totalInviteCodes) * 100 : 0

  const baselineUsers = Math.max(stats.totalUsers - totalNewUsersInWindow, 0)
  let runningTotal = baselineUsers
  const dailyTrendData = ordered.map((item) => {
    runningTotal += item.newUsers
    return { ...item, cumulativeUsers: runningTotal }
  })

  return {
    trendWindowDays: ordered.length,
    periodNewUsers: totalNewUsersInWindow,
    periodMessages: periodMessages,
    avgDAU,
    dauRatePct,
    msgPerActiveUser,
    growthVsPreviousPct,
    inviteUseRatePct,
    dailyTrendData,
  }
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

interface CloudTemplateRefreshResult {
  ok: true
  templatesDir: string
  totalFiles: number
  created: number
  updated: number
  skipped: number
  pruned: number
  slugs: string[]
  skippedFiles: Array<{ file: string; reason: string }>
  prunedSlugs: string[]
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
  const [statsLoading, setStatsLoading] = useState(false)
  const [statsWindowDays, setStatsWindowDays] = useState<number>(14)
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
  const [agentSearch, setAgentSearch] = useState('')
  const [agentStatusFilter, setAgentStatusFilter] = useState<AgentStatusFilter>('all')
  const [agentSortBy, setAgentSortBy] = useState<AgentSortBy>('updatedAt')
  const [agentSortOrder, setAgentSortOrder] = useState<SortOrder>('desc')
  const [agentPage, setAgentPage] = useState(1)
  const [agentPageSize, setAgentPageSize] = useState<number>(10)
  const [passwordLogs, setPasswordLogs] = useState<PasswordChangeLog[]>([])
  const [grantAmountByUser, setGrantAmountByUser] = useState<Record<string, string>>({})
  const [grantLoadingUserId, setGrantLoadingUserId] = useState<string | null>(null)
  const [userSearch, setUserSearch] = useState('')
  const [userStatusFilter, setUserStatusFilter] = useState<UserStatusFilter>('all')
  const [userTypeFilter, setUserTypeFilter] = useState<UserTypeFilter>('all')
  const [userSortBy, setUserSortBy] = useState<UserSortBy>('createdAt')
  const [userSortOrder, setUserSortOrder] = useState<SortOrder>('desc')
  const [userPage, setUserPage] = useState(1)
  const [userPageSize, setUserPageSize] = useState<number>(10)

  // Templates state
  const [templates, setTemplates] = useState<CloudTemplate[]>([])
  const [tplFilter, setTplFilter] = useState<TplStatusFilter>('all')
  const [tplSearch, setTplSearch] = useState('')
  const [tplSourceFilter, setTplSourceFilter] = useState<TplSourceFilter>('all')
  const [tplSortBy, setTplSortBy] = useState<TplSortBy>('updatedAt')
  const [tplSortOrder, setTplSortOrder] = useState<SortOrder>('desc')
  const [tplLoading, setTplLoading] = useState(false)
  const [tplSelected, setTplSelected] = useState<CloudTemplate | null>(null)
  const [tplActionLoading, setTplActionLoading] = useState<string | null>(null)
  const [tplRefreshLoading, setTplRefreshLoading] = useState(false)
  const [tplRefreshResult, setTplRefreshResult] = useState<CloudTemplateRefreshResult | null>(null)
  const [tplRejectDialogOpen, setTplRejectDialogOpen] = useState(false)
  const [tplRejectNote, setTplRejectNote] = useState('')
  const [tplRejectTargetId, setTplRejectTargetId] = useState<string | null>(null)
  const [tplPage, setTplPage] = useState(1)
  const [tplPageSize, setTplPageSize] = useState<number>(10)
  const [tplEditOpen, setTplEditOpen] = useState(false)
  const [tplEditTarget, setTplEditTarget] = useState<CloudTemplate | null>(null)
  const [tplCreateOpen, setTplCreateOpen] = useState(false)

  const statsSummary = useMemo(() => buildTrendSummary(stats), [stats])
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
    setStatsLoading(true)
    try {
      setStats(await apiFetch<Stats>(`/stats?days=${statsWindowDays}`))
    } catch {
      /* */
    } finally {
      setStatsLoading(false)
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
      setUserPage(1)
    } catch {
      /* */
    }
  }

  const filteredSortedUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase()
    const list = [...users].filter((u) => {
      if (q) {
        const name = (u.displayName ?? '').toLowerCase()
        const target = [u.username, u.email, name].filter(Boolean).some((item) => item.includes(q))
        if (!target) return false
      }

      if (userStatusFilter !== 'all' && u.status !== userStatusFilter) return false

      if (userTypeFilter === 'bot' && !u.isBot) return false
      if (userTypeFilter === 'user' && u.isBot) return false

      return true
    })

    list.sort((a, b) => {
      const multiplier = userSortOrder === 'asc' ? 1 : -1
      if (userSortBy === 'createdAt') {
        const aTs = a.createdAt ? new Date(a.createdAt).getTime() : 0
        const bTs = b.createdAt ? new Date(b.createdAt).getTime() : 0
        return (aTs - bTs) * multiplier
      }
      const aValue =
        userSortBy === 'username' ? a.username : userSortBy === 'email' ? a.email : a.status
      const bValue =
        userSortBy === 'username' ? b.username : userSortBy === 'email' ? b.email : b.status
      return aValue.localeCompare(bValue) * multiplier
    })

    return list
  }, [userSearch, userSortBy, userSortOrder, userStatusFilter, userTypeFilter, users])

  const userTotal = filteredSortedUsers.length
  const userTotalPages = Math.max(1, Math.ceil(userTotal / userPageSize))
  const userList = useMemo(() => {
    const start = (userPage - 1) * userPageSize
    return filteredSortedUsers.slice(start, start + userPageSize)
  }, [filteredSortedUsers, userPage, userPageSize])

  const userPaginationWindow = useMemo(() => {
    return getPaginationWindow(userPage, userTotalPages)
  }, [userPage, userTotalPages])

  const userPaginationFirst = userPaginationWindow[0] ?? 1
  const userPaginationLast = userPaginationWindow[userPaginationWindow.length - 1] ?? userTotalPages

  const userVisibleStart = userTotal === 0 ? 0 : (userPage - 1) * userPageSize + 1
  const userVisibleEnd = Math.min(userPage * userPageSize, userTotal)

  useEffect(() => {
    setUserPage(1)
  }, [userSearch, userStatusFilter, userTypeFilter, userSortBy, userSortOrder, userPageSize])

  useEffect(() => {
    if (userPage > userTotalPages) {
      setUserPage(userTotalPages)
    } else if (userPage < 1) {
      setUserPage(1)
    }
  }, [userPage, userTotalPages])

  const filteredSortedAgents = useMemo(() => {
    const q = agentSearch.trim().toLowerCase()
    const list = [...adminAgents].filter((agent) => {
      if (q) {
        const ownerName = (agent.owner?.displayName ?? '').toLowerCase()
        const ownerUsername = (agent.owner?.username ?? '').toLowerCase()
        const name = (agent.botUser?.displayName ?? agent.botUser?.username ?? '').toLowerCase()
        const email = (agent.botUser?.email ?? '').toLowerCase()

        if (![name, email, ownerName, ownerUsername].some((value) => value.includes(q))) {
          return false
        }
      }

      if (agentStatusFilter !== 'all' && agent.status !== agentStatusFilter) return false

      return true
    })

    list.sort((a, b) => {
      const multiplier = agentSortOrder === 'asc' ? 1 : -1

      if (agentSortBy === 'updatedAt') {
        const aTs = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
        const bTs = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
        return (aTs - bTs) * multiplier
      }

      const getValue = (agent: AdminAgent): string => {
        if (agentSortBy === 'name') {
          return (agent.botUser?.displayName ?? agent.botUser?.username ?? '').toLowerCase()
        }
        if (agentSortBy === 'owner') {
          return (agent.owner?.username ?? '').toLowerCase()
        }
        if (agentSortBy === 'kernelType') {
          return (agent.kernelType ?? '').toLowerCase()
        }
        return (agent.status ?? '').toLowerCase()
      }

      return getValue(a).localeCompare(getValue(b)) * multiplier
    })

    return list
  }, [adminAgents, agentSearch, agentSortBy, agentSortOrder, agentStatusFilter])

  const agentTotal = filteredSortedAgents.length
  const agentTotalPages = Math.max(1, Math.ceil(agentTotal / agentPageSize))
  const agentList = useMemo(() => {
    const start = (agentPage - 1) * agentPageSize
    return filteredSortedAgents.slice(start, start + agentPageSize)
  }, [filteredSortedAgents, agentPage, agentPageSize])

  const agentPaginationWindow = useMemo(() => {
    return getPaginationWindow(agentPage, agentTotalPages)
  }, [agentPage, agentTotalPages])

  const agentPaginationFirst = agentPaginationWindow[0] ?? 1
  const agentPaginationLast =
    agentPaginationWindow[agentPaginationWindow.length - 1] ?? agentTotalPages

  const agentVisibleStart = agentTotal === 0 ? 0 : (agentPage - 1) * agentPageSize + 1
  const agentVisibleEnd = Math.min(agentPage * agentPageSize, agentTotal)

  useEffect(() => {
    setAgentPage(1)
  }, [agentSearch, agentStatusFilter, agentSortBy, agentSortOrder, agentPageSize])

  useEffect(() => {
    if (agentPage > agentTotalPages) {
      setAgentPage(agentTotalPages)
    } else if (agentPage < 1) {
      setAgentPage(1)
    }
  }, [agentPage, agentTotalPages])

  const filteredSortedTemplates = useMemo(() => {
    const q = tplSearch.trim().toLowerCase()
    const list = [...templates].filter((tpl) => {
      if (tplSourceFilter !== 'all' && tpl.source !== tplSourceFilter) return false

      if (q) {
        const fields = [
          tpl.name.toLowerCase(),
          tpl.slug.toLowerCase(),
          (tpl.description ?? '').toLowerCase(),
          (tpl.category ?? '').toLowerCase(),
          ...(tpl.tags ?? []).map((tag) => tag.toLowerCase()),
        ]
        if (!fields.some((value) => value.includes(q))) return false
      }

      return true
    })

    list.sort((a, b) => {
      const multiplier = tplSortOrder === 'asc' ? 1 : -1
      if (tplSortBy === 'createdAt' || tplSortBy === 'updatedAt') {
        const aTs = new Date(a[tplSortBy]).getTime()
        const bTs = new Date(b[tplSortBy]).getTime()
        return (aTs - bTs) * multiplier
      }

      if (tplSortBy === 'deployCount' || tplSortBy === 'baseCost') {
        const aValue = tplSortBy === 'deployCount' ? a.deployCount : (a.baseCost ?? -1)
        const bValue = tplSortBy === 'deployCount' ? b.deployCount : (b.baseCost ?? -1)
        return (aValue - bValue) * multiplier
      }

      const getValue = (tpl: CloudTemplate): string =>
        tplSortBy === 'name'
          ? tpl.name.toLowerCase()
          : tplSortBy === 'reviewStatus'
            ? tpl.reviewStatus
            : tplSortBy === 'source'
              ? tpl.source
              : tpl.name.toLowerCase()

      return getValue(a).localeCompare(getValue(b)) * multiplier
    })

    return list
  }, [templates, tplSearch, tplSourceFilter, tplSortBy, tplSortOrder])

  const tplTotal = filteredSortedTemplates.length
  const tplTotalPages = Math.max(1, Math.ceil(tplTotal / tplPageSize))
  const tplList = useMemo(() => {
    const start = (tplPage - 1) * tplPageSize
    return filteredSortedTemplates.slice(start, start + tplPageSize)
  }, [filteredSortedTemplates, tplPage, tplPageSize])

  const tplPaginationWindow = useMemo(() => {
    return getPaginationWindow(tplPage, tplTotalPages)
  }, [tplPage, tplTotalPages])

  const tplPaginationFirst = tplPaginationWindow[0] ?? 1
  const tplPaginationLast = tplPaginationWindow[tplPaginationWindow.length - 1] ?? tplTotalPages

  const tplVisibleStart = tplTotal === 0 ? 0 : (tplPage - 1) * tplPageSize + 1
  const tplVisibleEnd = Math.min(tplPage * tplPageSize, tplTotal)

  useEffect(() => {
    setTplPage(1)
  }, [tplSearch, tplFilter, tplSourceFilter, tplSortBy, tplSortOrder, tplPageSize])

  useEffect(() => {
    if (tplPage > tplTotalPages) {
      setTplPage(tplTotalPages)
    } else if (tplPage < 1) {
      setTplPage(1)
    }
  }, [tplPage, tplTotalPages])

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

  const refreshOfficialTemplates = async () => {
    if (!confirm('确定从 templates 目录刷新预设模版？旧的 official 残留模版会被下架。')) return
    setTplRefreshLoading(true)
    setTplRefreshResult(null)
    try {
      const result = await apiFetch<CloudTemplateRefreshResult>(
        '/cloud-templates/refresh-official',
        {
          method: 'POST',
          body: JSON.stringify({ prune: true }),
        },
      )
      setTplRefreshResult(result)
      await loadTemplates(tplFilter)
    } catch (e) {
      alert(e instanceof Error ? e.message : '刷新失败')
    } finally {
      setTplRefreshLoading(false)
    }
  }

  const loadPasswordLogs = async () => {
    try {
      setPasswordLogs(await apiFetch<PasswordChangeLog[]>('/password-logs'))
    } catch {
      /* */
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: reload stats when window changes
  useEffect(() => {
    loadStats()
  }, [statsWindowDays])

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional load on tab change
  useEffect(() => {
    if (tab === 'invites') loadInvites()
    if (tab === 'users') loadUsers()
    if (tab === 'servers') loadServers()
    if (tab === 'agents') loadAgents()
    if (tab === 'passwordLogs') loadPasswordLogs()
    if (tab === 'templates') loadTemplates(tplFilter)
  }, [tab, tplFilter])

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

  const grantWalletToUser = async (userId: string, username: string) => {
    const rawAmount = (grantAmountByUser[userId] ?? '').trim()
    const amount = Number(rawAmount)
    if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount <= 0) {
      alert('请输入有效的加款金额（正整数）')
      return
    }

    const token = localStorage.getItem('admin_token') ?? ''
    if (!token) {
      alert('未检测到管理员登录态')
      return
    }

    setGrantLoadingUserId(userId)
    try {
      const res = await fetch(`${API_BASE}/wallet/grant`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          userId,
          amount,
          note: `admin grant by ${username}`,
        }),
      })

      if (res.status === 403) {
        const text = await res.text()
        throw new Error(
          text && text.trim() ? text : '余额加款被禁用，请确认 ENABLE_DEV_TOPUP 已开启（设置为 1）',
        )
      }
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || '加款失败')
      }
      alert(`已为 ${username} 增加 ${amount} 点。`)
      setGrantAmountByUser((prev) => ({ ...prev, [userId]: '' }))
    } catch (err) {
      alert(err instanceof Error ? err.message : '加款失败')
    } finally {
      setGrantLoadingUserId(null)
    }
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
          {tab === 'stats' && (
            <div>
              <h2 className="text-lg font-bold mb-4">数据看板</h2>
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-zinc-400">时间窗口</span>
                  <Select
                    value={String(statsWindowDays)}
                    onValueChange={(value) => setStatsWindowDays(Number(value))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择时间窗口" />
                    </SelectTrigger>
                    <SelectContent>
                      {STATS_WINDOW_OPTIONS.map((option) => (
                        <SelectItem key={option} value={String(option)}>
                          最近 {option} 天
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <button
                  onClick={loadStats}
                  disabled={statsLoading}
                  className="text-xs px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-md text-zinc-100 disabled:opacity-50"
                >
                  {statsLoading ? '刷新中...' : '刷新'}
                </button>
              </div>

              {statsLoading ? (
                <div className="text-zinc-500 text-sm py-8 text-center">数据加载中…</div>
              ) : !stats ? (
                <div className="text-zinc-500 text-sm py-8 text-center">暂未获取到看板数据</div>
              ) : (
                <>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatCard label="总用户数" value={stats.totalUsers} color="text-blue-400" />
                    <StatCard
                      label="在线用户"
                      value={`${stats.onlineUsers} (${((stats.onlineUsers / Math.max(stats.totalUsers, 1)) * 100).toFixed(1)}%)`}
                      color="text-green-400"
                    />
                    <StatCard label="总服务器" value={stats.totalServers} color="text-purple-400" />
                    <StatCard label="总频道数" value={stats.totalChannels} color="text-pink-400" />
                    <StatCard
                      label="总消息数"
                      value={stats.totalMessages}
                      color="text-orange-400"
                    />
                    <StatCard
                      label={`新增用户（近${statsSummary?.trendWindowDays ?? 14}天）`}
                      value={statsSummary?.periodNewUsers ?? 0}
                      color="text-indigo-400"
                    />
                    <StatCard
                      label={`近${statsSummary?.trendWindowDays ?? 14}天消息数`}
                      value={statsSummary?.periodMessages ?? 0}
                      color="text-violet-400"
                    />
                    <StatCard
                      label={`DAU（近${statsSummary?.trendWindowDays ?? 14}天平均）`}
                      value={Math.round(statsSummary?.avgDAU ?? 0)}
                      color="text-cyan-400"
                    />
                    <StatCard
                      label="DAU 占比"
                      value={formatPercent(statsSummary?.dauRatePct)}
                      color="text-sky-300"
                    />
                    <StatCard
                      label="人均消息活跃度"
                      value={statsSummary?.msgPerActiveUser.toFixed(2) ?? '0.00'}
                      color="text-emerald-400"
                    />
                    <StatCard
                      label="邀请码使用率"
                      value={formatPercent(statsSummary?.inviteUseRatePct)}
                      color="text-amber-400"
                    />
                    <StatCard
                      label={`用户增长率（后${Math.floor((statsSummary?.trendWindowDays ?? 14) / 2)}天 vs 前${Math.ceil((statsSummary?.trendWindowDays ?? 14) / 2)}天）`}
                      value={formatPercent(statsSummary?.growthVsPreviousPct)}
                      color="text-purple-300"
                    />
                  </div>

                  {statsSummary && (
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-6">
                      <div className="bg-zinc-900 rounded-xl p-5 border border-zinc-800">
                        <h3 className="text-sm font-bold text-zinc-300 mb-4">用户增长趋势</h3>
                        <div className="h-72">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={statsSummary.dailyTrendData}>
                              <CartesianGrid
                                stroke="var(--color-border-subtle)"
                                strokeDasharray="3 3"
                              />
                              <XAxis
                                dataKey="date"
                                tickFormatter={formatChartDate}
                                stroke="var(--color-text-secondary)"
                              />
                              <YAxis stroke="var(--color-text-secondary)" />
                              <Tooltip
                                formatter={(value: unknown) => formatTooltipValue(value)}
                                labelFormatter={(value: unknown) => formatTooltipValue(value)}
                                contentStyle={{
                                  backgroundColor: 'var(--color-bg-tertiary)',
                                  borderColor: 'var(--color-border-subtle)',
                                  color: 'var(--color-text-primary)',
                                }}
                              />
                              <Line
                                type="monotone"
                                dataKey="newUsers"
                                name="新增用户"
                                stroke="var(--color-primary)"
                                strokeWidth={2}
                                dot={false}
                              />
                              <Line
                                type="monotone"
                                dataKey="cumulativeUsers"
                                name="累计用户"
                                stroke="var(--color-warning)"
                                strokeWidth={2}
                                dot={false}
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                      <div className="bg-zinc-900 rounded-xl p-5 border border-zinc-800">
                        <h3 className="text-sm font-bold text-zinc-300 mb-4">
                          {`活跃度与消息趋势（近${statsSummary?.trendWindowDays ?? 14}天）`}
                        </h3>
                        <div className="h-72">
                          <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={statsSummary.dailyTrendData}>
                              <CartesianGrid
                                stroke="var(--color-border-subtle)"
                                strokeDasharray="3 3"
                              />
                              <XAxis
                                dataKey="date"
                                tickFormatter={formatChartDate}
                                stroke="var(--color-text-secondary)"
                              />
                              <YAxis yAxisId="left" stroke="var(--color-text-secondary)" />
                              <YAxis
                                yAxisId="right"
                                orientation="right"
                                stroke="var(--color-text-secondary)"
                              />
                              <Tooltip
                                formatter={(value: unknown) => formatTooltipValue(value)}
                                labelFormatter={(value: unknown) => formatTooltipValue(value)}
                                contentStyle={{
                                  backgroundColor: 'var(--color-bg-tertiary)',
                                  borderColor: 'var(--color-border-subtle)',
                                  color: 'var(--color-text-primary)',
                                }}
                              />
                              <Bar
                                yAxisId="left"
                                dataKey="activeUsers"
                                name="日活用户数"
                                fill="var(--color-success)"
                              />
                              <Line
                                yAxisId="right"
                                type="monotone"
                                dataKey="messages"
                                name="消息数"
                                stroke="var(--color-primary)"
                                strokeWidth={2}
                                dot={false}
                              />
                              <Line
                                yAxisId="right"
                                type="monotone"
                                dataKey="usedInviteCodes"
                                name="邀请码使用"
                                stroke="var(--color-warning)"
                                strokeWidth={2}
                                dot={false}
                              />
                            </ComposedChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
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
              <div className="mb-4 grid grid-cols-1 lg:grid-cols-6 gap-3">
                <div className="lg:col-span-2">
                  <Search
                    placeholder="搜索用户名 / 昵称 / 邮箱"
                    value={userSearch}
                    onChange={setUserSearch}
                  />
                </div>
                <div>
                  <Select
                    value={userStatusFilter}
                    onValueChange={(value) => setUserStatusFilter(value as UserStatusFilter)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="状态筛选" />
                    </SelectTrigger>
                    <SelectContent>
                      {USER_STATUS_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Select
                    value={userTypeFilter}
                    onValueChange={(value) => setUserTypeFilter(value as UserTypeFilter)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="类型筛选" />
                    </SelectTrigger>
                    <SelectContent>
                      {USER_TYPE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Select
                    value={userSortBy}
                    onValueChange={(value) => setUserSortBy(value as UserSortBy)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="排序字段" />
                    </SelectTrigger>
                    <SelectContent>
                      {USER_SORT_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Select
                    value={userSortOrder}
                    onValueChange={(value) => setUserSortOrder(value as SortOrder)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="排序顺序" />
                    </SelectTrigger>
                    <SelectContent>
                      {USER_SORT_ORDER_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Select
                    value={String(userPageSize)}
                    onValueChange={(value) => setUserPageSize(Number(value))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="每页条数" />
                    </SelectTrigger>
                    <SelectContent>
                      {USER_PAGE_SIZE_OPTIONS.map((size) => (
                        <SelectItem key={size} value={String(size)}>
                          {size} 条/页
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <p className="text-xs text-zinc-500 mb-2">
                共 {userTotal} 条
                {userTotal > 0 && `，显示 ${userVisibleStart}-${userVisibleEnd} 条`}
              </p>

              <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-zinc-400 font-normal uppercase normal-case">
                        用户
                      </TableHead>
                      <TableHead className="text-zinc-400 font-normal uppercase normal-case">
                        邮箱
                      </TableHead>
                      <TableHead className="text-zinc-400 font-normal uppercase normal-case">
                        加款金额
                      </TableHead>
                      <TableHead className="text-zinc-400 font-normal uppercase normal-case">
                        状态
                      </TableHead>
                      <TableHead className="text-zinc-400 font-normal uppercase normal-case">
                        类型
                      </TableHead>
                      <TableHead className="text-zinc-400 font-normal uppercase normal-case">
                        注册时间
                      </TableHead>
                      <TableHead className="text-zinc-400 font-normal uppercase normal-case">
                        操作
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {userList.map((u) => (
                      <TableRow
                        key={u.id}
                        className="border-b border-zinc-800/50 hover:bg-zinc-800/30"
                      >
                        <TableCell className="px-4 py-3">
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
                        </TableCell>
                        <TableCell className="px-4 py-3 text-zinc-400">{u.email}</TableCell>
                        <TableCell className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              min={1}
                              value={grantAmountByUser[u.id] ?? ''}
                              onChange={(e) =>
                                setGrantAmountByUser((prev) => ({
                                  ...prev,
                                  [u.id]: e.target.value,
                                }))
                              }
                              className="w-20 h-9"
                              placeholder="金额"
                            />
                            <button
                              onClick={() => grantWalletToUser(u.id, u.username)}
                              disabled={grantLoadingUserId === u.id}
                              className="text-green-400 hover:text-green-300 disabled:opacity-50 text-xs transition whitespace-nowrap"
                            >
                              {grantLoadingUserId === u.id ? '加款中...' : '加款'}
                            </button>
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-3">
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
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          {u.isBot ? (
                            <span className="text-xs bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded-full">
                              Buddy
                            </span>
                          ) : (
                            '用户'
                          )}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-zinc-500">
                          {u.createdAt ? new Date(u.createdAt).toLocaleString() : '-'}
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          <button
                            onClick={() => deleteUser(u.id)}
                            className="text-red-400 hover:text-red-300 text-xs transition"
                          >
                            删除
                          </button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {userList.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="px-4 py-8 text-center text-zinc-500">
                          {userSearch || userStatusFilter !== 'all' || userTypeFilter !== 'all'
                            ? '未匹配到用户'
                            : '暂无用户'}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              {userTotalPages > 1 && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          href="#"
                          className={userPage === 1 ? 'pointer-events-none opacity-50' : ''}
                          onClick={(e) => {
                            e.preventDefault()
                            if (userPage === 1) return
                            setUserPage((p) => p - 1)
                          }}
                        />
                      </PaginationItem>

                      {userPaginationFirst > 1 && (
                        <>
                          <PaginationItem>
                            <PaginationLink
                              href="#"
                              isActive={userPage === 1}
                              onClick={(e) => {
                                e.preventDefault()
                                setUserPage(1)
                              }}
                            >
                              1
                            </PaginationLink>
                          </PaginationItem>
                          {userPaginationFirst > 2 && (
                            <PaginationItem>
                              <PaginationEllipsis />
                            </PaginationItem>
                          )}
                        </>
                      )}

                      {userPaginationWindow.map((page) => (
                        <PaginationItem key={page}>
                          <PaginationLink
                            href="#"
                            isActive={userPage === page}
                            onClick={(e) => {
                              e.preventDefault()
                              setUserPage(page)
                            }}
                          >
                            {page}
                          </PaginationLink>
                        </PaginationItem>
                      ))}

                      {userPaginationLast < userTotalPages - 1 && (
                        <PaginationItem>
                          <PaginationEllipsis />
                        </PaginationItem>
                      )}

                      {userPaginationLast !== userTotalPages && (
                        <PaginationItem>
                          <PaginationLink
                            href="#"
                            isActive={userPage === userTotalPages}
                            onClick={(e) => {
                              e.preventDefault()
                              setUserPage(userTotalPages)
                            }}
                          >
                            {userTotalPages}
                          </PaginationLink>
                        </PaginationItem>
                      )}

                      <PaginationItem>
                        <PaginationNext
                          href="#"
                          className={
                            userPage === userTotalPages ? 'pointer-events-none opacity-50' : ''
                          }
                          onClick={(e) => {
                            e.preventDefault()
                            if (userPage === userTotalPages) return
                            setUserPage((p) => p + 1)
                          }}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              )}
              <div className="mt-2 text-xs text-zinc-500 lg:hidden">共 {userTotalPages} 页</div>
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
              <div className="flex flex-wrap gap-2 mb-4">
                <Search
                  value={agentSearch}
                  onChange={setAgentSearch}
                  placeholder="搜索 Buddy（名称/用户名/邮箱/所属者）"
                />
                <Select
                  value={agentStatusFilter}
                  onValueChange={(v: string) => setAgentStatusFilter(v as AgentStatusFilter)}
                >
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder="状态筛选" />
                  </SelectTrigger>
                  <SelectContent>
                    {AGENT_STATUS_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={agentSortBy}
                  onValueChange={(v: string) => setAgentSortBy(v as AgentSortBy)}
                >
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder="排序字段" />
                  </SelectTrigger>
                  <SelectContent>
                    {AGENT_SORT_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={agentSortOrder}
                  onValueChange={(v: string) => setAgentSortOrder(v as SortOrder)}
                >
                  <SelectTrigger className="w-28">
                    <SelectValue placeholder="排序顺序" />
                  </SelectTrigger>
                  <SelectContent>
                    {AGENT_SORT_ORDER_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={String(agentPageSize)}
                  onValueChange={(v: string) => {
                    const value = Number(v)
                    if (Number.isInteger(value)) {
                      setAgentPageSize(value)
                    }
                  }}
                >
                  <SelectTrigger className="w-28">
                    <SelectValue placeholder="每页条数" />
                  </SelectTrigger>
                  <SelectContent>
                    {AGENT_PAGE_SIZE_OPTIONS.map((size) => (
                      <SelectItem key={size} value={String(size)}>
                        {size}/页
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="text-sm text-zinc-400 mb-3">
                {agentTotal > 0
                  ? `共 ${agentTotal} 条，当前 ${agentVisibleStart}-${agentVisibleEnd} 条`
                  : '暂无数据'}
              </div>

              <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-zinc-400 font-normal uppercase normal-case">
                        Buddy
                      </TableHead>
                      <TableHead className="text-zinc-400 font-normal uppercase normal-case">
                        所有者
                      </TableHead>
                      <TableHead className="text-zinc-400 font-normal uppercase normal-case">
                        引擎
                      </TableHead>
                      <TableHead className="text-zinc-400 font-normal uppercase normal-case">
                        状态
                      </TableHead>
                      <TableHead className="text-zinc-400 font-normal uppercase normal-case">
                        更新时间
                      </TableHead>
                      <TableHead className="text-zinc-400 font-normal uppercase normal-case">
                        操作
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {agentList.map((agent) => (
                      <TableRow
                        key={agent.id}
                        className="border-b border-zinc-800/50 hover:bg-zinc-800/30"
                      >
                        <TableCell className="px-4 py-3">
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
                        </TableCell>
                        <TableCell className="px-4 py-3 text-zinc-400">
                          {agent.owner ? (
                            <span>@{agent.owner.username}</span>
                          ) : (
                            <span className="text-zinc-600">—</span>
                          )}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-zinc-400 font-mono text-xs">
                          {agent.kernelType}
                        </TableCell>
                        <TableCell className="px-4 py-3">
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
                        </TableCell>
                        <TableCell className="px-4 py-3 text-zinc-500">
                          {agent.updatedAt ? new Date(agent.updatedAt).toLocaleString() : '—'}
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          <button
                            onClick={() => deleteAgent(agent.id)}
                            className="text-red-400 hover:text-red-300 text-xs transition"
                          >
                            删除
                          </button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {agentList.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="px-4 py-8 text-center text-zinc-500">
                          暂无 Agent
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              {agentTotal > 0 && (
                <div className="mt-4 flex items-center justify-between">
                  <p className="text-xs text-zinc-500">
                    第 {agentPage} / {agentTotalPages} 页
                  </p>
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          href="#"
                          onClick={(e) => {
                            e.preventDefault()
                            if (agentPage > 1) setAgentPage(agentPage - 1)
                          }}
                          className={agentPage <= 1 ? 'pointer-events-none opacity-50' : ''}
                        />
                      </PaginationItem>
                      {agentPaginationFirst > 1 && (
                        <PaginationItem>
                          <PaginationLink href="#" onClick={() => setAgentPage(1)}>
                            1
                          </PaginationLink>
                        </PaginationItem>
                      )}
                      {agentPaginationFirst > 2 && (
                        <PaginationItem>
                          <PaginationEllipsis />
                        </PaginationItem>
                      )}
                      {agentPaginationWindow.map((page) => (
                        <PaginationItem key={page}>
                          <PaginationLink
                            href="#"
                            isActive={page === agentPage}
                            onClick={() => setAgentPage(page)}
                          >
                            {page}
                          </PaginationLink>
                        </PaginationItem>
                      ))}
                      {agentPaginationLast < agentTotalPages - 1 && (
                        <PaginationItem>
                          <PaginationEllipsis />
                        </PaginationItem>
                      )}
                      {agentPaginationLast !== agentTotalPages && (
                        <PaginationItem>
                          <PaginationLink href="#" onClick={() => setAgentPage(agentTotalPages)}>
                            {agentTotalPages}
                          </PaginationLink>
                        </PaginationItem>
                      )}
                      <PaginationItem>
                        <PaginationNext
                          href="#"
                          onClick={(e) => {
                            e.preventDefault()
                            if (agentPage < agentTotalPages) setAgentPage(agentPage + 1)
                          }}
                          className={
                            agentPage >= agentTotalPages ? 'pointer-events-none opacity-50' : ''
                          }
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              )}
              {agentTotal === 0 && (
                <div className="mt-4 text-xs text-zinc-500 text-center">暂无数据</div>
              )}
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
                <div className="flex items-center gap-2">
                  <button
                    onClick={refreshOfficialTemplates}
                    disabled={tplRefreshLoading}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-lg text-sm font-medium transition disabled:opacity-50"
                  >
                    <RefreshCw className={`h-4 w-4 ${tplRefreshLoading ? 'animate-spin' : ''}`} />
                    {tplRefreshLoading ? '刷新中…' : '刷新预设'}
                  </button>
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
              </div>

              {tplRefreshResult && (
                <div className="mb-4 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-300">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span>目录：{tplRefreshResult.templatesDir}</span>
                    <span>文件：{tplRefreshResult.totalFiles}</span>
                    <span className="text-green-300">新增：{tplRefreshResult.created}</span>
                    <span className="text-sky-300">更新：{tplRefreshResult.updated}</span>
                    <span className="text-yellow-300">跳过：{tplRefreshResult.skipped}</span>
                    <span className="text-red-300">清理：{tplRefreshResult.pruned}</span>
                  </div>
                  {tplRefreshResult.prunedSlugs.length > 0 && (
                    <p className="mt-1 text-xs text-red-300">
                      已下架旧预设：{tplRefreshResult.prunedSlugs.join(', ')}
                    </p>
                  )}
                  {tplRefreshResult.skippedFiles.length > 0 && (
                    <p className="mt-1 text-xs text-yellow-300">
                      有文件未导入：
                      {tplRefreshResult.skippedFiles
                        .map((item) => `${item.file}: ${item.reason}`)
                        .join('；')}
                    </p>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-2 mb-4">
                <Search
                  value={tplSearch}
                  onChange={setTplSearch}
                  placeholder="搜索模版（名称 / Slug / 描述 / 标签）"
                />
                <Select
                  value={tplFilter}
                  onValueChange={(v: string) => setTplFilter(v as TplStatusFilter)}
                >
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder="状态筛选" />
                  </SelectTrigger>
                  <SelectContent>
                    {TPL_STATUS_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={tplSourceFilter}
                  onValueChange={(v: string) => setTplSourceFilter(v as TplSourceFilter)}
                >
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder="来源筛选" />
                  </SelectTrigger>
                  <SelectContent>
                    {TPL_SOURCE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={tplSortBy}
                  onValueChange={(v: string) => setTplSortBy(v as TplSortBy)}
                >
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder="排序字段" />
                  </SelectTrigger>
                  <SelectContent>
                    {TPL_SORT_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={tplSortOrder}
                  onValueChange={(v: string) => setTplSortOrder(v as SortOrder)}
                >
                  <SelectTrigger className="w-28">
                    <SelectValue placeholder="排序顺序" />
                  </SelectTrigger>
                  <SelectContent>
                    {TPL_SORT_ORDER_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={String(tplPageSize)}
                  onValueChange={(v: string) => {
                    const value = Number(v)
                    if (Number.isInteger(value)) {
                      setTplPageSize(value)
                    }
                  }}
                >
                  <SelectTrigger className="w-28">
                    <SelectValue placeholder="每页条数" />
                  </SelectTrigger>
                  <SelectContent>
                    {TEMPLATE_PAGE_SIZE_OPTIONS.map((size) => (
                      <SelectItem key={size} value={String(size)}>
                        {size}/页
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="text-sm text-zinc-400 mb-3">
                {tplLoading
                  ? '加载中…'
                  : tplTotal > 0
                    ? `共 ${tplTotal} 条，当前 ${tplVisibleStart}-${tplVisibleEnd} 条`
                    : '暂无模版'}
              </div>
              <div className="flex gap-4">
                <div className="flex-1 min-w-0">
                  <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-zinc-400 font-normal uppercase normal-case">
                            模版
                          </TableHead>
                          <TableHead className="text-zinc-400 font-normal uppercase normal-case">
                            状态
                          </TableHead>
                          <TableHead className="text-zinc-400 font-normal uppercase normal-case">
                            来源
                          </TableHead>
                          <TableHead className="text-zinc-400 font-normal uppercase normal-case">
                            分类
                          </TableHead>
                          <TableHead className="text-zinc-400 font-normal uppercase normal-case">
                            部署次数
                          </TableHead>
                          <TableHead className="text-zinc-400 font-normal uppercase normal-case">
                            更新时间
                          </TableHead>
                          <TableHead className="text-zinc-400 font-normal uppercase normal-case">
                            操作
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tplLoading ? (
                          <TableRow>
                            <TableCell colSpan={7} className="px-4 py-8 text-center text-zinc-500">
                              加载中…
                            </TableCell>
                          </TableRow>
                        ) : tplList.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={7} className="px-4 py-8 text-center text-zinc-500">
                              暂无模版
                            </TableCell>
                          </TableRow>
                        ) : (
                          tplList.map((t) => {
                            const statusLabel =
                              t.reviewStatus === 'draft'
                                ? '草稿'
                                : t.reviewStatus === 'pending'
                                  ? '待审核'
                                  : t.reviewStatus === 'approved'
                                    ? '已上架'
                                    : '已拒绝'
                            const statusBadge = {
                              draft: 'bg-zinc-500/20 text-zinc-300',
                              pending: 'bg-yellow-500/20 text-yellow-300',
                              approved: 'bg-green-500/20 text-green-300',
                              rejected: 'bg-red-500/20 text-red-300',
                            }[t.reviewStatus]

                            return (
                              <TableRow
                                key={t.id}
                                className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 ${tplSelected?.id === t.id ? 'bg-zinc-800' : ''}`}
                                onClick={() => setTplSelected(t)}
                              >
                                <TableCell className="px-4 py-3">
                                  <div>
                                    <p className="font-medium text-white">{t.name}</p>
                                    <p className="text-xs text-zinc-500 font-mono mt-1">{t.slug}</p>
                                    {t.description && (
                                      <p className="text-xs text-zinc-400 mt-1 line-clamp-1">
                                        {t.description}
                                      </p>
                                    )}
                                    {t.reviewStatus === 'rejected' && t.reviewNote && (
                                      <p className="text-xs text-red-400 mt-1">✕ {t.reviewNote}</p>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="px-4 py-3">
                                  <span
                                    className={`px-2 py-0.5 rounded text-xs font-medium ${statusBadge}`}
                                  >
                                    {statusLabel}
                                  </span>
                                </TableCell>
                                <TableCell className="px-4 py-3 text-zinc-500">
                                  {t.source}
                                </TableCell>
                                <TableCell className="px-4 py-3 text-zinc-500">
                                  {t.category ?? '—'}
                                </TableCell>
                                <TableCell className="px-4 py-3 text-zinc-300">
                                  {t.deployCount}
                                </TableCell>
                                <TableCell className="px-4 py-3 text-zinc-500">
                                  {t.updatedAt ? new Date(t.updatedAt).toLocaleString() : '—'}
                                </TableCell>
                                <TableCell className="px-4 py-3">
                                  <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
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
                                            loadTemplates(tplFilter)
                                          })
                                          .catch(() => {})
                                      }}
                                      className="px-3 py-1 rounded-lg bg-red-900/40 hover:bg-red-700 text-red-400 hover:text-white text-xs font-medium transition"
                                    >
                                      删除
                                    </button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  {tplTotal > 0 && (
                    <div className="mt-4 flex items-center justify-between">
                      <p className="text-xs text-zinc-500">
                        第 {tplPage} / {tplTotalPages} 页
                      </p>
                      <Pagination>
                        <PaginationContent>
                          <PaginationItem>
                            <PaginationPrevious
                              href="#"
                              onClick={(e) => {
                                e.preventDefault()
                                if (tplPage > 1) setTplPage(tplPage - 1)
                              }}
                              className={tplPage <= 1 ? 'pointer-events-none opacity-50' : ''}
                            />
                          </PaginationItem>
                          {tplPaginationFirst > 1 && (
                            <PaginationItem>
                              <PaginationLink href="#" onClick={() => setTplPage(1)}>
                                1
                              </PaginationLink>
                            </PaginationItem>
                          )}
                          {tplPaginationFirst > 2 && (
                            <PaginationItem>
                              <PaginationEllipsis />
                            </PaginationItem>
                          )}
                          {tplPaginationWindow.map((page) => (
                            <PaginationItem key={page}>
                              <PaginationLink
                                href="#"
                                isActive={page === tplPage}
                                onClick={() => setTplPage(page)}
                              >
                                {page}
                              </PaginationLink>
                            </PaginationItem>
                          ))}
                          {tplPaginationLast < tplTotalPages - 1 && (
                            <PaginationItem>
                              <PaginationEllipsis />
                            </PaginationItem>
                          )}
                          {tplPaginationLast !== tplTotalPages && (
                            <PaginationItem>
                              <PaginationLink href="#" onClick={() => setTplPage(tplTotalPages)}>
                                {tplTotalPages}
                              </PaginationLink>
                            </PaginationItem>
                          )}
                          <PaginationItem>
                            <PaginationNext
                              href="#"
                              onClick={(e) => {
                                e.preventDefault()
                                if (tplPage < tplTotalPages) setTplPage(tplPage + 1)
                              }}
                              className={
                                tplPage >= tplTotalPages ? 'pointer-events-none opacity-50' : ''
                              }
                            />
                          </PaginationItem>
                        </PaginationContent>
                      </Pagination>
                    </div>
                  )}
                  {tplTotal === 0 && (
                    <div className="mt-4 text-xs text-zinc-500 text-center">暂无数据</div>
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
