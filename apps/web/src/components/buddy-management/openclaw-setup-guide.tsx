import { Button, cn } from '@shadowob/ui'
import { BookOpen, Check, Copy, Key, MessageSquare, Terminal } from 'lucide-react'
import { useState } from 'react'
import type { Agent } from './types'

/* ── OpenClaw Setup Guide ─────────────────────────────── */

function CopyBlock({
  content,
  label,
  t,
}: {
  content: string
  label?: string
  t: (key: string) => string
}) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="relative group">
      {label && (
        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-text-muted mb-1">
          {label}
        </p>
      )}
      <pre className="bg-bg-deep/50 backdrop-blur-sm rounded-2xl p-3 pr-10 font-mono text-xs text-text-secondary border border-border-subtle overflow-x-auto whitespace-pre-wrap break-all">
        {content}
      </pre>
      <button
        type="button"
        onClick={handleCopy}
        className="absolute top-1.5 right-1.5 p-1.5 rounded-full bg-bg-tertiary/50 text-text-muted hover:text-text-primary hover:bg-bg-modifier-hover transition opacity-0 group-hover:opacity-100"
        title={t('common.copy')}
      >
        {copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
      </button>
    </div>
  )
}

export function OpenClawSetupGuide({
  agent,
  generatedToken,
  onGenerateToken,
  generatingToken,
  t,
}: {
  agent: Agent
  generatedToken: string | null
  onGenerateToken: () => void
  generatingToken: boolean
  t: (key: string) => string
}) {
  const token = (agent.config?.lastToken as string | undefined) ?? generatedToken ?? ''
  const hasToken = !!token.trim()
  const serverUrl = window.location.origin
  const [activeTab, setActiveTab] = useState<'manual' | 'chat'>('chat')

  // Bash one-liner for manual setup
  const bashCommand = `openclaw plugins install @shadowob/openclaw-shadowob && openclaw config set channels.shadowob.token "${token || '<TOKEN>'}" && openclaw config set channels.shadowob.serverUrl "${serverUrl}" && openclaw gateway restart`

  // AI prompt for chat-based setup
  const aiPrompt = `请帮我安装和配置 ShadowOwnBuddy 插件，连接到 Shadow 服务器。

配置信息：
- 插件名称：@shadowob/openclaw
- 服务器地址：${serverUrl}

请执行以下步骤：
1. 安装插件：openclaw plugins install @shadowob/openclaw
2. 配置 Token：openclaw config set channels.shadowob.token "${token || '<TOKEN>'}"
3. 配置服务器地址：openclaw config set channels.shadowob.serverUrl "${serverUrl}"
4. 重启网关：openclaw gateway restart

请依次执行这些命令，并确认每个步骤是否成功。`

  if (!hasToken) {
    return (
      <div className="bg-bg-tertiary/40 rounded-[20px] p-6 border border-border-subtle shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <BookOpen size={16} className="text-primary" />
          <h3 className="text-sm font-black text-text-primary uppercase tracking-[0.15em]">
            {t('agentMgmt.openclawGuideTitle')}
          </h3>
        </div>
        <p className="text-sm text-text-muted font-bold italic mb-5">
          {t('agentMgmt.setupTokenWarning')}
        </p>
        <Button
          variant="primary"
          size="sm"
          onClick={onGenerateToken}
          disabled={generatingToken}
          className="rounded-[12px]"
        >
          <Key size={14} />
          {generatingToken ? t('agentMgmt.generating') : t('agentMgmt.generateToken')}
        </Button>
      </div>
    )
  }

  return (
    <div className="bg-bg-tertiary/40 rounded-[20px] p-6 border border-border-subtle shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <BookOpen size={16} className="text-primary" />
        <h3 className="text-sm font-black text-text-primary uppercase tracking-[0.15em]">
          {t('agentMgmt.openclawGuideTitle')}
        </h3>
      </div>
      <p className="text-sm text-text-muted font-bold italic mb-5">
        {t('agentMgmt.openclawGuideDesc')}
      </p>

      {/* Tab selector — pill-shaped */}
      <div className="flex gap-1 mb-5 bg-bg-deep/50 backdrop-blur-sm rounded-full p-1 border border-border-subtle">
        <button
          type="button"
          onClick={() => setActiveTab('manual')}
          className={cn(
            'flex items-center gap-1.5 flex-1 px-4 py-2 rounded-full text-xs font-black uppercase tracking-widest transition',
            activeTab === 'manual'
              ? 'bg-primary/15 text-primary shadow-sm'
              : 'text-text-muted hover:text-text-secondary',
          )}
        >
          <Terminal size={12} />
          {t('agentMgmt.setupManual')}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('chat')}
          className={cn(
            'flex items-center gap-1.5 flex-1 px-4 py-2 rounded-full text-xs font-black uppercase tracking-widest transition',
            activeTab === 'chat'
              ? 'bg-primary/15 text-primary shadow-sm'
              : 'text-text-muted hover:text-text-secondary',
          )}
        >
          <MessageSquare size={12} />
          {t('agentMgmt.setupChat')}
        </button>
      </div>

      {activeTab === 'manual' ? (
        <>
          {/* Quick bash one-liner */}
          <div className="mb-4">
            <p className="text-xs font-black text-text-secondary mb-2 uppercase tracking-widest">
              {t('agentMgmt.setupBashTitle')}
            </p>
            <CopyBlock content={bashCommand} t={t} />
            {!token && (
              <p className="text-[11px] text-warning mt-1.5 ml-1 font-bold">
                ⚠ {t('agentMgmt.setupTokenWarning')}
              </p>
            )}
          </div>

          <div className="h-px bg-bg-tertiary/50 my-4" />

          {/* Step-by-step */}
          <p className="text-[11px] font-black text-text-muted uppercase tracking-[0.2em] mb-3">
            {t('agentMgmt.setupStepByStep')}
          </p>

          {/* Step 1: Install */}
          <div className="mb-3">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs font-black flex items-center justify-center">
                1
              </span>
              <span className="text-sm font-black text-text-primary">
                {t('docs.openclawStep1Title')}
              </span>
            </div>
            <div className="ml-7">
              <CopyBlock content="openclaw plugins install @shadowob/openclaw-shadowob" t={t} />
            </div>
          </div>

          {/* Step 2: Config Token */}
          <div className="mb-3">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs font-black flex items-center justify-center">
                2
              </span>
              <span className="text-sm font-black text-text-primary">
                {t('agentMgmt.setupConfigToken')}
              </span>
            </div>
            <div className="ml-7">
              <CopyBlock content={`openclaw config set channels.shadowob.token "${token}"`} t={t} />
            </div>
          </div>

          {/* Step 3: Config Server URL */}
          <div className="mb-3">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs font-black flex items-center justify-center">
                3
              </span>
              <span className="text-sm font-black text-text-primary">
                {t('agentMgmt.setupConfigServer')}
              </span>
            </div>
            <div className="ml-7">
              <CopyBlock
                content={`openclaw config set channels.shadowob.serverUrl "${serverUrl}"`}
                t={t}
              />
            </div>
          </div>

          {/* Step 4: Run */}
          <div className="mb-3">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs font-black flex items-center justify-center">
                4
              </span>
              <span className="text-sm font-black text-text-primary">
                {t('agentMgmt.openclawRunTitle')}
              </span>
            </div>
            <div className="ml-7">
              <CopyBlock content="openclaw gateway restart" t={t} />
            </div>
          </div>
        </>
      ) : (
        <>
          {/* AI chat prompt */}
          <p className="text-xs text-text-muted font-bold italic mb-3">
            {t('agentMgmt.setupChatDesc')}
          </p>
          <CopyBlock content={aiPrompt} t={t} />
        </>
      )}

      {/* Capabilities */}
      <div className="mt-4 pt-4 border-t border-border-subtle">
        <p className="text-[11px] font-black text-text-muted uppercase tracking-[0.2em] mb-2">
          {t('docs.openclawCapabilities')}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {['messaging', 'threads', 'reactions', 'media', 'mentions', 'editDelete'].map((cap) => (
            <div
              key={cap}
              className="flex items-center gap-1.5 text-xs text-text-secondary font-bold"
            >
              <span className="text-success">✓</span>
              {t(`docs.openclawCap_${cap}`)}
            </div>
          ))}
        </div>
      </div>

      {/* Link to full docs */}
      <div className="mt-4 pt-3 border-t border-border-subtle">
        <a
          href="/product/index.html"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary hover:text-primary-hover font-black flex items-center gap-1 transition uppercase tracking-widest"
        >
          <BookOpen size={12} />
          {t('agentMgmt.openclawFullDocs')}
        </a>
      </div>
    </div>
  )
}
