import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { ArrowLeft, Check, Copy, ExternalLink, Home, Settings } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../lib/api'
import { useChatStore } from '../../stores/chat.store'
import { useUIStore } from '../../stores/ui.store'

interface ServerDetail {
  id: string
  name: string
  slug: string
  description: string | null
  iconUrl: string | null
  bannerUrl: string | null
  homepageHtml: string | null
  isPublic: boolean
}

/** Generate a polished default homepage HTML matching the main site's light glass-morphism style. */
function generateDefaultHtml(server: ServerDetail, t: (key: string) => string): string {
  const initial = server.name.charAt(0).toUpperCase()
  const bannerCss = server.bannerUrl
    ? `background-image: url('${server.bannerUrl}'); background-size: cover; background-position: center;`
    : ''

  const iconHtml = server.iconUrl
    ? `<img src="${server.iconUrl}" alt="" class="server-icon icon-img" />`
    : `<div class="server-icon icon-placeholder">${initial}</div>`

  const desc = server.description || t('serverHome.defaultDesc')

  const features = [
    {
      icon: '💬',
      title: t('serverHome.chatTitle'),
      desc: t('serverHome.chatDesc'),
      color: '#06b6d4',
    },
    { icon: '🤖', title: t('serverHome.aiTitle'), desc: t('serverHome.aiDesc'), color: '#f59e0b' },
    {
      icon: '📢',
      title: t('serverHome.announceTitle'),
      desc: t('serverHome.announceDesc'),
      color: '#8b5cf6',
    },
    {
      icon: '🎨',
      title: t('serverHome.customizeTitle'),
      desc: t('serverHome.customizeDesc'),
      color: '#ec4899',
    },
  ]

  const featureCards = features
    .map(
      (f) => `
    <div class="feature-card" style="--accent: ${f.color};">
      <div class="feature-icon">${f.icon}</div>
      <h3>${f.title}</h3>
      <p>${f.desc}</p>
    </div>
  `,
    )
    .join('')

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;700;800;900&display=swap');

  @keyframes fadeInUp { from { opacity:0; transform:translateY(24px); } to { opacity:1; transform:translateY(0); } }
  @keyframes floatAnim { 0%,100% { transform:translateY(0) rotate(0deg); } 50% { transform:translateY(-12px) rotate(2deg); } }
  @keyframes blobPulse { 0%,100% { transform: scale(1); opacity: 0.45; } 50% { transform: scale(1.1); opacity: 0.55; } }

  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    font-family: 'Nunito', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background-color: #f2f7fc;
    background-image: radial-gradient(#c2d2ea 2px, transparent 2px);
    background-size: 36px 36px;
    color: #2d3748;
    min-height: 100vh;
    overflow-x: hidden;
    position: relative;
  }

  /* Decorative blobs */
  .blob {
    position: absolute;
    border-radius: 50%;
    filter: blur(70px);
    z-index: 0;
    animation: blobPulse 8s ease-in-out infinite;
    pointer-events: none;
  }
  .blob-1 { width: 260px; height: 260px; background: #67e8f9; top: -40px; right: 10%; }
  .blob-2 { width: 200px; height: 200px; background: #fde68a; top: 180px; left: 5%; animation-delay: 2s; }
  .blob-3 { width: 180px; height: 180px; background: #c4b5fd; bottom: 60px; right: 20%; animation-delay: 4s; }

  /* Banner */
  .banner {
    height: 180px;
    ${bannerCss || 'background: linear-gradient(135deg, #e0f2fe 0%, #cffafe 40%, #fef3c7 100%);'}
    position: relative;
    overflow: hidden;
    border-bottom: 3px solid rgba(255,255,255,0.9);
  }
  .banner::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(to bottom, transparent 50%, rgba(242,247,252,0.8) 100%);
  }

  .content {
    max-width: 640px;
    margin: 0 auto;
    padding: 0 24px 48px;
    position: relative;
    z-index: 1;
  }

  /* Server identity */
  .icon-row {
    display: flex;
    align-items: flex-end;
    gap: 16px;
    margin-top: -40px;
    position: relative;
    z-index: 2;
    margin-bottom: 20px;
    animation: fadeInUp 0.5s ease-out;
  }
  .server-icon {
    width: 84px;
    height: 84px;
    border-radius: 24px;
    border: 4px solid #fff;
    box-shadow: 0 8px 28px rgba(0,0,0,0.1);
    flex-shrink: 0;
  }
  .icon-img { object-fit: cover; }
  .icon-placeholder {
    background: linear-gradient(135deg, #06b6d4, #0891b2);
    display: flex; align-items: center; justify-content: center;
    color: #fff; font-size: 34px; font-weight: 900;
    text-shadow: 0 2px 4px rgba(0,0,0,0.15);
  }
  .info { padding-bottom: 4px; }
  .info h1 {
    font-size: 24px; font-weight: 900; color: #1a202c;
    letter-spacing: -0.3px;
  }
  .badge {
    display: inline-flex; align-items: center; gap: 4px;
    font-size: 11px; color: #0891b2; font-weight: 800;
    margin-top: 4px; text-transform: uppercase; letter-spacing: 0.5px;
  }
  .badge::before {
    content: ''; width: 6px; height: 6px; border-radius: 50%;
    background: #06b6d4; animation: floatAnim 2s ease-in-out infinite;
  }

  .desc {
    color: #4a5568;
    font-size: 15px;
    font-weight: 700;
    line-height: 1.7;
    background: rgba(255,255,255,0.6);
    padding: 12px 16px;
    border-radius: 16px;
    border-left: 4px solid #fbbf24;
    margin-bottom: 24px;
    animation: fadeInUp 0.5s ease-out 0.1s both;
  }

  /* Quick start card */
  .quick-start {
    background: rgba(255,255,255,0.7);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 3px solid rgba(255,255,255,0.9);
    border-radius: 24px;
    padding: 24px 28px;
    margin-bottom: 24px;
    animation: fadeInUp 0.5s ease-out 0.2s both;
    box-shadow: 0 8px 32px rgba(0,0,0,0.06);
    transition: all 0.3s;
  }
  .quick-start:hover {
    box-shadow: 0 12px 40px rgba(0,0,0,0.1);
    border-color: #67e8f9;
    transform: translateY(-2px);
  }
  .quick-start h2 {
    font-size: 16px; font-weight: 900; color: #1a202c; margin-bottom: 6px;
    display: flex; align-items: center; gap: 8px;
  }
  .quick-start p { color: #718096; font-size: 14px; font-weight: 700; line-height: 1.6; }

  /* Feature grid */
  .features {
    display: grid; grid-template-columns: 1fr 1fr; gap: 14px;
    animation: fadeInUp 0.5s ease-out 0.3s both;
  }
  .feature-card {
    background: rgba(255,255,255,0.65);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 3px solid rgba(255,255,255,0.9);
    border-radius: 24px;
    padding: 22px;
    cursor: pointer;
    position: relative;
    overflow: hidden;
    box-shadow: 0 6px 24px rgba(0,0,0,0.04);
    transition: all 0.3s cubic-bezier(0.25,0.8,0.25,1);
  }
  .feature-card::before {
    content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
    background: var(--accent); opacity: 0; transition: opacity 0.3s;
  }
  .feature-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 16px 40px rgba(0,0,0,0.1);
    border-color: var(--accent);
  }
  .feature-card:hover::before { opacity: 1; }
  .feature-icon {
    font-size: 28px; margin-bottom: 10px;
    display: inline-block; animation: floatAnim 3s ease-in-out infinite;
  }
  .feature-card:nth-child(2) .feature-icon { animation-delay: 0.6s; }
  .feature-card:nth-child(3) .feature-icon { animation-delay: 1.2s; }
  .feature-card:nth-child(4) .feature-icon { animation-delay: 1.8s; }
  .feature-card h3 {
    font-size: 14px; font-weight: 900; color: #1a202c; margin-bottom: 5px;
  }
  .feature-card p {
    font-size: 12px; color: #718096; font-weight: 700; line-height: 1.5;
  }

  /* CTA button */
  .cta-row {
    text-align: center;
    margin-top: 28px;
    animation: fadeInUp 0.5s ease-out 0.4s both;
  }
  .cta-btn {
    display: inline-flex; align-items: center; gap: 8px;
    background: linear-gradient(135deg, #00f3ff, #00a2ff);
    color: #1a1a1c;
    font-size: 15px; font-weight: 900;
    padding: 12px 28px;
    border-radius: 9999px;
    border: 3px solid #1a1a1c;
    text-decoration: none;
    cursor: pointer;
    box-shadow: 0 6px 20px rgba(0,243,255,0.35);
    transition: all 0.2s;
  }
  .cta-btn:hover {
    transform: translateY(-3px) scale(1.05);
    box-shadow: 0 10px 28px rgba(0,243,255,0.5);
  }

  @media (max-width: 480px) {
    .banner { height: 120px; }
    .content { padding: 0 16px 32px; }
    .features { grid-template-columns: 1fr; }
    .server-icon { width: 68px; height: 68px; border-radius: 18px; font-size: 26px; }
    .info h1 { font-size: 20px; }
  }
</style>
</head>
<body>
  <!-- Decorative blobs -->
  <div class="blob blob-1"></div>
  <div class="blob blob-2"></div>
  <div class="blob blob-3"></div>

  <div class="banner"></div>
  <div class="content">
    <div class="icon-row">
      ${iconHtml}
      <div class="info">
        <h1>${server.name}</h1>
        ${server.isPublic ? `<div class="badge">${t('serverHome.publicBadge')}</div>` : ''}
      </div>
    </div>
    <div class="desc">${desc}</div>
    <div class="quick-start">
      <h2>👋 ${t('serverHome.quickStart')}</h2>
      <p>${t('serverHome.quickStartDesc')}</p>
    </div>
    <div class="features">
      ${featureCards}
    </div>
    <div class="cta-row">
      <button class="cta-btn" onclick="window.parent.postMessage({type:'server-home:explore-channels'},'*')">
        ${t('serverHome.exploreChannels')} →
      </button>
    </div>
  </div>
</body>
</html>`
}

interface ServerHomeProps {
  /** Override serverId instead of using chat store */
  serverId?: string
  /** Show enhanced toolbar with actions */
  standalone?: boolean
}

interface HomepageApp {
  id: string
  name: string
  sourceType: 'zip' | 'url'
  sourceUrl: string
  version: string | null
  iconUrl: string | null
}

export function ServerHome({ serverId: propServerId, standalone }: ServerHomeProps = {}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { activeServerId } = useChatStore()
  const effectiveServerId = propServerId || activeServerId
  const [copied, setCopied] = useState(false)

  const { data: server } = useQuery({
    queryKey: ['server', effectiveServerId],
    queryFn: () => fetchApi<ServerDetail>(`/api/servers/${effectiveServerId}`),
    enabled: !!effectiveServerId,
  })

  // Fetch channels for navigation
  const { data: channels } = useQuery({
    queryKey: ['channels', effectiveServerId],
    queryFn: () =>
      fetchApi<Array<{ id: string; name: string; type: string }>>(
        `/api/servers/${effectiveServerId}/channels`,
      ),
    enabled: !!effectiveServerId,
  })

  // Check for homepage app
  const { data: homepageApp } = useQuery({
    queryKey: ['homepage-app', effectiveServerId],
    queryFn: () => fetchApi<HomepageApp | null>(`/api/servers/${effectiveServerId}/apps/homepage`),
    enabled: !!effectiveServerId,
  })

  // Handle postMessage from iframe for navigation
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      if (!event.data || typeof event.data !== 'object') return
      const { type, channelName, url } = event.data

      if (type === 'server-home:explore-channels' || type === 'navigate-channel') {
        // Navigate to the first channel, or by name if specified
        const targetChannel = channelName
          ? channels?.find((ch) => ch.name === channelName)
          : channels?.[0]
        if (targetChannel && server) {
          void navigate({
            to: '/app/servers/$serverSlug/channels/$channelId',
            params: { serverSlug: server.slug || server.id, channelId: targetChannel.id },
          })
        }
      } else if (type === 'server-home:navigate' && url) {
        // Handle link clicks from iframe
        try {
          const parsed = new URL(url, window.location.origin)
          if (parsed.origin === window.location.origin) {
            // Internal link — navigate in parent
            void navigate({ to: parsed.pathname + parsed.search + parsed.hash })
          } else {
            // External link — open in new tab
            window.open(url, '_blank', 'noopener,noreferrer')
          }
        } catch {
          window.open(url, '_blank', 'noopener,noreferrer')
        }
      }
    },
    [channels, server, navigate],
  )

  useEffect(() => {
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [handleMessage])

  if (!server) {
    return (
      <div className="flex-1 flex items-center justify-center bg-bg-primary">
        <div className="text-center">
          <img src="/Logo.svg" alt="Shadow" className="w-16 h-16 mx-auto mb-4 opacity-30" />
          <p className="text-text-muted text-lg">{t('common.loading')}</p>
        </div>
      </div>
    )
  }

  // Use custom HTML if set, otherwise generate default with i18n
  const rawHtml = server.homepageHtml || generateDefaultHtml(server, t)

  // If a homepage app exists, resolve its URL for the iframe
  const homepageAppUrl = homepageApp
    ? homepageApp.sourceType === 'url'
      ? homepageApp.sourceUrl
      : `/api/media/files/${homepageApp.sourceUrl}`
    : null

  // Inject link interceptor script to prevent app-in-app navigation
  const linkInterceptorScript = `<script>
document.addEventListener('click', function(e) {
  var a = e.target.closest('a');
  if (!a) return;
  var href = a.getAttribute('href');
  if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
  e.preventDefault();
  window.parent.postMessage({ type: 'server-home:navigate', url: a.href }, '*');
}, true);
</script>`
  const htmlContent = rawHtml.includes('</body>')
    ? rawHtml.replace('</body>', `${linkInterceptorScript}</body>`)
    : rawHtml + linkInterceptorScript

  const handleCopyLink = () => {
    const slug = server.slug || server.id
    const url = `${window.location.origin}/s/${slug}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleOpenNewWindow = () => {
    const slug = server.slug || server.id
    window.open(`/s/${slug}`, '_blank')
  }

  return (
    <div className="flex-1 flex flex-col bg-bg-primary overflow-hidden">
      {/* Header bar */}
      <div className="desktop-drag-titlebar h-12 px-4 flex items-center border-b border-border-subtle shrink-0">
        {/* Mobile back button — return to channel list */}
        {!standalone && (
          <button
            type="button"
            onClick={() => useUIStore.getState().setMobileView('channels')}
            className="md:hidden p-2 -ml-2 mr-1 text-text-muted hover:text-text-primary hover:bg-bg-modifier-hover rounded-lg transition"
          >
            <ArrowLeft size={18} />
          </button>
        )}
        <Home size={16} className="mr-2 text-text-muted" />
        <h2 className="font-semibold text-text-primary text-sm truncate flex-1">{server.name}</h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleCopyLink}
            className="p-2 text-text-muted hover:text-text-primary hover:bg-bg-modifier-hover rounded-lg transition"
            title={t('common.copy')}
          >
            {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
          </button>
          <button
            type="button"
            onClick={handleOpenNewWindow}
            className="p-2 text-text-muted hover:text-text-primary hover:bg-bg-modifier-hover rounded-lg transition"
            title={t('serverHome.openNewWindow')}
          >
            <ExternalLink size={16} />
          </button>
          {standalone && (
            <button
              type="button"
              onClick={() => {
                const slug = server.slug || server.id
                navigate({ to: '/app/servers/$serverSlug', params: { serverSlug: slug } })
              }}
              className="p-2 text-text-muted hover:text-text-primary hover:bg-bg-modifier-hover rounded-lg transition"
              title={t('serverHome.backToServer')}
            >
              <Settings size={16} />
            </button>
          )}
        </div>
      </div>
      {/* HTML content in sandboxed iframe */}
      <div className="flex-1 overflow-auto">
        {homepageAppUrl ? (
          <iframe
            src={homepageAppUrl}
            title={`${homepageApp?.name ?? server.name} homepage`}
            className="w-full h-full border-0"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
            allow="fullscreen; clipboard-write"
          />
        ) : (
          <iframe
            srcDoc={htmlContent}
            title={`${server.name} homepage`}
            className="w-full h-full border-0"
            sandbox="allow-scripts allow-same-origin"
          />
        )}
      </div>
    </div>
  )
}
