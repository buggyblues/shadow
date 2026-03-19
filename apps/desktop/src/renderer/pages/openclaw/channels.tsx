/**
 * Channel Configuration Page
 *
 * Configure messaging channels (Telegram, Discord, WeChat, etc.)
 * with dynamic forms based on channel registry metadata.
 * Channels config is Record<string, unknown> keyed by channel type.
 */

import { ChevronLeft, Loader2, MessageSquare, Save, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ChannelConfigField, ChannelMeta } from '../../lib/openclaw-api'
import { openClawApi } from '../../lib/openclaw-api'
import { ChannelBrandIcon } from './channel-icons'

type ViewState = { mode: 'grid' } | { mode: 'edit'; channelId: string }

const CATEGORY_LABELS: Record<string, { key: string; fallback: string }> = {
  messaging: { key: 'openclaw.channels.catMessaging', fallback: '即时通讯' },
  social: { key: 'openclaw.channels.catSocial', fallback: '社交' },
  enterprise: { key: 'openclaw.channels.catEnterprise', fallback: '企业' },
  custom: { key: 'openclaw.channels.catCustom', fallback: '自定义' },
}

export function ChannelsPage() {
  const { t } = useTranslation()
  const [channels, setChannels] = useState<ChannelMeta[]>([])
  const [configs, setConfigs] = useState<Record<string, unknown>>({})
  const [view, setView] = useState<ViewState>({ mode: 'grid' })

  const loadData = useCallback(async () => {
    try {
      const [ch, cfg] = await Promise.all([
        openClawApi.getChannelRegistry(),
        openClawApi.getChannelConfigs(),
      ])
      setChannels(ch)
      setConfigs(cfg ?? {})
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    if (openClawApi.isAvailable) loadData()
  }, [loadData])

  const grouped = useMemo(() => {
    const groups: Record<string, ChannelMeta[]> = {}
    for (const ch of channels) {
      const cat = ch.category || 'custom'
      if (!groups[cat]) groups[cat] = []
      groups[cat]!.push(ch)
    }
    return groups
  }, [channels])

  if (view.mode === 'edit') {
    const channel = channels.find((c) => c.id === view.channelId)
    if (!channel) {
      setView({ mode: 'grid' })
      return null
    }
    return (
      <ChannelEditor
        channel={channel}
        existingConfig={(configs[view.channelId] ?? null) as Record<string, unknown> | null}
        onBack={() => setView({ mode: 'grid' })}
        onSave={async () => {
          await loadData()
          setView({ mode: 'grid' })
        }}
        onDelete={async () => {
          await openClawApi.deleteChannelConfig(view.channelId)
          await loadData()
          setView({ mode: 'grid' })
        }}
      />
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-6 pt-5 pb-6">
        <h2 className="text-lg font-bold text-text-primary mb-1">
          {t('openclaw.channels.title', 'IM 通道')}
        </h2>
        <p className="text-sm text-text-muted mb-6">
          {t('openclaw.channels.subtitle', '配置消息通道，将 AI 龙虾连接到不同平台')}
        </p>

        {Object.entries(grouped).map(([category, channelList]) => (
          <div key={category} className="mb-8">
            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
              {CATEGORY_LABELS[category]
                ? t(CATEGORY_LABELS[category].key, CATEGORY_LABELS[category].fallback)
                : category}
            </h3>
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}
            >
              {(channelList ?? []).map((ch: ChannelMeta) => {
                const hasConfig = !!configs[ch.id]
                return (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => setView({ mode: 'edit', channelId: ch.id })}
                    className="bg-bg-secondary rounded-xl border border-bg-tertiary p-4 text-left hover:border-primary/30 hover:bg-bg-secondary/80 transition group"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <ChannelBrandIcon channelId={ch.id} size={24} />
                      {hasConfig && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-green-500/10 text-green-500">
                          {t('openclaw.channels.configured', '已配置')}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-text-primary group-hover:text-primary transition">
                      {ch.label}
                    </p>
                    <p className="text-xs text-text-muted mt-0.5 line-clamp-2">{ch.description}</p>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Channel Editor ──────────────────────────────────────────────────────────

function ChannelEditor({
  channel,
  existingConfig,
  onBack,
  onSave,
  onDelete,
}: {
  channel: ChannelMeta
  existingConfig: Record<string, unknown> | null
  onBack: () => void
  onSave: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const isNew = !existingConfig

  const [fieldValues, setFieldValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    for (const field of channel.configFields ?? []) {
      const existing = existingConfig?.[field.key]
      initial[field.key] =
        existing != null ? String(existing) : (field.defaultValue?.toString() ?? '')
    }
    return initial
  })
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}
    for (const field of channel.configFields ?? []) {
      if (field.required && !fieldValues[field.key]?.trim()) {
        newErrors[field.key] = t('openclaw.channels.fieldRequired', '{{field}} 为必填项', {
          field: field.label,
        })
      }
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSave = async () => {
    if (!validate()) return
    setSaving(true)
    try {
      const config: Record<string, string | number | boolean> = {}
      for (const field of channel.configFields ?? []) {
        const val = fieldValues[field.key]
        if (field.type === 'number') {
          config[field.key] = Number(val) || 0
        } else if (field.type === 'boolean') {
          config[field.key] = val === 'true'
        } else {
          config[field.key] = val
        }
      }
      await openClawApi.saveChannelConfig(channel.id, config)
      onSave()
    } finally {
      setSaving(false)
    }
  }

  const renderField = (field: ChannelConfigField) => {
    const value = fieldValues[field.key] ?? ''
    const error = errors[field.key]

    if (field.type === 'boolean') {
      return (
        <div key={field.key} className="flex items-center justify-between py-2">
          <div>
            <p className="text-sm font-medium text-text-primary">{field.label}</p>
            {field.description && (
              <p className="text-xs text-text-muted mt-0.5">{field.description}</p>
            )}
          </div>
          <div
            role="switch"
            aria-checked={value === 'true'}
            tabIndex={0}
            onClick={() =>
              setFieldValues((prev) => ({
                ...prev,
                [field.key]: value === 'true' ? 'false' : 'true',
              }))
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setFieldValues((prev) => ({
                  ...prev,
                  [field.key]: value === 'true' ? 'false' : 'true',
                }))
              }
            }}
            className={`relative cursor-pointer transition-colors rounded-full ${value === 'true' ? 'bg-primary' : 'bg-bg-tertiary'}`}
            style={{ width: 40, height: 22 }}
          >
            <div
              className={`absolute top-0.5 left-0.5 w-[18px] h-[18px] rounded-full bg-white shadow transition-transform ${value === 'true' ? 'translate-x-[18px]' : ''}`}
            />
          </div>
        </div>
      )
    }

    if (field.type === 'select' && field.options) {
      return (
        <div key={field.key}>
          <label className="block text-sm font-medium text-text-primary mb-1.5">
            {field.label}
            {field.required && <span className="text-red-500 ml-0.5">*</span>}
          </label>
          {field.description && (
            <p className="text-xs text-text-muted mb-1.5">{field.description}</p>
          )}
          <select
            value={value}
            onChange={(e) => setFieldValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
            className="w-full px-3 py-2.5 rounded-lg bg-bg-secondary border border-bg-tertiary text-sm text-text-primary focus:outline-none focus:border-primary/50 transition"
          >
            <option value="">{t('common.pleaseSelect', '请选择...')}</option>
            {field.options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
        </div>
      )
    }

    if (field.type === 'textarea') {
      return (
        <div key={field.key}>
          <label className="block text-sm font-medium text-text-primary mb-1.5">
            {field.label}
            {field.required && <span className="text-red-500 ml-0.5">*</span>}
          </label>
          {field.description && (
            <p className="text-xs text-text-muted mb-1.5">{field.description}</p>
          )}
          <textarea
            value={value}
            onChange={(e) => setFieldValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
            placeholder={field.placeholder}
            rows={4}
            className="w-full px-3 py-2.5 rounded-lg bg-bg-secondary border border-bg-tertiary text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary/50 transition resize-none"
          />
          {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
        </div>
      )
    }

    return (
      <div key={field.key}>
        <label className="block text-sm font-medium text-text-primary mb-1.5">
          {field.label}
          {field.required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
        {field.description && <p className="text-xs text-text-muted mb-1.5">{field.description}</p>}
        <input
          type={
            field.type === 'password' ? 'password' : field.type === 'number' ? 'number' : 'text'
          }
          value={value}
          onChange={(e) => setFieldValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
          placeholder={field.placeholder}
          className={`w-full px-3 py-2.5 rounded-lg bg-bg-secondary border text-sm text-text-primary placeholder:text-text-muted focus:outline-none transition ${
            error ? 'border-red-500' : 'border-bg-tertiary focus:border-primary/50'
          }`}
        />
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-6 pt-5 pb-6 max-w-2xl">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-text-muted hover:text-text-primary transition mb-4"
        >
          <ChevronLeft size={16} />
          {t('common.back', '返回')}
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-bg-tertiary flex items-center justify-center shrink-0">
            <MessageSquare size={18} className="text-text-muted" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-text-primary">
              {isNew
                ? t('openclaw.channels.configure', '配置 {{channel}}', { channel: channel.label })
                : t('openclaw.channels.editChannel', '编辑 {{channel}}', {
                    channel: channel.label,
                  })}
            </h2>
            <p className="text-sm text-text-muted">{channel.description}</p>
          </div>
        </div>

        {(channel.configFields ?? []).length > 0 ? (
          <div className="space-y-4">{(channel.configFields ?? []).map(renderField)}</div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center bg-bg-secondary rounded-xl border border-bg-tertiary">
            <MessageSquare size={36} className="text-text-muted mb-3" />
            <p className="text-sm text-text-muted">
              {t('openclaw.channels.noFields', '该频道无可配置字段。')}
            </p>
          </div>
        )}

        <div className="flex items-center justify-between mt-8 pt-4 border-t border-bg-tertiary">
          <div>
            {!isNew && (
              <button
                type="button"
                onClick={onDelete}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-red-500 hover:bg-red-500/10 transition"
              >
                <Trash2 size={14} />
                {t('openclaw.channels.removeConfig', '移除配置')}
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onBack}
              className="px-4 py-2.5 rounded-lg text-sm text-text-secondary hover:text-text-primary hover:bg-bg-secondary transition"
            >
              {t('common.cancel', '取消')}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover disabled:opacity-50 transition"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {t('common.save', '保存')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
