import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import {
  Bell,
  ChevronDown,
  Home,
  LayoutDashboard,
  Plus,
  Search,
  Settings,
  Sparkles,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useArtworks, useOAuthSession, useProfile } from '../hooks.js'

type PanelName = 'create' | 'updates' | null

export function TopNav() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const search = useSearch({ strict: false }) as { q?: string }
  const [query, setQuery] = useState(search.q ?? '')
  const [panel, setPanel] = useState<PanelName>(null)
  const [oauthPopupOpen, setOauthPopupOpen] = useState(false)
  const oauthPopupPollRef = useRef<number | null>(null)
  const profileQuery = useProfile()
  const oauthSessionQuery = useOAuthSession()
  const artworksQuery = useArtworks({ visibility: 'all' })
  const profile = profileQuery.data?.profile
  const oauthSession = oauthSessionQuery.data
  const artworks = artworksQuery.data?.artworks ?? []
  const connectedProfile = oauthSession?.authenticated ? oauthSession.profile : null
  const avatarUrl = connectedProfile?.avatarUrl ?? profile?.coverUrl
  const avatarLabel =
    connectedProfile?.displayName ?? connectedProfile?.username ?? profile?.displayName ?? 'Space'
  const latestComments = useMemo(
    () =>
      artworks
        .flatMap((artwork) =>
          artwork.comments.map((comment) => ({
            artworkId: artwork.id,
            artworkTitle: artwork.title || '未命名作品',
            comment,
          })),
        )
        .slice(0, 8),
    [artworks],
  )

  const togglePanel = (nextPanel: Exclude<PanelName, null>) => {
    setPanel((current) => (current === nextPanel ? null : nextPanel))
  }

  const refreshOAuthSession = useCallback(() => {
    setOauthPopupOpen(false)
    if (oauthPopupPollRef.current !== null) {
      window.clearInterval(oauthPopupPollRef.current)
      oauthPopupPollRef.current = null
    }
    void queryClient.invalidateQueries({ queryKey: ['space', 'oauth-session'] })
  }, [queryClient])

  const startOAuth = () => {
    const authorizeUrl = oauthSession?.authorizeUrl
    if (!authorizeUrl) return
    setOauthPopupOpen(true)
    const popup = window.open(
      authorizeUrl,
      'shadow-space-oauth',
      'popup,width=520,height=760,menubar=no,toolbar=no,location=yes,status=no',
    )
    if (!popup) {
      setOauthPopupOpen(false)
      window.top?.location.assign(authorizeUrl)
      return
    }
    if (oauthPopupPollRef.current !== null) window.clearInterval(oauthPopupPollRef.current)
    oauthPopupPollRef.current = window.setInterval(() => {
      if (popup.closed) refreshOAuthSession()
    }, 800)
  }

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string } | null
      if (!data || typeof data !== 'object' || data.type !== 'space.oauth.completed') return
      refreshOAuthSession()
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [refreshOAuthSession])

  useEffect(
    () => () => {
      if (oauthPopupPollRef.current !== null) window.clearInterval(oauthPopupPollRef.current)
    },
    [],
  )

  return (
    <>
      <aside className="pinRail" aria-label="Space navigation">
        <Link
          className="pinLogo"
          search={{ q: '', tag: '', visibility: 'all' }}
          to="/"
          aria-label="Space"
        >
          <SpaceMark />
        </Link>
        <nav className="railCluster">
          <Link to="/" search={{ q: '', tag: '', visibility: 'all' }} aria-label="首页">
            <Home />
          </Link>
          <Link to="/profile" aria-label="你的作品集">
            <LayoutDashboard />
          </Link>
          <button type="button" aria-label="创建" onClick={() => togglePanel('create')}>
            <Plus />
          </button>
          <button type="button" aria-label="更新" onClick={() => togglePanel('updates')}>
            <Bell />
          </button>
        </nav>
        <Link className="railSettings" to="/profile" aria-label="设置">
          <Settings />
        </Link>
      </aside>

      <header className="topNav">
        <form
          className="searchBox"
          onSubmit={(event) => {
            event.preventDefault()
            void navigate({ to: '/', search: { q: query, tag: '', visibility: 'all' } })
          }}
        >
          <Search />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索作品"
          />
        </form>
        {oauthSession?.configured && !oauthSession.authenticated ? (
          <button
            type="button"
            className="identityButton"
            onClick={startOAuth}
            disabled={oauthPopupOpen}
          >
            {oauthPopupOpen ? '等待授权' : '连接身份'}
          </button>
        ) : null}
        {connectedProfile ? (
          <span className="identityPill" title={avatarLabel}>
            {avatarLabel}
          </span>
        ) : null}
        <Link className="profileBubble" to="/profile" aria-label="个人资料">
          <span className="topAvatar">
            {avatarUrl ? <img src={avatarUrl} alt="" /> : avatarLabel.slice(0, 1).toUpperCase()}
          </span>
          <ChevronDown />
        </Link>
      </header>

      {panel ? (
        <aside className="pinSidePanel" aria-label="侧栏">
          <button
            type="button"
            className="panelClose"
            aria-label="关闭"
            onClick={() => setPanel(null)}
          >
            <X />
          </button>
          {panel === 'create' ? <CreatePanel /> : null}
          {panel === 'updates' ? (
            <UpdatesPanel comments={latestComments} onNavigate={() => setPanel(null)} />
          ) : null}
        </aside>
      ) : null}
    </>
  )
}

function SpaceMark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden>
      <rect className="markSurface" x="6" y="6" width="36" height="36" rx="12" />
      <path
        className="markLine"
        d="M31 13H20c-5.2 0-8.6 2.8-8.6 7 0 3.7 2.7 5.9 8 7.1l7.1 1.7c5 1.2 7.7 3.3 7.7 7 0 4.1-3.4 6.8-8.5 6.8H15"
      />
      <path className="markAccent" d="M35.5 10.5v10M12.5 27.5v10" />
    </svg>
  )
}

function CreatePanel() {
  return (
    <div className="panelStack">
      <h2>创建</h2>
      <Link className="panelAction" to="/upload">
        <span>
          <Sparkles />
        </span>
        <strong>作品</strong>
        <p>发布一个新作品，加入标题、封面和标签。</p>
      </Link>
      <Link className="panelAction" to="/profile">
        <span>
          <LayoutDashboard />
        </span>
        <strong>作品集</strong>
        <p>整理你喜欢的主题，让作品变成作品集。</p>
      </Link>
    </div>
  )
}

function UpdatesPanel({
  comments,
  onNavigate,
}: {
  comments: Array<{
    artworkId: string
    artworkTitle: string
    comment: { id: string; body: string; createdAt: string; author: { displayName: string } }
  }>
  onNavigate: () => void
}) {
  return (
    <div className="panelStack">
      <h2>更新</h2>
      <h3>新</h3>
      {comments.length ? (
        <div className="updateList">
          {comments.map(({ artworkId, artworkTitle, comment }) => (
            <Link
              className="updateItem"
              key={comment.id}
              params={{ artworkId }}
              search={{ toolbar: 1 }}
              to="/preview/$artworkId"
              onClick={onNavigate}
            >
              <div className="updateThumb" />
              <div>
                <strong>{comment.author.displayName}</strong>
                <p>
                  在 {artworkTitle} 留下了回应: {comment.body}
                </p>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <p className="panelQuiet">新的回应、收藏和作品动态会出现在这里。</p>
      )}
    </div>
  )
}
