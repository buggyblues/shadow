import './styles.css'
import { shadowSpaceAppMountedPath } from '@shadowob/sdk/bridge'
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  RouterProvider,
  useNavigate,
  useRouterState,
} from '@tanstack/react-router'
import DOMPurify from 'dompurify'
import {
  ArrowLeft,
  BookmarkPlus,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  Filter,
  Hash,
  Home,
  Image as ImageIcon,
  ListPlus,
  MessageCircle,
  MoreHorizontal,
  PenLine,
  Plus,
  Search,
  Send,
  Trash2,
  X,
} from 'lucide-react'
import { marked } from 'marked'
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import ReactDOM from 'react-dom/client'
import type {
  QnaAnswer,
  QnaArticle,
  QnaComment,
  QnaList,
  QnaQuestion,
  QnaReadingBatch,
  QnaReadingEntry,
} from '../types.js'
import type { TagSummary } from './api.js'
import {
  addQuestionToList,
  askQuestion,
  createAnswer,
  createComment,
  createList,
  deleteAnswer,
  deleteQuestion,
  getArticle,
  getQuestion,
  listArticles,
  listLists,
  listQuestions,
  listReadingBatches,
  listTags,
  markReadingItemRead,
  onSpaceAppRouteNavigate,
  publishArticle,
  removeQuestionFromList,
  reportSpaceAppRoute,
  uploadImage,
} from './api.js'

marked.setOptions({ breaks: true, gfm: true })

const queryClient = new QueryClient()
declare global {
  interface Window {
    ReactNativeWebView?: {
      postMessage(message: string): void
    }
  }
}

function mobileNavigationMode() {
  const runtimeMode = new URLSearchParams(window.location.search).get('shadow_mobile_navigation')
  if (runtimeMode === '1' || runtimeMode === 'true') return 'immersive'
  if (runtimeMode === 'immersive' || runtimeMode === 'compat') return runtimeMode
  const rawValue = new URLSearchParams(window.location.search).get('mobileNavigation')
  if (!rawValue) return null
  try {
    const parsed = JSON.parse(decodeURIComponent(rawValue)) as { mode?: unknown }
    return parsed.mode === 'immersive' || parsed.mode === 'compat' ? parsed.mode : null
  } catch {
    return null
  }
}

function isLocalPreviewHost() {
  return ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)
}

function safeAreaParam(params: URLSearchParams, name: string, fallback: number) {
  const rawValue = params.get(name)
  if (!rawValue) return fallback
  const value = Number(rawValue)
  if (!Number.isFinite(value)) return fallback
  return Math.min(Math.max(Math.round(value), 0), 240)
}

function shadowMobileSafeArea(params: URLSearchParams) {
  const previewFallback = isLocalPreviewHost() && params.get('shadow_mobile_app') === '1'
  return {
    top: safeAreaParam(params, 'shadow_safe_top', previewFallback ? 44 : 0),
    right: safeAreaParam(params, 'shadow_safe_right', 0),
    bottom: safeAreaParam(params, 'shadow_safe_bottom', previewFallback ? 34 : 0),
    left: safeAreaParam(params, 'shadow_safe_left', 0),
  }
}

function isShadowMobileAppRuntime() {
  const params = new URLSearchParams(window.location.search)
  const explicitMobileApp = params.get('shadow_mobile_app') === '1'
  const trustedMobileRuntime = Boolean(window.ReactNativeWebView) || isLocalPreviewHost()
  return Boolean(
    trustedMobileRuntime && explicitMobileApp && mobileNavigationMode() === 'immersive',
  )
}

function syncRuntimeClasses() {
  const params = new URLSearchParams(window.location.search)
  const mobileAppRuntime = isShadowMobileAppRuntime()
  const safeArea = mobileAppRuntime
    ? shadowMobileSafeArea(params)
    : { top: 0, right: 0, bottom: 0, left: 0 }
  const root = document.documentElement
  root.classList.toggle('shadowMobileApp', mobileAppRuntime)
  root.style.setProperty('--shadow-mobile-safe-top', `${safeArea.top}px`)
  root.style.setProperty('--shadow-mobile-safe-right', `${safeArea.right}px`)
  root.style.setProperty('--shadow-mobile-safe-bottom', `${safeArea.bottom}px`)
  root.style.setProperty('--shadow-mobile-safe-left', `${safeArea.left}px`)
}

syncRuntimeClasses()

function isFeedPathname(pathname: string) {
  return (
    pathname === '/' ||
    pathname === '/hot' ||
    pathname === '/articles' ||
    pathname === '/reading' ||
    pathname.startsWith('/tags/') ||
    pathname.startsWith('/lists/') ||
    pathname.startsWith('/search/') ||
    pathname.startsWith('/articles/search/')
  )
}

function isArticleCollectionPathname(pathname: string) {
  return pathname === '/articles' || pathname.startsWith('/articles/search/')
}

function isReadingOverviewPathname(pathname: string) {
  return pathname === '/reading'
}

function isSearchablePathname(pathname: string) {
  return isFeedPathname(pathname) && !isReadingOverviewPathname(pathname)
}

function normalizeSpaceAppRoutePath(value: string) {
  const input = value.trim()
  if (!input) return '/'
  const withoutHash = input.startsWith('#') ? input.slice(1) : input
  return withoutHash.startsWith('/') ? withoutHash : `/${withoutHash}`
}

function SpaceAppRouteBridge() {
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (state) => state.location.pathname })

  useEffect(() => {
    reportSpaceAppRoute(pathname || '/')
  }, [pathname])

  useEffect(
    () =>
      onSpaceAppRouteNavigate((path) => {
        const nextPath = normalizeSpaceAppRoutePath(path)
        if (nextPath === pathname) return
        void navigate({ to: nextPath as never })
      }),
    [navigate, pathname],
  )

  return null
}

function RootLayout() {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const feedRoute = isFeedPathname(pathname)
  useRouteScrollRestoration(pathname)
  return (
    <div className={feedRoute ? 'app appFeed' : 'app appDetail'}>
      <SpaceAppRouteBridge />
      <Header />
      <Outlet />
    </div>
  )
}

const rootRoute = createRootRoute({
  component: RootLayout,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => <FeedPage mode="home" />,
})

const hotRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/hot',
  component: () => <FeedPage mode="hot" />,
})

const articlesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/articles',
  component: () => <ArticlesPage />,
})

const articleSearchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/articles/search/$query',
  component: ArticleSearchRoutePage,
})

const articleNewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/articles/new',
  component: ArticleComposePage,
})

const articleRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/articles/$articleId',
  component: ArticleRoutePage,
})

const readingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/reading',
  component: ReadingPage,
})

const readingBatchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/reading/$batchIndex',
  component: ReadingBatchRoutePage,
})

const askRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/ask',
  component: AskPage,
})

const tagRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/tags/$tag',
  component: TagRoutePage,
})

const listRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/lists/$listId',
  component: ListRoutePage,
})

const searchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/search/$query',
  component: SearchRoutePage,
})

const questionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/questions/$questionId',
  component: QuestionRoutePage,
})

const answerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/questions/$questionId/answer',
  component: AnswerRoutePage,
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  hotRoute,
  articlesRoute,
  articleSearchRoute,
  articleNewRoute,
  articleRoute,
  readingRoute,
  readingBatchRoute,
  askRoute,
  tagRoute,
  listRoute,
  searchRoute,
  questionRoute,
  answerRoute,
])

