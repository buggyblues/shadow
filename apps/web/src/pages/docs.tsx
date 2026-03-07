import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStatus } from '../hooks/use-app-status'
import { PublicFooter, PublicNav } from './home'

type DocSection = 'guide' | 'channels' | 'agents' | 'faq'

const sectionIds: { id: DocSection; labelKey: string }[] = [
  { id: 'guide', labelKey: 'docs.guide' },
  { id: 'channels', labelKey: 'docs.channels' },
  { id: 'agents', labelKey: 'docs.agentsDoc' },
  { id: 'faq', labelKey: 'docs.faqDoc' },
]

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{ fontFamily: "'ZCOOL KuaiLe', cursive" }}
      className="text-2xl md:text-3xl mb-4 text-gray-800 border-b-2 border-cyan-200 pb-2"
    >
      {children}
    </h2>
  )
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xl font-bold mb-3 text-gray-700 mt-8">{children}</h3>
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-cyan-50 border border-cyan-200 rounded-xl p-4 my-4 text-sm text-cyan-800 flex gap-2">
      <span>💡</span>
      <div>{children}</div>
    </div>
  )
}

function Step({ num, title, children }: { num: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 my-6">
      <div className="shrink-0 w-8 h-8 rounded-full bg-cyan-500 text-white flex items-center justify-center font-bold text-sm">
        {num}
      </div>
      <div className="flex-1">
        <h4 className="font-bold text-gray-800 mb-2">{title}</h4>
        <div className="text-gray-600 leading-relaxed">{children}</div>
      </div>
    </div>
  )
}

/* ---------- Content Sections ---------- */

function GuideContent() {
  const { t } = useTranslation()
  return (
    <div>
      <SectionHeading>{t('docs.guide')}</SectionHeading>
      <p className="text-gray-600 font-medium mb-6 leading-relaxed">{t('docs.guideIntro')}</p>

      <SubHeading>{t('docs.getStarted')}</SubHeading>
      <Step num={1} title={t('docs.step1Title')}>
        <p>{t('docs.step1Desc')}</p>
      </Step>
      <Step num={2} title={t('docs.step2Title')}>
        <p>{t('docs.step2Desc')}</p>
      </Step>
      <Step num={3} title={t('docs.step3Title')}>
        <p>{t('docs.step3Desc')}</p>
      </Step>
      <Step num={4} title={t('docs.step4Title')}>
        <p>{t('docs.step4Desc')}</p>
      </Step>

      <Tip>{t('docs.guideTip')}</Tip>
    </div>
  )
}

function ChannelsContent() {
  const { t } = useTranslation()
  return (
    <div>
      <SectionHeading>{t('docs.channels')}</SectionHeading>
      <p className="text-gray-600 font-medium mb-6 leading-relaxed">{t('docs.channelsIntro')}</p>

      <SubHeading>{t('docs.channelTypes')}</SubHeading>
      <div className="grid gap-4 my-4">
        {['text', 'voice', 'announcement'].map((type) => (
          <div key={type} className="bg-gray-50 rounded-xl p-4 border border-gray-200">
            <p className="font-bold text-gray-800">{t(`docs.channelType_${type}`)}</p>
            <p className="text-gray-600 text-sm mt-1">{t(`docs.channelType_${type}_desc`)}</p>
          </div>
        ))}
      </div>

      <SubHeading>{t('docs.messaging')}</SubHeading>
      <ul className="list-disc pl-6 text-gray-600 space-y-2 my-4">
        <li>{t('docs.msgMarkdown')}</li>
        <li>{t('docs.msgEmoji')}</li>
        <li>{t('docs.msgReply')}</li>
        <li>{t('docs.msgImage')}</li>
        <li>{t('docs.msgEdit')}</li>
      </ul>

      <SubHeading>{t('docs.serverMgmt')}</SubHeading>
      <p className="text-gray-600 leading-relaxed">{t('docs.serverMgmtDesc')}</p>
    </div>
  )
}

