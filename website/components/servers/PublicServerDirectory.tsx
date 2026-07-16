import { ChevronLeft, ChevronRight, Loader2, Search } from 'lucide-react'
import { type CSSProperties, useEffect, useMemo, useState } from 'react'
import { useI18n, usePageData } from 'rspress/runtime'
import { fetchPublicServers, type PublicServerDirectoryEntry } from '../../api/publicServers'
import { type SpaceIconName, spaceIconPath } from '../../data/spaceIcons'
import { handleAppEntryClick, serverDesktopUrl } from '../home/app-entry'
import type { Play } from '../home/types'
import { SpaceStickerIcon } from '../icons/SpaceStickerIcon'

const FETCH_LIMIT = 96
const PAGE_SIZE = 12

type DirectoryLang = 'en' | 'zh'
type CategoryKey = 'all' | 'gaming' | 'entertainment' | 'education' | 'music' | 'science'

type CategoryDefinition = {
  key: CategoryKey
  labelKey: string
  icon: SpaceIconName
  keywords: string[]
}

const CATEGORY_DEFINITIONS: CategoryDefinition[] = [
  {
    key: 'all',
    labelKey: 'spaces.directory.category.all',
    icon: 'space-planet',
    keywords: [],
  },
  {
    key: 'gaming',
    labelKey: 'spaces.directory.category.gaming',
    icon: 'category-game',
    keywords: ['game', 'gaming', 'minecraft', 'roblox', 'rpg', 'valorant', '游戏', '玩家', '开黑'],
  },
  {
    key: 'entertainment',
    labelKey: 'spaces.directory.category.entertainment',
    icon: 'category-entertainment',
    keywords: ['anime', 'chat', 'club', 'entertainment', 'movie', 'social', '娱乐', '聊天', '番剧'],
  },
  {
    key: 'education',
    labelKey: 'spaces.directory.category.education',
    icon: 'category-education',
    keywords: ['course', 'docs', 'education', 'learn', 'school', 'study', '学习', '教育', '课程'],
  },
  {
    key: 'music',
    labelKey: 'spaces.directory.category.music',
    icon: 'category-music',
    keywords: ['audio', 'band', 'music', 'radio', 'song', 'voice', '乐队', '声音', '音乐'],
  },
  {
    key: 'science',
    labelKey: 'spaces.directory.category.science',
    icon: 'category-science-tech',
    keywords: ['ai', 'api', 'code', 'developer', 'science', 'tech', '开发', '工程', '技术', '科学'],
  },
]

function serverToSearchText(server: PublicServerDirectoryEntry) {
  return `${server.name} ${server.description ?? ''}`.toLowerCase()
}

function matchesCategory(server: PublicServerDirectoryEntry, category: CategoryDefinition) {
  if (category.key === 'all') return true
  const text = serverToSearchText(server)
  return category.keywords.some((keyword) => text.includes(keyword.toLowerCase()))
}

function toDesktopPlay(server: PublicServerDirectoryEntry): Play {
  return {
    id: server.id,
    server: server.routeKey,
    image: server.image,
    title: server.name,
    desc: server.description,
    accentColor: server.accentColor,
    memberCount: server.memberCount,
  }
}

function serverAccentStyle(accentColor: string) {
  return { '--server-accent': accentColor } as CSSProperties
}

function pageNumbers(pageCount: number, pageIndex: number) {
  if (pageCount <= 6) return Array.from({ length: pageCount }, (_, index) => index)
  const start = Math.max(0, Math.min(pageIndex - 2, pageCount - 5))
  return Array.from({ length: 5 }, (_, index) => start + index)
}

function PublicServerImage({ server, base }: { server: PublicServerDirectoryEntry; base: string }) {
  if (server.image) {
    return <img src={server.image} alt="" className="public-server-card-image" draggable={false} />
  }

  const fallbackSrc = server.iconUrl || spaceIconPath('space-planet', base)

  return (
    <div className="public-server-card-fallback" style={serverAccentStyle(server.accentColor)}>
      <img
        src={fallbackSrc}
        alt=""
        className="public-server-card-fallback-cover"
        draggable={false}
      />
    </div>
  )
}

