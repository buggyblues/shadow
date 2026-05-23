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
  CheckCircle2,
  ClipboardCheck,
  FilePlus2,
  GraduationCap,
  Layers3,
  ListChecks,
  Plus,
  Send,
  Trash2,
} from 'lucide-react'
import React, { useMemo, useState } from 'react'
import ReactDOM from 'react-dom/client'
import type {
  Quiz,
  QuizAnswerValue,
  QuizQuestion,
  QuizQuestionType,
  QuizSubmission,
} from '../types.js'
import {
  getQuiz,
  gradeSubmission,
  listQuizzes,
  listSubmissions,
  publishQuiz,
  submitQuiz,
} from './api.js'

type QuizWithCounts = Quiz & { submissionCount?: number; pendingCount?: number }
type DraftQuestion = {
  id: string
  type: QuizQuestionType
  prompt: string
  options: string[]
  answerText: string
  correctOptions: string[]
  points: number
  explanation: string
}
type PublishQuizInput = Parameters<typeof publishQuiz>[0]
type ValidateQuizResult = { error: string } | { value: PublishQuizInput }

const queryClient = new QueryClient()
const questionTypes: Array<{ value: QuizQuestionType; label: string }> = [
  { value: 'single', label: 'Single choice' },
  { value: 'multiple', label: 'Multiple choice' },
  { value: 'fill', label: 'Fill blank' },
  { value: 'short', label: 'Written answer' },
]
const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

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
  component: () => <DashboardPage />,
})

const createRouteModal = createRoute({
  getParentRoute: () => rootRoute,
  path: '/create',
  component: () => <DashboardPage createModal />,
})

const reviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/review',
  component: ReviewPage,
})

const quizRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/quizzes/$quizId',
  component: QuizRoutePage,
})

const routeTree = rootRoute.addChildren([indexRoute, createRouteModal, reviewRoute, quizRoute])

