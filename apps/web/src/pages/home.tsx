import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { UserAvatar } from '../components/common/avatar'
import { LanguageSwitcher } from '../components/common/language-switcher'

import { useAppStatus } from '../hooks/use-app-status'
import { BRAND_EN } from '../lib/brand'
import { useAuthStore } from '../stores/auth.store'

/* Shared nav component for public pages */
export function PublicNav() {
  const { t } = useTranslation()
  const { isAuthenticated, user } = useAuthStore()
  return (
    <nav className="glass-nav fixed w-full top-0 z-50 py-4 px-8 md:px-16 flex justify-between items-center transition-all bg-white/70 backdrop-blur-xl border-b border-border-dim shadow-sm">
      <Link to="/" className="flex items-center gap-3 cursor-pointer hover:scale-105 transition">
        <img src="/Logo.svg" alt="Shadow Logo" className="w-10 h-10" />
        <span className="zcool text-2xl font-bold tracking-wider text-gray-800">
          虾豆<span className="text-lg text-cyan-600 ml-1 font-sans font-black">{BRAND_EN}</span>
        </span>
      </Link>
      <div className="hidden md:flex gap-8 text-base font-bold">
        <Link
          to="/features"
          className="hover:text-cyan-600 transition border-b-2 border-transparent hover:border-cyan-500 py-1"
        >
          {t('nav.features')}
        </Link>
        <Link
          to="/buddies"
          className="hover:text-cyan-600 transition border-b-2 border-transparent hover:border-cyan-500 py-1"
        >
          {t('nav.agents')}
        </Link>
        <Link
          to="/pricing"
          className="hover:text-cyan-600 transition border-b-2 border-transparent hover:border-cyan-500 py-1"
        >
          {t('nav.pricing')}
        </Link>
        <Link
          to="/docs"
          className="hover:text-cyan-600 transition border-b-2 border-transparent hover:border-cyan-500 py-1"
        >
          {t('nav.docs')}
        </Link>
      </div>
      <div className="flex items-center gap-3">
        <LanguageSwitcher compact />
        {isAuthenticated && user ? (
          <Link to="/app" className="hover:scale-105 transition-transform">
            <UserAvatar
              userId={user.id}
              avatarUrl={user.avatarUrl}
              displayName={user.displayName ?? undefined}
              size="sm"
            />
          </Link>
        ) : (
          <>
            <Link
              to="/login"
              className="text-base font-bold px-4 py-2 hover:text-cyan-600 transition hidden md:block"
            >
              {t('nav.login')}
            </Link>
            <Link
              to="/register"
              className="btn-primary zcool text-lg px-6 py-2 hover:scale-105 transition-transform duration-300 shadow-lg hover:shadow-cyan-500/30"
            >
              {t('nav.launch')}
            </Link>
          </>
        )}
      </div>
    </nav>
  )
}

/* Shared footer for public pages */
export function PublicFooter() {
  const { t } = useTranslation()
  return (
    <footer className="py-8 text-center bg-white/75 backdrop-blur-xl border-t-2 border-white/90">
      <div className="flex justify-center items-center gap-2 mb-2">
        <img src="/Logo.svg" className="w-6 h-6 opacity-70" alt="Shadow" />
        <span
          style={{ fontFamily: "'ZCOOL KuaiLe', cursive" }}
          className="text-lg text-gray-500 font-bold"
        >
          {t('common.brandLegal', { defaultValue: t('common.brandFull') })}
        </span>
      </div>
      <p className="text-sm text-gray-400 font-bold">{t('common.poweredBy')}</p>
    </footer>
  )
}

/* Small inline SVG icons to replace emoji on the homepage */
function SparkleIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`inline-block ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <title>Sparkle icon</title>
      <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
    </svg>
  )
}

function ChatIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`inline-block ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <title>Chat icon</title>
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  )
}

function BuddyIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`inline-block ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <title>Buddy icon</title>
      <path d="M6 10c-1.1-2.8-1-5.2.8-6.1 1.8-.9 3.8.7 5.2 3.1" />
      <path d="M18 10c1.1-2.8 1-5.2-.8-6.1-1.8-.9-3.8.7-5.2 3.1" />
      <ellipse cx="12" cy="14" rx="8" ry="6.5" />
      <circle cx="9.2" cy="13.5" r="0.8" fill="currentColor" />
      <circle cx="14.8" cy="13.5" r="0.8" fill="currentColor" />
      <path d="M11.4 16.3c.5.5 1.3.5 1.8 0" />
    </svg>
  )
}

function BoltIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`inline-block ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <title>Bolt icon</title>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  )
}

function RocketIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`inline-block ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <title>Rocket icon</title>
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09z" />
      <path d="M12 15l-3-3a22 22 0 012-3.95A12.88 12.88 0 0122 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 01-4 2z" />
    </svg>
  )
}

function PawIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`inline-block ${className}`} fill="currentColor">
      <title>Paw icon</title>
      <ellipse cx="8" cy="7" rx="2.5" ry="3" />
      <ellipse cx="16" cy="7" rx="2.5" ry="3" />
      <ellipse cx="4.5" cy="13" rx="2" ry="2.5" />
      <ellipse cx="19.5" cy="13" rx="2" ry="2.5" />
      <path d="M12 22c-3 0-5.5-2.5-5.5-5.5S9 11 12 11s5.5 2.5 5.5 5.5S15 22 12 22z" />
    </svg>
  )
}

function BookIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`inline-block ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <title>Book icon</title>
      <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" />
      <path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" />
    </svg>
  )
}

export function HomePage() {
  const { t } = useTranslation()
  useAppStatus({ title: t('home.heroTitle2'), variant: 'default' })

  return (
    <div
      className="relative min-h-screen flex flex-col"
      style={{
        fontFamily: "'Nunito', 'ZCOOL KuaiLe', sans-serif",
        backgroundColor: '#f2f7fc',
        backgroundImage: 'radial-gradient(#c2d2ea 3px, transparent 3px)',
        backgroundSize: '40px 40px',
        overflowX: 'hidden',
        color: '#2d3748',
      }}
    >
      {/* SVG Defs */}
      <svg width="0" height="0" className="hidden">
        <defs>
          <radialGradient id="catBody" cx="50%" cy="35%" r="70%">
            <stop offset="0%" stopColor="#5a5a5e" />
            <stop offset="50%" stopColor="#3d3d40" />
            <stop offset="100%" stopColor="#18181a" />
          </radialGradient>
          <radialGradient id="eyeYellow" cx="35%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#ffffcc" />
            <stop offset="35%" stopColor="#f8e71c" />
            <stop offset="100%" stopColor="#b3a100" />
          </radialGradient>
          <radialGradient id="eyeCyan" cx="35%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#ccffff" />
            <stop offset="35%" stopColor="#00f3ff" />
            <stop offset="100%" stopColor="#0099aa" />
          </radialGradient>
        </defs>
      </svg>

      {/* Background Blobs */}
      <div className="hero-blob bg-cyan-300 w-96 h-96 top-20 left-10" />
      <div className="hero-blob bg-yellow-200 w-80 h-80 top-40 right-20" />
      <div className="hero-blob bg-cyan-200 w-96 h-96 bottom-20 left-1/3" />

      {/* Navigation */}
      <PublicNav />

      {/* Hero Section */}
      <main className="flex-grow pt-28 pb-20 px-8 md:px-16 flex flex-col md:flex-row items-center justify-between max-w-7xl mx-auto w-full gap-16">
        <div className="md:w-1/2 flex flex-col gap-5 relative z-10">
          <div className="bg-white/80 border-2 border-gray-800 text-gray-800 font-bold px-4 py-1.5 rounded-full inline-flex items-center gap-1.5 w-max mb-2 -rotate-2">
            <SparkleIcon className="w-4 h-4 text-yellow-500" /> {t('home.heroBadge')}
          </div>
          <h1 className="zcool text-5xl md:text-7xl leading-tight">
            {t('home.heroTitle1')}
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-500 to-cyan-400">
              {t('home.heroTitle2')}
            </span>
          </h1>
          <p className="text-lg md:text-xl font-bold text-gray-600 bg-white/50 p-3 rounded-xl border-l-4 border-yellow-400">
            {t('home.heroDesc')}
          </p>
          <div className="flex flex-wrap gap-4 mt-4">
            <Link
              to="/register"
              className="btn-primary zcool text-xl px-7 py-3.5 flex items-center gap-2 hover:scale-105 transition-all duration-300 shadow-lg hover:shadow-cyan-500/30 group"
            >
              {t('home.createWorkspace')}{' '}
              <PawIcon className="w-5 h-5 group-hover:rotate-12 transition-transform" />
            </Link>
            <Link
              to="/docs"
              className="btn-secondary zcool text-xl px-7 py-3.5 flex items-center gap-2 hover:scale-105 transition-all duration-300 shadow-md hover:shadow-gray-400/20 group"
            >
              {t('home.viewDocs')}{' '}
              <BookIcon className="w-5 h-5 group-hover:-rotate-12 transition-transform" />
            </Link>
          </div>
        </div>

        <div className="md:w-1/2 relative flex justify-center float z-10 group overflow-visible">
          <img
            src="/hero-halo.svg"
            alt=""
            aria-hidden="true"
            className="absolute -z-10 w-[520px] h-[520px] md:w-[620px] md:h-[620px] object-contain opacity-90 pointer-events-none"
          />
          <img
            src="/Logo.svg"
            alt="Shadow Hero Cat"
            className="w-[320px] h-[320px] md:w-[380px] md:h-[380px] drop-shadow-2xl transition-transform duration-700 group-hover:scale-105"
          />
          <div className="absolute top-6 -left-4 md:-left-8 bg-white border-3 border-gray-800 rounded-2xl px-4 py-3 shadow-xl -rotate-6 float-delay-1 zcool text-lg flex items-center gap-2 transition-transform hover:scale-110 cursor-default">
            <ChatIcon className="w-5 h-5 text-cyan-500" /> {t('home.floatChat')}
          </div>
          <div className="absolute top-36 -right-4 md:-right-8 bg-white border-3 border-gray-800 rounded-2xl px-4 py-3 shadow-xl rotate-12 float-delay-2 zcool text-lg flex items-center gap-2 transition-transform hover:scale-110 cursor-default flex-row-reverse">
            <BuddyIcon className="w-5 h-5 text-yellow-500" /> {t('home.floatAgent')}
          </div>
          <div className="absolute bottom-8 left-4 md:left-8 bg-white border-3 border-gray-800 rounded-2xl px-4 py-3 shadow-xl rotate-3 float-delay-3 zcool text-lg flex items-center gap-2 transition-transform hover:scale-110 cursor-default">
            <BoltIcon className="w-5 h-5 text-cyan-500" /> {t('home.floatSync')}
          </div>
        </div>
      </main>

      {/* Features Section */}
      <section id="features" className="max-w-7xl mx-auto w-full px-8 md:px-16 py-20 relative z-10">
        <div className="text-center mb-16">
          <h2 className="zcool text-4xl md:text-5xl mb-4">
            {t('home.featuresTitle')} <span className="text-cyan-500">{t('common.brandName')}</span>
            ？
          </h2>
          <p className="text-xl font-bold text-gray-500">{t('home.featuresSubtitle')}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Feature 1: Multi-Agent */}
          <div className="glass-card p-8 flex flex-col items-center text-center group hover:-translate-y-2 transition-all duration-300 shadow-sm hover:shadow-xl cursor-default">
            <div className="w-40 h-40 mb-6 float relative group-hover:scale-110 transition-transform duration-500">
              <AgentCatSvg />
            </div>
            <h3 className="zcool text-2xl font-bold mb-3 text-gray-800">
              {t('home.featureAgent')}
            </h3>
            <p className="text-base font-bold text-gray-600 leading-relaxed">
              {t('home.featureAgentDesc')}
            </p>
          </div>

          {/* Feature 2: Workspace */}
          <div className="glass-card p-8 flex flex-col items-center text-center group hover:-translate-y-2 transition-all duration-300 shadow-sm hover:shadow-xl cursor-default">
            <div className="w-40 h-40 mb-6 float-delay-1 relative group-hover:scale-110 transition-transform duration-500">
              <WorkCatSvg />
            </div>
            <h3 className="zcool text-2xl font-bold mb-3 text-gray-800">
              {t('home.featureWorkspace')}
            </h3>
            <p className="text-base font-bold text-gray-600 leading-relaxed">
              {t('home.featureWorkspaceDesc')}
            </p>
          </div>

          {/* Feature 3: Unified Channels */}
          <div className="glass-card p-8 flex flex-col items-center text-center group hover:-translate-y-2 transition-all duration-300 shadow-sm hover:shadow-xl cursor-default">
            <div className="w-40 h-40 mb-6 float-delay-2 relative group-hover:scale-110 transition-transform duration-500">
              <ChannelCatSvg />
            </div>
            <h3 className="zcool text-2xl font-bold mb-3 text-gray-800">
              {t('home.featureChannel')}
            </h3>
            <p className="text-base font-bold text-gray-600 leading-relaxed">
              {t('home.featureChannelDesc')}
            </p>
          </div>
        </div>
      </section>

      {/* P2P Rental Highlight */}
      <section className="max-w-5xl mx-auto w-full px-8 md:px-16 py-12 relative z-10">
        <div className="glass-card bg-gradient-to-r from-amber-50 to-yellow-50 p-10 md:p-14 rounded-[36px] overflow-hidden shadow-xl hover:shadow-amber-500/10 transition-all duration-500">
          <div className="flex flex-col md:flex-row items-center gap-8">
            <div className="text-7xl md:text-8xl shrink-0">🤝</div>
            <div>
              <h3 className="zcool text-3xl md:text-4xl font-bold mb-4 text-gray-800">
                {t('home.featureP2pRental', 'P2P Claw 租赁')}
              </h3>
              <p className="text-base md:text-lg font-bold text-gray-600 leading-relaxed mb-4">
                {t(
                  'home.featureP2pRentalDesc',
                  '闲置的 OpenClaw 也能赚虾币！将你的 Buddy 挂到集市出租给有需要的人，智能合约保护双方权益，一键签约、按时计费、自动结算。不用的时候让别人用，用的时候租别人的——共享经济，猫猫也懂！',
                )}
              </p>
              <Link
                to="/buddies"
                className="inline-flex items-center gap-2 zcool text-lg font-bold text-amber-600 hover:text-amber-700 transition-colors"
              >
                {t('home.featureP2pRentalCta', '逛逛 Buddy 集市 →')}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Banner */}
      <section id="cta" className="max-w-5xl mx-auto w-full px-8 md:px-16 py-12 mb-20">
        <div className="glass-card bg-gradient-to-r from-cyan-50 to-yellow-50 p-10 md:p-12 text-center rounded-[36px] relative overflow-hidden shadow-2xl transition-all duration-500 hover:shadow-cyan-500/20">
          <h2 className="zcool text-3xl md:text-4xl mb-5">{t('home.ctaTitle')}</h2>
          <p className="text-lg md:text-xl font-bold text-gray-600 mb-8">{t('home.ctaSubtitle')}</p>
          <Link
            to="/register"
            className="btn-primary zcool text-2xl px-10 py-4 inline-flex items-center gap-2 hover:-translate-y-1 hover:scale-105 transition-all duration-300 shadow-xl hover:shadow-cyan-400/40 group"
          >
            {t('home.ctaButton')}{' '}
            <RocketIcon className="w-6 h-6 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
          </Link>
          <div className="absolute -bottom-10 -right-10 opacity-20 w-48 h-48 pointer-events-none transition-transform duration-700 hover:scale-110">
            <img src="/Logo.svg" alt="Faded Logo background" />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="glass-nav mt-auto py-8 text-center border-t-2 border-border-subtle0 relative z-10 w-full">
        <div className="flex justify-center items-center gap-2 mb-3">
          <img src="/Logo.svg" className="w-7 h-7 opacity-80" alt="Shadow cat" />
          <span className="zcool text-xl font-bold text-gray-500">
            {t('common.brandLegal', { defaultValue: t('common.brandFull') })}
          </span>
        </div>
        <p className="text-sm font-bold text-gray-400">{t('common.poweredBy')}</p>
      </footer>

      <style>{`
        .zcool {
          font-family: 'ZCOOL KuaiLe', cursive, sans-serif;
        }
        .glass-nav {
          background: rgba(255, 255, 255, 0.75);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border-bottom: 2px solid rgba(255, 255, 255, 0.9);
        }
        .glass-card {
          background: rgba(255, 255, 255, 0.65);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 3px solid rgba(255, 255, 255, 0.9);
          border-radius: 36px;
          box-shadow: 0 12px 40px rgba(31, 41, 55, 0.08);
          transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
        }
        .glass-card:hover {
          transform: translateY(-10px);
          box-shadow: 0 20px 50px rgba(31, 41, 55, 0.12);
          border-color: #00f3ff;
        }
        .btn-primary {
          background: linear-gradient(135deg, #00f3ff, #00a2ff);
          box-shadow: 0 6px 20px rgba(0, 243, 255, 0.4);
          border: 3px solid #1a1a1c;
          border-radius: 9999px;
          color: #1a1a1c;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          text-decoration: none;
        }
        .btn-primary:hover {
          transform: translateY(-4px) scale(1.05);
          box-shadow: 0 10px 25px rgba(0, 243, 255, 0.6);
          background: linear-gradient(135deg, #33f5ff, #33b5ff);
        }
        .btn-secondary {
          background: linear-gradient(135deg, #f8e71c, #ffb300);
          box-shadow: 0 6px 20px rgba(248, 231, 28, 0.4);
          border: 3px solid #1a1a1c;
          border-radius: 9999px;
          color: #1a1a1c;
          transition: all 0.2s;
          text-decoration: none;
        }
        .btn-secondary:hover {
          transform: translateY(-4px) scale(1.05);
          box-shadow: 0 10px 25px rgba(248, 231, 28, 0.6);
        }
        .hero-blob {
          position: absolute;
          filter: blur(80px);
          z-index: -1;
          opacity: 0.5;
          border-radius: 50%;
        }
        .float { animation: floatAnim 4s ease-in-out infinite; }
        .float-delay-1 { animation: floatAnim 5s ease-in-out infinite 0.5s; }
        .float-delay-2 { animation: floatAnim 4.5s ease-in-out infinite 1.2s; }
        .float-delay-3 { animation: floatAnim 3.8s ease-in-out infinite 0.8s; }
        @keyframes floatAnim {
          0% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-18px) rotate(3deg); }
          100% { transform: translateY(0px) rotate(0deg); }
        }
      `}</style>
    </div>
  )
}

