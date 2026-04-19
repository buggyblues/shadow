import { User, X } from 'lucide-react'
import { useState } from 'react'
import { useApp } from '../store'
import type { UserSettings } from '../types'

interface SettingsPanelProps {
  onClose: () => void
}

export default function SettingsPanel({ onClose }: SettingsPanelProps) {
  const { state, dispatch } = useApp()

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[80vh] overflow-hidden rounded-xl border border-border bg-surface-2 shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-3">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-brand-400" />
            <span className="text-sm font-semibold text-zinc-200">Personal Settings</span>
          </div>
          <button onClick={onClose} className="rounded p-1 text-zinc-500 hover:text-zinc-300">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <PersonalSettings
            settings={state.userSettings}
            onChange={(updates) => dispatch({ type: 'SET_USER_SETTINGS', settings: updates })}
          />
        </div>
      </div>
    </div>
  )
}

function PersonalSettings({
  settings,
  onChange,
}: {
  settings: UserSettings
  onChange: (updates: Partial<UserSettings>) => void
}) {
  return (
    <>
      <SettingGroup title="General">
        <SettingRow label="Nickname" description="Name displayed in the UI">
          <input
            type="text"
            value={settings.displayName}
            onChange={(e) => onChange({ displayName: e.target.value })}
            placeholder="Enter nickname..."
            className="w-48 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-zinc-200 focus:border-brand-500/50 focus:outline-none"
          />
        </SettingRow>
        <SettingRow label="UI Language" description="Interface display language">
          <select
            value={settings.language}
            onChange={(e) => onChange({ language: e.target.value as UserSettings['language'] })}
            className="w-48 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-zinc-200 focus:border-brand-500/50 focus:outline-none"
          >
            <option value="zh-CN">Simplified Chinese</option>
            <option value="en-US">English</option>
          </select>
        </SettingRow>
        <SettingRow label="AI Response Language" description="Language for AI generated content">
          <select
            value={settings.aiLanguage}
            onChange={(e) => onChange({ aiLanguage: e.target.value as UserSettings['aiLanguage'] })}
            className="w-48 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-zinc-200 focus:border-brand-500/50 focus:outline-none"
          >
            <option value="zh">Chinese</option>
            <option value="en">English</option>
            <option value="auto">Follow material</option>
          </select>
        </SettingRow>
      </SettingGroup>

      <SettingGroup title="Automation">
        <SettingRow
          label="Auto Organize"
          description="Auto-extract cards after uploading materials"
        >
          <Toggle checked={settings.autoCurate} onChange={(v) => onChange({ autoCurate: v })} />
        </SettingRow>
        <SettingRow
          label="Full Pipeline Mode"
          description="Auto-run full pipeline after upload: Organize → Outline → Generate PPT"
        >
          <Toggle checked={settings.autoPipeline} onChange={(v) => onChange({ autoPipeline: v })} />
        </SettingRow>
        <SettingRow label="Notifications" description="Show notifications when tasks complete">
          <Toggle
            checked={settings.notifications}
            onChange={(v) => onChange({ notifications: v })}
          />
        </SettingRow>
      </SettingGroup>

      <SettingGroup title="❤️ Heartbeat (Auto Mode)">
        <SettingRow
          label="Auto Inspire"
          description="Periodically trigger AI inspiration suggestions"
        >
          <Toggle checked={settings.autoInspire} onChange={(v) => onChange({ autoInspire: v })} />
        </SettingRow>
        <SettingRow
          label="Auto Research"
          description="Auto-trigger deep research when materials are available (web search)"
        >
          <Toggle checked={settings.autoResearch} onChange={(v) => onChange({ autoResearch: v })} />
        </SettingRow>
        <SettingRow
          label="Auto Consume Tasks"
          description="Auto-apply TODO task queue to outline and PPT"
        >
          <Toggle
            checked={settings.autoConsumeTodos}
            onChange={(v) => onChange({ autoConsumeTodos: v })}
          />
        </SettingRow>
        <SettingRow label="Heartbeat Interval" description="Interval between auto tasks (seconds)">
          <input
            type="number"
            value={settings.heartbeatInterval}
            onChange={(e) =>
              onChange({ heartbeatInterval: Math.max(30, parseInt(e.target.value) || 120) })
            }
            min={30}
            max={600}
            className="w-24 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-zinc-200 focus:border-brand-500/50 focus:outline-none"
          />
        </SettingRow>
      </SettingGroup>
    </>
  )
}

// ── Shared UI Components ──

function SettingGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-3">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border/50 px-4 py-3">
      <div>
        <p className="text-xs font-medium text-zinc-200">{label}</p>
        <p className="text-[10px] text-zinc-600 mt-0.5">{description}</p>
      </div>
      {children}
    </div>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 rounded-full transition-colors ${
        checked ? 'bg-brand-500' : 'bg-zinc-700'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
          checked ? 'translate-x-4' : ''
        }`}
      />
    </button>
  )
}