const router = createRouter({
  routeTree,
  history: createHashHistory(),
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

function QuizRoutePage() {
  const { quizId } = quizRoute.useParams()
  return <QuizPage quizId={quizId} />
}

function Header() {
  return (
    <header className="topbar">
      <Link className="brand" to="/">
        <span className="brandMark">Q</span>
        <span>
          <strong>Quiz</strong>
          <small>assessment studio</small>
        </span>
      </Link>
      <nav className="nav">
        <Link activeProps={{ className: 'active' }} to="/">
          Quizzes
        </Link>
        <Link activeProps={{ className: 'active' }} to="/review">
          Review
        </Link>
      </nav>
      <Link className="primaryAction" to="/create">
        <Plus size={17} />
        New quiz
      </Link>
    </header>
  )
}

function DashboardPage({ createModal = false }: { createModal?: boolean }) {
  const quizzesQuery = useQuery({ queryKey: ['quizzes'], queryFn: listQuizzes })
  const submissionsQuery = useQuery({
    queryKey: ['submissions', 'pending_review'],
    queryFn: () => listSubmissions({ status: 'pending_review' }),
  })
  const quizzes = quizzesQuery.data?.quizzes ?? []
  const pending = submissionsQuery.data?.submissions ?? []
  const questionCount = quizzes.reduce((sum, quiz) => sum + questionsOf(quiz).length, 0)

  return (
    <main className="shell">
      <section className="hero panel">
        <div>
          <p className="eyebrow">Quiz workspace</p>
          <h1>Quizzes and review queue</h1>
          <p>
            Publish assessments, take them step by step, and keep written answers in one review
            flow.
          </p>
          <div className="heroActions">
            <Link className="primaryAction" to="/create">
              <FilePlus2 size={17} />
              Create quiz
            </Link>
            <Link className="secondaryAction" to="/review">
              <ClipboardCheck size={17} />
              Review queue
            </Link>
          </div>
        </div>
      </section>

      <section className="metrics">
        <Metric icon={<Layers3 size={20} />} label="Published quizzes" value={quizzes.length} />
        <Metric icon={<ListChecks size={20} />} label="Questions" value={questionCount} />
        <Metric
          icon={<ClipboardCheck size={20} />}
          label="Pending reviews"
          value={pending.length}
        />
      </section>

      <section className="library">
        <div className="sectionHeader">
          <div>
            <p className="eyebrow">Library</p>
            <h2>Available quizzes</h2>
          </div>
          <Link className="secondaryAction" to="/create">
            <Plus size={16} />
            Add quiz
          </Link>
        </div>
        {quizzesQuery.isLoading ? (
          <EmptyState title="Loading quizzes" body="Fetching the latest assessments." />
        ) : quizzes.length ? (
          <div className="quizGrid">
            {quizzes.map((quiz, index) => (
              <QuizCard key={quiz.id} index={index} quiz={quiz} />
            ))}
          </div>
        ) : (
          <EmptyState title="No quizzes yet" body="Create the first assessment for this channel." />
        )}
      </section>

      {createModal ? <CreateQuizModal /> : null}
    </main>
  )
}

function QuizCard({ quiz, index }: { quiz: QuizWithCounts; index: number }) {
  return (
    <Link className="quizCard" params={{ quizId: quiz.id }} to="/quizzes/$quizId">
      <span className={clsx('thumb', index % 3 === 1 && 'alt', index % 3 === 2 && 'warm')} />
      <span className="quizInfo">
        <strong>{quiz.title}</strong>
        <span>{quiz.description || 'No description'}</span>
        <span className="badgeRow">
          <span>{questionsOf(quiz).length} questions</span>
          <span>{quizMaxScore(quiz)} pts</span>
          <span>{quiz.pendingCount ?? 0} pending</span>
        </span>
      </span>
    </Link>
  )
}

function QuizPage({ quizId }: { quizId: string }) {
  const queryClient = useQueryClient()
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string, QuizAnswerValue>>({})
  const [marked, setMarked] = useState<Set<string>>(() => new Set())
  const [result, setResult] = useState<QuizSubmission | null>(null)
  const quizQuery = useQuery({
    queryKey: ['quiz', quizId],
    queryFn: () => getQuiz(quizId),
  })
  const submitMutation = useMutation({
    mutationFn: submitQuiz,
    onSuccess: ({ submission }) => {
      if (!submission) return
      setResult(submission)
      setStep(0)
      setMarked(new Set())
      queryClient.invalidateQueries({ queryKey: ['quizzes'] })
      queryClient.invalidateQueries({ queryKey: ['submissions'] })
    },
  })

  const quiz = quizQuery.data?.quiz
  const questions = quiz ? questionsOf(quiz) : []
  const question = questions[step]
  const answeredCount = questions.filter((item) => hasAnswer(answers[item.id])).length
  const progress = questions.length ? Math.round(((step + 1) / questions.length) * 100) : 0

  if (quizQuery.isLoading || !quiz || !question) {
    return (
      <main className="detailShell">
        <EmptyState title="Loading quiz" body="Opening the assessment." />
      </main>
    )
  }

  return (
    <main className="detailShell">
      <Link className="backLink" to="/">
        <ArrowLeft size={16} />
        Back to library
      </Link>
      <section className="panel examPanel">
        <div className="examHead">
          <div>
            <p className="eyebrow">Take quiz</p>
            <h1>{quiz.title}</h1>
            <p>{quiz.description || 'Complete every step and submit for grading.'}</p>
          </div>
          <span className="scoreBadge">{quizMaxScore(quiz)} pts</span>
        </div>

        {result ? <SubmissionResult submission={result} /> : null}

        <div className="progressBlock">
          <span>
            Question {step + 1} of {questions.length} · {answeredCount} answered
          </span>
          <div className="progressTrack">
            <span style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="questionLayout">
          <section className="questionPanel">
            <span className="questionMeta">
              {questionTypeLabel(question.type)} · {question.points} pts
            </span>
            <h2>{question.prompt}</h2>
            <AnswerControl
              question={question}
              value={answers[question.id]}
              onChange={(value) => setAnswers((current) => ({ ...current, [question.id]: value }))}
            />
            <div className="examActions">
              <button
                className="secondaryAction"
                disabled={step === 0}
                type="button"
                onClick={() => setStep((current) => Math.max(0, current - 1))}
              >
                Previous
              </button>
              <button
                className="secondaryAction"
                type="button"
                onClick={() =>
                  setMarked((current) => {
                    const next = new Set(current)
                    if (next.has(question.id)) next.delete(question.id)
                    else next.add(question.id)
                    return next
                  })
                }
              >
                {marked.has(question.id) ? 'Unmark review' : 'Mark review'}
              </button>
              {step < questions.length - 1 ? (
                <button
                  className="primaryAction"
                  type="button"
                  onClick={() => setStep((current) => Math.min(questions.length - 1, current + 1))}
                >
                  Next
                </button>
              ) : (
                <button
                  className="primaryAction"
                  disabled={submitMutation.isPending}
                  type="button"
                  onClick={() => submitMutation.mutate({ quizId: quiz.id, answers })}
                >
                  <Send size={17} />
                  Submit
                </button>
              )}
            </div>
          </section>

          <aside className="navigator panel">
            <strong>Question navigator</strong>
            <span className="muted">
              {answeredCount} answered · {marked.size} marked
            </span>
            <div className="navGrid">
              {questions.map((item, index) => (
                <button
                  key={item.id}
                  className={clsx(
                    'navStep',
                    index === step && 'active',
                    hasAnswer(answers[item.id]) && 'done',
                    marked.has(item.id) && 'marked',
                  )}
                  type="button"
                  onClick={() => setStep(index)}
                >
                  {index + 1}
                </button>
              ))}
            </div>
          </aside>
        </div>
      </section>
    </main>
  )
}

function AnswerControl({
  question,
  value,
  onChange,
}: {
  question: QuizQuestion
  value?: QuizAnswerValue
  onChange: (value: QuizAnswerValue) => void
}) {
  if (question.type === 'single') {
    return (
      <div className="optionList">
        {(question.options ?? []).map((option, index) => (
          <button
            key={option}
            className={clsx('optionCard', value === option && 'selected')}
            type="button"
            onClick={() => onChange(option)}
          >
            <span>{letters[index]}</span>
            {option}
          </button>
        ))}
      </div>
    )
  }
  if (question.type === 'multiple') {
    const selected = Array.isArray(value) ? value : []
    return (
      <div className="optionList">
        {(question.options ?? []).map((option, index) => (
          <button
            key={option}
            className={clsx('optionCard', selected.includes(option) && 'selected')}
            type="button"
            onClick={() => {
              const next = selected.includes(option)
                ? selected.filter((item) => item !== option)
                : [...selected, option]
              onChange(next)
            }}
          >
            <span>{letters[index]}</span>
            {option}
          </button>
        ))}
      </div>
    )
  }
  if (question.type === 'fill') {
    return (
      <input
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Type the exact answer"
      />
    )
  }
  return (
    <textarea
      rows={9}
      value={typeof value === 'string' ? value : ''}
      onChange={(event) => onChange(event.target.value)}
      placeholder="Write a complete answer for review"
    />
  )
}

function ReviewPage() {
  const quizzesQuery = useQuery({ queryKey: ['quizzes'], queryFn: listQuizzes })
  const submissionsQuery = useQuery({
    queryKey: ['submissions', 'pending_review'],
    queryFn: () => listSubmissions({ status: 'pending_review' }),
  })
  const quizById = new Map((quizzesQuery.data?.quizzes ?? []).map((quiz) => [quiz.id, quiz]))

  return (
    <main className="detailShell">
      <section className="sectionHeader">
        <div>
          <p className="eyebrow">Review queue</p>
          <h1>Grade pending submissions</h1>
        </div>
        <Link className="secondaryAction" to="/">
          Back to quizzes
        </Link>
      </section>
      <section className="reviewList">
        {submissionsQuery.isLoading ? (
          <EmptyState title="Loading submissions" body="Fetching pending review items." />
        ) : submissionsQuery.data?.submissions.length ? (
          submissionsQuery.data.submissions.map((submission) => (
            <SubmissionCard
              key={submission.id}
              quiz={quizById.get(submission.quizId)}
              submission={submission}
            />
          ))
        ) : (
          <EmptyState title="No pending reviews" body="Submitted quizzes will appear here." />
        )}
      </section>
    </main>
  )
}

function SubmissionCard({
  submission,
  quiz,
}: {
  submission: QuizSubmission
  quiz?: QuizWithCounts
}) {
  const queryClient = useQueryClient()
  const [score, setScore] = useState(submission.autoScore)
  const [feedback, setFeedback] = useState('')
  const mutation = useMutation({
    mutationFn: gradeSubmission,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['submissions'] })
      queryClient.invalidateQueries({ queryKey: ['quizzes'] })
    },
  })

  return (
    <article className="panel submissionCard">
      <div className="submissionHead">
        <div>
          <strong>{submission.respondent.displayName}</strong>
          <span>
            {quiz?.title || submission.quizId} · auto {submission.autoScore}/{submission.maxScore}
          </span>
        </div>
        <span className="scoreBadge">{submission.maxScore} pts</span>
      </div>
      <div className="answerReviewList">
        {Object.entries(submission.answers ?? {}).map(([questionId, answer]) => {
          const question = quiz
            ? questionsOf(quiz).find((item) => item.id === questionId)
            : undefined
          return (
            <div key={questionId} className="answerReview">
              <strong>{cleanDisplayText(question?.prompt || questionId)}</strong>
              <span>{cleanDisplayText(formatAnswer(answer))}</span>
            </div>
          )
        })}
      </div>
      <form
        className="gradeForm"
        onSubmit={(event) => {
          event.preventDefault()
          mutation.mutate({ submissionId: submission.id, score, feedback })
        }}
      >
        <label>
          Score
          <input
            max={submission.maxScore}
            min={0}
            type="number"
            value={score}
            onChange={(event) => setScore(Number(event.target.value))}
          />
        </label>
        <label>
          Feedback
          <textarea
            rows={3}
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            placeholder="Feedback for the respondent"
          />
        </label>
        <button className="primaryAction" disabled={mutation.isPending} type="submit">
          <CheckCircle2 size={17} />
          Grade
        </button>
      </form>
    </article>
  )
}