const router = createRouter({
  routeTree,
  basepath: shadowSpaceAppMountedPath('/shadow/server'),
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

function TagRoutePage() {
  const { tag } = tagRoute.useParams()
  return <FeedPage mode="tag" tag={safeDecode(tag)} />
}

function ArticleSearchRoutePage() {
  const { query } = articleSearchRoute.useParams()
  return <ArticlesPage query={safeDecode(query)} />
}

function ArticleRoutePage() {
  const { articleId } = articleRoute.useParams()
  return <ArticlePage articleId={articleId} />
}

function ReadingBatchRoutePage() {
  const { batchIndex } = readingBatchRoute.useParams()
  return <ReadingSessionPage batchIndex={Number(batchIndex)} />
}

function ListRoutePage() {
  const { listId } = listRoute.useParams()
  return <FeedPage listId={listId} mode="list" />
}

function SearchRoutePage() {
  const { query } = searchRoute.useParams()
  return <FeedPage mode="search" query={safeDecode(query)} />
}

function QuestionRoutePage() {
  const { questionId } = questionRoute.useParams()
  return <QuestionPage questionId={questionId} />
}

function AnswerRoutePage() {
  const { questionId } = answerRoute.useParams()
  return <QuestionPage answerComposer questionId={questionId} />
}

function Header() {
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const [query, setQuery] = useState('')
  const showFeedChrome = isFeedPathname(pathname)
  const showSearch = isSearchablePathname(pathname)
  const articleArea = isArticleCollectionPathname(pathname)
  const primaryAction = articleArea
    ? { to: '/articles/new' as const, label: '发布文章', icon: <PenLine size={18} /> }
    : { to: '/ask' as const, label: '提问', icon: <Plus size={18} /> }

  return (
    <>
      <header
        className={[
          'topbar',
          showFeedChrome ? '' : 'topbarDetail',
          showSearch ? '' : 'topbarNoSearch',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <Link className="brand" to="/">
          <span className="brandMark">
            <img alt="" src={mountedAssetPath('assets/icon.svg')} />
          </span>
          <span>
            <strong>问问</strong>
            <small>Q&A</small>
          </span>
        </Link>
        <nav className="nav">
          <Link activeProps={{ className: 'active' }} to="/">
            问答
          </Link>
          <Link activeProps={{ className: 'active' }} to="/articles">
            文章
          </Link>
          <Link activeProps={{ className: 'active' }} to="/reading">
            阅读
          </Link>
        </nav>
        {showSearch ? (
          <>
            <form
              className="searchBox"
              onSubmit={(event) => {
                event.preventDefault()
                const value = query.trim()
                if (!value) return
                if (articleArea) {
                  navigate({ to: '/articles/search/$query', params: { query: value } })
                } else {
                  navigate({ to: '/search/$query', params: { query: value } })
                }
              }}
            >
              <Search size={18} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={articleArea ? '搜索文章或 #标签' : '搜索问题或 #标签'}
              />
            </form>
            <Link className="primaryButton" to={primaryAction.to}>
              {primaryAction.icon}
              {primaryAction.label}
            </Link>
          </>
        ) : null}
      </header>
      {showFeedChrome ? (
        <nav className="mobileTabbar" aria-label="主导航">
          <Link activeProps={{ className: 'active' }} to="/">
            <Home size={20} />
            <span>问答</span>
          </Link>
          <Link activeProps={{ className: 'active' }} to="/articles">
            <FileText size={20} />
            <span>文章</span>
          </Link>
          <Link activeProps={{ className: 'active' }} to="/reading">
            <BookOpen size={20} />
            <span>阅读</span>
          </Link>
        </nav>
      ) : null}
    </>
  )
}

function mountedAssetPath(path: string) {
  const normalized = path.replace(/^\/+/u, '')
  const appMount = window.location.pathname.match(/^\/([^/]+)\/shadow(?:\/|$)/u)?.[1]
  return appMount ? `/${appMount}/${normalized}` : `/${normalized}`
}

function FeedPage({
  mode,
  tag,
  query,
  listId,
}: {
  mode: 'home' | 'hot' | 'tag' | 'search' | 'list'
  tag?: string
  query?: string
  listId?: string
}) {
  const questionsQuery = useQuery({
    queryKey: ['questions', { mode, tag, query, listId }],
    queryFn: () => listQuestions({ tag, query, listId, limit: 100 }),
  })
  const tagsQuery = useQuery({
    queryKey: ['tags'],
    queryFn: listTags,
  })
  const listsQuery = useQuery({
    queryKey: ['lists'],
    queryFn: listLists,
  })

  const questions = useMemo(() => {
    const items = questionsQuery.data?.questions ?? []
    if (mode !== 'hot') return items
    return [...items].sort((a, b) => questionScore(b) - questionScore(a))
  }, [mode, questionsQuery.data?.questions])
  const tags = tagsQuery.data?.tags ?? []
  const lists = listsQuery.data?.lists ?? []
  const selectedList = listId ? lists.find((list) => list.id === listId) : undefined

  return (
    <main className="workspace">
      <section className="feed">
        <div className="feedIntro">
          <div>
            <p>{feedEyebrow(mode, tag, query, selectedList)}</p>
            <h1>{feedTitle(mode, tag, query, selectedList)}</h1>
          </div>
          <div className="feedControls">
            <Link aria-label="提问" className="iconAction" to="/ask">
              <Plus size={18} />
            </Link>
            <FilterMenu
              listId={listId}
              lists={lists}
              mode={mode}
              query={query}
              selectedList={selectedList}
              tag={tag}
              tags={tags}
            />
          </div>
        </div>
        {questionsQuery.isLoading ? (
          <QuietState title="正在加载问题" />
        ) : questions.length ? (
          <div className="questionRows">
            {questions.map((question) => (
              <QuestionRow key={question.id} lists={lists} question={question} />
            ))}
          </div>
        ) : (
          <QuietState title="没有找到问题" />
        )}
      </section>
    </main>
  )
}

function ArticlesPage({ query }: { query?: string }) {
  const articlesQuery = useQuery({
    queryKey: ['articles', { query }],
    queryFn: () => listArticles({ query, limit: 100 }),
  })
  const articles = articlesQuery.data?.articles ?? []

  return (
    <main className="workspace">
      <section className="feed">
        <div className="feedIntro">
          <div>
            <p>{query ? `搜索 ${query}` : '文章区'}</p>
            <h1>{query || '文章'}</h1>
          </div>
          <div className="feedControls">
            <Link aria-label="发布文章" className="iconAction" to="/articles/new">
              <Plus size={18} />
            </Link>
          </div>
        </div>
        {articlesQuery.isLoading ? (
          <QuietState title="正在加载文章" />
        ) : articles.length ? (
          <div className="questionRows">
            {articles.map((article) => (
              <ArticleRow key={article.id} article={article} />
            ))}
          </div>
        ) : (
          <QuietState title="没有找到文章" />
        )}
      </section>
    </main>
  )
}

function ArticleRow({ article }: { article: QnaArticle }) {
  return (
    <article className="questionRow articleRow">
      <div className="rowMain">
        <ArticleTagLine tags={tagsOf(article)} />
        <Link
          className="questionTitle"
          params={{ articleId: article.id }}
          to="/articles/$articleId"
        >
          {article.title}
        </Link>
        {article.body ? <p>{plainText(article.body)}</p> : null}
        <div className="rowMeta">
          <ActorLine name={article.author.displayName} avatarUrl={article.author.avatarUrl} />
          <time dateTime={article.createdAt}>{formatDate(article.createdAt)}</time>
          <span>文章</span>
        </div>
      </div>
    </article>
  )
}

function ArticlePage({ articleId }: { articleId: string }) {
  const articleQuery = useQuery({
    queryKey: ['article', articleId],
    queryFn: () => getArticle(articleId),
  })
  const article = articleQuery.data?.article

  return (
    <main className="detailShell">
      <section className="detailColumn">
        <Link className="backLink" to="/articles">
          <ArrowLeft size={16} />
          返回文章
        </Link>
        {articleQuery.isLoading || !article ? (
          <QuietState title="正在打开文章" />
        ) : (
          <article className="questionDetail articleDetail">
            <ArticleTagLine tags={tagsOf(article)} />
            <h1>{article.title}</h1>
            <MarkdownView source={article.body} />
            <div className="detailMeta">
              <ActorLine
                name={article.author.displayName}
                avatarUrl={article.author.avatarUrl}
                suffix={formatDate(article.createdAt)}
              />
            </div>
          </article>
        )}
      </section>
    </main>
  )
}

function ArticleComposePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const tagsQuery = useQuery({
    queryKey: ['tags'],
    queryFn: listTags,
  })
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [error, setError] = useState('')
  const mutation = useMutation({
    mutationFn: publishArticle,
    onSuccess: ({ article }) => {
      queryClient.invalidateQueries({ queryKey: ['articles'] })
      queryClient.invalidateQueries({ queryKey: ['reading'] })
      navigate({ to: '/articles/$articleId', params: { articleId: article.id } })
    },
    onError: (err) => setError(userError(err, '文章发布失败')),
  })

  return (
    <main className="composeShell">
      <Link className="backLink" to="/articles">
        <ArrowLeft size={16} />
        返回文章
      </Link>
      <form
        className="questionForm"
        onSubmit={(event) => {
          event.preventDefault()
          const nextTitle = title.trim()
          const nextBody = body.trim()
          if (!nextTitle) {
            setError('需要填写文章标题。')
            return
          }
          if (!nextBody) {
            setError('需要填写文章内容。')
            return
          }
          mutation.mutate({
            title: nextTitle,
            body: nextBody,
            tags: splitTags(tagInput),
          })
        }}
      >
        <div className="composeIntro">
          <p>Markdown 文章</p>
          <h1>发布文章</h1>
        </div>
        <label>
          标题
          <input
            autoFocus
            maxLength={220}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="这篇文章要沉淀什么？"
          />
        </label>
        <label>
          正文
          <MarkdownEditor
            rows={14}
            value={body}
            onChange={setBody}
            placeholder="使用 Markdown 写下完整观点、步骤、参考链接、代码块或图片。"
          />
        </label>
        <label>
          标签
          <input
            maxLength={220}
            value={tagInput}
            onChange={(event) => setTagInput(event.target.value)}
            placeholder="#notes, #guide"
          />
        </label>
        {(tagsQuery.data?.tags ?? []).length ? (
          <div className="tagSuggestions">
            {(tagsQuery.data?.tags ?? []).slice(0, 10).map((item) => (
              <button
                key={item.tag}
                type="button"
                onClick={() => setTagInput(appendTag(tagInput, item.tag))}
              >
                #{item.tag}
              </button>
            ))}
          </div>
        ) : null}
        {body ? (
          <div className="markdownPreview">
            <span>预览</span>
            <MarkdownView source={body} />
          </div>
        ) : null}
        {error ? <p className="formError">{error}</p> : null}
        <div className="formActions">
          <Link className="secondaryButton" to="/articles">
            取消
          </Link>
          <button className="primaryButton" disabled={mutation.isPending} type="submit">
            <Send size={17} />
            发布文章
          </button>
        </div>
      </form>
    </main>
  )
}

function ReadingPage() {
  const readingQuery = useQuery({
    queryKey: ['reading', 'batches'],
    queryFn: listReadingBatches,
  })
  const batches = readingQuery.data?.batches ?? []
  const totalItems = batches.reduce((total, batch) => total + batch.items.length, 0)
  const totalUnread = batches.reduce((total, batch) => total + batch.unreadCount, 0)

  return (
    <main className="workspace">
      <section className="feed">
        <div className="feedIntro">
          <div>
            <p>阅读状态</p>
            <h1>阅读</h1>
          </div>
          <div className="readingSummary">
            <strong>{totalUnread}</strong>
            <span>待读 / {totalItems}</span>
          </div>
        </div>
        {readingQuery.isLoading ? (
          <QuietState title="正在整理阅读清单" />
        ) : batches.length ? (
          <div className="readingBatches">
            {batches.map((batch) => (
              <ReadingBatchCard key={batch.index} batch={batch} />
            ))}
          </div>
        ) : (
          <QuietState title="暂无阅读内容" />
        )}
      </section>
    </main>
  )
}

function ReadingBatchCard({ batch }: { batch: QnaReadingBatch }) {
  const firstUnread = batch.items.find((item) => !item.readAt) ?? batch.items[0]
  return (
    <Link
      className={batch.completed ? 'readingBatch completed' : 'readingBatch'}
      params={{ batchIndex: String(batch.index) }}
      to="/reading/$batchIndex"
    >
      <div>
        <p>{batch.title}</p>
        <h2>{firstUnread ? entryTitle(firstUnread) : '空清单'}</h2>
      </div>
      <div className="readingBatchMeta">
        <span>{batch.items.length} 条</span>
        <strong>{batch.completed ? '已完成' : `${batch.unreadCount} 待读`}</strong>
      </div>
    </Link>
  )
}

function ReadingSessionPage({ batchIndex }: { batchIndex: number }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const requestedIndex = Number.isFinite(batchIndex) && batchIndex >= 0 ? Math.floor(batchIndex) : 0
  const [cursor, setCursor] = useState(0)
  const [slideDirection, setSlideDirection] = useState<'back' | 'forward' | 'none'>('none')
  const [previousEntry, setPreviousEntry] = useState<QnaReadingEntry | null>(null)
  const touchStartX = useRef<number | null>(null)
  const readingQuery = useQuery({
    queryKey: ['reading', 'batches'],
    queryFn: listReadingBatches,
  })
  const batches = readingQuery.data?.batches ?? []
  const batch = batches.find((item) => item.index === requestedIndex) ?? batches[0]
  const nextBatch = batch ? batches.find((item) => item.index > batch.index) : undefined
  const items = batch?.items ?? []
  const current = items[Math.min(cursor, Math.max(items.length - 1, 0))]
  const markReadMutation = useMutation({
    mutationFn: markReadingItemRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reading'] })
    },
  })

  useEffect(() => {
    if (!batch) return
    const firstUnread = batch.items.findIndex((item) => !item.readAt)
    setPreviousEntry(null)
    setSlideDirection('none')
    setCursor(firstUnread >= 0 ? firstUnread : 0)
  }, [batch?.index])

  useEffect(() => {
    if (!previousEntry || slideDirection === 'none') return
    const timeout = window.setTimeout(() => {
      setPreviousEntry(null)
      setSlideDirection('none')
    }, 260)
    return () => window.clearTimeout(timeout)
  }, [previousEntry, slideDirection])

  useLayoutEffect(() => {
    if (!current) return
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0 })
    })
  }, [current?.kind, current?.id])

  function moveToCursor(nextCursor: number, direction: 'back' | 'forward') {
    if (!current || nextCursor === cursor || nextCursor < 0 || nextCursor >= items.length) return
    setPreviousEntry(current)
    setSlideDirection(direction)
    setCursor(nextCursor)
  }

  function goPrevious() {
    moveToCursor(cursor - 1, 'back')
  }

  function goNext() {
    if (cursor < items.length - 1) {
      moveToCursor(cursor + 1, 'forward')
      return
    }
    if (batch?.completed && nextBatch) {
      navigate({ to: '/reading/$batchIndex', params: { batchIndex: String(nextBatch.index) } })
    }
  }

  function handleTouchStart(event: React.TouchEvent<HTMLElement>) {
    touchStartX.current = event.changedTouches[0]?.clientX ?? null
  }

  function handleTouchEnd(event: React.TouchEvent<HTMLElement>) {
    const start = touchStartX.current
    touchStartX.current = null
    if (start === null) return
    const end = event.changedTouches[0]?.clientX
    if (end === undefined) return
    const delta = end - start
    if (Math.abs(delta) < 48) return
    if (delta < 0) goNext()
    else goPrevious()
  }

  function markCurrentRead() {
    if (!current || current.readAt || markReadMutation.isPending) return
    markReadMutation.mutate({ kind: current.kind, itemId: current.id })
  }

  if (readingQuery.isLoading) {
    return (
      <main className="readingShell">
        <QuietState title="正在打开阅读清单" />
      </main>
    )
  }

  if (!batch || !current) {
    return (
      <main className="readingShell">
        <Link className="backLink" to="/reading">
          <ArrowLeft size={16} />
          返回阅读
        </Link>
        <QuietState title="没有找到阅读清单" />
      </main>
    )
  }

  return (
    <main className="readingShell">
      <section className="readingStage" onTouchEnd={handleTouchEnd} onTouchStart={handleTouchStart}>
        <Link className="backLink" to="/reading">
          <ArrowLeft size={16} />
          返回阅读
        </Link>
        <div className="readingDeck" data-direction={slideDirection}>
          {previousEntry ? (
            <div
              key={`previous:${previousEntry.kind}:${previousEntry.id}`}
              className="readingFrame readingFrameOutgoing"
            >
              <ReadingEntryView entry={previousEntry} />
            </div>
          ) : null}
          <div
            key={`current:${current.kind}:${current.id}`}
            className={
              previousEntry
                ? 'readingFrame readingFrameActive readingFrameIncoming'
                : 'readingFrame readingFrameActive'
            }
          >
            <ReadingEntryView entry={current} />
          </div>
        </div>
      </section>
      <div className="readingToolbar">
        <button
          aria-label="上一条"
          className="iconButton"
          disabled={cursor <= 0}
          type="button"
          onClick={goPrevious}
        >
          <ChevronLeft size={18} />
        </button>
        <div className="readingProgress">
          <strong>
            {cursor + 1} / {items.length}
          </strong>
          <span>
            {batch.readCount} 已读 · {batch.unreadCount} 待读
          </span>
        </div>
        <button
          className={
            current.readAt ? 'secondaryButton readDoneButton' : 'primaryButton readDoneButton'
          }
          disabled={Boolean(current.readAt) || markReadMutation.isPending}
          type="button"
          onClick={markCurrentRead}
        >
          <Check size={17} />
          {current.readAt ? '已读' : '读完'}
        </button>
        <button
          aria-label="下一条"
          className="iconButton"
          disabled={cursor >= items.length - 1 && !(batch.completed && nextBatch)}
          type="button"
          onClick={goNext}
        >
          <ChevronRight size={18} />
        </button>
        {batch.completed && nextBatch ? (
          <button
            className="secondaryButton nextBatchButton"
            type="button"
            onClick={() =>
              navigate({
                to: '/reading/$batchIndex',
                params: { batchIndex: String(nextBatch.index) },
              })
            }
          >
            下一清单
          </button>
        ) : null}
      </div>
    </main>
  )
}

