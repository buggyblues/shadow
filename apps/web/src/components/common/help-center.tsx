import { Button } from '@shadowob/ui'
import { BookOpen, ExternalLink, HelpCircle, MessageCircle, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

interface HelpCenterProps {
  variant?: 'button' | 'panel'
}

interface HelpArticle {
  id: string
  titleKey: string
  descKey: string
  icon: typeof BookOpen
  url?: string
  action?: () => void
}

const helpArticles: HelpArticle[] = [
  {
    id: 'getting-started',
    titleKey: 'help.gettingStarted',
    descKey: 'help.gettingStartedDesc',
    icon: BookOpen,
    url: 'https://docs.shadowob.com/guide/getting-started',
  },
  {
    id: 'channels',
    titleKey: 'help.channels',
    descKey: 'help.channelsDesc',
    icon: MessageCircle,
    url: 'https://docs.shadowob.com/guide/channels',
  },
  {
    id: 'ai-agents',
    titleKey: 'help.aiAgents',
    descKey: 'help.aiAgentsDesc',
    icon: HelpCircle,
    url: 'https://docs.shadowob.com/guide/ai-agents',
  },
]

export function HelpCenterButton({ variant = 'button' }: HelpCenterProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  if (variant === 'panel' && open) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg-deep/60 backdrop-blur-sm">
        <div className="w-full max-w-md bg-bg-primary/95 backdrop-blur-xl rounded-[24px] border border-border-subtle shadow-[0_16px_64px_rgba(0,0,0,0.4)] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border-subtle">
            <div className="flex items-center gap-2">
              <HelpCircle size={20} className="text-primary" />
              <h2 className="font-black text-text-primary">{t('help.title', '帮助中心')}</h2>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setOpen(false)}>
              <X size={18} />
            </Button>
          </div>

          {/* Content */}
          <div className="p-4 space-y-2">
            {helpArticles.map((article) => (
              <a
                key={article.id}
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-3 p-3 rounded-xl hover:bg-bg-tertiary transition group"
              >
                <div className="w-10 h-10 rounded-lg bg-bg-tertiary group-hover:bg-bg-modifier-hover flex items-center justify-center shrink-0">
                  <article.icon
                    size={20}
                    className="text-text-muted group-hover:text-primary transition"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-text-primary group-hover:text-primary transition">
                    {t(article.titleKey)}
                  </p>
                  <p className="text-sm text-text-muted truncate">{t(article.descKey)}</p>
                </div>
                <ExternalLink size={16} className="text-text-muted shrink-0 mt-1" />
              </a>
            ))}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-border-subtle">
            <a
              href="https://docs.shadowob.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-2 text-sm text-text-muted hover:text-primary transition"
            >
              <BookOpen size={16} />
              {t('help.viewDocs', '查看完整文档')}
              <ExternalLink size={14} />
            </a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        title={t('help.title', '帮助中心')}
      >
        <HelpCircle size={20} />
      </Button>
      {open && variant === 'panel' && <HelpCenterButton variant="panel" />}
    </>
  )
}

// Inline help tooltip for specific features
interface HelpTooltipProps {
  content: string
  children: React.ReactNode
}

export function HelpTooltip({ content, children }: HelpTooltipProps) {
  const [show, setShow] = useState(false)

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-bg-primary/95 backdrop-blur-xl border border-border-subtle rounded-2xl shadow-xl text-sm text-text-primary whitespace-nowrap z-50">
          {content}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-bg-secondary" />
        </div>
      )}
    </div>
  )
}