function AgentsDocContent() {
  const { t } = useTranslation()
  return (
    <div>
      <SectionHeading>{t('docs.agentsDoc')}</SectionHeading>
      <p className="text-gray-600 font-medium mb-6 leading-relaxed">{t('docs.agentsDocIntro')}</p>

      <SubHeading>{t('docs.whatIsAgent')}</SubHeading>
      <p className="text-gray-600 leading-relaxed mb-4">{t('docs.whatIsAgentDesc')}</p>

      <SubHeading>{t('docs.howToUseAgent')}</SubHeading>
      <ul className="list-disc pl-6 text-gray-600 space-y-2 my-4">
        <li>{t('docs.agentStep1')}</li>
        <li>{t('docs.agentStep2')}</li>
        <li>{t('docs.agentStep3')}</li>
      </ul>

      <SubHeading>{t('docs.availableAgents')}</SubHeading>
      <div className="grid gap-3 my-4">
        {['coding', 'docu', 'design', 'detective', 'ops'].map((a) => (
          <div
            key={a}
            className="bg-gray-50 rounded-xl p-4 border border-gray-200 flex items-start gap-3"
          >
            <span className="text-2xl">
              {a === 'coding'
                ? '🐱'
                : a === 'docu'
                  ? '📝'
                  : a === 'design'
                    ? '🎨'
                    : a === 'detective'
                      ? '🔍'
                      : '⚙️'}
            </span>
            <div>
              <p className="font-bold text-gray-800">{t(`docs.agent_${a}`)}</p>
              <p className="text-gray-600 text-sm">{t(`docs.agent_${a}_desc`)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function FaqContent() {
  const { t } = useTranslation()
  const faqs = [1, 2, 3, 4, 5, 6] as const
  return (
    <div>
      <SectionHeading>{t('docs.faqDoc')}</SectionHeading>
      <div className="space-y-4 my-6">
        {faqs.map((n) => (
          <div key={n} className="bg-gray-50 rounded-xl p-5 border border-gray-200">
            <p className="font-bold text-gray-800 mb-2">Q: {t(`docs.faq${n}q`)}</p>
            <p className="text-gray-600">{t(`docs.faq${n}a`)}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ---------- Main Page ---------- */

export function DocsPage() {
  const [activeSection, setActiveSection] = useState<DocSection>('guide')
  const { t } = useTranslation()
  useAppStatus({ title: t('nav.docs'), variant: 'docs' })

  const contentMap: Record<DocSection, React.ReactNode> = {
    guide: <GuideContent />,
    channels: <ChannelsContent />,
    agents: <AgentsDocContent />,
    faq: <FaqContent />,
  }

  return (
    <div
      className="min-h-screen bg-[#f2f7fc] text-gray-800"
      style={{ fontFamily: "'Nunito', 'ZCOOL KuaiLe', sans-serif" }}
    >
      <PublicNav />

      <div className="pt-24 flex max-w-7xl mx-auto w-full min-h-screen">
        <aside className="hidden md:block w-64 shrink-0 p-6 sticky top-24 self-start">
          <h3
            style={{ fontFamily: "'ZCOOL KuaiLe', cursive" }}
            className="text-lg text-gray-500 mb-4"
          >
            {t('docs.nav')}
          </h3>
          <nav className="space-y-1">
            {sectionIds.map((s) => (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                className={`block w-full text-left px-4 py-2.5 rounded-xl font-bold text-sm transition-all ${
                  activeSection === s.id
                    ? 'bg-cyan-100 text-cyan-700 border-l-4 border-cyan-500'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-800'
                }`}
              >
                {t(s.labelKey)}
              </button>
            ))}
          </nav>
        </aside>

        <div className="md:hidden px-8 pt-4 pb-2 w-full">
          <div className="flex gap-2 overflow-x-auto pb-2">
            {sectionIds.map((s) => (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-bold transition ${
                  activeSection === s.id
                    ? 'bg-cyan-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {t(s.labelKey)}
              </button>
            ))}
          </div>
        </div>

        <main className="flex-1 px-8 md:px-12 py-8 max-w-4xl">{contentMap[activeSection]}</main>
      </div>

      <PublicFooter />
    </div>
  )
}
