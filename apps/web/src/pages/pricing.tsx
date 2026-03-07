import { Link } from '@tanstack/react-router'
import { Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAppStatus } from '../hooks/use-app-status'
import { PublicFooter, PublicNav } from './home'

const planDefs = [
  {
    nameKey: 'pricing.free',
    nameEnKey: 'pricing.freeEn',
    priceKey: 'pricing.freePrice',
    descKey: 'pricing.freeDesc',
    color: 'border-gray-200',
    btn: 'bg-gray-800 text-white hover:bg-gray-700',
    featureKeys: [
      'pricing.feat_servers3',
      'pricing.feat_channels10',
      'pricing.feat_agentBasic',
      'pricing.feat_storage5',
      'pricing.feat_history7',
      'pricing.feat_community',
    ],
  },
  {
    nameKey: 'pricing.pro',
    nameEnKey: 'pricing.proEn',
    priceKey: 'pricing.proPrice',
    descKey: 'pricing.proDesc',
    popular: true,
    color: 'border-cyan-400',
    btn: 'bg-gradient-to-r from-cyan-400 to-cyan-500 text-gray-900 hover:scale-105',
    featureKeys: [
      'pricing.feat_unlimitedServers',
      'pricing.feat_unlimitedAgent',
      'pricing.feat_storage50',
      'pricing.feat_fullHistory',
      'pricing.feat_advancedPerms',
      'pricing.feat_customAgent',
      'pricing.feat_prioritySupport',
    ],
  },
  {
    nameKey: 'pricing.enterprise',
    nameEnKey: 'pricing.enterpriseEn',
    priceKey: 'pricing.enterprisePrice',
    descKey: 'pricing.enterpriseDesc',
    color: 'border-yellow-400',
    btn: 'bg-gradient-to-r from-yellow-400 to-yellow-500 text-gray-900 hover:scale-105',
    featureKeys: [
      'pricing.feat_allPro',
      'pricing.feat_privateDeploy',
      'pricing.feat_unlimitedStorage',
      'pricing.feat_sso',
      'pricing.feat_sla',
      'pricing.feat_dedicatedManager',
      'pricing.feat_customDev',
      'pricing.feat_auditLog',
    ],
  },
]

const faqKeys = [
  { q: 'pricing.faq1q', a: 'pricing.faq1a' },
  { q: 'pricing.faq2q', a: 'pricing.faq2a' },
  { q: 'pricing.faq3q', a: 'pricing.faq3a' },
  { q: 'pricing.faq4q', a: 'pricing.faq4a' },
]

export function PricingPage() {
  const { t } = useTranslation()
  useAppStatus({ title: t('nav.pricing'), variant: 'pricing' })

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
          {t('pricing.pageTitle')}
        </h1>
        <p className="text-lg md:text-xl text-gray-600 font-bold max-w-2xl mx-auto">
          {t('pricing.pageSubtitle')}
        </p>
      </section>

      <section className="max-w-6xl mx-auto px-8 md:px-16 pb-24">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
          {planDefs.map((p) => (
            <div
              key={p.nameKey}
              className={`bg-white/70 backdrop-blur-lg border-3 ${p.color} rounded-3xl p-8 relative hover:-translate-y-2 hover:shadow-xl transition-all ${p.popular ? 'md:-mt-4 md:mb-4 shadow-lg' : ''}`}
            >
              {p.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-cyan-500 text-white text-sm font-bold px-4 py-1 rounded-full">
                  {t('pricing.mostPopular')}
                </div>
              )}
              <div className="text-center mb-6">
                <h3
                  style={{ fontFamily: "'ZCOOL KuaiLe', cursive" }}
                  className="text-2xl font-bold mb-1"
                >
                  {t(p.nameKey)}
                </h3>
                <p className="text-sm text-gray-500 font-bold mb-4">{t(p.nameEnKey)}</p>
                <div className="flex items-baseline justify-center gap-1">
                  <span
                    style={{ fontFamily: "'ZCOOL KuaiLe', cursive" }}
                    className="text-4xl font-bold"
                  >
                    {t(p.priceKey)}
                  </span>
                  {p.priceKey !== 'pricing.enterprisePrice' && (
                    <span className="text-gray-500 font-bold">{t('pricing.perMonth')}</span>
                  )}
                </div>
                <p className="text-sm text-gray-500 font-medium mt-2">{t(p.descKey)}</p>
              </div>
              <ul className="space-y-3 mb-8">
                {p.featureKeys.map((fk) => (
                  <li key={fk} className="flex items-start gap-2">
                    <Check className="w-5 h-5 text-cyan-500 shrink-0 mt-0.5" />
                    <span className="text-gray-700 font-medium text-sm">{t(fk)}</span>
                  </li>
                ))}
              </ul>
              <Link
                to="/register"
                className={`block text-center font-bold py-3 rounded-full border-2 border-gray-800 transition-all ${p.btn}`}
                style={{ fontFamily: "'ZCOOL KuaiLe', cursive", textDecoration: 'none' }}
              >
                {p.priceKey === 'pricing.enterprisePrice'
                  ? t('pricing.contactUs')
                  : t('pricing.startFree')}
              </Link>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-8 md:px-16 pb-20">
        <h2
          style={{ fontFamily: "'ZCOOL KuaiLe', cursive" }}
          className="text-3xl text-center mb-10"
        >
          {t('pricing.faqTitle')}
        </h2>
        <div className="space-y-4">
          {faqKeys.map((item) => (
            <div
              key={item.q}
              className="bg-white/70 backdrop-blur-lg border-2 border-white/90 rounded-2xl p-6"
            >
              <h4 className="font-bold text-gray-800 mb-2">{t(item.q)}</h4>
              <p className="text-gray-600 font-medium text-sm">{t(item.a)}</p>
            </div>
          ))}
        </div>
      </section>

      <PublicFooter />
    </div>
  )
}
