import { QueryClient, QueryClientProvider, useMutation, useQuery } from '@tanstack/react-query'
import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { CheckCircle2, ClipboardCheck, Code2, Loader2, Send, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { CodeSubmission, SubmissionVerdict } from '../types.js'
import {
  createSubmission,
  getChallenge,
  judgeSubmission,
  listChallenges,
  pendingSubmissions,
} from './api.js'
import './styles.css'

const queryClient = new QueryClient()
const verdicts: SubmissionVerdict[] = ['accepted', 'wrong_answer', 'runtime_error', 'needs_review']

const rootRoute = createRootRoute()
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: App,
})
const router = createRouter({
  routeTree: rootRoute.addChildren([indexRoute]),
  history: createHashHistory(),
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

function App() {
  const [selectedChallengeId, setSelectedChallengeId] = useState('two_sum')
  const [query, setQuery] = useState('')
  const [code, setCode] = useState('')
  const [judgeTarget, setJudgeTarget] = useState<CodeSubmission | null>(null)
  const challenges = useQuery({
    queryKey: ['challenges', query],
    queryFn: () => listChallenges({ query: query.trim() || undefined }),
  })
  const selected = useQuery({
    queryKey: ['challenge', selectedChallengeId],
    queryFn: () => getChallenge(selectedChallengeId),
  })
  const pending = useQuery({
    queryKey: ['submissions', 'pending'],
    queryFn: () => pendingSubmissions({ limit: 20 }),
  })
  const challenge = selected.data?.challenge
  const starter = challenge?.starterCode ?? ''
  const submissions = selected.data?.submissions ?? []
  const submit = useMutation({
    mutationFn: () =>
      createSubmission({
        challengeId: selectedChallengeId,
        language: 'javascript',
        code: (code || starter).trim(),
      }),
    onSuccess: () => {
      setCode('')
      void selected.refetch()
      void pending.refetch()
    },
  })
  const stats = useMemo(() => {
    const judged = submissions.filter((item) => item.status === 'judged').length
    return { total: submissions.length, judged }
  }, [submissions])

  return (
    <main className="appShell">
      <aside className="sidebar">
        <div className="brand">
          <Code2 />
          <div>
            <strong>Code Trainer</strong>
            <span>Practice and review</span>
          </div>
        </div>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search challenges"
        />
        <div className="challengeList">
          {(challenges.data?.challenges ?? []).map((item) => (
            <button
              className={
                item.id === selectedChallengeId ? 'challengeLink isActive' : 'challengeLink'
              }
              key={item.id}
              type="button"
              onClick={() => {
                setSelectedChallengeId(item.id)
                setCode(item.starterCode)
              }}
            >
              <span>{item.title}</span>
              <small>{item.difficulty}</small>
            </button>
          ))}
        </div>
      </aside>

      <section className="workspace">
        <div className="hero">
          <div>
            <span className="eyebrow">Programming Coach</span>
            <h1>{challenge?.title ?? 'Loading challenge'}</h1>
            <p>{challenge?.prompt}</p>
          </div>
          <div className="statGrid">
            <div>
              <strong>{stats.total}</strong>
              <span>submissions</span>
            </div>
            <div>
              <strong>{stats.judged}</strong>
              <span>judged</span>
            </div>
          </div>
        </div>

        {challenge ? (
          <div className="mainGrid">
            <section className="panel problemPanel">
              <div className="tagRow">
                {challenge.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
              <h2>Examples</h2>
              {challenge.examples.map((example) => (
                <div className="exampleBox" key={`${example.input}-${example.output}`}>
                  <strong>{example.input}</strong>
                  <span>{example.output}</span>
                </div>
              ))}
              <h2>Judge Instructions</h2>
              <p className="judgeNotes">{challenge.judgeInstructions}</p>
            </section>

            <section className="panel editorPanel">
              <div className="panelHeader">
                <h2>Solution</h2>
                <button type="button" onClick={() => setCode(starter)}>
                  Reset
                </button>
              </div>
              <textarea
                value={code || starter}
                onChange={(event) => setCode(event.target.value)}
                spellCheck={false}
              />
              {submit.error ? <div className="errorText">{submit.error.message}</div> : null}
              <button
                className="primaryAction"
                type="button"
                disabled={submit.isPending || !(code || starter).trim()}
                onClick={() => submit.mutate()}
              >
                {submit.isPending ? <Loader2 className="spinIcon" /> : <Send />}
                Submit for Review
              </button>
            </section>

            <section className="panel queuePanel">
              <div className="panelHeader">
                <h2>Review Queue</h2>
                <ClipboardCheck />
              </div>
              <div className="queueList">
                {(pending.data?.submissions ?? []).map((item) => (
                  <div className="queueItem" key={item.submission.id}>
                    <div>
                      <strong>{item.challenge.title}</strong>
                      <span>{item.submission.author.displayName}</span>
                    </div>
                    <button type="button" onClick={() => setJudgeTarget(item.submission)}>
                      Judge
                    </button>
                  </div>
                ))}
              </div>
              {pending.data?.submissions.length === 0 ? (
                <div className="emptyState">No pending submissions.</div>
              ) : null}
            </section>
          </div>
        ) : null}
      </section>

      {judgeTarget ? (
        <JudgeModal
          submission={judgeTarget}
          onClose={() => setJudgeTarget(null)}
          onComplete={() => {
            setJudgeTarget(null)
            void pending.refetch()
            void selected.refetch()
          }}
        />
      ) : null}
    </main>
  )
}

function JudgeModal(props: {
  submission: CodeSubmission
  onClose: () => void
  onComplete: () => void
}) {
  const [verdict, setVerdict] = useState<SubmissionVerdict>('accepted')
  const [score, setScore] = useState(90)
  const [feedback, setFeedback] = useState('Passes the reviewed cases. Keep the solution concise.')
  const [suggestions, setSuggestions] = useState('Add edge case tests\nExplain time complexity')
  const judge = useMutation({
    mutationFn: () =>
      judgeSubmission({
        submissionId: props.submission.id,
        verdict,
        score,
        feedback,
        suggestions: suggestions
          .split('\n')
          .map((item) => item.trim())
          .filter(Boolean),
      }),
    onSuccess: props.onComplete,
  })

  return (
    <div className="modalBackdrop">
      <div className="modalPanel" role="dialog" aria-modal="true">
        <button className="iconButton" type="button" aria-label="Close" onClick={props.onClose}>
          <X />
        </button>
        <h2>Judge Submission</h2>
        <pre className="codePreview">{props.submission.code}</pre>
        <label>
          Verdict
          <select
            value={verdict}
            onChange={(event) => setVerdict(event.target.value as SubmissionVerdict)}
          >
            {verdicts.map((item) => (
              <option key={item} value={item}>
                {item.replace('_', ' ')}
              </option>
            ))}
          </select>
        </label>
        <label>
          Score
          <input
            type="number"
            min={0}
            max={100}
            value={score}
            onChange={(event) => setScore(Number(event.target.value))}
          />
        </label>
        <label>
          Feedback
          <textarea value={feedback} onChange={(event) => setFeedback(event.target.value)} />
        </label>
        <label>
          Suggestions
          <textarea value={suggestions} onChange={(event) => setSuggestions(event.target.value)} />
        </label>
        {judge.error ? <div className="errorText">{judge.error.message}</div> : null}
        <button
          type="button"
          disabled={judge.isPending || !feedback.trim()}
          onClick={() => judge.mutate()}
        >
          {judge.isPending ? <Loader2 className="spinIcon" /> : <CheckCircle2 />}
          Save Verdict
        </button>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <QueryClientProvider client={queryClient}>
    <RouterProvider router={router} />
  </QueryClientProvider>,
)
