import { Link } from '@tanstack/react-router'
import { Code, FileText, Palette, Search, Wrench } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAppStatus } from '../hooks/use-app-status'
import { PublicFooter, PublicNav } from './home'

const agentItems = [
  {
    nameKey: 'agents.codingCat',
    descKey: 'agents.codingCatDesc',
    icon: Code,
    color: 'from-cyan-400 to-blue-400',
    tagKeys: ['agents.tagCodeGen', 'agents.tagCodeReview', 'agents.tagDebug'],
  },
  {
    nameKey: 'agents.docuMeow',
    descKey: 'agents.docuMeowDesc',
    icon: FileText,
    color: 'from-yellow-400 to-orange-400',
    tagKeys: ['agents.tagDocGen', 'agents.tagSummary', 'agents.tagApiDoc'],
  },
  {
    nameKey: 'agents.designCat',
    descKey: 'agents.designCatDesc',
    icon: Palette,
    color: 'from-pink-400 to-rose-400',
    tagKeys: ['agents.tagUiDesign', 'agents.tagColor', 'agents.tagComponent'],
  },
  {
    nameKey: 'agents.detectiveCat',
    descKey: 'agents.detectiveCatDesc',
    icon: Search,
    color: 'from-green-400 to-emerald-400',
    tagKeys: ['agents.tagDebug', 'agents.tagLogAnalysis', 'agents.tagSearch'],
  },
  {
    nameKey: 'agents.opsCat',
    descKey: 'agents.opsCatDesc',
    icon: Wrench,
    color: 'from-purple-400 to-violet-400',
    tagKeys: ['agents.tagDevOps', 'agents.tagMonitor', 'agents.tagDeploy'],
  },
  {
    nameKey: 'agents.customAgent',
    descKey: 'agents.customAgentDesc',
    icon: null,
    color: 'from-gray-500 to-gray-600',
    tagKeys: ['agents.tagCustom', 'agents.tagMcp', 'agents.tagApi'],
  },
]

export function AgentMarketPage() {
  const { t } = useTranslation()
  useAppStatus({ title: t('nav.agents'), variant: 'market' })

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
          {t('agents.pageTitle')}
        </h1>
        <p className="text-lg md:text-xl text-gray-600 font-bold max-w-2xl mx-auto">
          {t('agents.pageSubtitle')}
        </p>
      </section>

      <section className="max-w-6xl mx-auto px-8 md:px-16 pb-24">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {agentItems.map((a) => (
            <div
              key={a.nameKey}
              className="bg-white/70 backdrop-blur-lg border-2 border-white/90 rounded-3xl p-8 hover:-translate-y-2 hover:shadow-xl transition-all group"
            >
              <div
                className={`inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br ${a.color} mb-5`}
              >
                {a.icon ? (
                  <a.icon className="w-7 h-7 text-white" />
                ) : (
                  <img src="/Logo.svg" alt="Buddy" className="w-7 h-7" />
                )}
              </div>
              <h3
                style={{ fontFamily: "'ZCOOL KuaiLe', cursive" }}
                className="text-xl font-bold mb-2"
              >
                {t(a.nameKey)}
              </h3>
              <p className="text-gray-600 font-medium leading-relaxed mb-4">{t(a.descKey)}</p>
              <div className="flex flex-wrap gap-2">
                {a.tagKeys.map((tk) => (
                  <span
                    key={tk}
                    className="bg-gray-100 text-gray-600 text-xs font-bold px-3 py-1 rounded-full"
                  >
                    {t(tk)}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-8 md:px-16 pb-20">
        <div className="bg-gradient-to-r from-yellow-50 to-cyan-50 border-2 border-white/90 rounded-3xl p-10 md:p-14 text-center">
          <h2
            style={{ fontFamily: "'ZCOOL KuaiLe', cursive" }}
            className="text-3xl md:text-4xl mb-4"
          >
            {t('agents.ctaTitle')}
          </h2>
          <p className="text-lg text-gray-600 font-bold mb-8">{t('agents.ctaSubtitle')}</p>
          <Link
            to="/docs"
            className="inline-flex items-center gap-2 bg-gradient-to-r from-yellow-400 to-yellow-500 text-gray-900 font-bold px-10 py-4 rounded-full border-3 border-gray-800 text-xl hover:scale-105 transition-transform"
            style={{ fontFamily: "'ZCOOL KuaiLe', cursive" }}
          >
            {t('agents.ctaButton')}
          </Link>
        </div>
      </section>

      <PublicFooter />
    </div>
  )
}
