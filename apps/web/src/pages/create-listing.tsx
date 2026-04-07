import { Button, Card } from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import {
  ChevronDown,
  ChevronLeft,
  Cpu,
  HardDrive,
  Lock,
  MemoryStick,
  Monitor,
  Plus,
  Save,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../lib/api'
import { showToast } from '../lib/toast'
import { useMarketplaceStore } from '../stores/marketplace.store'

/** Convert ISO date string to datetime-local input value (YYYY-MM-DDTHH:mm) */
function formatDatetimeLocal(isoString: string): string {
  if (!isoString) return ''
  const d = new Date(isoString)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

interface AgentOption {
  id: string
  botUser?: {
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
  } | null
  isListed?: boolean
  isRented?: boolean
}

interface ListingForm {
  agentId: string
  title: string
  description: string
  skills: string
  guidelines: string
  deviceTier: 'high_end' | 'mid_range' | 'low_end'
  osType: 'macos' | 'windows' | 'linux'
  deviceModel: string
  deviceCpu: string
  deviceRam: string
  deviceStorage: string
  deviceGpu: string
  softwareTools: string
  baseDailyRate: number
  messageFee: number
  depositAmount: number
  tokenFeePassthrough: boolean
  availableFrom: string
  availableUntil: string
}

const INITIAL_FORM: ListingForm = {
  agentId: '',
  title: '',
  description: '',
  skills: '',
  guidelines: '',
  deviceTier: 'mid_range',
  osType: 'macos',
  deviceModel: '',
  deviceCpu: '',
  deviceRam: '',
  deviceStorage: '',
  deviceGpu: '',
  softwareTools: '',
  baseDailyRate: 500,
  messageFee: 10,
  depositAmount: 100,
  tokenFeePassthrough: true,
  availableFrom: '',
  availableUntil: '',
}

export function CreateListingPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { listingId } = useParams({ strict: false }) as { listingId?: string }
  const isEdit = !!listingId

  const [form, setForm] = useState<ListingForm>(INITIAL_FORM)
  const [showDeviceDetail, setShowDeviceDetail] = useState(false)

  // Fetch user's agents for the dropdown
  const { data: agents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: () => fetchApi<AgentOption[]>('/api/agents'),
  })

  // Load existing listing for edit
  const { data: existing } = useQuery({
    queryKey: ['marketplace', 'listing', listingId],
    queryFn: () => fetchApi<Record<string, unknown>>(`/api/marketplace/listings/${listingId}`),
    enabled: isEdit,
  })

  useEffect(() => {
    if (existing && isEdit) {
      const e = existing as Record<string, unknown>
      const deviceInfo = (e.deviceInfo || {}) as Record<string, string>
      setForm({
        agentId: (e.agentId as string) || '',
        title: (e.title as string) || '',
        description: (e.description as string) || '',
        skills: ((e.skills as string[]) || []).join(', '),
        guidelines: (e.guidelines as string) || '',
        deviceTier: (e.deviceTier as ListingForm['deviceTier']) || 'mid_range',
        osType: (e.osType as ListingForm['osType']) || 'macos',
        deviceModel: deviceInfo.model || '',
        deviceCpu: deviceInfo.cpu || '',
        deviceRam: deviceInfo.ram || '',
        deviceStorage: deviceInfo.storage || '',
        deviceGpu: deviceInfo.gpu || '',
        softwareTools: ((e.softwareTools as string[]) || []).join(', '),
        baseDailyRate:
          (e.baseDailyRate as number) || ((e.pricingVersion as number) === 2 ? 0 : 500),
        messageFee: (e.messageFee as number) || ((e.pricingVersion as number) === 2 ? 0 : 10),
        depositAmount: (e.depositAmount as number) || 100,
        tokenFeePassthrough: (e.tokenFeePassthrough as boolean) ?? true,
        availableFrom: formatDatetimeLocal((e.availableFrom as string) || ''),
        availableUntil: formatDatetimeLocal((e.availableUntil as string) || ''),
      })
      // Auto-expand device detail section if any detail fields are filled
      if (
        deviceInfo.model ||
        deviceInfo.cpu ||
        deviceInfo.ram ||
        deviceInfo.storage ||
        deviceInfo.gpu
      ) {
        setShowDeviceDetail(true)
      }
    }
  }, [existing, isEdit])

  const mutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => {
      if (isEdit) {
        return fetchApi(`/api/marketplace/listings/${listingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        })
      }
      return fetchApi('/api/marketplace/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketplace'] })
      showToast(
        isEdit
          ? t('marketplace.listingUpdated', '挂单已更新')
          : t('marketplace.listingCreated', '挂单已创建'),
        'success',
      )
      useMarketplaceStore.getState().setRentalsTab('renting-out')
      useMarketplaceStore.getState().setRentalsSubTab('listings')
      navigate({ to: '/marketplace/my-rentals' })
    },
    onError: (err: Error) => showToast(err.message, 'error'),
  })

  const handleSubmit = (e: React.FormEvent, status: 'draft' | 'active') => {
    e.preventDefault()
    mutation.mutate({
      agentId: form.agentId || undefined,
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      skills: form.skills
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      guidelines: form.guidelines.trim() || undefined,
      deviceTier: form.deviceTier,
      osType: form.osType,
      deviceInfo: {
        model: form.deviceModel.trim() || undefined,
        cpu: form.deviceCpu.trim() || undefined,
        ram: form.deviceRam.trim() || undefined,
        storage: form.deviceStorage.trim() || undefined,
        gpu: form.deviceGpu.trim() || undefined,
      },
      softwareTools: form.softwareTools
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      baseDailyRate: form.baseDailyRate,
      messageFee: form.messageFee,
      depositAmount: form.depositAmount,
      tokenFeePassthrough: form.tokenFeePassthrough,
      pricingVersion: 2,
      availableFrom: form.availableFrom ? new Date(form.availableFrom).toISOString() : undefined,
      availableUntil: form.availableUntil ? new Date(form.availableUntil).toISOString() : undefined,
      listingStatus: status,
    })
  }

  const update = (key: keyof ListingForm, value: ListingForm[keyof ListingForm]) =>
    setForm((f) => ({ ...f, [key]: value }))

  return (
    <div
      className="min-h-screen overflow-y-auto bg-bg-primary text-text-primary"
      style={{ fontFamily: "'Nunito', 'ZCOOL KuaiLe', sans-serif" }}
    >
      <div className="max-w-3xl mx-auto px-6 py-8 pb-24">
        {/* Header */}
        <Link
          to="/marketplace/my-rentals"
          className="inline-flex items-center gap-2 text-text-muted hover:text-text-primary transition-colors font-bold mb-6"
        >
          <ChevronLeft className="w-5 h-5" />
          {t('marketplace.backToRentals', '返回我的租赁')}
        </Link>

        <h1 style={{ fontFamily: "'ZCOOL KuaiLe', cursive" }} className="text-3xl font-bold mb-8">
          {isEdit
            ? t('marketplace.editListing', '编辑挂单')
            : t('marketplace.newListing', '创建挂单')}
        </h1>

        <form onSubmit={(e) => handleSubmit(e, 'active')} className="space-y-8">
          {/* Basic Info */}
          <Card variant="glass" className="p-8">
            <h2
              style={{ fontFamily: "'ZCOOL KuaiLe', cursive" }}
              className="text-lg font-bold mb-4"
            >
              {t('marketplace.basicInfo', '基本信息')}
            </h2>
            <div className="space-y-4">
              {/* Agent / Claw selector */}
              <label className="block">
                <span className="text-sm font-bold text-text-muted block mb-1">
                  {t('marketplace.selectClaw', '选择 Claw')}
                </span>
                <select
                  value={form.agentId}
                  onChange={(e) => update('agentId', e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border-2 border-border-subtle font-medium focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 bg-bg-secondary"
                >
                  <option value="">{t('marketplace.noClawSelected', '-- 不绑定 Claw --')}</option>
                  {agents.map((agent) => {
                    const name = agent.botUser?.displayName ?? agent.botUser?.username ?? agent.id
                    const disabled = !!agent.isRented
                    return (
                      <option key={agent.id} value={agent.id} disabled={disabled}>
                        {name}
                        {disabled ? ` 🔒 ${t('marketplace.clawRented', '租赁中')}` : ''}
                        {agent.isListed && !disabled
                          ? ` (${t('marketplace.clawListed', '已上架')})`
                          : ''}
                      </option>
                    )
                  })}
                </select>
                {agents.length === 0 && (
                  <p className="text-xs text-text-muted mt-1 flex items-center gap-1">
                    <Lock className="w-3 h-3" />
                    {t('marketplace.noClawHint', '你还没有 Claw，请先在 Buddy 管理页面创建')}
                  </p>
                )}
              </label>

              <label className="block">
                <span className="text-sm font-bold text-text-muted block mb-1">
                  {t('marketplace.listingTitle', '标题')} *
                </span>
                <input
                  type="text"
                  required
                  maxLength={100}
                  value={form.title}
                  onChange={(e) => update('title', e.target.value)}
                  placeholder={t(
                    'marketplace.titlePlaceholder',
                    '例：高配 Mac Studio 全栈开发环境',
                  )}
                  className="w-full px-4 py-2.5 rounded-xl border-2 border-border-subtle font-medium focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </label>
              <label className="block">
                <span className="text-sm font-bold text-text-muted block mb-1">
                  {t('marketplace.listingDesc', '描述')}
                </span>
                <textarea
                  value={form.description}
                  onChange={(e) => update('description', e.target.value)}
                  maxLength={2000}
                  rows={4}
                  placeholder={t('marketplace.descPlaceholder', '介绍你的 Claw 可以做什么...')}
                  className="w-full px-4 py-2.5 rounded-xl border-2 border-border-subtle font-medium focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 resize-none"
                />
              </label>
              <label className="block">
                <span className="text-sm font-bold text-text-muted block mb-1">
                  {t('marketplace.skillTags', '技能标签')}
                </span>
                <input
                  type="text"
                  value={form.skills}
                  onChange={(e) => update('skills', e.target.value)}
                  placeholder={t(
                    'marketplace.skillsPlaceholder',
                    'Web 开发, Python, DevOps (逗号分隔)',
                  )}
                  className="w-full px-4 py-2.5 rounded-xl border-2 border-border-subtle font-medium focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </label>
              <label className="block">
                <span className="text-sm font-bold text-text-muted block mb-1">
                  {t('marketplace.usageGuidelines', '使用准则')}
                </span>
                <textarea
                  value={form.guidelines}
                  onChange={(e) => update('guidelines', e.target.value)}
                  rows={3}
                  maxLength={5000}
                  placeholder={t('marketplace.guidelinesPlaceholder', '对使用方的要求和限制...')}
                  className="w-full px-4 py-2.5 rounded-xl border-2 border-border-subtle font-medium focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 resize-none"
                />
              </label>
            </div>
          </Card>

          {/* Device Info */}
          <Card variant="glass" className="p-8">
            <h2
              style={{ fontFamily: "'ZCOOL KuaiLe', cursive" }}
              className="text-lg font-bold mb-4"
            >
              {t('marketplace.deviceInfo', '设备信息')}
            </h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block">
                    <span className="text-sm font-bold text-text-muted block mb-1">
                      {t('marketplace.deviceTier', '设备档次')}
                    </span>
                    <select
                      value={form.deviceTier}
                      onChange={(e) => update('deviceTier', e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border-2 border-border-subtle font-medium focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 bg-bg-secondary"
                    >
                      <option value="high_end">🔥 {t('marketplace.deviceHighEnd')}</option>
                      <option value="mid_range">⚡ {t('marketplace.deviceMidRange')}</option>
                      <option value="low_end">💡 {t('marketplace.deviceLowEnd')}</option>
                    </select>
                  </label>
                </div>
                <div>
                  <label className="block">
                    <span className="text-sm font-bold text-text-muted block mb-1">
                      {t('marketplace.osType', '操作系统')}
                    </span>
                    <select
                      value={form.osType}
                      onChange={(e) => update('osType', e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border-2 border-border-subtle font-medium focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 bg-bg-secondary"
                    >
                      <option value="macos">macOS</option>
                      <option value="windows">Windows</option>
                      <option value="linux">Linux</option>
                    </select>
                  </label>
                </div>
              </div>
              <div>
                <label className="block">
                  <span className="text-sm font-bold text-text-muted block mb-1">
                    {t('marketplace.softwareTools', '已安装工具')}
                  </span>
                  <input
                    type="text"
                    value={form.softwareTools}
                    onChange={(e) => update('softwareTools', e.target.value)}
                    placeholder="VS Code, Docker, Node.js, Python (逗号分隔)"
                    className="w-full px-4 py-2.5 rounded-xl border-2 border-border-subtle font-medium focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </label>
              </div>

              {/* Expandable detailed device config */}
              <button
                type="button"
                onClick={() => setShowDeviceDetail(!showDeviceDetail)}
                className="flex items-center gap-2 text-sm font-bold text-text-muted hover:text-text-secondary transition-colors"
              >
                <ChevronDown
                  className={`w-4 h-4 transition-transform ${showDeviceDetail ? 'rotate-180' : ''}`}
                />
                {t('marketplace.detailedDeviceConfig', '详细设备配置')}
              </button>

              {showDeviceDetail && (
                <div className="space-y-4 animate-fade-in-up">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block">
                        <span className="text-sm font-bold text-text-muted block mb-1 flex items-center gap-1">
                          <Monitor className="w-3.5 h-3.5" /> {t('marketplace.model', '型号')}
                        </span>
                        <input
                          type="text"
                          value={form.deviceModel}
                          onChange={(e) => update('deviceModel', e.target.value)}
                          placeholder="Mac Studio M2 Ultra"
                          className="w-full px-4 py-2.5 rounded-xl border-2 border-border-subtle font-medium focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                        />
                      </label>
                    </div>
                    <div>
                      <label className="block">
                        <span className="text-sm font-bold text-text-muted block mb-1 flex items-center gap-1">
                          <Cpu className="w-3.5 h-3.5" /> CPU
                        </span>
                        <input
                          type="text"
                          value={form.deviceCpu}
                          onChange={(e) => update('deviceCpu', e.target.value)}
                          placeholder="M2 Ultra 24-core"
                          className="w-full px-4 py-2.5 rounded-xl border-2 border-border-subtle font-medium focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                        />
                      </label>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block">
                        <span className="text-sm font-bold text-text-muted block mb-1 flex items-center gap-1">
                          <MemoryStick className="w-3.5 h-3.5" /> RAM
                        </span>
                        <input
                          type="text"
                          value={form.deviceRam}
                          onChange={(e) => update('deviceRam', e.target.value)}
                          placeholder="192GB"
                          className="w-full px-4 py-2.5 rounded-xl border-2 border-border-subtle font-medium focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                        />
                      </label>
                    </div>
                    <div>
                      <label className="block">
                        <span className="text-sm font-bold text-text-muted block mb-1 flex items-center gap-1">
                          <HardDrive className="w-3.5 h-3.5" /> {t('marketplace.storage', '存储')}
                        </span>
                        <input
                          type="text"
                          value={form.deviceStorage}
                          onChange={(e) => update('deviceStorage', e.target.value)}
                          placeholder="2TB SSD"
                          className="w-full px-4 py-2.5 rounded-xl border-2 border-border-subtle font-medium focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                        />
                      </label>
                    </div>
                    <div>
                      <label className="block">
                        <span className="text-sm font-bold text-text-muted block mb-1">GPU</span>
                        <input
                          type="text"
                          value={form.deviceGpu}
                          onChange={(e) => update('deviceGpu', e.target.value)}
                          placeholder="76-core GPU"
                          className="w-full px-4 py-2.5 rounded-xl border-2 border-border-subtle font-medium focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                        />
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Pricing */}
          <Card variant="glass" className="p-8">
            <h2
              style={{ fontFamily: "'ZCOOL KuaiLe', cursive" }}
              className="text-lg font-bold mb-4"
            >
              {t('marketplace.pricingSetup', '定价设置')}
            </h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block">
                    <span className="text-sm font-bold text-text-muted block mb-1">
                      {t('marketplace.baseDailyRate', '基础每日费用')} (🦐/d) *
                    </span>
                    <input
                      type="number"
                      required
                      min={1}
                      value={form.baseDailyRate}
                      onChange={(e) => update('baseDailyRate', Number(e.target.value))}
                      className="w-full px-4 py-2.5 rounded-xl border-2 border-border-subtle font-bold text-center focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                  </label>
                  <p className="text-xs text-text-muted mt-1">
                    {t('marketplace.baseDailyRateHint', '不管是否使用，每天自动收取')}
                  </p>
                </div>
                <div>
                  <label className="block">
                    <span className="text-sm font-bold text-text-muted block mb-1">
                      {t('marketplace.messageFee', '每条消息费用')} (🦐/msg) *
                    </span>
                    <input
                      type="number"
                      required
                      min={0}
                      value={form.messageFee}
                      onChange={(e) => update('messageFee', Number(e.target.value))}
                      className="w-full px-4 py-2.5 rounded-xl border-2 border-border-subtle font-bold text-center focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                  </label>
                  <p className="text-xs text-text-muted mt-1">
                    {t('marketplace.messageFeeHint', '用户每发送一条消息收取的费用')}
                  </p>
                </div>
              </div>
              <div>
                <label className="block">
                  <span className="text-sm font-bold text-text-muted block mb-1">
                    {t('marketplace.deposit', '押金')} (🦐)
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={form.depositAmount}
                    onChange={(e) => update('depositAmount', Number(e.target.value))}
                    className="w-full px-4 py-2.5 rounded-xl border-2 border-border-subtle font-bold text-center focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </label>
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.tokenFeePassthrough}
                  onChange={(e) => update('tokenFeePassthrough', e.target.checked)}
                  className="w-5 h-5 rounded border-border-subtle text-primary focus:ring-primary/30"
                />
                <span className="text-sm font-bold text-text-secondary">
                  {t('marketplace.tokenPassthrough', 'Token 费用由使用方承担')}
                </span>
              </label>

              <div className="bg-warning/10 rounded-xl p-4 text-xs text-warning leading-relaxed">
                <strong>{t('marketplace.pricingNote', '定价说明：')}</strong>{' '}
                {t(
                  'marketplace.pricingExplainNew',
                  '总费用 = 基础每日费用 + 消息次数费 + Token消耗(如开启代付) + 5% 平台手续费。基础费用每日自动收取，消息费按使用次数定期结算。',
                )}
              </div>
            </div>
          </Card>

          {/* Availability */}
          <Card variant="glass" className="p-8">
            <h2
              style={{ fontFamily: "'ZCOOL KuaiLe', cursive" }}
              className="text-lg font-bold mb-4"
            >
              {t('marketplace.availability', '可用时间')}
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block">
                  <span className="text-sm font-bold text-text-muted block mb-1">
                    {t('marketplace.availableFrom', '开始时间')}
                  </span>
                  <input
                    type="datetime-local"
                    value={form.availableFrom}
                    onChange={(e) => update('availableFrom', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border-2 border-border-subtle font-medium focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </label>
              </div>
              <div>
                <label className="block">
                  <span className="text-sm font-bold text-text-muted block mb-1">
                    {t('marketplace.availableUntil', '结束时间')}
                  </span>
                  <input
                    type="datetime-local"
                    value={form.availableUntil}
                    onChange={(e) => update('availableUntil', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border-2 border-border-subtle font-medium focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </label>
              </div>
            </div>
            <p className="text-xs text-text-muted mt-2 font-medium">
              {t('marketplace.availabilityNote', '留空表示不限制可用时间范围')}
            </p>
          </Card>

          {/* Submit */}
          <div className="flex gap-4 justify-end pb-12">
            <Button
              variant="glass"
              size="lg"
              onClick={(e) => handleSubmit(e as unknown as React.FormEvent, 'draft')}
              disabled={mutation.isPending || !form.title.trim()}
            >
              <Save className="w-4 h-4" />
              {t('marketplace.saveDraft', '保存草稿')}
            </Button>
            <Button
              variant="primary"
              size="lg"
              type="submit"
              disabled={mutation.isPending || !form.title.trim()}
            >
              <Plus className="w-4 h-4" />
              {mutation.isPending
                ? t('common.loading', '处理中...')
                : isEdit
                  ? t('marketplace.updateListing', '更新挂单')
                  : t('marketplace.publishListing', '发布挂单')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
