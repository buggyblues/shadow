import { Button, TooltipAnchor } from '@shadowob/ui'
import { BookOpen, ExternalLink, HelpCircle, MessageCircle, X } from 'lucide-react'
import type { ReactElement } from 'react'
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
              <h2 className="font-black text-text-primary">{t('help.title')}</h2>
            </div>
            <TooltipAnchor label={t('common.close')}>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setOpen(false)}
                aria-label={t('common.close')}
              >
                <X size={18} />
              </Button>
            </TooltipAnchor>
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
              {t('help.viewDocs')}
              <ExternalLink size={14} />
            </a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <TooltipAnchor label={t('help.title')}>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setOpen(true)}
          aria-label={t('help.title')}
        >
          <HelpCircle size={20} />
        </Button>
      </TooltipAnchor>
      {open && variant === 'panel' && <HelpCenterButton variant="panel" />}
    </>
  )
}

// Inline help tooltip for specific features
interface HelpTooltipProps {
  content: string
  children: ReactElement
}

export function HelpTooltip({ content, children }: HelpTooltipProps) {
  return <TooltipAnchor label={content}>{children}</TooltipAnchor>
}
