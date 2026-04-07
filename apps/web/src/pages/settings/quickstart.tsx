import { Badge, Breadcrumbs, BuddyIcon, Button, Card, PageContainer } from '@shadowob/ui'
import { useNavigate } from '@tanstack/react-router'
import { ArrowRight, Compass, HelpCircle, Home, LayoutGrid, Monitor, User } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export function QuickstartSettings() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  return (
    <PageContainer className="mx-auto space-y-12">
      <div className="space-y-6">
        <Breadcrumbs
          items={[
            {
              label: t('settings.sidebarTitle', '设置'),
              icon: Home,
              onClick: () => navigate({ to: '/settings' } as any),
            },
            { label: t('settings.tabQuickStart') },
          ]}
        />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
          <div className="space-y-2">
            <h1 className="text-4xl font-black text-text-primary tracking-tight uppercase leading-none">
              {t('common.welcomeTitle', 'Welcome to')} <span className="text-primary">Shadow</span>
            </h1>
            <p className="text-lg font-bold text-text-muted italic opacity-80">
              {t('common.welcomeDesc')}
            </p>
          </div>
        </div>
      </div>

      {/* Primary Action Blobs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <Card
          hoverable
          onClick={() => navigate({ to: '/settings', search: { tab: 'profile' } } as any)}
          className="p-10 relative overflow-hidden group border-none bg-gradient-to-br from-primary/20 via-bg-secondary to-bg-tertiary shadow-2xl blob-button"
        >
          <div className="absolute top-0 right-0 w-48 h-48 bg-primary/10 rounded-full blur-[80px] -mr-24 -mt-24 group-hover:bg-primary/20 transition-all duration-700" />
          <div className="relative z-10 flex flex-col gap-6">
            <div className="w-20 h-20 rounded-[40px] bg-primary/10 flex items-center justify-center text-primary shadow-inner border border-primary/10 group-hover:scale-110 transition-transform duration-500">
              <User size={40} strokeWidth={2.5} />
            </div>
            <div>
              <h3 className="text-2xl font-black text-text-primary uppercase tracking-tight mb-2">
                {t('settings.profileTitle', '个人资料')}
              </h3>
              <p className="text-base font-bold text-text-muted leading-relaxed opacity-80 mb-6 max-w-xs">
                {t('guide.profileDesc', '设置你的头像、昵称和个人信息')}
              </p>
              <div className="inline-flex items-center gap-2 text-primary font-black uppercase tracking-widest text-xs">
                {t('settings.profileTitle', '个人资料')}{' '}
                <ArrowRight
                  size={16}
                  strokeWidth={3}
                  className="group-hover:translate-x-2 transition-transform"
                />
              </div>
            </div>
          </div>
        </Card>

        <Card
          hoverable
          onClick={() => window.open('/download', '_blank')}
          className="p-10 relative overflow-hidden group border-none bg-gradient-to-br from-accent/20 via-bg-secondary to-bg-tertiary shadow-2xl blob-button"
        >
          <div className="absolute top-0 right-0 w-48 h-48 bg-accent/10 rounded-full blur-[80px] -mr-24 -mt-24 group-hover:bg-accent/20 transition-all duration-700" />
          <div className="relative z-10 flex flex-col gap-6">
            <div className="w-20 h-20 rounded-[40px] bg-accent/10 flex items-center justify-center text-accent shadow-inner border border-accent/10 group-hover:scale-110 transition-transform duration-500">
              <Monitor size={40} strokeWidth={2.5} />
            </div>
            <div>
              <h3 className="text-2xl font-black text-text-primary uppercase tracking-tight mb-2">
                {t('guide.desktopTitle', '下载桌面端')}
              </h3>
              <p className="text-base font-bold text-text-muted leading-relaxed opacity-80 mb-6 max-w-xs">
                {t('guide.desktopDesc', '连接你的 Buddy 并在本地运行')}
              </p>
              <div className="inline-flex items-center gap-2 text-accent font-black uppercase tracking-widest text-xs">
                {t('common.download', 'Download')}{' '}
                <ArrowRight
                  size={16}
                  strokeWidth={3}
                  className="group-hover:translate-x-2 transition-transform"
                />
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Discovery Grid - Modern Circles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 pt-4">
        {[
          {
            icon: Compass,
            label: t('guide.discoverTitle', '探索'),
            to: '/discover',
            color: 'text-success',
            bg: 'bg-success/10',
            border: 'border-success/20',
          },
          {
            icon: BuddyIcon,
            label: t('guide.marketTitle', 'Buddy 集市'),
            to: '/buddies' as const,
            color: 'text-primary',
            bg: 'bg-primary/10',
            border: 'border-primary/20',
          },
          {
            icon: LayoutGrid,
            label: t('guide.buddyMgmtTitle', 'Buddy 管理'),
            to: '/settings/buddy' as const,
            color: 'text-info',
            bg: 'bg-info/10',
            border: 'border-info/20',
          },
          {
            icon: HelpCircle,
            label: t('guide.helpTitle', '帮助'),
            href: '/product/index.html',
            color: 'text-info',
            bg: 'bg-info/10',
            border: 'border-info/20',
          },
        ].map((link, i) => (
          <Card
            key={i}
            hoverable
            onClick={() => {
              if ('to' in link && link.to) {
                navigate({ to: link.to } as any)
              } else if ('href' in link && link.href) {
                window.open(link.href, '_blank')
              }
            }}
            className="p-8 flex flex-col items-center gap-5 text-center group transition-all duration-500"
          >
            <div
              className={`w-16 h-16 rounded-[24px] ${link.bg} flex items-center justify-center ${link.color} shadow-inner group-hover:scale-110 group-hover:rotate-6 transition-all duration-500 border ${link.border}`}
            >
              <link.icon size={32} strokeWidth={2.5} />
            </div>
            <div className="space-y-1">
              <div className="font-black text-[13px] text-text-primary uppercase tracking-widest group-hover:text-primary transition-colors">
                {link.label}
              </div>
              <div className="h-1 w-4 bg-primary/20 mx-auto rounded-full group-hover:w-8 group-hover:bg-primary transition-all" />
            </div>
          </Card>
        ))}
      </div>

      {/* Footer Info */}
      <div className="pt-12 flex flex-col md:flex-row items-center justify-between gap-6 border-t border-border-subtle opacity-60">
        <div className="flex items-center gap-8">
          <a
            href="/terms"
            className="text-[11px] font-black uppercase tracking-[0.2em] hover:text-primary transition-colors text-text-muted"
          >
            Terms
          </a>
          <a
            href="/privacy"
            className="text-[11px] font-black uppercase tracking-[0.2em] hover:text-primary transition-colors text-text-muted"
          >
            Privacy
          </a>
          <a
            href="/support"
            className="text-[11px] font-black uppercase tracking-[0.2em] hover:text-primary transition-colors text-text-muted"
          >
            Support
          </a>
        </div>
        <div className="flex items-center gap-3">
          <Badge
            variant="neutral"
            className="bg-bg-tertiary border-none px-3 py-1 text-[11px] opacity-50"
          >
            v2.4.0-nightly
          </Badge>
          <span className="text-[11px] font-black uppercase tracking-[0.2em] text-text-muted">
            © 2026 SHADOW
          </span>
        </div>
      </div>
    </PageContainer>
  )
}
