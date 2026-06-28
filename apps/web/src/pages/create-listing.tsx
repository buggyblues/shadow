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

/** Convert ISO date string to datetime-local input value (YYYY-MM-DDTHH:mm) */
export function formatDatetimeLocal(isoString: string): string {
  if (!isoString) return ''
  const d = new Date(isoString)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export interface AgentOption {
  id: string
  config?: Record<string, unknown>
  botUser?: {
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
  } | null
  isListed?: boolean
  isRented?: boolean
}

const isPrivateBuddy = (agent: AgentOption | undefined) =>
  agent ? agent.config?.buddyMode !== 'shareable' : false

export interface ListingForm {
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

type CreateListingPageProps = {
  listingId?: string
  defaultAgentId?: string
  embedded?: boolean
  onSubmitSuccess?: (data: Record<string, unknown>) => void
  onCancel?: () => void
}

export function CreateListingPage({
  listingId: listingIdFromProps,
  defaultAgentId,
  embedded = false,
  onSubmitSuccess,
  onCancel,
}: CreateListingPageProps = {}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { listingId: listingIdFromRoute } = useParams({ strict: false }) as { listingId?: string }
  const listingId = listingIdFromProps ?? listingIdFromRoute
  const isEdit = !!listingId

  const [form, setForm] = useState<ListingForm>({ ...INITIAL_FORM, agentId: defaultAgentId ?? '' })
  const [showDeviceDetail, setShowDeviceDetail] = useState(false)

  useEffect(() => {
    if (!isEdit && defaultAgentId && form.agentId !== defaultAgentId) {
      setForm((f) => ({ ...f, agentId: defaultAgentId }))
    }
  }, [defaultAgentId, isEdit, form.agentId])

  // Fetch user's agents for the dropdown
  const { data: agents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: () => fetchApi<AgentOption[]>('/api/agents'),
  })
  const selectedAgent = agents.find((agent) => agent.id === form.agentId)
  const selectedAgentPrivate = isPrivateBuddy(selectedAgent)

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
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['marketplace'] })
      showToast(
        isEdit ? t('marketplace.listingUpdated') : t('marketplace.listingCreated'),
        'success',
      )
      if (onSubmitSuccess) return onSubmitSuccess(data as Record<string, unknown>)

      navigate({ to: '/settings/buddy/market', search: {} })
    },
    onError: (err: Error) => showToast(err.message, 'error'),
  })

  const handleSubmit = (e: React.FormEvent, status: 'draft' | 'active') => {
    e.preventDefault()
    if (selectedAgentPrivate) {
      showToast(t('marketplace.privateBuddyCannotList'), 'error')
      return
    }
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
      className={
        embedded
          ? 'text-text-primary'
          : 'min-h-screen overflow-y-auto bg-bg-primary text-text-primary'
      }
      style={{ fontFamily: "'Nunito', 'ZCOOL KuaiLe', sans-serif" }}
    >
      <div className={embedded ? 'w-full' : 'max-w-3xl mx-auto px-6 py-8 pb-24'}>
        {/* Header */}
        {!embedded && (
          <Link
            to="/settings/buddy/market"
            className="inline-flex items-center gap-2 text-text-muted hover:text-text-primary transition-colors font-bold mb-6"
          >
            <ChevronLeft className="w-5 h-5" />
            {t('marketplace.backToRentals')}
          </Link>
        )}
        {embedded && onCancel && (
          <div className="flex items-center justify-end mb-4">
            <Button variant="ghost" size="sm" onClick={onCancel} className="rounded-[12px]">
              {t('common.cancel')}
            </Button>
          </div>
        )}

        <h1
          style={{ fontFamily: "'ZCOOL KuaiLe', cursive" }}
          className={embedded ? 'text-2xl font-bold mb-4' : 'text-3xl font-bold mb-8'}
        >
          {isEdit ? t('marketplace.editListing') : t('marketplace.newListing')}
        </h1>

        <form onSubmit={(e) => handleSubmit(e, 'active')} className="space-y-8">
          {/* Basic Info */}
          <Card variant="glass" className="p-8">
            <h2
              style={{ fontFamily: "'ZCOOL KuaiLe', cursive" }}
              className="text-lg font-bold mb-4"
            >
              {t('marketplace.basicInfo')}
            </h2>
            <div className="space-y-4">
              {/* Agent / Buddy selector */}
              <label className="block">
                <span className="text-sm font-bold text-text-muted block mb-1">
                  {t('marketplace.selectBuddy')}
                </span>
                {defaultAgentId ? (
                  <>
                    <div className="w-full px-4 py-2.5 rounded-xl border-2 border-border-subtle bg-bg-tertiary/30 text-text-muted">
                      {agents.find((agent) => agent.id === form.agentId)?.botUser?.displayName ??
                        agents.find((agent) => agent.id === form.agentId)?.botUser?.username ??
                        form.agentId}
                    </div>
                    <input type="hidden" value={form.agentId} />
                  </>
                ) : (
                  <select
                    value={form.agentId}
                    onChange={(e) => update('agentId', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border-2 border-border-subtle font-medium focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 bg-bg-secondary"
                  >
                    <option value="">{t('marketplace.noBuddySelected')}</option>
                    {agents.map((agent) => {
                      const name = agent.botUser?.displayName ?? agent.botUser?.username ?? agent.id
                      const privateBuddy = isPrivateBuddy(agent)
                      const disabled = !!agent.isRented || privateBuddy
                      return (
                        <option key={agent.id} value={agent.id} disabled={disabled}>
                          {name}
                          {agent.isRented ? ` 🔒 ${t('marketplace.buddyRented')}` : ''}
                          {privateBuddy ? ` (${t('agentMgmt.modePrivate')})` : ''}
                          {agent.isListed && !disabled ? ` (${t('marketplace.buddyListed')})` : ''}
                        </option>
                      )
                    })}
                  </select>
                )}
                {agents.length === 0 && (
                  <p className="text-xs text-text-muted mt-1 flex items-center gap-1">
                    <Lock className="w-3 h-3" />
                    {t('marketplace.noBuddyHint')}
                  </p>
                )}
                {selectedAgentPrivate && form.agentId && (
                  <p className="text-xs text-warning mt-1 flex items-center gap-1">
                    <Lock className="w-3 h-3" />
                    {t('marketplace.privateBuddyCannotList')}
                  </p>
                )}
              </label>

              <label className="block">
                <span className="text-sm font-bold text-text-muted block mb-1">
                  {t('marketplace.listingTitle')} *
                </span>
                <input
                  type="text"
                  required
                  maxLength={100}
                  value={form.title}
                  onChange={(e) => update('title', e.target.value)}
                  placeholder={t('marketplace.titlePlaceholder')}
                  className="w-full px-4 py-2.5 rounded-xl border-2 border-border-subtle font-medium focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </label>
              <label className="block">
                <span className="text-sm font-bold text-text-muted block mb-1">
                  {t('marketplace.listingDesc')}
                </span>
                <textarea
                  value={form.description}
                  onChange={(e) => update('description', e.target.value)}
                  maxLength={2000}
                  rows={4}
                  placeholder={t('marketplace.descPlaceholder')}
                  className="w-full px-4 py-2.5 rounded-xl border-2 border-border-subtle font-medium focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 resize-none"
                />
              </label>
              <label className="block">
                <span className="text-sm font-bold text-text-muted block mb-1">
                  {t('marketplace.skillTags')}
                </span>
                <input
                  type="text"
                  value={form.skills}
                  onChange={(e) => update('skills', e.target.value)}
                  placeholder={t('marketplace.skillsPlaceholder')}
                  className="w-full px-4 py-2.5 rounded-xl border-2 border-border-subtle font-medium focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </label>
              <label className="block">
                <span className="text-sm font-bold text-text-muted block mb-1">
                  {t('marketplace.usageGuidelines')}
                </span>
                <textarea
                  value={form.guidelines}
                  onChange={(e) => update('guidelines', e.target.value)}
                  rows={3}
                  maxLength={5000}
                  placeholder={t('marketplace.guidelinesPlaceholder')}
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
              {t('marketplace.deviceInfo')}
            </h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block">
                    <span className="text-sm font-bold text-text-muted block mb-1">
                      {t('marketplace.deviceTier')}
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
                      {t('marketplace.osType')}
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
                    {t('marketplace.softwareTools')}
                  </span>
                  <input
                    type="text"
                    value={form.softwareTools}
                    onChange={(e) => update('softwareTools', e.target.value)}
                    placeholder={t('marketplace.softwareToolsPlaceholder')}
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
                {t('marketplace.detailedDeviceConfig')}
              </button>

              {showDeviceDetail && (
                <div className="space-y-4 animate-fade-in-up">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block">
                        <span className="text-sm font-bold text-text-muted block mb-1 flex items-center gap-1">
                          <Monitor className="w-3.5 h-3.5" /> {t('marketplace.model')}
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
                          <HardDrive className="w-3.5 h-3.5" /> {t('marketplace.storage')}
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
              {t('marketplace.pricingSetup')}
            </h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block">
                    <span className="text-sm font-bold text-text-muted block mb-1">
                      {t('marketplace.baseDailyRate')} (🦐/d) *
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
                    {t('marketplace.baseDailyRateHint')}
                  </p>
                </div>
                <div>
                  <label className="block">
                    <span className="text-sm font-bold text-text-muted block mb-1">
                      {t('marketplace.messageFee')} (🦐/msg) *
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
                  <p className="text-xs text-text-muted mt-1">{t('marketplace.messageFeeHint')}</p>
                </div>
              </div>
              <div>
                <label className="block">
                  <span className="text-sm font-bold text-text-muted block mb-1">
                    {t('marketplace.deposit')} (🦐)
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
                  {t('marketplace.tokenPassthrough')}
                </span>
              </label>

              <div className="bg-warning/10 rounded-xl p-4 text-xs text-warning leading-relaxed">
                <strong>{t('marketplace.pricingNote')}</strong> {t('marketplace.pricingExplainNew')}
              </div>
            </div>
          </Card>

          {/* Availability */}
          <Card variant="glass" className="p-8">
            <h2
              style={{ fontFamily: "'ZCOOL KuaiLe', cursive" }}
              className="text-lg font-bold mb-4"
            >
              {t('marketplace.availability')}
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block">
                  <span className="text-sm font-bold text-text-muted block mb-1">
                    {t('marketplace.availableFrom')}
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
                    {t('marketplace.availableUntil')}
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
              {t('marketplace.availabilityNote')}
            </p>
          </Card>

          {/* Submit */}
          <div className="flex gap-4 justify-end pb-12">
            <Button
              variant="glass"
              size="lg"
              onClick={(e) => handleSubmit(e as unknown as React.FormEvent, 'draft')}
              disabled={
                mutation.isPending ||
                !form.title.trim() ||
                !form.agentId.trim() ||
                selectedAgentPrivate
              }
            >
              <Save className="w-4 h-4" />
              {t('marketplace.saveDraft')}
            </Button>
            <Button
              variant="primary"
              size="lg"
              type="submit"
              disabled={
                mutation.isPending ||
                !form.title.trim() ||
                !form.agentId.trim() ||
                selectedAgentPrivate
              }
            >
              <Plus className="w-4 h-4" />
              {mutation.isPending
                ? t('common.loading')
                : isEdit
                  ? t('marketplace.updateListing')
                  : t('marketplace.publishListing')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