function AgentCatSvg() {
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-lg">
      {/* Ear Left */}
      <path
        d="M 22,47 Q 15,24 28,24 Q 34,24 40,40"
        fill="url(#catBody)"
        stroke="#1a1a1c"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Ear Right */}
      <path
        d="M 78,47 Q 85,24 72,24 Q 66,24 60,40"
        fill="url(#catBody)"
        stroke="#1a1a1c"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Face */}
      <ellipse
        cx="50"
        cy="62"
        rx="38"
        ry="26"
        fill="url(#catBody)"
        stroke="#1a1a1c"
        strokeWidth="2.5"
      />
      {/* Eyes */}
      <circle cx="32" cy="57" r="6.5" fill="url(#eyeYellow)" stroke="#1a1a1c" strokeWidth="1.5" />
      <circle cx="30" cy="54.5" r="2.2" fill="#ffffff" />
      <circle cx="68" cy="57" r="6.5" fill="url(#eyeCyan)" stroke="#1a1a1c" strokeWidth="1.5" />
      <circle cx="66" cy="54.5" r="2.2" fill="#ffffff" />
      <ellipse cx="50" cy="64" rx="4" ry="2.5" fill="#3a2a26" />
      <path
        d="M 40,69 Q 45,74.5 50,69"
        fill="none"
        stroke="#1a1a1c"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M 50,69 Q 55,74.5 60,69"
        fill="none"
        stroke="#1a1a1c"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* Headset */}
      <path
        d="M 12,50 A 42 42 0 0 1 88 50"
        fill="none"
        stroke="#00f3ff"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <rect
        x="6"
        y="45"
        width="12"
        height="28"
        rx="6"
        fill="#ff7da5"
        stroke="#1a1a1c"
        strokeWidth="2.5"
      />
      <rect
        x="82"
        y="45"
        width="12"
        height="28"
        rx="6"
        fill="#00f3ff"
        stroke="#1a1a1c"
        strokeWidth="2.5"
      />
      <path
        d="M 12,68 Q 20,80 30,75"
        fill="none"
        stroke="#1a1a1c"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="30" cy="75" r="3.5" fill="#f8e71c" stroke="#1a1a1c" strokeWidth="2" />
    </svg>
  )
}