function ReadingEntryView({ entry }: { entry: QnaReadingEntry }) {
  if (entry.kind === 'article' && entry.article) {
    return (
      <article className="readingEntry">
        <StaticTagLine tags={tagsOf(entry.article)} />
        <div className="readingKind">文章</div>
        <h1>{entry.article.title}</h1>
        <ActorLine
          name={entry.article.author.displayName}
          avatarUrl={entry.article.author.avatarUrl}
          suffix={formatDate(entry.article.createdAt)}
        />
        <MarkdownView source={entry.article.body} />
      </article>
    )
  }

  if (entry.question) {
    return (
      <article className="readingEntry">
        <StaticTagLine tags={tagsOf(entry.question)} />
        <div className="readingKind">问答</div>
        <h1>{displayQuestionTitle(entry.question.title)}</h1>
        <ActorLine
          name={entry.question.author.displayName}
          avatarUrl={entry.question.author.avatarUrl}
          suffix={formatDate(entry.question.createdAt)}
        />
        {entry.question.body ? <MarkdownView source={entry.question.body} /> : null}
        <section className="readingAnswers">
          <div className="sectionTitle">
            <h2>回答</h2>
            <span>{answersOf(entry.question).length}</span>
          </div>
          {answersOf(entry.question).length ? (
            answersOf(entry.question).map((answer) => (
              <article key={answer.id} className="readingAnswer">
                <ActorLine
                  name={answer.author.displayName}
                  avatarUrl={answer.author.avatarUrl}
                  suffix={formatDate(answer.createdAt)}
                />
                <MarkdownView source={answer.body} />
              </article>
            ))
          ) : (
            <QuietState title="还没有回答" />
          )}
        </section>
      </article>
    )
  }

  return <QuietState title="这条内容已经不可用" />
}