function PublicServerCard({ server, base }: { server: PublicServerDirectoryEntry; base: string }) {
  const t = useI18n()
  const play = useMemo(() => toDesktopPlay(server), [server])
  const desktopHref = serverDesktopUrl(play)

  return (
    <a
      href={desktopHref}
      className="public-server-card"
      style={serverAccentStyle(server.accentColor)}
      onClick={handleAppEntryClick}
    >
      <span className="public-server-card-media">
        <PublicServerImage server={server} base={base} />
      </span>
      <span className="public-server-card-body">
        <span className="public-server-card-title-row">
          {server.iconUrl ? (
            <span className="public-server-card-avatar" aria-hidden="true">
              <img src={server.iconUrl} alt="" draggable={false} />
            </span>
          ) : null}
          <h2>{server.name}</h2>
        </span>
        <p>{server.description || t('spaces.directory.serverFallbackDescription')}</p>
      </span>
    </a>
  )
}

export function PublicServerDirectory({ lang = 'zh' }: { lang?: DirectoryLang }) {
  const t = useI18n()
  const { siteData } = usePageData()
  const base = (siteData.base || '/').replace(/\/$/, '')
  const [servers, setServers] = useState<PublicServerDirectoryEntry[]>([])
  const [activeCategory, setActiveCategory] = useState<CategoryKey>('all')
  const [query, setQuery] = useState('')
  const [pageIndex, setPageIndex] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const loadServers = async () => {
      setLoading(true)
      const nextServers = await fetchPublicServers({ limit: FETCH_LIMIT, offset: 0 })
      if (cancelled) return
      setServers(nextServers)
      setLoading(false)
    }

    void loadServers()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    setPageIndex(0)
  }, [activeCategory, query])

  const categoryCounts = useMemo(() => {
    const counts = new Map<CategoryKey, number>()
    for (const category of CATEGORY_DEFINITIONS) {
      counts.set(category.key, servers.filter((server) => matchesCategory(server, category)).length)
    }
    return counts
  }, [servers])

  const visibleServers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const activeDefinition =
      CATEGORY_DEFINITIONS.find((category) => category.key === activeCategory) ??
      CATEGORY_DEFINITIONS[0]

    return servers.filter((server) => {
      if (!matchesCategory(server, activeDefinition)) return false
      if (!normalizedQuery) return true
      return serverToSearchText(server).includes(normalizedQuery)
    })
  }, [activeCategory, query, servers])

  const pageCount = Math.max(1, Math.ceil(visibleServers.length / PAGE_SIZE))
  const currentPageIndex = Math.min(pageIndex, pageCount - 1)
  const paginatedServers = visibleServers.slice(
    currentPageIndex * PAGE_SIZE,
    currentPageIndex * PAGE_SIZE + PAGE_SIZE,
  )
  const visiblePageNumbers = pageNumbers(pageCount, currentPageIndex)
  const isDirectoryEmpty = !loading && servers.length === 0
  const communityShowcaseHref = `${base}${lang === 'zh' ? '/zh' : ''}/#community-showcase`

  return (
    <main className="public-server-directory shadow-page" data-lang={lang}>
      <img
        src={`${base}/home-sections/space-milky-way-2.webp`}
        alt=""
        className="public-server-directory-background"
        draggable={false}
      />
      <section className="public-server-directory-hero">
        <SpaceStickerIcon
          name="discover-ship"
          base={base}
          className="public-server-hero-sticker public-server-hero-sticker-left"
        />
        <div className="public-server-directory-hero-copy">
          <h1>{t('spaces.directory.title')}</h1>
          <p>{t('spaces.directory.subtitle')}</p>
        </div>
        <SpaceStickerIcon
          name="space-planet"
          base={base}
          className="public-server-hero-sticker public-server-hero-sticker-right"
        />
      </section>

      <section className="public-server-results" aria-live="polite">
        <div
          className="public-server-category-row"
          aria-label={t('spaces.directory.categoriesLabel')}
        >
          {CATEGORY_DEFINITIONS.map((category) => {
            return (
              <button
                key={category.key}
                type="button"
                className={
                  category.key === activeCategory
                    ? 'public-server-category is-active'
                    : 'public-server-category'
                }
                onClick={() => setActiveCategory(category.key)}
              >
                <SpaceStickerIcon
                  name={category.icon}
                  base={base}
                  className="public-server-category-icon"
                  aria-hidden
                />
                <span>{t(category.labelKey)}</span>
                <strong>({categoryCounts.get(category.key) ?? 0})</strong>
              </button>
            )
          })}
        </div>

        <label className="public-server-search">
          <Search className="public-server-search-icon" size={22} aria-hidden="true" />
          <input
            type="search"
            value={query}
            placeholder={t('spaces.directory.searchPlaceholder')}
            aria-label={t('spaces.directory.searchPlaceholder')}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        {loading ? (
          <div className="public-server-directory-state">
            <Loader2 className="public-server-loading-icon" size={28} aria-hidden="true" />
            <span>{t('spaces.directory.loading')}</span>
          </div>
        ) : paginatedServers.length > 0 ? (
          <div className="public-server-grid">
            {paginatedServers.map((server) => (
              <PublicServerCard key={server.id} server={server} base={base} />
            ))}
          </div>
        ) : (
          <div className="public-server-directory-state">
            <SpaceStickerIcon
              name="space-planet"
              base={base}
              className="public-server-state-icon"
              aria-hidden
            />
            <h2>
              {t(
                isDirectoryEmpty
                  ? 'spaces.directory.emptyDirectoryTitle'
                  : 'spaces.directory.emptyTitle',
              )}
            </h2>
            <p>
              {t(
                isDirectoryEmpty
                  ? 'spaces.directory.emptyDirectoryDescription'
                  : 'spaces.directory.emptyDescription',
              )}
            </p>
            {isDirectoryEmpty ? (
              <div className="public-server-empty-actions">
                <a href={communityShowcaseHref} className="btn-secondary public-server-action">
                  {t('spaces.directory.productTourAction')}
                </a>
                <a
                  href="/app/create-space"
                  className="public-server-inline-action"
                  onClick={handleAppEntryClick}
                >
                  {t('spaces.directory.ctaAction')}
                </a>
              </div>
            ) : null}
          </div>
        )}

        {!loading && visibleServers.length > PAGE_SIZE ? (
          <nav className="public-server-pagination" aria-label={t('spaces.directory.pagination')}>
            <button
              type="button"
              disabled={currentPageIndex === 0}
              onClick={() => setPageIndex((current) => Math.max(0, current - 1))}
            >
              <ChevronLeft size={14} aria-hidden="true" />
              {t('spaces.directory.back')}
            </button>
            {visiblePageNumbers[0] > 0 ? (
              <>
                <button type="button" onClick={() => setPageIndex(0)}>
                  1
                </button>
                <span>...</span>
              </>
            ) : null}
            {visiblePageNumbers.map((number) => (
              <button
                key={number}
                type="button"
                className={number === currentPageIndex ? 'is-active' : undefined}
                onClick={() => setPageIndex(number)}
              >
                {number + 1}
              </button>
            ))}
            {visiblePageNumbers.at(-1)! < pageCount - 1 ? (
              <>
                <span>...</span>
                <button type="button" onClick={() => setPageIndex(pageCount - 1)}>
                  {pageCount}
                </button>
              </>
            ) : null}
            <button
              type="button"
              disabled={currentPageIndex >= pageCount - 1}
              onClick={() => setPageIndex((current) => Math.min(pageCount - 1, current + 1))}
            >
              {t('spaces.directory.next')}
              <ChevronRight size={14} aria-hidden="true" />
            </button>
          </nav>
        ) : null}

        {!isDirectoryEmpty ? (
          <section className="public-server-discovery-cta">
            <img
              src={`${base}/home-stickers/education_owl_book.png`}
              alt=""
              draggable={false}
              className="public-server-cta-sticker"
            />
            <h2>{t('spaces.directory.ctaTitle')}</h2>
            <a
              href="/app/create-space"
              className="btn-secondary public-server-action"
              onClick={handleAppEntryClick}
            >
              {t('spaces.directory.ctaAction')}
            </a>
          </section>
        ) : null}
      </section>
    </main>
  )
}