function WorkCatSvg() {
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-lg">
      <path
        d="M 28,40 Q 22,20 32,20 Q 38,20 42,32"
        fill="url(#catBody)"
        stroke="#1a1a1c"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M 72,40 Q 78,20 68,20 Q 62,20 58,32"
        fill="url(#catBody)"
        stroke="#1a1a1c"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <ellipse
        cx="50"
        cy="50"
        rx="35"
        ry="24"
        fill="url(#catBody)"
        stroke="#1a1a1c"
        strokeWidth="2.5"
      />
      <circle cx="34" cy="45" r="6" fill="url(#eyeYellow)" stroke="#1a1a1c" strokeWidth="1.5" />
      <circle cx="32" cy="43" r="2" fill="#ffffff" />
      <circle cx="66" cy="45" r="6" fill="url(#eyeCyan)" stroke="#1a1a1c" strokeWidth="1.5" />
      <circle cx="64" cy="43" r="2" fill="#ffffff" />
      {/* Paws */}
      <path
        d="M 32,60 Q 32,48 40,48 Q 45,48 45,55"
        fill="url(#catBody)"
        stroke="#1a1a1c"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M 68,60 Q 68,48 60,48 Q 55,48 55,55"
        fill="url(#catBody)"
        stroke="#1a1a1c"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* Laptop */}
      <path
        d="M 15,55 L 85,55 L 90,85 L 10,85 Z"
        fill="#ff7da5"
        stroke="#1a1a1c"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M 12,85 L 88,85 L 88,88 Q 50,92 12,88 Z"
        fill="#e85b85"
        stroke="#1a1a1c"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M 50,62 L 52,66 L 57,66 L 53,69 L 55,73 L 50,70 L 45,73 L 47,69 L 43,66 L 48,66 Z"
        fill="#f8e71c"
        stroke="#1a1a1c"
        strokeWidth="1.5"
      />
    </svg>
  )
}