function FilterMenu({
  tags,
  lists,
  mode,
  tag,
  query,
  listId,
  selectedList,
}: {
  tags: TagSummary[]
  lists: QnaList[]
  mode: 'home' | 'hot' | 'tag' | 'search' | 'list'
  tag?: string
  query?: string
  listId?: string
  selectedList?: QnaList
}) {
  const [open, setOpen] = useState(false)
  const { anchorRef, menuRef, menuStyle } = useFloatingMenu(
    open,
    { width: 360, maxHeight: 440 },
    () => setOpen(false),
  )
  const activeLabel = filterLabel(mode, tag, query, selectedList)
  const hasFilter = Boolean(activeLabel)
  return (
    <div className="filterMenu">
      {activeLabel ? (
        <Link className="filterChip" to="/">
          <span>{activeLabel}</span>
          <X size={14} />
        </Link>
      ) : null}
      <button
        ref={anchorRef}
        aria-label="筛选"
        className={hasFilter ? 'iconAction filterButton active' : 'iconAction filterButton'}
        type="button"
        onClick={() => setOpen((value) => !value)}
      >
        <Filter size={18} />
        {hasFilter ? <Check size={12} /> : null}
      </button>
      {open ? (
        <div ref={menuRef} className="filterPanel" style={menuStyle}>
          <KnowledgeIndex currentListId={listId} currentTag={tag} lists={lists} tags={tags} />
          {hasFilter ? (
            <Link className="clearFilter" to="/">
              <X size={14} />
              清除筛选
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function KnowledgeIndex({
  tags,
  lists,
  currentTag,
  currentListId,
}: {
  tags: TagSummary[]
  lists: QnaList[]
  currentTag?: string
  currentListId?: string
}) {
  return (
    <div className="filterIndex">
      <IndexSection action={<CreateListInline />} icon={<ListPlus size={16} />} title="清单">
        {lists.length ? (
          lists.map((list) => (
            <Link
              key={list.id}
              className={list.id === currentListId ? 'indexRow selected' : 'indexRow'}
              params={{ listId: list.id }}
              to="/lists/$listId"
            >
              <span>{list.title}</span>
              <small>
                {list.id === currentListId ? <Check size={14} /> : list.questionIds.length}
              </small>
            </Link>
          ))
        ) : (
          <p className="muted">创建清单来收集有用问答。</p>
        )}
      </IndexSection>
      <IndexSection icon={<Hash size={16} />} title="标签">
        {tags.length ? (
          tags.map((item) => (
            <Link
              key={item.tag}
              className={item.tag === currentTag ? 'indexRow selected' : 'indexRow'}
              params={{ tag: item.tag }}
              to="/tags/$tag"
            >
              <span>#{item.tag}</span>
              <small>{item.tag === currentTag ? <Check size={14} /> : item.count}</small>
            </Link>
          ))
        ) : (
          <p className="muted">发布问题后会出现标签。</p>
        )}
      </IndexSection>
    </div>
  )
}

function IndexSection({
  title,
  icon,
  action,
  children,
}: {
  title: string
  icon: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="indexSection">
      <div className="indexHeader">
        <span>
          {icon}
          {title}
        </span>
        {action}
      </div>
      <div className="indexStack">{children}</div>
    </section>
  )
}

function CreateListInline() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [error, setError] = useState('')
  const mutation = useMutation({
    mutationFn: createList,
    onSuccess: () => {
      setTitle('')
      setOpen(false)
      queryClient.invalidateQueries({ queryKey: ['lists'] })
    },
    onError: (err) => setError(userError(err, '清单创建失败')),
  })

  if (!open) {
    return (
      <button className="iconButton" type="button" onClick={() => setOpen(true)}>
        <Plus size={15} />
      </button>
    )
  }

  return (
    <form
      className="miniForm"
      onSubmit={(event) => {
        event.preventDefault()
        const value = title.trim()
        if (!value) return
        mutation.mutate({ title: value })
      }}
    >
      <input
        autoFocus
        maxLength={120}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="新清单"
      />
      <button disabled={mutation.isPending || !title.trim()} type="submit">
        <Check size={14} />
      </button>
      {error ? <small className="formError">{error}</small> : null}
    </form>
  )
}

function QuestionRow({ question, lists }: { question: QnaQuestion; lists: QnaList[] }) {
  return (
    <article className="questionRow">
      <div className="rowMain">
        <TagLine tags={tagsOf(question)} />
        <Link
          className="questionTitle"
          params={{ questionId: question.id }}
          to="/questions/$questionId"
        >
          {displayQuestionTitle(question.title)}
        </Link>
        {question.body ? <p>{plainText(question.body)}</p> : null}
        <div className="rowMeta">
          <ActorLine name={question.author.displayName} avatarUrl={question.author.avatarUrl} />
          <time dateTime={question.createdAt}>{formatDate(question.createdAt)}</time>
          <span>{answersOf(question).length} 回答</span>
          <span>{questionCommentCount(question)} 评论</span>
        </div>
      </div>
      <RowActions lists={lists} question={question} />
    </article>
  )
}

function RowActions({ question, lists }: { question: QnaQuestion; lists: QnaList[] }) {
  const [open, setOpen] = useState(false)
  const { anchorRef, menuRef, menuStyle } = useFloatingMenu(
    open,
    { width: 270, maxHeight: 360 },
    () => setOpen(false),
  )
  const queryClient = useQueryClient()
  const deleteMutation = useMutation({
    mutationFn: deleteQuestion,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['questions'] })
      queryClient.invalidateQueries({ queryKey: ['tags'] })
      queryClient.invalidateQueries({ queryKey: ['lists'] })
      queryClient.invalidateQueries({ queryKey: ['reading'] })
    },
  })
  return (
    <div className="rowActions">
      <button
        ref={anchorRef}
        aria-label="打开问题操作"
        className="iconAction"
        type="button"
        onClick={() => setOpen((value) => !value)}
      >
        <MoreHorizontal size={16} />
      </button>
      {open ? (
        <div ref={menuRef} className="actionMenu" style={menuStyle}>
          <Link params={{ questionId: question.id }} to="/questions/$questionId/answer">
            <PenLine size={15} />
            回答
          </Link>
          <AddToListMenu lists={lists} questionId={question.id} />
          <button
            className="dangerAction"
            disabled={deleteMutation.isPending}
            type="button"
            onClick={() => {
              if (window.confirm('删除这个问题？')) deleteMutation.mutate(question.id)
            }}
          >
            <Trash2 size={15} />
            删除问题
          </button>
        </div>
      ) : null}
    </div>
  )
}

function AddToListMenu({ questionId, lists }: { questionId: string; lists: QnaList[] }) {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (input: { listId: string; questionId: string; selected: boolean }) =>
      input.selected
        ? removeQuestionFromList({ listId: input.listId, questionId: input.questionId })
        : addQuestionToList({ listId: input.listId, questionId: input.questionId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lists'] })
      queryClient.invalidateQueries({ queryKey: ['questions'] })
    },
  })

  return (
    <div className="listMenu">
      <span>
        <BookmarkPlus size={15} />
        保存到清单
      </span>
      {lists.length ? (
        lists.map((list) => {
          const selected = list.questionIds.includes(questionId)
          return (
            <button
              key={list.id}
              aria-pressed={selected}
              className={selected ? 'selectedListOption' : undefined}
              disabled={mutation.isPending}
              type="button"
              onClick={() => mutation.mutate({ listId: list.id, questionId, selected })}
            >
              <span>{list.title}</span>
              {selected ? <Check size={14} /> : null}
            </button>
          )
        })
      ) : (
        <small className="muted">暂无清单。</small>
      )}
    </div>
  )
}

function AddToListButton({ questionId, lists }: { questionId: string; lists: QnaList[] }) {
  const [open, setOpen] = useState(false)
  const { anchorRef, menuRef, menuStyle } = useFloatingMenu(
    open,
    { width: 260, maxHeight: 360 },
    () => setOpen(false),
  )
  return (
    <div className="foldedAction">
      <button
        ref={anchorRef}
        className="pillButton"
        type="button"
        onClick={() => setOpen((value) => !value)}
      >
        <BookmarkPlus size={16} />
        保存
      </button>
      {open ? (
        <div ref={menuRef} className="actionMenu" style={menuStyle}>
          <AddToListMenu lists={lists} questionId={questionId} />
        </div>
      ) : null}
    </div>
  )
}

function QuestionPage({
  questionId,
  answerComposer = false,
}: {
  questionId: string
  answerComposer?: boolean
}) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const listsQuery = useQuery({
    queryKey: ['lists'],
    queryFn: listLists,
  })
  const questionQuery = useQuery({
    queryKey: ['question', questionId],
    queryFn: () => getQuestion(questionId),
  })
  const question = questionQuery.data?.question
  const commentMutation = useMutation({
    mutationFn: createComment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['question', questionId] })
      queryClient.invalidateQueries({ queryKey: ['questions'] })
      queryClient.invalidateQueries({ queryKey: ['reading'] })
    },
  })
  const deleteQuestionMutation = useMutation({
    mutationFn: deleteQuestion,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['questions'] })
      queryClient.invalidateQueries({ queryKey: ['tags'] })
      queryClient.invalidateQueries({ queryKey: ['lists'] })
      queryClient.invalidateQueries({ queryKey: ['reading'] })
      navigate({ to: '/' })
    },
  })

  return (
    <main className="detailShell">
      <section className="detailColumn">
        <Link className="backLink" to="/">
          <ArrowLeft size={16} />
          返回列表
        </Link>
        {questionQuery.isLoading || !question ? (
          <QuietState title="正在打开问题" />
        ) : (
          <>
            <article className="questionDetail">
              <TagLine tags={tagsOf(question)} />
              <h1>{displayQuestionTitle(question.title)}</h1>
              {question.body ? <MarkdownView source={question.body} /> : null}
              <div className="detailMeta">
                <ActorLine
                  name={question.author.displayName}
                  avatarUrl={question.author.avatarUrl}
                  suffix={formatDate(question.createdAt)}
                />
              </div>
              <div className="detailActions">
                <Link
                  className="primaryButton"
                  params={{ questionId: question.id }}
                  to="/questions/$questionId/answer"
                >
                  <PenLine size={17} />
                  写回答
                </Link>
                <AddToListButton lists={listsQuery.data?.lists ?? []} questionId={question.id} />
                <CollapsedComments
                  comments={question.comments}
                  disabled={commentMutation.isPending}
                  label="评论"
                  placeholder="评论这个问题"
                  onSubmit={(body) =>
                    commentMutation.mutate({
                      targetType: 'question',
                      targetId: question.id,
                      body,
                    })
                  }
                />
                <button
                  aria-label="删除问题"
                  className="iconAction dangerIcon"
                  disabled={deleteQuestionMutation.isPending}
                  type="button"
                  onClick={() => {
                    if (window.confirm('删除这个问题？')) deleteQuestionMutation.mutate(question.id)
                  }}
                >
                  <Trash2 size={17} />
                </button>
              </div>
              {answerComposer ? <AnswerComposer question={question} /> : null}
            </article>

            <section className="answersSection">
              <div className="sectionTitle">
                <h2>回答</h2>
                <span>{answersOf(question).length}</span>
              </div>
              {answersOf(question).length ? (
                answersOf(question).map((answer) => (
                  <AnswerRow
                    key={answer.id}
                    answer={answer}
                    onComment={(body) =>
                      commentMutation.mutate({
                        targetType: 'answer',
                        targetId: answer.id,
                        body,
                      })
                    }
                  />
                ))
              ) : (
                <QuietState title="还没有回答" />
              )}
            </section>
          </>
        )}
      </section>
    </main>
  )
}

