import './styles.css'
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  RouterProvider,
  useNavigate,
} from '@tanstack/react-router'
import DOMPurify from 'dompurify'
import {
  ArrowLeft,
  BookmarkPlus,
  Check,
  Filter,
  Flame,
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
import type { QnaAnswer, QnaComment, QnaList, QnaQuestion } from '../types.js'
import type { TagSummary } from './api.js'
import {
  addQuestionToList,
  askQuestion,
  createAnswer,
  createComment,
  createList,
  deleteAnswer,
  deleteQuestion,
  getQuestion,
  listLists,
  listQuestions,
  listTags,
  removeQuestionFromList,
  uploadImage,
} from './api.js'

marked.setOptions({ breaks: true, gfm: true })

const queryClient = new QueryClient()

function RootLayout() {
  return (
    <div className="app">
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
  askRoute,
  tagRoute,
  listRoute,
  searchRoute,
  questionRoute,
  answerRoute,
])

const router = createRouter({
  routeTree,
  history: createHashHistory(),
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
  const [query, setQuery] = useState('')

  return (
    <>
      <header className="topbar">
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
            首页
          </Link>
          <Link activeProps={{ className: 'active' }} to="/hot">
            热门
          </Link>
        </nav>
        <form
          className="searchBox"
          onSubmit={(event) => {
            event.preventDefault()
            const value = query.trim()
            if (!value) return
            navigate({ to: '/search/$query', params: { query: value } })
          }}
        >
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索问题或 #标签"
          />
        </form>
        <Link className="primaryButton" to="/ask">
          <Plus size={18} />
          提问
        </Link>
      </header>
      <nav className="mobileTabbar" aria-label="主导航">
        <Link activeProps={{ className: 'active' }} to="/">
          <Home size={20} />
          <span>首页</span>
        </Link>
        <Link activeProps={{ className: 'active' }} to="/hot">
          <Flame size={20} />
          <span>热门</span>
        </Link>
        <Link activeProps={{ className: 'active' }} to="/ask">
          <Plus size={21} />
          <span>提问</span>
        </Link>
      </nav>
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
    },
  })
  const deleteQuestionMutation = useMutation({
    mutationFn: deleteQuestion,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['questions'] })
      queryClient.invalidateQueries({ queryKey: ['tags'] })
      queryClient.invalidateQueries({ queryKey: ['lists'] })
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
              placeholder="#server-apps, #sdk"
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
      <span className="avatar">{avatarUrl ? <img alt="" src={avatarUrl} /> : initials(name)}</span>
      <strong>{name}</strong>
      {suffix ? <small>{suffix}</small> : null}
    </div>
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

function tagsOf(question: QnaQuestion) {
  return Array.isArray(question.tags) ? question.tags : []
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