function ChannelCatSvg() {
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-lg">
      <path
        d="M 22,35 Q 15,12 28,12 Q 34,12 40,28"
        fill="url(#catBody)"
        stroke="#1a1a1c"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M 78,35 Q 85,12 72,12 Q 66,12 60,28"
        fill="url(#catBody)"
        stroke="#1a1a1c"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <ellipse
        cx="50"
        cy="50"
        rx="38"
        ry="26"
        fill="url(#catBody)"
        stroke="#1a1a1c"
        strokeWidth="2.5"
      />
      <circle cx="34" cy="45" r="7" fill="url(#eyeYellow)" stroke="#1a1a1c" strokeWidth="1.5" />
      <circle cx="32" cy="42.5" r="2.5" fill="#ffffff" />
      <circle cx="66" cy="45" r="7" fill="url(#eyeCyan)" stroke="#1a1a1c" strokeWidth="1.5" />
      <circle cx="64" cy="42.5" r="2.5" fill="#ffffff" />
      <ellipse cx="50" cy="52" rx="3" ry="2" fill="#3a2a26" />
      <circle cx="50" cy="58" r="3" fill="#ff7da5" stroke="#1a1a1c" strokeWidth="2" />
      {/* Channel blocks */}
      <rect
        x="15"
        y="65"
        width="25"
        height="25"
        rx="6"
        fill="#f8e71c"
        stroke="#1a1a1c"
        strokeWidth="2.5"
        transform="rotate(-10 27 75)"
      />
      <text
        x="22"
        y="85"
        fontFamily="'Nunito', sans-serif"
        fontWeight="900"
        fontSize="18"
        fill="#1a1a1c"
        transform="rotate(-10 27 75)"
      >
        #
      </text>
      <rect
        x="40"
        y="60"
        width="25"
        height="25"
        rx="6"
        fill="#00f3ff"
        stroke="#1a1a1c"
        strokeWidth="2.5"
      />
      <text
        x="47"
        y="78"
        fontFamily="'Nunito', sans-serif"
        fontWeight="900"
        fontSize="18"
        fill="#1a1a1c"
      >
        @
      </text>
      <rect
        x="65"
        y="70"
        width="25"
        height="25"
        rx="6"
        fill="#ff7da5"
        stroke="#1a1a1c"
        strokeWidth="2.5"
        transform="rotate(15 77 82)"
      />
      <text
        x="73"
        y="88"
        fontFamily="'Nunito', sans-serif"
        fontWeight="900"
        fontSize="16"
        fill="#1a1a1c"
        transform="rotate(15 77 82)"
      >
        !!
      </text>
    </svg>
  )
}