function AnswerRow({
  answer,
  onComment,
}: {
  answer: QnaAnswer
  onComment: (body: string) => void
}) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const { anchorRef, menuRef, menuStyle } = useFloatingMenu(
    open,
    { width: 230, maxHeight: 260 },
    () => setOpen(false),
  )
  const deleteMutation = useMutation({
    mutationFn: deleteAnswer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['question', answer.questionId] })
      queryClient.invalidateQueries({ queryKey: ['questions'] })
      queryClient.invalidateQueries({ queryKey: ['reading'] })
    },
  })

  return (
    <article className="answerRow">
      <div className="answerHeader">
        <ActorLine
          name={answer.author.displayName}
          avatarUrl={answer.author.avatarUrl}
          suffix={formatDate(answer.createdAt)}
        />
        <div className="rowActions">
          <button
            ref={anchorRef}
            aria-label="打开答案操作"
            className="iconAction"
            type="button"
            onClick={() => setOpen((value) => !value)}
          >
            <MoreHorizontal size={16} />
          </button>
          {open ? (
            <div ref={menuRef} className="actionMenu" style={menuStyle}>
              <button
                className="dangerAction"
                disabled={deleteMutation.isPending}
                type="button"
                onClick={() => {
                  if (window.confirm('删除这个答案？')) deleteMutation.mutate(answer.id)
                }}
              >
                <Trash2 size={15} />
                删除答案
              </button>
            </div>
          ) : null}
        </div>
      </div>
      <MarkdownView source={answer.body} />
      <CollapsedComments
        comments={answer.comments}
        label="回复"
        placeholder="回复这个答案"
        onSubmit={onComment}
      />
    </article>
  )
}

function AskPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const tagsQuery = useQuery({
    queryKey: ['tags'],
    queryFn: listTags,
  })
  const listsQuery = useQuery({
    queryKey: ['lists'],
    queryFn: listLists,
  })
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [listId, setListId] = useState('')
  const [error, setError] = useState('')
  const mutation = useMutation({
    mutationFn: askQuestion,
    onSuccess: ({ question }) => {
      queryClient.invalidateQueries({ queryKey: ['questions'] })
      queryClient.invalidateQueries({ queryKey: ['tags'] })
      queryClient.invalidateQueries({ queryKey: ['lists'] })
      queryClient.invalidateQueries({ queryKey: ['reading'] })
      navigate({ to: '/questions/$questionId', params: { questionId: question.id } })
    },
    onError: (err) => setError(userError(err, '问题发布失败')),
  })

  return (
    <main className="composeShell">
      <Link className="backLink" to="/">
        <ArrowLeft size={16} />
        返回列表
      </Link>
      <form
        className="questionForm"
        onSubmit={(event) => {
          event.preventDefault()
          const nextTitle = title.trim()
          if (!nextTitle) {
            setError('需要填写问题标题。')
            return
          }
          mutation.mutate({
            title: nextTitle,
            body: body.trim(),
            tags: splitTags(tagInput),
            listId: listId || undefined,
          })
        }}
      >
        <div className="composeIntro">
          <p>带上下文提问</p>
          <h1>发起一个问题</h1>
        </div>
        <label>
          问题
          <input
            autoFocus
            maxLength={220}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="你希望大家回答什么？"
          />
        </label>
        <label>
          Markdown 上下文
          <MarkdownEditor
            rows={9}
            value={body}
            onChange={setBody}
            placeholder="补充约束、截图、表格、代码块，或任何回答需要参考的信息。"
          />
        </label>
        <div className="formGrid">
          <label>
            标签
            <input
              maxLength={220}
              value={tagInput}
              onChange={(event) => setTagInput(event.target.value)}
              placeholder="#space-apps, #sdk"
            />
          </label>
          <label>
            清单
            <select value={listId} onChange={(event) => setListId(event.target.value)}>
              <option value="">不加入清单</option>
              {(listsQuery.data?.lists ?? []).map((list) => (
                <option key={list.id} value={list.id}>
                  {list.title}
                </option>
              ))}
            </select>
          </label>
        </div>
        {(tagsQuery.data?.tags ?? []).length ? (
          <div className="tagSuggestions">
            {(tagsQuery.data?.tags ?? []).slice(0, 10).map((item) => (
              <button
                key={item.tag}
                type="button"
                onClick={() => setTagInput(appendTag(tagInput, item.tag))}
              >
                #{item.tag}
              </button>
            ))}
          </div>
        ) : null}
        {body ? (
          <div className="markdownPreview">
            <span>预览</span>
            <MarkdownView source={body} />
          </div>
        ) : null}
        {error ? <p className="formError">{error}</p> : null}
        <div className="formActions">
          <Link className="secondaryButton" to="/">
            取消
          </Link>
          <button className="primaryButton" disabled={mutation.isPending} type="submit">
            <Send size={17} />
            发布
          </button>
        </div>
      </form>
    </main>
  )
}

