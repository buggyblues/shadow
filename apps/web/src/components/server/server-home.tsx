import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { fetchApi } from '../../lib/api'
import { useChatStore } from '../../stores/chat.store'

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

/** Generate a polished default homepage HTML with i18n support. */
function generateDefaultHtml(
  server: ServerDetail,
  t: (key: string) => string,
): string {
  const initial = server.name.charAt(0).toUpperCase()
  const bannerCss = server.bannerUrl
    ? `background-image: url('${server.bannerUrl}'); background-size: cover; background-position: center;`
    : 'background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);'

  const iconHtml = server.iconUrl
    ? `<img src="${server.iconUrl}" alt="" class="server-icon icon-img" />`
    : `<div class="server-icon icon-placeholder">${initial}</div>`

  const desc = server.description || t('serverHome.defaultDesc')

  const features = [
    { icon: '💬', title: t('serverHome.chatTitle'), desc: t('serverHome.chatDesc'), color: '#5865F2' },
    { icon: '🤖', title: t('serverHome.aiTitle'), desc: t('serverHome.aiDesc'), color: '#57F287' },
    { icon: '📢', title: t('serverHome.announceTitle'), desc: t('serverHome.announceDesc'), color: '#FEE75C' },
    { icon: '🎨', title: t('serverHome.customizeTitle'), desc: t('serverHome.customizeDesc'), color: '#EB459E' },
  ]

  const featureCards = features.map((f) => `
    <div class="feature-card" style="--accent: ${f.color};">
      <div class="feature-icon">${f.icon}</div>
      <h3>${f.title}</h3>
      <p>${f.desc}</p>
    </div>
  `).join('')

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  @keyframes fadeInUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
  @keyframes shimmer { 0% { background-position:-200% 0; } 100% { background-position:200% 0; } }
  @keyframes float { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-6px); } }

  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
    background: #1a1b1e; color: #e4e5e8; min-height: 100vh;
    overflow-x: hidden;
  }

  .banner {
    height: 200px; ${bannerCss} position: relative;
    overflow: hidden;
  }
  .banner::before {
    content: ''; position: absolute; inset: 0;
    background: linear-gradient(to bottom, transparent 30%, rgba(26,27,30,0.6) 70%, #1a1b1e 100%);
  }
  .banner::after {
    content: ''; position: absolute; bottom: 0; left: 0; right: 0; height: 1px;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent);
  }

  .content { max-width: 680px; margin: 0 auto; padding: 0 28px 40px; position: relative; }

  .icon-row {
    display: flex; align-items: flex-end; gap: 16px;
    margin-top: -44px; position: relative; z-index: 1; margin-bottom: 20px;
    animation: fadeInUp 0.5s ease-out;
  }
  .server-icon {
    width: 88px; height: 88px; border-radius: 20px; border: 4px solid #1a1b1e;
    box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    flex-shrink: 0;
  }
  .icon-img { object-fit: cover; }
  .icon-placeholder {
    background: linear-gradient(135deg, #667eea, #764ba2);
    display: flex; align-items: center; justify-content: center;
    color: #fff; font-size: 36px; font-weight: 700;
    text-shadow: 0 2px 4px rgba(0,0,0,0.2);
  }
  .info { padding-bottom: 4px; }
  .info h1 {
    font-size: 26px; font-weight: 800; color: #fff;
    letter-spacing: -0.3px;
  }
  .badge {
    display: inline-flex; align-items: center; gap: 4px;
    font-size: 11px; color: #57F287; font-weight: 600;
    margin-top: 4px; text-transform: uppercase; letter-spacing: 0.5px;
  }
  .badge::before {
    content: ''; width: 6px; height: 6px; border-radius: 50%;
    background: #57F287; animation: float 2s ease-in-out infinite;
  }

  .desc {
    color: #b8bbc2; font-size: 15px; line-height: 1.7;
    margin-bottom: 28px;
    animation: fadeInUp 0.5s ease-out 0.1s both;
  }

  .quick-start {
    background: linear-gradient(135deg, rgba(86,99,242,0.12), rgba(118,75,162,0.08));
    border-radius: 16px; padding: 24px 28px;
    border: 1px solid rgba(86,99,242,0.2);
    margin-bottom: 24px;
    animation: fadeInUp 0.5s ease-out 0.2s both;
    position: relative; overflow: hidden;
  }
  .quick-start::before {
    content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px;
    background: linear-gradient(90deg, transparent, rgba(86,99,242,0.4), transparent);
  }
  .quick-start h2 {
    font-size: 16px; font-weight: 700; color: #fff; margin-bottom: 6px;
    display: flex; align-items: center; gap: 8px;
  }
  .quick-start p { color: #949ba4; font-size: 14px; line-height: 1.5; }

  .features {
    display: grid; grid-template-columns: 1fr 1fr; gap: 14px;
    animation: fadeInUp 0.5s ease-out 0.3s both;
  }
  .feature-card {
    background: rgba(255,255,255,0.04);
    border-radius: 14px; padding: 22px;
    border: 1px solid rgba(255,255,255,0.06);
    transition: all 0.3s cubic-bezier(0.4,0,0.2,1);
    cursor: pointer; position: relative; overflow: hidden;
  }
  .feature-card::before {
    content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px;
    background: var(--accent); opacity: 0; transition: opacity 0.3s;
  }
  .feature-card:hover {
    background: rgba(255,255,255,0.07);
    border-color: rgba(255,255,255,0.12);
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0,0,0,0.3);
  }
  .feature-card:hover::before { opacity: 1; }
  .feature-icon {
    font-size: 28px; margin-bottom: 12px;
    display: inline-block; animation: float 3s ease-in-out infinite;
  }
  .feature-card:nth-child(2) .feature-icon { animation-delay: 0.5s; }
  .feature-card:nth-child(3) .feature-icon { animation-delay: 1s; }
  .feature-card:nth-child(4) .feature-icon { animation-delay: 1.5s; }
  .feature-card h3 {
    font-size: 14px; font-weight: 700; color: #f2f3f5; margin-bottom: 6px;
  }
  .feature-card p {
    font-size: 12px; color: #949ba4; line-height: 1.5;
  }

  @media (max-width: 480px) {
    .banner { height: 140px; }
    .content { padding: 0 16px 24px; }
    .features { grid-template-columns: 1fr; }
    .server-icon { width: 72px; height: 72px; border-radius: 16px; font-size: 28px; }
    .info h1 { font-size: 22px; }
  }
</style>
</head>
<body>
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
  </div>
  <script>
    document.querySelectorAll('.feature-card').forEach(card => {
      card.addEventListener('click', () => {
        window.parent.postMessage({ type: 'server-home:explore-channels' }, '*');
      });
    });
  </script>
</body>
</html>`
}

export function ServerHome() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { activeServerId, setActiveChannel } = useChatStore()

  const { data: server } = useQuery({
    queryKey: ['server', activeServerId],
    queryFn: () => fetchApi<ServerDetail>(`/api/servers/${activeServerId}`),
    enabled: !!activeServerId,
  })

  // Fetch channels for navigation
  const { data: channels } = useQuery({
    queryKey: ['channels', activeServerId],
    queryFn: () =>
      fetchApi<Array<{ id: string; name: string; type: string }>>(
        `/api/servers/${activeServerId}/channels`,
      ),
    enabled: !!activeServerId,
  })

  // Handle postMessage from iframe for navigation
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      if (!event.data || typeof event.data !== 'object') return
      const { type, channelName } = event.data

      if (type === 'server-home:explore-channels' || type === 'navigate-channel') {
        // Navigate to the first channel, or by name if specified
        const targetChannel = channelName
          ? channels?.find((ch) => ch.name === channelName)
          : channels?.[0]
        if (targetChannel && server) {
          setActiveChannel(targetChannel.id)
          void navigate({
            to: '/app/servers/$serverId/$channelName',
            params: { serverId: server.slug || server.id, channelName: targetChannel.name },
          })
        }
      }
    },
    [channels, server, navigate, setActiveChannel],
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
  const htmlContent = server.homepageHtml || generateDefaultHtml(server, t)

  return (
    <div className="flex-1 flex flex-col bg-bg-primary overflow-hidden">
      {/* Header bar */}
      <div className="h-12 px-4 flex items-center border-b border-white/5 shrink-0">
        <img src="/Logo.svg" alt="" className="w-5 h-5 mr-2 opacity-60" />
        <h2 className="font-semibold text-text-primary text-sm truncate">{server.name}</h2>
      </div>
      {/* HTML content in sandboxed iframe */}
      <div className="flex-1 overflow-auto">
        <iframe
          srcDoc={htmlContent}
          title={`${server.name} homepage`}
          className="w-full h-full border-0"
          sandbox="allow-scripts allow-same-origin"
        />
      </div>
    </div>
  )
}
