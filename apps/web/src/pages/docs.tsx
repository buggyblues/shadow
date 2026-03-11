import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStatus } from '../hooks/use-app-status'
import { PublicFooter, PublicNav } from './home'

type DocSection =
  | 'guide'
  | 'community'
  | 'channels'
  | 'agents'
  | 'shop'
  | 'workspace'
  | 'openclaw'
  | 'faq'

const sectionIds: { id: DocSection; labelKey: string }[] = [
  { id: 'guide', labelKey: 'docs.guide' },
  { id: 'community', labelKey: 'docs.community' },
  { id: 'channels', labelKey: 'docs.channels' },
  { id: 'agents', labelKey: 'docs.agentsDoc' },
  { id: 'shop', labelKey: 'docs.shopDoc' },
  { id: 'workspace', labelKey: 'docs.workspaceDoc' },
  { id: 'openclaw', labelKey: 'docs.openclawDoc' },
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
      <Step num={5} title={t('docs.step5Title')}>
        <p>{t('docs.step5Desc')}</p>
      </Step>

      <Tip>{t('docs.guideTip')}</Tip>

      <SubHeading>{t('docs.guideOverview')}</SubHeading>
      <div className="grid gap-3 my-4">
        {['community', 'buddies', 'shop', 'workspace'].map((item) => (
          <div
            key={item}
            className="bg-gray-50 rounded-xl p-4 border border-gray-200 flex items-start gap-3"
          >
            <span className="text-2xl">
              {item === 'community'
                ? '🏠'
                : item === 'buddies'
                  ? '🤖'
                  : item === 'shop'
                    ? '🛒'
                    : '📁'}
            </span>
            <div>
              <p className="font-bold text-gray-800">{t(`docs.guideOverview_${item}`)}</p>
              <p className="text-gray-600 text-sm">{t(`docs.guideOverview_${item}_desc`)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function CommunityContent() {
  const { t } = useTranslation()
  return (
    <div>
      <SectionHeading>{t('docs.community')}</SectionHeading>
      <p className="text-gray-600 font-medium mb-6 leading-relaxed">{t('docs.communityIntro')}</p>

      <SubHeading>{t('docs.communityCreate')}</SubHeading>
      <Step num={1} title={t('docs.communityCreate1Title')}>
        <p>{t('docs.communityCreate1Desc')}</p>
      </Step>
      <Step num={2} title={t('docs.communityCreate2Title')}>
        <p>{t('docs.communityCreate2Desc')}</p>
      </Step>
      <Step num={3} title={t('docs.communityCreate3Title')}>
        <p>{t('docs.communityCreate3Desc')}</p>
      </Step>

      <SubHeading>{t('docs.communityJoin')}</SubHeading>
      <ul className="list-disc pl-6 text-gray-600 space-y-2 my-4">
        <li>{t('docs.communityJoin1')}</li>
        <li>{t('docs.communityJoin2')}</li>
        <li>{t('docs.communityJoin3')}</li>
      </ul>

      <SubHeading>{t('docs.communityRoles')}</SubHeading>
      <div className="grid gap-3 my-4">
        {['owner', 'admin', 'member'].map((role) => (
          <div
            key={role}
            className="bg-gray-50 rounded-xl p-4 border border-gray-200 flex items-start gap-3"
          >
            <span className="text-xl">
              {role === 'owner' ? '👑' : role === 'admin' ? '🛡️' : '👤'}
            </span>
            <div>
              <p className="font-bold text-gray-800">{t(`docs.communityRole_${role}`)}</p>
              <p className="text-gray-600 text-sm">{t(`docs.communityRole_${role}_desc`)}</p>
            </div>
          </div>
        ))}
      </div>

      <SubHeading>{t('docs.communityInvite')}</SubHeading>
      <p className="text-gray-600 leading-relaxed">{t('docs.communityInviteDesc')}</p>

      <Tip>{t('docs.communityTip')}</Tip>
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

function ShopContent() {
  const { t } = useTranslation()
  return (
    <div>
      <SectionHeading>{t('docs.shopDoc')}</SectionHeading>
      <p className="text-gray-600 font-medium mb-6 leading-relaxed">{t('docs.shopIntro')}</p>

      <SubHeading>{t('docs.shopBuyer')}</SubHeading>
      <Step num={1} title={t('docs.shopBuyer1Title')}>
        <p>{t('docs.shopBuyer1Desc')}</p>
      </Step>
      <Step num={2} title={t('docs.shopBuyer2Title')}>
        <p>{t('docs.shopBuyer2Desc')}</p>
      </Step>
      <Step num={3} title={t('docs.shopBuyer3Title')}>
        <p>{t('docs.shopBuyer3Desc')}</p>
      </Step>
      <Step num={4} title={t('docs.shopBuyer4Title')}>
        <p>{t('docs.shopBuyer4Desc')}</p>
      </Step>

      <SubHeading>{t('docs.shopSeller')}</SubHeading>
      <Step num={1} title={t('docs.shopSeller1Title')}>
        <p>{t('docs.shopSeller1Desc')}</p>
      </Step>
      <Step num={2} title={t('docs.shopSeller2Title')}>
        <p>{t('docs.shopSeller2Desc')}</p>
      </Step>
      <Step num={3} title={t('docs.shopSeller3Title')}>
        <p>{t('docs.shopSeller3Desc')}</p>
      </Step>

      <SubHeading>{t('docs.shopProductTypes')}</SubHeading>
      <div className="grid gap-3 my-4">
        {['physical', 'entitlement'].map((type) => (
          <div
            key={type}
            className="bg-gray-50 rounded-xl p-4 border border-gray-200 flex items-start gap-3"
          >
            <span className="text-xl">{type === 'physical' ? '📦' : '🎫'}</span>
            <div>
              <p className="font-bold text-gray-800">{t(`docs.shopProductType_${type}`)}</p>
              <p className="text-gray-600 text-sm">{t(`docs.shopProductType_${type}_desc`)}</p>
            </div>
          </div>
        ))}
      </div>

      <SubHeading>{t('docs.shopWallet')}</SubHeading>
      <p className="text-gray-600 leading-relaxed mb-4">{t('docs.shopWalletDesc')}</p>

      <SubHeading>{t('docs.shopReviews')}</SubHeading>
      <p className="text-gray-600 leading-relaxed">{t('docs.shopReviewsDesc')}</p>

      <Tip>{t('docs.shopTip')}</Tip>
    </div>
  )
}

function WorkspaceContent() {
  const { t } = useTranslation()
  return (
    <div>
      <SectionHeading>{t('docs.workspaceDoc')}</SectionHeading>
      <p className="text-gray-600 font-medium mb-6 leading-relaxed">{t('docs.workspaceIntro')}</p>

      <SubHeading>{t('docs.workspaceFeatures')}</SubHeading>
      <div className="grid gap-3 my-4">
        {['fileTree', 'upload', 'preview', 'clipboard', 'search'].map((feat) => (
          <div
            key={feat}
            className="bg-gray-50 rounded-xl p-4 border border-gray-200 flex items-start gap-3"
          >
            <span className="text-green-500 mt-0.5">✅</span>
            <div>
              <p className="font-bold text-gray-800">{t(`docs.workspaceFeat_${feat}`)}</p>
              <p className="text-gray-600 text-sm">{t(`docs.workspaceFeat_${feat}_desc`)}</p>
            </div>
          </div>
        ))}
      </div>

      <SubHeading>{t('docs.workspaceFormats')}</SubHeading>
      <p className="text-gray-600 leading-relaxed mb-4">{t('docs.workspaceFormatsDesc')}</p>
      <div className="flex flex-wrap gap-2 my-4">
        {['image', 'video', 'audio', 'pdf', 'markdown', 'code', 'spreadsheet'].map((fmt) => (
          <span
            key={fmt}
            className="px-3 py-1 bg-cyan-50 text-cyan-700 rounded-full text-xs font-bold border border-cyan-200"
          >
            {t(`docs.workspaceFmt_${fmt}`)}
          </span>
        ))}
      </div>

      <SubHeading>{t('docs.workspaceChatIntegration')}</SubHeading>
      <p className="text-gray-600 leading-relaxed">{t('docs.workspaceChatIntegrationDesc')}</p>

      <Tip>{t('docs.workspaceTip')}</Tip>
    </div>
  )
}

function OpenClawContent() {
  const { t } = useTranslation()
  return (
    <div>
      <SectionHeading>{t('docs.openclawDoc')}</SectionHeading>
      <p className="text-gray-600 font-medium mb-6 leading-relaxed">{t('docs.openclawIntro')}</p>

      <SubHeading>{t('docs.openclawWhat')}</SubHeading>
      <p className="text-gray-600 leading-relaxed mb-4">{t('docs.openclawWhatDesc')}</p>

      <SubHeading>{t('docs.openclawInstall')}</SubHeading>
      <Step num={1} title={t('docs.openclawStep1Title')}>
        <p>{t('docs.openclawStep1Desc')}</p>
        <div className="bg-gray-900 text-green-400 rounded-lg p-4 mt-2 font-mono text-sm overflow-x-auto">
          <div>openclaw plugins install @shadowob/openclaw</div>
        </div>
      </Step>
      <Step num={2} title={t('docs.openclawStep2Title')}>
        <p>{t('docs.openclawStep2Desc')}</p>
        <div className="bg-gray-900 text-green-400 rounded-lg p-4 mt-2 font-mono text-sm overflow-x-auto">
          <div>openclaw plugins list</div>
        </div>
      </Step>

      <SubHeading>{t('docs.openclawConfig')}</SubHeading>
      <p className="text-gray-600 leading-relaxed mb-4">{t('docs.openclawConfigDesc')}</p>
      <div className="bg-gray-900 text-green-400 rounded-lg p-4 mt-2 font-mono text-sm overflow-x-auto whitespace-pre">
        {`{
  "channels": {
    "shadowob": {
      "token": "<agent-jwt-token>",
      "serverUrl": "https://shadowob.com"
    }
  }
}`}
      </div>

      <SubHeading>{t('docs.openclawToken')}</SubHeading>
      <Step num={1} title={t('docs.openclawTokenStep1')}>
        <p>{t('docs.openclawTokenStep1Desc')}</p>
      </Step>
      <Step num={2} title={t('docs.openclawTokenStep2')}>
        <p>{t('docs.openclawTokenStep2Desc')}</p>
      </Step>
      <Step num={3} title={t('docs.openclawTokenStep3')}>
        <p>{t('docs.openclawTokenStep3Desc')}</p>
      </Step>

      <SubHeading>{t('docs.openclawCapabilities')}</SubHeading>
      <div className="grid gap-3 my-4">
        {['messaging', 'threads', 'reactions', 'media', 'mentions', 'editDelete'].map((cap) => (
          <div
            key={cap}
            className="bg-gray-50 rounded-xl p-4 border border-gray-200 flex items-start gap-3"
          >
            <span className="text-green-500 mt-0.5">✅</span>
            <div>
              <p className="font-bold text-gray-800">{t(`docs.openclawCap_${cap}`)}</p>
              <p className="text-gray-600 text-sm">{t(`docs.openclawCap_${cap}_desc`)}</p>
            </div>
          </div>
        ))}
      </div>

      <Tip>{t('docs.openclawTip')}</Tip>
    </div>
  )
}

function FaqContent() {
  const { t } = useTranslation()
  const faqs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const
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
    community: <CommunityContent />,
    channels: <ChannelsContent />,
    agents: <AgentsDocContent />,
    shop: <ShopContent />,
    workspace: <WorkspaceContent />,
    openclaw: <OpenClawContent />,
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