function AnswerComposer({ question }: { question: QnaQuestion }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [body, setBody] = useState('')
  const [error, setError] = useState('')
  const mutation = useMutation({
    mutationFn: createAnswer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['question', question.id] })
      queryClient.invalidateQueries({ queryKey: ['questions'] })
      queryClient.invalidateQueries({ queryKey: ['reading'] })
      navigate({ to: '/questions/$questionId', params: { questionId: question.id } })
    },
    onError: (err) => setError(userError(err, '回答发布失败')),
  })

  return (
    <form
      className="answerComposerBlock"
      onSubmit={(event) => {
        event.preventDefault()
        const value = body.trim()
        if (!value) {
          setError('需要填写回答内容。')
          return
        }
        mutation.mutate({ questionId: question.id, body: value })
      }}
    >
      <div className="sectionTitle">
        <h2>写回答</h2>
        <span>Markdown</span>
      </div>
      <MarkdownEditor
        rows={12}
        value={body}
        onChange={setBody}
        placeholder="可以使用标题、列表、表格、代码块、链接和上传图片。"
      />
      {body ? (
        <div className="markdownPreview">
          <span>预览</span>
          <MarkdownView source={body} />
        </div>
      ) : null}
      {error ? <p className="formError">{error}</p> : null}
      <div className="formActions">
        <Link
          className="secondaryButton"
          params={{ questionId: question.id }}
          to="/questions/$questionId"
        >
          取消
        </Link>
        <button className="primaryButton" disabled={mutation.isPending} type="submit">
          <Send size={17} />
          发布回答
        </button>
      </div>
    </form>
  )
}

function MarkdownEditor({
  value,
  rows,
  placeholder,
  onChange,
}: {
  value: string
  rows: number
  placeholder: string
  onChange: (value: string) => void
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [error, setError] = useState('')
  const uploadMutation = useMutation({
    mutationFn: uploadImage,
    onSuccess: ({ image }) => {
      const alt = image.filename.replace(/\.[^.]+$/, '') || '图片'
      insertMarkdown(`![${alt}](${image.url})`)
      setError('')
      if (fileInputRef.current) fileInputRef.current.value = ''
    },
    onError: (err) => setError(err instanceof Error ? err.message : '上传失败'),
  })

  function insertMarkdown(snippet: string) {
    const target = textareaRef.current
    const start = target?.selectionStart ?? value.length
    const end = target?.selectionEnd ?? value.length
    const prefix = value.slice(0, start)
    const suffix = value.slice(end)
    const block = `${prefix.endsWith('\n') || !prefix ? '' : '\n\n'}${snippet}${
      suffix.startsWith('\n') || !suffix ? '' : '\n\n'
    }`
    const next = `${prefix}${block}${suffix}`
    onChange(next)
    window.requestAnimationFrame(() => {
      target?.focus()
      const cursor = prefix.length + block.length
      target?.setSelectionRange(cursor, cursor)
    })
  }

  return (
    <div className="markdownEditor">
      <textarea
        ref={textareaRef}
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
      <div className="editorActions">
        <button type="button" onClick={() => fileInputRef.current?.click()}>
          <ImageIcon size={16} />
          {uploadMutation.isPending ? '上传中' : '图片'}
        </button>
        <input
          ref={fileInputRef}
          accept="image/png,image/jpeg,image/webp,image/gif"
          hidden
          type="file"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0]
            if (file) uploadMutation.mutate(file)
          }}
        />
        {error ? <span className="formError">{error}</span> : null}
      </div>
    </div>
  )
}

function CollapsedComments({
  label,
  comments,
  placeholder,
  disabled,
  onSubmit,
}: {
  label: string
  comments: QnaComment[]
  placeholder: string
  disabled?: boolean
  onSubmit: (body: string) => void
}) {
  const [open, setOpen] = useState(false)
  const { anchorRef, menuRef, menuStyle } = useFloatingMenu(
    open,
    { width: 560, maxHeight: 420 },
    () => setOpen(false),
  )
  return (
    <div className="commentsFold">
      <button
        ref={anchorRef}
        className="pillButton"
        type="button"
        onClick={() => setOpen((value) => !value)}
      >
        <MessageCircle size={16} />
        {label}
        {comments.length ? <span>{comments.length}</span> : null}
      </button>
      {open ? (
        <div ref={menuRef} className="commentsBody" style={menuStyle}>
          <CommentList comments={comments} />
          <CommentComposer disabled={disabled} placeholder={placeholder} onSubmit={onSubmit} />
        </div>
      ) : null}
    </div>
  )
}

function CommentComposer({
  placeholder,
  disabled,
  onSubmit,
}: {
  placeholder: string
  disabled?: boolean
  onSubmit: (body: string) => void
}) {
  const [body, setBody] = useState('')
  return (
    <form
      className="commentComposer"
      onSubmit={(event) => {
        event.preventDefault()
        const value = body.trim()
        if (!value) return
        onSubmit(value)
        setBody('')
      }}
    >
      <input
        maxLength={1200}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder={placeholder}
      />
      <button aria-label="发送评论" disabled={disabled || !body.trim()} type="submit">
        <Send size={15} />
      </button>
    </form>
  )
}

function CommentList({ comments }: { comments: QnaComment[] }) {
  const items = Array.isArray(comments) ? comments : []
  if (!items.length) return null
  return (
    <div className="commentList">
      {items.map((comment) => (
        <p key={comment.id}>
          <strong>{comment.author.displayName}</strong>
          <span>{comment.body}</span>
        </p>
      ))}
    </div>
  )
}

function MarkdownView({ source }: { source: string }) {
  const html = useMemo(() => {
    const parsed = marked.parse(markdownSource(source), { async: false }) as string
    const clean = DOMPurify.sanitize(parsed, { ADD_ATTR: ['target', 'rel'] })
    const template = document.createElement('template')
    template.innerHTML = clean
    for (const anchor of template.content.querySelectorAll('a')) {
      anchor.target = '_blank'
      anchor.rel = 'noopener noreferrer'
    }
    return template.innerHTML
  }, [source])
  return <div className="markdown" dangerouslySetInnerHTML={{ __html: html }} />
}

function TagLine({ tags }: { tags: string[] }) {
  if (!tags.length) return null
  return (
    <div className="tagLine">
      {tags.map((tag) => (
        <Link key={tag} params={{ tag }} to="/tags/$tag">
          #{tag}
        </Link>
      ))}
    </div>
  )
}

function ArticleTagLine({ tags }: { tags: string[] }) {
  if (!tags.length) return null
  return (
    <div className="tagLine">
      {tags.map((tag) => (
        <Link key={tag} params={{ query: `#${tag}` }} to="/articles/search/$query">
          #{tag}
        </Link>
      ))}
    </div>
  )
}

function StaticTagLine({ tags }: { tags: string[] }) {
  if (!tags.length) return null
  return (
    <div className="tagLine staticTagLine">
      {tags.map((tag) => (
        <span key={tag}>#{tag}</span>
      ))}
    </div>
  )
}

function ActorLine({
  name,
  avatarUrl,
  suffix,
}: {
  name: string
  avatarUrl?: string | null
  suffix?: string
}) {
  return (
    <div className="actorLine">
      <span className="avatar">
        <ActorAvatar avatarUrl={avatarUrl} name={name} />
      </span>
      <strong>{name}</strong>
      {suffix ? <small>{suffix}</small> : null}
    </div>
  )
}