function CreateQuizModal() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [questions, setQuestions] = useState<DraftQuestion[]>([newDraftQuestion()])
  const [error, setError] = useState('')
  const mutation = useMutation({
    mutationFn: publishQuiz,
    onSuccess: ({ quiz }) => {
      if (!quiz?.id) {
        setError('Quiz was created, but the app could not read its id. Please refresh.')
        return
      }
      queryClient.invalidateQueries({ queryKey: ['quizzes'] })
      navigate({ to: '/quizzes/$quizId', params: { quizId: quiz.id } })
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Failed to publish quiz'),
  })

  return (
    <Modal title="Create quiz" onClose={() => navigate({ to: '/' })}>
      <form
        className="modalForm"
        onSubmit={(event) => {
          event.preventDefault()
          const payload = validateQuiz(title, description, questions)
          if ('error' in payload) {
            setError(payload.error)
            return
          }
          mutation.mutate(payload.value)
        }}
      >
        <div className="formGrid two">
          <label>
            Quiz title
            <input
              autoFocus
              maxLength={220}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Server App Basics"
            />
          </label>
          <label>
            Description
            <input
              maxLength={4000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What this quiz measures"
            />
          </label>
        </div>

        <div className="builderList">
          {questions.map((question, index) => (
            <QuestionBuilder
              key={question.id}
              index={index}
              question={question}
              canRemove={questions.length > 1}
              onChange={(next) =>
                setQuestions((current) =>
                  current.map((item) => (item.id === question.id ? next : item)),
                )
              }
              onRemove={() =>
                setQuestions((current) => current.filter((item) => item.id !== question.id))
              }
            />
          ))}
        </div>

        <button
          className="secondaryAction wide"
          type="button"
          onClick={() => setQuestions((current) => [...current, newDraftQuestion()])}
        >
          <Plus size={16} />
          Add question
        </button>

        {error ? <p className="formError">{error}</p> : null}
        <div className="modalActions">
          <button className="secondaryAction" type="button" onClick={() => navigate({ to: '/' })}>
            Cancel
          </button>
          <button className="primaryAction" disabled={mutation.isPending} type="submit">
            <Send size={17} />
            Publish quiz
          </button>
        </div>
      </form>
    </Modal>
  )
}

function QuestionBuilder({
  question,
  index,
  canRemove,
  onChange,
  onRemove,
}: {
  question: DraftQuestion
  index: number
  canRemove: boolean
  onChange: (question: DraftQuestion) => void
  onRemove: () => void
}) {
  const isChoice = question.type === 'single' || question.type === 'multiple'
  return (
    <section className="questionBuilder">
      <div className="builderHead">
        <strong>Question {index + 1}</strong>
        {canRemove ? (
          <button
            aria-label="Remove question"
            className="iconButton"
            type="button"
            onClick={onRemove}
          >
            <Trash2 size={16} />
          </button>
        ) : null}
      </div>
      <div className="formGrid two">
        <label>
          Type
          <select
            value={question.type}
            onChange={(event) => {
              const nextType = event.target.value as QuizQuestionType
              onChange({
                ...question,
                type: nextType,
                options: nextType === 'single' || nextType === 'multiple' ? question.options : [],
                correctOptions: [],
                answerText: '',
              })
            }}
          >
            {questionTypes.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Points
          <input
            min={1}
            type="number"
            value={question.points}
            onChange={(event) => onChange({ ...question, points: Number(event.target.value) })}
          />
        </label>
      </div>
      <label>
        Prompt
        <textarea
          rows={3}
          value={question.prompt}
          onChange={(event) => onChange({ ...question, prompt: event.target.value })}
          placeholder="Question prompt"
        />
      </label>
      {isChoice ? (
        <ChoiceBuilder question={question} onChange={onChange} />
      ) : (
        <label>
          Standard answer
          <textarea
            rows={3}
            value={question.answerText}
            onChange={(event) => onChange({ ...question, answerText: event.target.value })}
            placeholder={
              question.type === 'fill'
                ? 'Exact answer used for auto scoring'
                : 'Reference answer for grader review'
            }
          />
        </label>
      )}
      <label>
        Explanation
        <input
          value={question.explanation}
          onChange={(event) => onChange({ ...question, explanation: event.target.value })}
          placeholder="Optional explanation shown to graders"
        />
      </label>
    </section>
  )
}

function ChoiceBuilder({
  question,
  onChange,
}: {
  question: DraftQuestion
  onChange: (question: DraftQuestion) => void
}) {
  return (
    <div className="choiceBuilder">
      {question.options.map((option, index) => {
        const selected = question.correctOptions.includes(option)
        return (
          <div key={`${question.id}-${index}`} className="choiceRow">
            <button
              className={clsx('correctToggle', selected && 'selected')}
              type="button"
              onClick={() => {
                const nextCorrect =
                  question.type === 'single'
                    ? [option]
                    : selected
                      ? question.correctOptions.filter((item) => item !== option)
                      : [...question.correctOptions, option]
                onChange({ ...question, correctOptions: nextCorrect })
              }}
            >
              {question.type === 'single' ? '○' : '□'}
            </button>
            <input
              value={option}
              onChange={(event) => {
                const nextOptions = question.options.map((item, itemIndex) =>
                  itemIndex === index ? event.target.value : item,
                )
                const nextCorrect = question.correctOptions.map((item) =>
                  item === option ? event.target.value : item,
                )
                onChange({ ...question, options: nextOptions, correctOptions: nextCorrect })
              }}
              placeholder={`Option ${index + 1}`}
            />
            <button
              aria-label="Remove option"
              className="iconButton"
              type="button"
              onClick={() =>
                onChange({
                  ...question,
                  options: question.options.filter((_, itemIndex) => itemIndex !== index),
                  correctOptions: question.correctOptions.filter((item) => item !== option),
                })
              }
            >
              <Trash2 size={15} />
            </button>
          </div>
        )
      })}
      <button
        className="secondaryAction"
        type="button"
        onClick={() => onChange({ ...question, options: [...question.options, ''] })}
      >
        <Plus size={15} />
        Add option
      </button>
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
    <div className="modalBackdrop">
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

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="metric panel">
      {icon}
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  )
}

function SubmissionResult({ submission }: { submission: QuizSubmission }) {
  return (
    <div className="resultBox">
      <GraduationCap size={18} />
      <strong>Submitted for review</strong>
      <span>
        Auto score {submission.autoScore}/{submission.maxScore}. A grader can finalize the result
        from the review queue.
      </span>
    </div>
  )
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="panel emptyState">
      <ClipboardCheck size={30} />
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  )
}

function newDraftQuestion(): DraftQuestion {
  return {
    id: `draft_${Math.random().toString(36).slice(2)}`,
    type: 'single',
    prompt: '',
    options: ['Option A', 'Option B'],
    correctOptions: [],
    answerText: '',
    points: 1,
    explanation: '',
  }
}

function validateQuiz(
  title: string,
  description: string,
  questions: DraftQuestion[],
): ValidateQuizResult {
  const cleanTitle = title.trim()
  if (!cleanTitle) return { error: 'Quiz title is required.' } as const
  const parsed: Array<Omit<QuizQuestion, 'id'> & { id?: string }> = []
  for (const [index, question] of questions.entries()) {
    const prompt = question.prompt.trim()
    if (!prompt) return { error: `Question ${index + 1} needs a prompt.` } as const
    if (question.points < 1)
      return { error: `Question ${index + 1} needs at least 1 point.` } as const
    if (question.type === 'single' || question.type === 'multiple') {
      const options = question.options.map((item) => item.trim()).filter(Boolean)
      if (options.length < 2)
        return { error: `Question ${index + 1} needs at least 2 options.` } as const
      const correct = question.correctOptions.map((item) => item.trim()).filter(Boolean)
      if (!correct.length)
        return { error: `Question ${index + 1} needs a correct answer.` } as const
      parsed.push({
        type: question.type,
        prompt,
        options,
        answer: question.type === 'single' ? (correct[0] ?? '') : correct,
        points: question.points,
        explanation: question.explanation.trim() || undefined,
      })
      continue
    }
    const answer = question.answerText.trim()
    if (!answer) return { error: `Question ${index + 1} needs a standard answer.` } as const
    parsed.push({
      type: question.type,
      prompt,
      answer,
      points: question.points,
      explanation: question.explanation.trim() || undefined,
    })
  }
  return {
    value: {
      title: cleanTitle,
      description: description.trim(),
      questions: parsed,
    },
  } as const
}

function quizMaxScore(quiz: Quiz) {
  return questionsOf(quiz).reduce((sum, question) => sum + Number(question.points || 0), 0)
}

function questionsOf(quiz: Quiz) {
  return Array.isArray(quiz.questions) ? quiz.questions : []
}

function hasAnswer(value: QuizAnswerValue | undefined) {
  if (Array.isArray(value)) return value.length > 0
  return String(value ?? '').trim().length > 0
}

function questionTypeLabel(type: QuizQuestionType) {
  return questionTypes.find((item) => item.value === type)?.label ?? type
}

function formatAnswer(value: QuizAnswerValue) {
  return Array.isArray(value) ? value.join(', ') : value
}

function cleanDisplayText(value: string) {
  return value.replace(/\\n/g, '\n')
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
