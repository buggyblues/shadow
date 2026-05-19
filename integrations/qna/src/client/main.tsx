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
import clsx from 'clsx'
import {
  ArrowLeft,
  BookOpen,
  MessageCircle,
  PenLine,
  Plus,
  Search,
  Send,
  Sparkles,
  TrendingUp,
} from 'lucide-react'
import React, { useMemo, useState } from 'react'
import ReactDOM from 'react-dom/client'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { QnaAnswer, QnaQuestion } from '../types.js'
import type { TopicSummary } from './api.js'
import {
  askQuestion,
  createAnswer,
  createComment,
  getQuestion,
  listQuestions,
  listTopics,
} from './api.js'

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
  component: () => <FeedPage mode="recommended" />,
})

const hotRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/hot',
  component: () => <FeedPage mode="hot" />,
})

const askRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/ask',
  component: () => <FeedPage mode="recommended" askModal />,
})

const topicRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/topics/$topic',
  component: TopicRoutePage,
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
  topicRoute,
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

function TopicRoutePage() {
  const { topic } = topicRoute.useParams()
  return <FeedPage mode="topic" topic={safeDecode(topic)} />
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
  return <QuestionPage questionId={questionId} answerModal />
}

function Header() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')

  return (
    <header className="topbar">
      <Link className="brand" to="/">
        <span className="brandMark">知</span>
        <span>
          <strong>Shadow Answers</strong>
          <small>channel knowledge base</small>
        </span>
      </Link>
      <nav className="nav">
        <Link activeProps={{ className: 'active' }} to="/">
          Home
        </Link>
        <Link activeProps={{ className: 'active' }} to="/hot">
          Hot
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
        <Search size={17} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search questions and topics"
        />
      </form>
      <Link className="primaryAction" to="/ask">
        <Plus size={17} />
        Ask
      </Link>
    </header>
  )
}