function ActorAvatar({ name, avatarUrl }: { name: string; avatarUrl?: string | null }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  useEffect(() => {
    setFailedSrc(null)
  }, [avatarUrl])

  const src = avatarUrl && avatarUrl !== failedSrc ? avatarUrl : null
  if (!src) return initials(name)
  return (
    <img
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      src={src}
      onError={() => setFailedSrc(src)}
    />
  )
}

function QuietState({ title }: { title: string }) {
  return (
    <div className="quietState">
      <MessageCircle size={24} />
      <p>{title}</p>
    </div>
  )
}

const scrollStoreKey = 'qna-scroll-positions-v1'

function readScrollPosition(pathname: string) {
  try {
    const raw = window.sessionStorage.getItem(scrollStoreKey)
    if (!raw) return 0
    const positions = JSON.parse(raw) as Record<string, number>
    const value = positions[pathname]
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0
  } catch {
    return 0
  }
}

function writeScrollPosition(pathname: string, value: number) {
  try {
    const raw = window.sessionStorage.getItem(scrollStoreKey)
    const positions = raw ? (JSON.parse(raw) as Record<string, number>) : {}
    positions[pathname] = Math.max(0, Math.round(value))
    window.sessionStorage.setItem(scrollStoreKey, JSON.stringify(positions))
  } catch {
    // Ignore private-mode storage failures.
  }
}

function useRouteScrollRestoration(pathname: string) {
  useEffect(() => {
    if (!('scrollRestoration' in window.history)) return
    const previous = window.history.scrollRestoration
    window.history.scrollRestoration = 'manual'
    return () => {
      window.history.scrollRestoration = previous
    }
  }, [])

  useLayoutEffect(() => {
    const targetY = isFeedPathname(pathname) ? readScrollPosition(pathname) : 0
    let attempts = 0
    let frame = window.requestAnimationFrame(function restore() {
      window.scrollTo({ top: targetY, left: 0 })
      attempts += 1
      if (attempts < 8 && Math.abs(window.scrollY - targetY) > 2) {
        frame = window.requestAnimationFrame(restore)
      }
    })
    return () => window.cancelAnimationFrame(frame)
  }, [pathname])

  useEffect(() => {
    let frame = 0

    function save() {
      writeScrollPosition(pathname, window.scrollY)
    }

    function scheduleSave() {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(save)
    }

    window.addEventListener('scroll', scheduleSave, { passive: true })
    window.addEventListener('pagehide', save)
    return () => {
      window.cancelAnimationFrame(frame)
      save()
      window.removeEventListener('scroll', scheduleSave)
      window.removeEventListener('pagehide', save)
    }
  }, [pathname])
}

function useFloatingMenu(
  open: boolean,
  options: { width: number; maxHeight: number },
  onClose?: () => void,
) {
  const anchorRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({ visibility: 'hidden' })

  useLayoutEffect(() => {
    if (!open) return

    function update() {
      const anchor = anchorRef.current
      if (!anchor) return
      const rect = anchor.getBoundingClientRect()
      const margin = 12
      const width = Math.min(options.width, window.innerWidth - margin * 2)
      const maxHeight = Math.min(options.maxHeight, window.innerHeight - margin * 2)
      const left = Math.min(
        Math.max(margin, rect.right - width),
        window.innerWidth - width - margin,
      )
      const top = Math.min(rect.bottom + 8, window.innerHeight - maxHeight - margin)
      setMenuStyle({
        position: 'fixed',
        left,
        right: 'auto',
        top: Math.max(margin, top),
        width,
        maxHeight,
        visibility: 'visible',
      })
    }

    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open, options.width, options.maxHeight])

  useEffect(() => {
    if (!open || !onClose) return
    const close = onClose

    function handlePointerDown(event: PointerEvent) {
      const target = event.target
      if (!(target instanceof Node)) return
      if (anchorRef.current?.contains(target) || menuRef.current?.contains(target)) return
      close()
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') close()
    }

    document.addEventListener('pointerdown', handlePointerDown, true)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, onClose])

  return { anchorRef, menuRef, menuStyle }
}

function filterLabel(mode: string, tag?: string, query?: string, selectedList?: QnaList) {
  if (mode === 'tag') return `#${tag || ''}`
  if (mode === 'list') return selectedList?.title || '清单'
  if (mode === 'search') return query ? `搜索：${query}` : '搜索'
  return ''
}

function userError(error: unknown, fallback: string) {
  if (!(error instanceof Error)) return fallback
  const message = error.message.trim()
  if (!message || message === 'Command failed') return fallback
  if (message === 'Command timed out') return '请求超时，请稍后重试。'
  if (message === 'Upload failed') return '图片上传失败'
  return message
}

function feedTitle(mode: string, tag?: string, query?: string, selectedList?: QnaList) {
  if (mode === 'hot') return '热门问题'
  if (mode === 'tag') return `#${tag || 'tag'}`
  if (mode === 'search') return query || '搜索'
  if (mode === 'list') return selectedList?.title ?? '清单'
  return '问题'
}

function feedEyebrow(mode: string, tag?: string, query?: string, selectedList?: QnaList) {
  if (mode === 'tag') return `标签 #${tag || ''}`
  if (mode === 'search') return `搜索 ${query || ''}`
  if (mode === 'list') return selectedList?.description || '清单'
  if (mode === 'hot') return '按回答和评论排序'
  return '问答'
}

function questionScore(question: QnaQuestion) {
  return (
    answersOf(question).length * 5 + questionCommentCount(question) * 2 + tagsOf(question).length
  )
}

function questionCommentCount(question: QnaQuestion) {
  return (
    commentsOf(question).length +
    answersOf(question).reduce((total, answer) => total + commentsOf(answer).length, 0)
  )
}

function answersOf(question: QnaQuestion) {
  return Array.isArray(question.answers) ? question.answers : []
}

function tagsOf(item: Pick<QnaQuestion, 'tags'> | Pick<QnaArticle, 'tags'>) {
  return Array.isArray(item.tags) ? item.tags : []
}

function commentsOf(item: Pick<QnaQuestion, 'comments'> | Pick<QnaAnswer, 'comments'>) {
  return Array.isArray(item.comments) ? item.comments : []
}

function displayQuestionTitle(title: string) {
  const value = title
    .trim()
    .replace(/[?？!！.。]+$/g, '')
    .trim()
  return value ? `${value}？` : value
}

function entryTitle(entry: QnaReadingEntry) {
  if (entry.kind === 'article') return entry.article?.title ?? '文章'
  return entry.question ? displayQuestionTitle(entry.question.title) : '问答'
}

function markdownSource(source: string) {
  return source.replace(/\r\n?/g, '\n').replace(/\\n/g, '\n')
}

function splitTags(value: string) {
  return Array.from(
    new Set(
      value
        .split(',')
        .map((item) => item.trim().replace(/^#+/, '').toLowerCase())
        .filter(Boolean),
    ),
  )
}

function appendTag(current: string, tag: string) {
  const tags = splitTags(current)
  if (!tags.includes(tag)) tags.push(tag)
  return tags.map((item) => `#${item}`).join(', ')
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

function plainText(value: string) {
  return value
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\[[^\]]+\]\([^)]+\)/g, (match) => match.replace(/^\[|\]\([^)]+\)$/g, ''))
    .replace(/[`*_>#|-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180)
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

const root = document.getElementById('root')
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </React.StrictMode>,
  )
}
