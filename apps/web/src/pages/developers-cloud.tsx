/**
 * Developers · Cloud — landing page inside apps/web for the Shadow Cloud
 * creator path. Accessible at /developers/cloud once mounted by main.tsx.
 *
 * Consumer path → `/` (home)
 * Creator path  → `/developers/cloud` (this page) → /cloud (dashboard)
 *
 * All copy must go through i18n. Keys: `developers.cloud.*` (en/zh-CN).
 */
import { Button } from '@shadowob/ui'
import { Link, useNavigate } from '@tanstack/react-router'
import { Activity, Cloud, GitBranch, Rocket, Wallet, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export function DevelopersCloudPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const features = [
    {
      icon: GitBranch,
      title: t('developers.cloud.featureGitTitle'),
      desc: t('developers.cloud.featureGitDesc'),
    },
    {
      icon: Cloud,
      title: t('developers.cloud.featureK8sTitle'),
      desc: t('developers.cloud.featureK8sDesc'),
    },
    {
      icon: Wallet,
      title: t('developers.cloud.featureBillingTitle'),
      desc: t('developers.cloud.featureBillingDesc'),
    },
    {
      icon: Activity,
      title: t('developers.cloud.featureObsTitle'),
      desc: t('developers.cloud.featureObsDesc'),
    },
  ]

  return (
    <div className="min-h-screen bg-bg-base text-text-primary">
      <div className="max-w-5xl mx-auto px-6 py-16">
        {/* Hero */}
        <div className="text-center space-y-6 mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
            <Zap size={12} />
            {t('developers.cloud.heroBadge')}
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
            {t('developers.cloud.heroTitle')}
          </h1>
          <p className="text-lg text-text-secondary max-w-2xl mx-auto">
            {t('developers.cloud.heroSubtitle')}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button variant="primary" size="lg" onClick={() => navigate({ to: '/cloud' })}>
              <Rocket size={16} />
              {t('developers.cloud.ctaOpenConsole')}
            </Button>
            <Link
              to="/shop"
              className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary border border-border-subtle hover:border-border rounded-lg px-5 py-3 transition-colors"
            >
              {t('developers.cloud.ctaBrowseApps')}
            </Link>
          </div>
        </div>

        {/* Feature grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-16">
          {features.map((f) => {
            const Icon = f.icon
            return (
              <div
                key={f.title}
                className="rounded-xl border border-border-subtle bg-bg-secondary/50 p-5"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-3">
                  <Icon size={18} />
                </div>
                <h3 className="text-base font-semibold mb-1">{f.title}</h3>
                <p className="text-sm text-text-muted">{f.desc}</p>
              </div>
            )
          })}
        </div>

        {/* How it works */}
        <div className="rounded-2xl border border-border-subtle bg-bg-secondary/30 p-8 mb-16">
          <h2 className="text-2xl font-semibold mb-6">{t('developers.cloud.howTitle')}</h2>
          <ol className="space-y-4 text-sm">
            <li className="flex gap-4">
              <span className="shrink-0 w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center text-xs font-semibold">
                1
              </span>
              <div>
                <div className="font-medium">{t('developers.cloud.step1Title')}</div>
                <div className="text-text-muted">{t('developers.cloud.step1Desc')}</div>
              </div>
            </li>
            <li className="flex gap-4">
              <span className="shrink-0 w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center text-xs font-semibold">
                2
              </span>
              <div>
                <div className="font-medium">{t('developers.cloud.step2Title')}</div>
                <div className="text-text-muted">{t('developers.cloud.step2Desc')}</div>
              </div>
            </li>
            <li className="flex gap-4">
              <span className="shrink-0 w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center text-xs font-semibold">
                3
              </span>
              <div>
                <div className="font-medium">{t('developers.cloud.step3Title')}</div>
                <div className="text-text-muted">{t('developers.cloud.step3Desc')}</div>
              </div>
            </li>
          </ol>
        </div>

        {/* Pricing note */}
        <div className="rounded-xl border border-primary/25 bg-primary/5 p-6 text-sm">
          <p className="font-medium mb-1">{t('developers.cloud.pricingTitle')}</p>
          <p className="text-text-secondary">{t('developers.cloud.pricingDesc')}</p>
        </div>
      </div>
    </div>
  )
}
