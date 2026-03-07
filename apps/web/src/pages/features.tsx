import { Link } from '@tanstack/react-router'
import { Globe, Layers, MessageSquare, Shield, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAppStatus } from '../hooks/use-app-status'
import { PublicFooter, PublicNav } from './home'

const featureItems = [
  {
    icon: MessageSquare,
    titleKey: 'features.channelComm',
    descKey: 'features.channelCommDesc',
    color: 'text-cyan-500',
    bg: 'bg-cyan-50',
  },
  {
    icon: null,
    titleKey: 'features.multiAgent',
    descKey: 'features.multiAgentDesc',
    color: 'text-yellow-500',
    bg: 'bg-yellow-50',
  },
  {
    icon: Layers,
    titleKey: 'features.unifiedWorkspace',
    descKey: 'features.unifiedWorkspaceDesc',
    color: 'text-pink-500',
    bg: 'bg-pink-50',
  },
  {
    icon: Shield,
    titleKey: 'features.permissions',
    descKey: 'features.permissionsDesc',
    color: 'text-green-500',
    bg: 'bg-green-50',
  },
  {
    icon: Zap,
    titleKey: 'features.realtime',
    descKey: 'features.realtimeDesc',
    color: 'text-orange-500',
    bg: 'bg-orange-50',
  },
  {
    icon: Globe,
    titleKey: 'features.i18n',
    descKey: 'features.i18nDesc',
    color: 'text-indigo-500',
    bg: 'bg-indigo-50',
  },
]

export function FeaturesPage() {
  const { t } = useTranslation()
  useAppStatus({ title: t('nav.features'), variant: 'default' })

  return (
    <div
      className="min-h-screen bg-[#f2f7fc] text-gray-800"
      style={{ fontFamily: "'Nunito', 'ZCOOL KuaiLe', sans-serif" }}
    >
      <PublicNav />

      <section className="pt-32 pb-16 px-8 md:px-16 max-w-6xl mx-auto text-center">
        <h1
          style={{ fontFamily: "'ZCOOL KuaiLe', cursive" }}
          className="text-4xl md:text-6xl mb-6 leading-tight"
        >
          {t('features.pageTitle')}
        </h1>
        <p className="text-lg md:text-xl text-gray-600 font-bold max-w-2xl mx-auto">
          {t('features.pageSubtitle')}
        </p>
      </section>

      <section className="max-w-6xl mx-auto px-8 md:px-16 pb-24">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {featureItems.map((f) => (
            <div
              key={f.titleKey}
              className="bg-white/70 backdrop-blur-lg border-2 border-white/90 rounded-3xl p-8 hover:-translate-y-2 hover:shadow-xl transition-all group"
            >
              <div
                className={`inline-flex items-center justify-center w-14 h-14 rounded-2xl ${f.bg} mb-5`}
              >
                {f.icon ? (
                  <f.icon className={`w-7 h-7 ${f.color}`} />
                ) : (
                  <img src="/Logo.svg" alt="Buddy" className="w-7 h-7" />
                )}
              </div>
              <h3
                style={{ fontFamily: "'ZCOOL KuaiLe', cursive" }}
                className="text-2xl font-bold mb-3"
              >
                {t(f.titleKey)}
              </h3>
              <p className="text-gray-600 font-medium leading-relaxed">{t(f.descKey)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-8 md:px-16 pb-20">
        <div className="bg-gradient-to-r from-cyan-50 to-yellow-50 border-2 border-white/90 rounded-3xl p-10 md:p-14 text-center">
          <h2
            style={{ fontFamily: "'ZCOOL KuaiLe', cursive" }}
            className="text-3xl md:text-4xl mb-4"
          >
            {t('features.ctaTitle')}
          </h2>
          <p className="text-lg text-gray-600 font-bold mb-8">{t('features.ctaSubtitle')}</p>
          <Link
            to="/register"
            className="inline-flex items-center gap-2 bg-gradient-to-r from-cyan-400 to-cyan-500 text-gray-900 font-bold px-10 py-4 rounded-full border-3 border-gray-800 text-xl hover:scale-105 transition-transform"
            style={{ fontFamily: "'ZCOOL KuaiLe', cursive" }}
          >
            {t('features.ctaButton')}
          </Link>
        </div>
      </section>

      <PublicFooter />
    </div>
  )
}