function FeedPage({
  mode,
  topic,
  query,
  askModal = false,
}: {
  mode: 'recommended' | 'hot' | 'topic' | 'search'
  topic?: string
  query?: string
  askModal?: boolean
}) {
  const questionsQuery = useQuery({
    queryKey: ['questions', mode, topic, query],
    queryFn: () => listQuestions({ topic, query, limit: 80 }),
  })
  const topicsQuery = useQuery({
    queryKey: ['topics'],
    queryFn: listTopics,
  })

  const questions = useMemo(() => {
    const items = questionsQuery.data?.questions ?? []
    if (mode !== 'hot') return items
    return [...items].sort((a, b) => questionScore(b) - questionScore(a))
  }, [mode, questionsQuery.data?.questions])
  const topics = topicsQuery.data?.topics ?? []
  const answerCount = questions.reduce((total, question) => total + answersOf(question).length, 0)

  return (
    <main className="shell">
      <aside className="leftRail">
        <section className="panel introPanel">
          <span className="sectionIcon">
            <BookOpen size={18} />
          </span>
          <h1>Questions become durable channel knowledge.</h1>
          <p>
            Ask with context, collect Markdown answers, and let Buddies participate in a focused
            discussion.
          </p>
          <Link className="primaryAction wide" to="/ask">
            <PenLine size={17} />
            Ask a question
          </Link>
        </section>
        <TopicPanel topics={topics} />
      </aside>

      <section className="contentColumn">
        <div className="feedHeader">
          <div>
            <p className="eyebrow">{feedEyebrow(mode, topic, query)}</p>
            <h2>{feedTitle(mode, topic, query)}</h2>
          </div>
          <div className="feedStats">
            <span>{questions.length} questions</span>
            <span>{answerCount} answers</span>
          </div>
        </div>
        {questionsQuery.isLoading ? (
          <EmptyState title="Loading questions" body="Fetching the latest channel knowledge." />
        ) : questions.length ? (
          <div className="questionList">
            {questions.map((question) => (
              <QuestionCard key={question.id} question={question} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No questions found"
            body="Create a new question or adjust the search to start a useful thread."
          />
        )}
      </section>

      <aside className="rightRail">
        <section className="panel statPanel">
          <Sparkles size={20} />
          <strong>{topics.length}</strong>
          <span>active topics</span>
        </section>
        <section className="panel guidePanel">
          <h3>Answer quality</h3>
          <p>Use examples, constraints, and tradeoffs. Markdown is rendered in answers.</p>
        </section>
      </aside>

      {askModal ? <AskQuestionModal topics={topics} /> : null}
    </main>
  )
}

function TopicPanel({ topics }: { topics: TopicSummary[] }) {
  return (
    <section className="panel topicPanel">
      <div className="panelTitle">
        <TrendingUp size={17} />
        <h3>Topics</h3>
      </div>
      <div className="topicList">
        {topics.length ? (
          topics.map((item) => (
            <Link
              key={item.topic}
              className="topicRow"
              params={{ topic: item.topic }}
              to="/topics/$topic"
            >
              <span>{item.topic}</span>
              <strong>{item.count}</strong>
            </Link>
          ))
        ) : (
          <p className="muted">Topics appear after questions are published.</p>
        )}
      </div>
    </section>
  )
}

function QuestionCard({ question }: { question: QnaQuestion }) {
  return (
    <Link className="questionCard" params={{ questionId: question.id }} to="/questions/$questionId">
      <div className="questionText">
        <div className="topicChips">
          {topicsOf(question)
            .slice(0, 3)
            .map((topic) => (
              <span key={topic}>{topic}</span>
            ))}
        </div>
        <h3>{question.title}</h3>
        <p>{question.body || 'Open the thread to inspect answers and add context.'}</p>
        <ActorLine name={question.author.displayName} avatarUrl={question.author.avatarUrl} />
      </div>
      <div className="cardMetrics">
        <strong>{answersOf(question).length}</strong>
        <span>answers</span>
        <strong>{questionCommentCount(question)}</strong>
        <span>comments</span>
      </div>
    </Link>
  )
}

function QuestionPage({
  questionId,
  answerModal = false,
}: {
  questionId: string
  answerModal?: boolean
}) {
  const queryClient = useQueryClient()
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

  return (
    <main className="detailShell">
      <section className="detailColumn">
        <Link className="backLink" to="/">
          <ArrowLeft size={16} />
          Back to feed
        </Link>
        {questionQuery.isLoading || !question ? (
          <EmptyState title="Loading question" body="Opening the discussion thread." />
        ) : (
          <>
            <article className="panel questionDetail">
              <div className="topicChips">
                {topicsOf(question).map((topic) => (
                  <Link key={topic} params={{ topic }} to="/topics/$topic">
                    {topic}
                  </Link>
                ))}
              </div>
              <h1>{question.title}</h1>
              {question.body ? <p className="questionBody">{question.body}</p> : null}
              <ActorLine
                name={question.author.displayName}
                avatarUrl={question.author.avatarUrl}
                suffix={new Date(question.createdAt).toLocaleString()}
              />
              <div className="detailActions">
                <Link
                  className="primaryAction"
                  params={{ questionId: question.id }}
                  to="/questions/$questionId/answer"
                >
                  <PenLine size={17} />
                  Write answer
                </Link>
                <span>{answersOf(question).length} answers</span>
              </div>
              <CommentComposer
                disabled={commentMutation.isPending}
                placeholder="Comment on this question"
                onSubmit={(body) =>
                  commentMutation.mutate({
                    targetType: 'question',
                    targetId: question.id,
                    body,
                  })
                }
              />
              <CommentList comments={question.comments} />
            </article>

            <section className="answersSection">
              <h2>Answers</h2>
              {answersOf(question).length ? (
                answersOf(question).map((answer) => (
                  <AnswerCard
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
                <EmptyState title="No answers yet" body="Start with a structured answer." />
              )}
            </section>
            {answerModal ? <AnswerModal question={question} /> : null}
          </>
        )}
      </section>
    </main>
  )
}

function AnswerCard({
  answer,
  onComment,
}: {
  answer: QnaAnswer
  onComment: (body: string) => void
}) {
  return (
    <article className="panel answerCard">
      <ActorLine
        name={answer.author.displayName}
        avatarUrl={answer.author.avatarUrl}
        suffix={new Date(answer.createdAt).toLocaleString()}
      />
      <div className="markdown">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{answer.body}</ReactMarkdown>
      </div>
      <CommentList comments={answer.comments} />
      <CommentComposer placeholder="Reply to this answer" onSubmit={onComment} />
    </article>
  )
}

function AskQuestionModal({ topics }: { topics: TopicSummary[] }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [topicInput, setTopicInput] = useState('')
  const [error, setError] = useState('')
  const mutation = useMutation({
    mutationFn: askQuestion,
    onSuccess: ({ question }) => {
      if (!question?.id) {
        setError('Question was created, but the app could not read its id. Please refresh.')
        return
      }
      queryClient.invalidateQueries({ queryKey: ['questions'] })
      queryClient.invalidateQueries({ queryKey: ['topics'] })
      navigate({ to: '/questions/$questionId', params: { questionId: question.id } })
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Failed to publish question'),
  })

  const topicSuggestions = topics.slice(0, 8).map((item) => item.topic)

  return (
    <Modal title="Ask a question" onClose={() => navigate({ to: '/' })}>
      <form
        className="modalForm"
        onSubmit={(event) => {
          event.preventDefault()
          const nextTitle = title.trim()
          if (!nextTitle) {
            setError('Question title is required.')
            return
          }
          mutation.mutate({
            title: nextTitle,
            body: body.trim(),
            topics: splitTopics(topicInput),
          })
        }}
      >
        <label>
          Question
          <input
            autoFocus
            maxLength={220}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="What should the channel help answer?"
          />
        </label>
        <label>
          Context
          <textarea
            rows={5}
            maxLength={4000}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Add constraints, background, or what a good answer should cover."
          />
        </label>
        <label>
          Topics
          <input
            maxLength={180}
            value={topicInput}
            onChange={(event) => setTopicInput(event.target.value)}
            placeholder="server-apps, sdk, buddies"
          />
        </label>
        {topicSuggestions.length ? (
          <div className="suggestions">
            {topicSuggestions.map((topic) => (
              <button
                key={topic}
                type="button"
                onClick={() => setTopicInput(appendTopic(topicInput, topic))}
              >
                {topic}
              </button>
            ))}
          </div>
        ) : null}
        {error ? <p className="formError">{error}</p> : null}
        <div className="modalActions">
          <button className="secondaryAction" type="button" onClick={() => navigate({ to: '/' })}>
            Cancel
          </button>
          <button className="primaryAction" disabled={mutation.isPending} type="submit">
            <Send size={17} />
            Publish
          </button>
        </div>
      </form>
    </Modal>
  )
}

function AnswerModal({ question }: { question: QnaQuestion }) {
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
    onError: (err) => setError(err instanceof Error ? err.message : 'Failed to publish answer'),
  })

  return (
    <Modal
      title="Write answer"
      onClose={() =>
        navigate({ to: '/questions/$questionId', params: { questionId: question.id } })
      }
    >
      <form
        className="modalForm"
        onSubmit={(event) => {
          event.preventDefault()
          const value = body.trim()
          if (!value) {
            setError('Answer body is required.')
            return
          }
          mutation.mutate({ questionId: question.id, body: value })
        }}
      >
        <div className="answerContext">
          <span>Answering</span>
          <strong>{question.title}</strong>
        </div>
        <textarea
          autoFocus
          rows={12}
          maxLength={12000}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Markdown is supported. Use headings, lists, code blocks, and links when useful."
        />
        {body ? (
          <div className="previewBox">
            <h4>Preview</h4>
            <div className="markdown">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
            </div>
          </div>
        ) : null}
        {error ? <p className="formError">{error}</p> : null}
        <div className="modalActions">
          <button
            className="secondaryAction"
            type="button"
            onClick={() =>
              navigate({ to: '/questions/$questionId', params: { questionId: question.id } })
            }
          >
            Cancel
          </button>
          <button className="primaryAction" disabled={mutation.isPending} type="submit">
            <Send size={17} />
            Publish answer
          </button>
        </div>
      </form>
    </Modal>
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
        value={body}
        maxLength={1200}
        onChange={(event) => setBody(event.target.value)}
        placeholder={placeholder}
      />
      <button aria-label="Send comment" disabled={disabled || !body.trim()} type="submit">
        <Send size={15} />
      </button>
    </form>
  )
}

function CommentList({ comments }: { comments: QnaQuestion['comments'] }) {
  const items = Array.isArray(comments) ? comments : []
  if (!items.length) return null
  return (
    <div className="commentList">
      {items.map((comment) => (
        <p key={comment.id}>
          <strong>{comment.author.displayName}</strong>
          {comment.body}
        </p>
      ))}
    </div>
  )
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string
  children: React.ReactNode
  onClose: () => void
}) {
  return (
    <div className="modalBackdrop" role="presentation">
      <section aria-modal="true" className="modalPanel" role="dialog">
        <div className="modalHeader">
          <h2>{title}</h2>
          <button aria-label="Close" className="iconButton" type="button" onClick={onClose}>
            x
          </button>
        </div>
        {children}
      </section>
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
      <span>{name}</span>
      {suffix ? <small>{suffix}</small> : null}
    </div>
  )
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="panel emptyState">
      <MessageCircle size={28} />
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  )
}

function feedTitle(mode: string, topic?: string, query?: string) {
  if (mode === 'hot') return 'Hot discussions'
  if (mode === 'topic') return topic || 'Topic'
  if (mode === 'search') return `Search: ${query || ''}`
  return 'Recommended questions'
}

function feedEyebrow(mode: string, topic?: string, query?: string) {
  if (mode === 'topic') return `Topic / ${topic || ''}`
  if (mode === 'search') return `Search / ${query || ''}`
  if (mode === 'hot') return 'Ranked by answers and comments'
  return 'Home / Recommended'
}

function questionScore(question: QnaQuestion) {
  return (
    answersOf(question).length * 5 + questionCommentCount(question) * 2 + topicsOf(question).length
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

function topicsOf(question: QnaQuestion) {
  return Array.isArray(question.topics) ? question.topics : []
}

function commentsOf(item: Pick<QnaQuestion, 'comments'> | Pick<QnaAnswer, 'comments'>) {
  return Array.isArray(item.comments) ? item.comments : []
}

function splitTopics(value: string) {
  return Array.from(
    new Set(
      value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  )
}

function appendTopic(current: string, topic: string) {
  const topics = splitTopics(current)
  if (!topics.includes(topic)) topics.push(topic)
  return topics.join(', ')
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
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
