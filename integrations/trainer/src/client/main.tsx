import { Editor as MonacoEditor } from '@monaco-editor/react'
import { ShadowBridge } from '@shadowob/sdk/bridge'
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
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import {
  ArrowRight,
  BookOpen,
  Bot,
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  Code2,
  Download,
  ExternalLink,
  FileText,
  History,
  Layers3,
  Lightbulb,
  ListChecks,
  Loader2,
  Plus,
  RotateCcw,
  Search,
  Send,
  Sparkles,
  Target,
  TerminalSquare,
} from 'lucide-react'
import { type ReactNode, type RefObject, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Challenge, CodeSubmission, SubmissionReviewFocus, TrainerLanguage } from '../types.js'
import {
  type BuddyInboxOption,
  createSubmission,
  getChallenge,
  getSubmission,
  importProblemSource,
  listBuddyInboxes,
  listChallenges,
  listSubmissions,
  type ProblemSource,
  searchProblemSources,
  subscribeTrainerEvents,
} from './api.js'
import { configureMonacoWorkers } from './monaco.js'
import './styles.css'

configureMonacoWorkers()

type WorkspaceView = 'description' | 'submissions' | 'submission' | 'waiting'
type ConsoleView = 'testcase' | 'result'
type LanguageOption = {
  value: TrainerLanguage
  label: string
  monaco: string
}
type ReviewFocusOption = {
  value: SubmissionReviewFocus
  label: string
  hint: string
}
type ProblemSourceProvider = ProblemSource['provider']
type StudyTrack = {
  id: string
  title: string
  principle: string
  theory: string
  invariant: string
  template: string[]
  pitfalls: string[]
  checkpoint: string
  tags: string[]
  buddyDrill: string
}

const queryClient = new QueryClient()
const languageOptions: LanguageOption[] = [
  { value: 'javascript', label: 'JavaScript', monaco: 'javascript' },
  { value: 'typescript', label: 'TypeScript', monaco: 'typescript' },
  { value: 'python', label: 'Python', monaco: 'python' },
]
const reviewerStorageKey = 'shadow-trainer:preferred-reviewer'
const reviewFocusStorageKey = 'shadow-trainer:review-focus'
const reviewFocusOptions: ReviewFocusOption[] = [
  {
    value: 'standard',
    label: 'Sandbox review',
    hint: 'run cases and explain correctness',
  },
  {
    value: 'debug',
    label: 'Debug hints',
    hint: 'find the first failing state',
  },
  {
    value: 'interview',
    label: 'Interview coaching',
    hint: 'train explanation and follow-ups',
  },
  {
    value: 'complexity',
    label: 'Complexity review',
    hint: 'focus on tradeoffs and proof',
  },
]
const defaultReviewFocusOption = reviewFocusOptions[0] as ReviewFocusOption
const problemSourceOptions: Array<{
  value: ProblemSourceProvider
  label: string
  hint: string
}> = [
  {
    value: 'exercism',
    label: 'Exercism',
    hint: 'open statements and canonical JSON tests',
  },
  {
    value: 'leetcode',
    label: 'LeetCode',
    hint: 'statements and examples via alfa-leetcode-api',
  },
  {
    value: 'codeforces',
    label: 'Codeforces',
    hint: 'official metadata plus mirror statements and samples',
  },
]
const defaultProblemSourceOption = problemSourceOptions[0] as (typeof problemSourceOptions)[number]
const problemSourcePageSize = 24
const studyTracks: StudyTrack[] = [
  {
    id: 'array-hash',
    title: 'Array and Hashing',
    principle: 'Turn repeated lookup into stored state, then prove what each map entry means.',
    theory:
      'Array problems usually become easier when you name the information you wish you already had. Hash maps make that information constant-time state.',
    invariant:
      'Before index i is processed, the map contains exactly the values from earlier indices and the answer has not appeared among them.',
    template: [
      'Define the value you need to find later.',
      'Check the stored state before writing the current item.',
      'Store enough information to reconstruct the answer.',
    ],
    pitfalls: [
      'Storing values instead of indices',
      'Using the same element twice',
      'Updating state before checking the complement',
    ],
    checkpoint: 'Explain why the map contents are sufficient and why no earlier pair was skipped.',
    tags: ['hash-map', 'hash-table', 'hashing'],
    buddyDrill: 'Ask Buddy to make you state the invariant before debugging the code.',
  },
  {
    id: 'stack-parsing',
    title: 'Stack and Parsing',
    principle:
      'Model the most recent unresolved choice, then pop only when the matching fact appears.',
    theory:
      'A stack is a memory of unfinished obligations. It is useful when the next valid action depends on the most recent unmatched item.',
    invariant:
      'After each character or token, the stack contains unmatched openings in the exact order they still need to be closed.',
    template: [
      'Classify each token as opening, closing, or ignorable.',
      'Push openings with the metadata needed for matching.',
      'On closing, fail fast if the top item does not match.',
    ],
    pitfalls: [
      'Counting symbols without order',
      'Calling pop on an empty stack without intent',
      'Forgetting the final empty-stack check',
    ],
    checkpoint: 'Trace one failing case and point to the first token where the invariant breaks.',
    tags: ['stack', 'parsing', 'bracket', 'parentheses'],
    buddyDrill: 'Ask Buddy for one smallest counterexample and one whiteboard trace.',
  },
  {
    id: 'two-pointers',
    title: 'Two Pointers and Windows',
    principle: 'Move boundaries because a monotonic fact proves which candidates can be discarded.',
    theory:
      'Two pointers are not just two indices. They encode a shrinking or sliding search space where each movement discards impossible states.',
    invariant:
      'At every step, all discarded positions are provably unable to improve the current answer.',
    template: [
      'State the sorted, monotonic, or window condition.',
      'Move the boundary that can no longer help.',
      'Update the answer only when the window is valid.',
    ],
    pitfalls: [
      'Moving both pointers without proof',
      'Letting the window become invalid silently',
      'Confusing inclusive and exclusive bounds',
    ],
    checkpoint: 'Justify one pointer movement using only the problem constraints, not intuition.',
    tags: ['two-pointers', 'sliding-window', 'window'],
    buddyDrill: 'Ask Buddy to challenge every pointer movement with why it is safe.',
  },
  {
    id: 'search-order',
    title: 'Binary Search and Ordered Decisions',
    principle:
      'Define the predicate first, then search the first or last position where it changes.',
    theory:
      'Binary search applies to ordered answers, not just arrays. The hard part is proving the predicate flips once.',
    invariant:
      'The answer is always inside the current interval, and each update removes a side that cannot contain the boundary.',
    template: [
      'Write the predicate in one sentence.',
      'Choose first true or last true before coding.',
      'Use one interval convention and preserve it every loop.',
    ],
    pitfalls: [
      'Searching a predicate that is not monotonic',
      'Mixing inclusive and exclusive bounds',
      'Returning mid instead of the maintained answer',
    ],
    checkpoint: 'Draw the true/false boundary and say which side each branch removes.',
    tags: ['binary-search', 'search'],
    buddyDrill: 'Ask Buddy to review predicate design and off-by-one cases before code style.',
  },
  {
    id: 'graphs-trees',
    title: 'Trees and Graphs',
    principle:
      'Choose traversal state deliberately: visited set, parent relation, depth, or accumulated path.',
    theory:
      'Graph problems are state design problems. The traversal is only correct when the carried state matches the property being asked.',
    invariant:
      'Every queued or recursive node has a well-defined reason for being visited and the state attached to it is still valid.',
    template: [
      'Choose DFS, BFS, or topological order from the question.',
      'Store visited state at the right granularity.',
      'Separate graph construction from traversal logic.',
    ],
    pitfalls: [
      'Marking visited too late',
      'Forgetting disconnected components',
      'Treating directed and undirected edges the same',
    ],
    checkpoint: 'Describe what a visited entry means and when it becomes true.',
    tags: ['tree', 'graph', 'dfs', 'bfs'],
    buddyDrill: 'Ask Buddy to generate one cycle case and one disconnected case.',
  },
  {
    id: 'dynamic-programming',
    title: 'Dynamic Programming',
    principle: 'Name the subproblem, prove the transition, then choose memoization or table order.',
    theory:
      'Dynamic programming caches repeated decisions. The key is to make each state small enough to reuse and complete enough to decide.',
    invariant:
      'When a state is read, every dependency needed by its recurrence has already been solved or memoized.',
    template: [
      'Name the state with parameters and meaning.',
      'List choices that transition into smaller states.',
      'Pick memoization or table order from dependency direction.',
    ],
    pitfalls: [
      'Adding dimensions without meaning',
      'Returning the recurrence before defining the base cases',
      'Using a table order that reads future values',
    ],
    checkpoint:
      'Say the state definition and recurrence without code, then test it on a tiny input.',
    tags: ['dynamic-programming', 'dp'],
    buddyDrill: 'Ask Buddy to explain the recurrence without giving the final implementation.',
  },
  {
    id: 'greedy-intervals',
    title: 'Greedy and Intervals',
    principle: 'Find the exchange argument: why the local choice cannot make the future worse.',
    theory:
      'Greedy works when a local decision can be exchanged into an optimal solution without harming the future.',
    invariant:
      'After each choice, there exists an optimal solution that agrees with all choices made so far.',
    template: [
      'Sort by the property that makes future choices easiest.',
      'Choose the local item and name what it preserves.',
      'Prove skipped alternatives cannot lead to a better result.',
    ],
    pitfalls: [
      'Sorting by a plausible but unproved field',
      'Confusing earliest start with earliest finish',
      'Missing equal-value tie handling',
    ],
    checkpoint: 'Give Buddy a counterexample attempt and explain why the greedy rule survives it.',
    tags: ['greedy', 'interval', 'sorting'],
    buddyDrill: 'Ask Buddy for a failed greedy counterexample before accepting the rule.',
  },
  {
    id: 'math-implementation',
    title: 'Math and Implementation',
    principle:
      'Reduce the rule to constraints, parity, divisibility, bounds, or careful simulation.',
    theory:
      'Math implementation problems punish vague reasoning. Translate each constraint into a small rule before writing loops.',
    invariant:
      'Every transformation preserves the original answer, or every simulation step matches the statement exactly.',
    template: [
      'Extract constraints and derive the smallest reusable rule.',
      'Decide whether proof, formula, or bounded simulation is enough.',
      'Write edge cases before performance optimizations.',
    ],
    pitfalls: [
      'Ignoring integer bounds',
      'Overfitting sample tests',
      'Mixing one-based statement math with zero-based code',
    ],
    checkpoint: 'Separate parsing, formula, and proof in your explanation before coding.',
    tags: ['math', 'simulation', 'implementation', 'brute force'],
    buddyDrill: 'Ask Buddy to separate formula reasoning from input parsing mistakes.',
  },
]

const generalStudyTrack: StudyTrack = {
  id: 'general',
  title: 'Mixed Review',
  principle: 'Use uncategorized problems to discover weak patterns and route them into a track.',
  theory:
    'A mixed set is useful only after you classify each miss. Treat every attempt as evidence for which principle needs more practice.',
  invariant:
    'Every reviewed problem should leave behind one named pattern, one failure mode, and one next drill.',
  template: [
    'Solve once without hints.',
    'Ask Buddy to classify the underlying pattern.',
    'Move the problem into the closest study path mentally before retrying.',
  ],
  pitfalls: [
    'Random practice without notes',
    'Only reading accepted solutions',
    'Not retrying after feedback',
  ],
  checkpoint: 'Write the pattern name and the reason your first attempt failed.',
  tags: [],
  buddyDrill: 'Ask Buddy which pattern this problem belongs to before solving.',
}

const rootRoute = createRootRoute({
  component: RootLayout,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: ProblemsPage,
})

const problemsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/problems',
  component: ProblemsPage,
})

const submissionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/submissions',
  component: SubmissionsPage,
})

const studyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/study',
  component: StudyPage,
})

const importRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/import',
  component: ImportPage,
})

const problemRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/problems/$challengeId',
  component: ProblemRoutePage,
})

const problemSubmissionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/problems/$challengeId/submissions',
  component: ProblemSubmissionsRoutePage,
})

const submissionDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/problems/$challengeId/submissions/$submissionId',
  component: SubmissionDetailRoutePage,
})

const submissionWaitingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/problems/$challengeId/submissions/$submissionId/waiting',
  component: SubmissionWaitingRoutePage,
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  problemsRoute,
  studyRoute,
  submissionsRoute,
  importRoute,
  problemRoute,
  problemSubmissionsRoute,
  submissionDetailRoute,
  submissionWaitingRoute,
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

function RootLayout() {
  useTrainerRuntimeInvalidation()

  return (
    <div className="appShell">
      <header className="topbar">
        <Link className="brand" to="/problems">
          <span className="brandMark">
            <Code2 size={19} />
          </span>
          <span>
            <strong>Code Trainer</strong>
            <small>practice workspace</small>
          </span>
        </Link>
        <nav className="nav">
          <Link activeProps={{ className: 'active' }} to="/problems">
            Problems
          </Link>
          <Link activeProps={{ className: 'active' }} to="/study">
            Study
          </Link>
          <Link activeProps={{ className: 'active' }} to="/submissions">
            Submissions
          </Link>
          <Link activeProps={{ className: 'active' }} to="/import">
            Import
          </Link>
        </nav>
      </header>
      <Outlet />
    </div>
  )
}

function ProblemRoutePage() {
  const { challengeId } = problemRoute.useParams()
  return <ProblemWorkspace challengeId={challengeId} view="description" />
}

function ProblemSubmissionsRoutePage() {
  const { challengeId } = problemSubmissionsRoute.useParams()
  return <ProblemWorkspace challengeId={challengeId} view="submissions" />
}

function SubmissionDetailRoutePage() {
  const { challengeId, submissionId } = submissionDetailRoute.useParams()
  return (
    <ProblemWorkspace challengeId={challengeId} submissionId={submissionId} view="submission" />
  )
}

function SubmissionWaitingRoutePage() {
  const { challengeId, submissionId } = submissionWaitingRoute.useParams()
  return <ProblemWorkspace challengeId={challengeId} submissionId={submissionId} view="waiting" />
}

function ProblemsPage() {
  const [query, setQuery] = useState('')
  const [difficulty, setDifficulty] = useState<Challenge['difficulty'] | 'all'>('all')
  const challengesQuery = useQuery({
    queryKey: ['challenges', query, difficulty],
    queryFn: () =>
      listChallenges({
        query: query.trim() || undefined,
        difficulty: difficulty === 'all' ? undefined : difficulty,
      }),
  })
  const challenges = challengesQuery.data?.challenges ?? []

  return (
    <main className="libraryPage">
      <section className="libraryHeader">
        <div>
          <p className="eyebrow">Problem set</p>
          <h1>Choose a challenge</h1>
        </div>
        <div className="librarySearch">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by title, tag, or prompt"
          />
        </div>
      </section>

      <div className="filterBar" aria-label="Difficulty">
        {(['all', 'easy', 'medium', 'hard'] as const).map((item) => (
          <button
            className={clsx('segmentedButton', difficulty === item && 'active')}
            key={item}
            type="button"
            onClick={() => setDifficulty(item)}
          >
            {item === 'all' ? 'All' : difficultyLabel(item)}
          </button>
        ))}
      </div>

      {challengesQuery.isLoading ? (
        <EmptyState icon={<Loader2 className="spinIcon" />} title="Loading problems" />
      ) : challenges.length ? (
        <section className="problemTable" aria-label="Problems">
          <div className="problemTableHeader">
            <span>#</span>
            <span>Title</span>
            <span>Source</span>
            <span>Tests</span>
            <span>Difficulty</span>
          </div>
          {challenges.map((challenge, index) => (
            <ProblemCard challenge={challenge} index={index} key={challenge.id} />
          ))}
        </section>
      ) : (
        <EmptyState icon={<BookOpen size={24} />} title="No problems found" />
      )}
    </main>
  )
}

function StudyPage() {
  const studyRef = useRef<HTMLElement>(null)
  const [activeTrackId, setActiveTrackId] = useState(studyTracks[0]?.id ?? 'array-hash')
  const challengesQuery = useQuery({
    queryKey: ['challenges', 'study'],
    queryFn: () => listChallenges({}),
  })
  const submissionsQuery = useQuery({
    queryKey: ['submissions', 'study'],
    queryFn: () => listSubmissions({ limit: 100 }),
  })
  const challenges = challengesQuery.data?.challenges ?? []
  const acceptedChallengeIds = useMemo(
    () =>
      new Set(
        (submissionsQuery.data?.submissions ?? [])
          .filter((submission) => submission.analysis?.outcome === 'accepted')
          .map((submission) => submission.challengeId),
      ),
    [submissionsQuery.data?.submissions],
  )
  const trackByChallengeId = useMemo(() => {
    return new Map(
      challenges.map((challenge) => [challenge.id, firstMatchingTrackId(challenge)] as const),
    )
  }, [challenges])
  const uncategorized = useMemo(() => {
    return challenges.filter((challenge) => !trackByChallengeId.get(challenge.id))
  }, [challenges, trackByChallengeId])
  const tracks = useMemo(
    () => (uncategorized.length ? [...studyTracks, generalStudyTrack] : studyTracks),
    [uncategorized.length],
  )
  const activeTrack = tracks.find((track) => track.id === activeTrackId) ?? tracks[0]
  const activeTrackChallenges = useMemo(() => {
    if (!activeTrack) return []
    if (activeTrack.id === generalStudyTrack.id) return uncategorized
    return challenges.filter((challenge) => trackByChallengeId.get(challenge.id) === activeTrack.id)
  }, [activeTrack, challenges, trackByChallengeId, uncategorized])
  const activeSolvedCount = activeTrackChallenges.filter((challenge) =>
    acceptedChallengeIds.has(challenge.id),
  ).length
  const continueChallenge =
    activeTrackChallenges.find((challenge) => !acceptedChallengeIds.has(challenge.id)) ??
    activeTrackChallenges[0]

  useStudyMotion(studyRef, activeTrack?.id)

  return (
    <main className="studyPage" ref={studyRef}>
      <section className="studyHero motion-reveal">
        <div className="studyHeroCopy">
          <p className="eyebrow">Study studio</p>
          <h1>Learn the principle before the next attempt.</h1>
          <p>
            Build the mental model first, solve one focused problem, then let Buddy test the
            invariant, sandbox cases, and interview explanation.
          </p>
        </div>
        <div className="studyHeroPanel">
          <span>Progress</span>
          <strong>
            {acceptedChallengeIds.size}/{challenges.length || 0}
          </strong>
          <p>accepted across the local library</p>
          <div className="studyPhaseStrip">
            <span>Theory</span>
            <span>Drill</span>
            <span>Review</span>
          </div>
        </div>
      </section>

      {challengesQuery.isLoading ? (
        <EmptyState icon={<Loader2 className="spinIcon" />} title="Loading study plan" />
      ) : (
        <>
          <section className="studyStudioGrid" aria-label="Study paths">
            <aside className="studyTrackRail motion-reveal">
              <div className="railHeader">
                <h2>Paths</h2>
                <span>{tracks.length} tracks</span>
              </div>
              {tracks.map((track) => {
                const trackChallenges =
                  track.id === generalStudyTrack.id
                    ? uncategorized
                    : challenges.filter(
                        (challenge) => trackByChallengeId.get(challenge.id) === track.id,
                      )
                const solvedCount = trackChallenges.filter((challenge) =>
                  acceptedChallengeIds.has(challenge.id),
                ).length
                return (
                  <button
                    className={clsx('studyTrackButton', activeTrack?.id === track.id && 'active')}
                    key={track.id}
                    type="button"
                    onClick={() => setActiveTrackId(track.id)}
                  >
                    <span>
                      <strong>{track.title}</strong>
                      <small>{track.principle}</small>
                    </span>
                    <em>
                      {solvedCount}/{trackChallenges.length}
                    </em>
                  </button>
                )
              })}
            </aside>

            {activeTrack ? (
              <section className="theoryStudio" aria-live="polite">
                <div className="studioHeader motion-reveal">
                  <div>
                    <p className="eyebrow">Theory path</p>
                    <h2>{activeTrack.title}</h2>
                    <p>{activeTrack.principle}</p>
                  </div>
                  {continueChallenge ? (
                    <Link
                      className="primaryLink"
                      params={{ challengeId: continueChallenge.id }}
                      to="/problems/$challengeId"
                    >
                      <Sparkles size={16} />
                      Start drill
                    </Link>
                  ) : (
                    <Link className="primaryLink" to="/import">
                      <Download size={16} />
                      Import drills
                    </Link>
                  )}
                </div>

                <div className="theoryBento">
                  <article className="theoryTile theoryTileLarge stackMotionCard">
                    <Brain size={20} />
                    <h3>Principle</h3>
                    <p>{activeTrack.theory}</p>
                  </article>
                  <article className="theoryTile stackMotionCard">
                    <Target size={20} />
                    <h3>Invariant</h3>
                    <p>{activeTrack.invariant}</p>
                  </article>
                  <article className="theoryTile stackMotionCard">
                    <Layers3 size={20} />
                    <h3>Template</h3>
                    <ol>
                      {activeTrack.template.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                  </article>
                  <article className="theoryTile stackMotionCard">
                    <ListChecks size={20} />
                    <h3>Pitfalls</h3>
                    <ul>
                      {activeTrack.pitfalls.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </article>
                  <article className="theoryTile buddyTheoryTile stackMotionCard">
                    <Bot size={20} />
                    <h3>Buddy coaching</h3>
                    <p>{activeTrack.buddyDrill}</p>
                    <p>{activeTrack.checkpoint}</p>
                  </article>
                </div>
              </section>
            ) : null}
          </section>

          <section className="studyQueue motion-reveal" aria-label="Track problem queue">
            <div className="queueHeader">
              <div>
                <p className="eyebrow">Drill queue</p>
                <h2>{activeTrack?.title ?? 'Study'} problems</h2>
              </div>
              <span>
                {activeSolvedCount}/{activeTrackChallenges.length} accepted
              </span>
            </div>
            {activeTrackChallenges.length ? (
              <div className="queueList">
                {activeTrackChallenges.slice(0, 8).map((challenge, index) => (
                  <Link
                    className="queueProblemRow"
                    key={challenge.id}
                    params={{ challengeId: challenge.id }}
                    to="/problems/$challengeId"
                  >
                    <span className="problemNumber">{String(index + 1).padStart(2, '0')}</span>
                    <span className="problemMeta">
                      <strong>{challenge.title}</strong>
                      <span>{challenge.tags.join(', ') || 'general'}</span>
                    </span>
                    <span
                      className={clsx(
                        'statusDot',
                        acceptedChallengeIds.has(challenge.id) && 'done',
                      )}
                    />
                    <span className={clsx('difficultyBadge', challenge.difficulty)}>
                      {difficultyLabel(challenge.difficulty)}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState icon={<Download size={24} />} title="No drills in this path yet" />
            )}
          </section>
        </>
      )}
    </main>
  )
}

function useStudyMotion(rootRef: RefObject<HTMLElement | null>, activeTrackId?: string) {
  useEffect(() => {
    const root = rootRef.current
    if (!root || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    gsap.registerPlugin(ScrollTrigger)
    const context = gsap.context(() => {
      gsap.fromTo(
        '.motion-reveal',
        { autoAlpha: 0, y: 26 },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.7,
          ease: 'power3.out',
          stagger: 0.08,
        },
      )
      gsap.utils.toArray<HTMLElement>('.stackMotionCard').forEach((card, index) => {
        gsap.fromTo(
          card,
          { y: 24, scale: 0.985 },
          {
            y: 0,
            scale: 1,
            ease: 'none',
            scrollTrigger: {
              trigger: card,
              start: 'top 92%',
              end: 'bottom 68%',
              scrub: true,
            },
            delay: index * 0.03,
          },
        )
      })
    }, root)
    return () => context.revert()
  }, [rootRef, activeTrackId])
}

function ProblemCard({ challenge, index }: { challenge: Challenge; index: number }) {
  return (
    <Link className="problemRow" params={{ challengeId: challenge.id }} to="/problems/$challengeId">
      <span className="problemNumber">{String(index + 1).padStart(3, '0')}</span>
      <span className="problemMeta">
        <strong>{challenge.title}</strong>
        <span>{challenge.tags.join(', ') || 'general'}</span>
      </span>
      <span className="sourceBadge">{sourceLabel(challenge)}</span>
      <span className="caseCount">{caseCountLabel(challenge)}</span>
      <span className={clsx('difficultyBadge', challenge.difficulty)}>
        {difficultyLabel(challenge.difficulty)}
      </span>
    </Link>
  )
}

function ImportPage() {
  const client = useQueryClient()
  const navigate = useNavigate()
  const [provider, setProvider] = useState<ProblemSourceProvider>('exercism')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const selectedProvider =
    problemSourceOptions.find((option) => option.value === provider) ?? defaultProblemSourceOption
  const normalizedQuery = query.trim()
  const offset = page * problemSourcePageSize
  const sourcesQuery = useQuery({
    queryKey: ['problem-sources', provider, normalizedQuery, page],
    queryFn: () =>
      searchProblemSources({
        provider,
        query: normalizedQuery || undefined,
        limit: problemSourcePageSize,
        offset,
      }),
    placeholderData: (previousData) => previousData,
  })
  const importSource = useMutation({
    mutationFn: (source: ProblemSource) =>
      importProblemSource({ provider: source.provider, sourceId: source.id }),
    onSuccess: async ({ challenge }) => {
      await client.invalidateQueries({ queryKey: ['challenges'] })
      void navigate({ to: '/problems/$challengeId', params: { challengeId: challenge.id } })
    },
  })
  const sources = sourcesQuery.data?.sources ?? []
  const pageInfo = sourcesQuery.data?.pageInfo
  const currentRangeStart = sources.length ? offset + 1 : 0
  const currentRangeEnd = offset + sources.length
  const importingSourceKey =
    importSource.isPending && importSource.variables ? sourceKey(importSource.variables) : ''

  return (
    <main className="libraryPage">
      <section className="libraryHeader">
        <div>
          <p className="eyebrow">Problem sources</p>
          <h1>Import practice problems</h1>
        </div>
        <div className="librarySearch">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setPage(0)
            }}
            placeholder={`Search ${selectedProvider.label}`}
          />
        </div>
      </section>
      <div className="sourceProviderBar" aria-label="Problem source">
        {problemSourceOptions.map((option) => (
          <button
            className={clsx('sourceProviderButton', provider === option.value && 'active')}
            key={option.value}
            type="button"
            onClick={() => {
              setProvider(option.value)
              setPage(0)
            }}
          >
            <strong>{option.label}</strong>
            <span>{option.hint}</span>
          </button>
        ))}
      </div>
      <div className="sourceNote">
        <Download size={16} />
        <span>
          Exercism imports canonical test data. LeetCode uses alfa-leetcode-api for public
          statements and examples. Codeforces uses the official problemset API for discovery, then
          imports statements and samples from the Codeforces mirror when available.
        </span>
      </div>
      <div className="sourcePagingSummary">
        <span>
          {sources.length
            ? `${currentRangeStart}-${currentRangeEnd} of ${pageInfo?.total ?? currentRangeEnd}`
            : 'No results loaded'}
        </span>
        {sourcesQuery.isFetching ? (
          <span className="inlineLoading">
            <Loader2 className="spinIcon" size={14} />
            Loading page
          </span>
        ) : null}
      </div>
      {sourcesQuery.isLoading && !sources.length ? (
        <EmptyState icon={<Loader2 className="spinIcon" />} title="Searching sources" />
      ) : sources.length ? (
        <section className="problemList sourceList" aria-label="Problem sources">
          {sources.map((source) => {
            const rowIsImporting = importingSourceKey === sourceKey(source)
            return (
              <div className="sourceRow" key={sourceKey(source)}>
                <span className="problemMeta">
                  <strong>{source.title}</strong>
                  <span>
                    {[providerLabel(source.provider), source.description || source.id].join(' · ')}
                  </span>
                </span>
                <span className={clsx('difficultyBadge', source.difficulty ?? 'unrated')}>
                  {source.difficulty ? difficultyLabel(source.difficulty) : 'Unrated'}
                </span>
                {source.url ? (
                  <a className="sourceLink" href={source.url} rel="noreferrer" target="_blank">
                    <ExternalLink size={15} />
                  </a>
                ) : null}
                <button
                  className="ghostLightButton"
                  disabled={rowIsImporting}
                  type="button"
                  onClick={() => importSource.mutate(source)}
                >
                  {rowIsImporting ? <Loader2 className="spinIcon" size={15} /> : <Plus size={15} />}
                  {rowIsImporting ? 'Importing' : 'Import'}
                </button>
              </div>
            )
          })}
        </section>
      ) : (
        <EmptyState icon={<BookOpen size={24} />} title="No importable sources found" />
      )}
      <div className="paginationBar">
        <button
          className="ghostLightButton"
          disabled={page === 0 || sourcesQuery.isFetching}
          type="button"
          onClick={() => setPage((value) => Math.max(0, value - 1))}
        >
          Previous
        </button>
        <span>Page {page + 1}</span>
        <button
          className="ghostLightButton"
          disabled={!pageInfo?.hasMore || sourcesQuery.isFetching}
          type="button"
          onClick={() => setPage((value) => value + 1)}
        >
          Next
        </button>
      </div>
      {importSource.error ? <div className="errorText">{importSource.error.message}</div> : null}
    </main>
  )
}

function ProblemWorkspace({
  challengeId,
  submissionId,
  view,
}: {
  challengeId: string
  submissionId?: string
  view: WorkspaceView
}) {
  const navigate = useNavigate()
  const client = useQueryClient()
  const challengeQuery = useQuery({
    queryKey: ['challenge', challengeId],
    queryFn: () => getChallenge(challengeId),
  })
  const submissionQuery = useQuery({
    enabled: !!submissionId,
    queryKey: ['submission', submissionId],
    queryFn: () => getSubmission(submissionId as string),
    refetchInterval: submissionId ? 3000 : false,
  })
  const challenge = challengeQuery.data?.challenge
  const submissions = challengeQuery.data?.submissions ?? []
  const [language, setLanguage] = useState<TrainerLanguage>('javascript')
  const starter = useMemo(
    () => (challenge ? starterForLanguage(challenge, language) : ''),
    [challenge, language],
  )
  const [code, setCode] = usePersistentDraft(challengeId, language, starter)
  const [consoleView, setConsoleView] = useState<ConsoleView>('testcase')
  const [consoleOpen, setConsoleOpen] = useState(false)
  const [reviewFocus, setReviewFocus] = useState<SubmissionReviewFocus>(readStoredReviewFocus)
  const lastSubmitted = submissions.find((item) => item.language === language) ?? submissions[0]
  const latestSubmission = submissions[0]
  const selectedSubmission =
    submissionQuery.data?.submission ?? submissions.find((item) => item.id === submissionId)
  const submissionReviewMode = view === 'submission' && !!selectedSubmission
  const editorLanguage = submissionReviewMode
    ? knownLanguage(selectedSubmission.language, language)
    : language
  const editorValue = submissionReviewMode ? selectedSubmission.code : code || starter
  const submittedLanguageLabel =
    languageOptions.find((item) => item.value === editorLanguage)?.label ??
    selectedSubmission?.language
  const inboxesQuery = useQuery({
    queryKey: ['buddy-inboxes'],
    queryFn: listBuddyInboxes,
    staleTime: 60_000,
  })
  const nextChallengeQuery = useQuery({
    enabled: view === 'submission',
    queryKey: ['challenges', 'submission-next'],
    queryFn: () => listChallenges({}),
  })
  const nextChallenge = useMemo(() => {
    const challenges = nextChallengeQuery.data?.challenges ?? []
    const index = challenges.findIndex((item) => item.id === challengeId)
    return challenges[(index + 1) % challenges.length] ?? null
  }, [challengeId, nextChallengeQuery.data?.challenges])
  const buddyInboxes = inboxesQuery.data?.inboxes ?? []
  const [reviewerAgentId, setReviewerAgentId] = useState(
    () => readStoredReviewerPreference()?.agentId ?? '',
  )
  const [rememberReviewer, setRememberReviewer] = useState(
    () => !!readStoredReviewerPreference()?.agentId,
  )
  const [submitNotice, setSubmitNotice] = useState<string | null>(null)
  const selectedReviewer = buddyInboxes.find((inbox) => inbox.agent.id === reviewerAgentId)
  const selectedReviewFocus =
    reviewFocusOptions.find((option) => option.value === reviewFocus) ?? defaultReviewFocusOption
  const reviewerHint = inboxesQuery.isLoading
    ? 'Loading Buddies'
    : inboxesQuery.isError
      ? 'Buddy list unavailable'
      : selectedReviewer
        ? `Buddy will ${selectedReviewFocus.hint}`
        : buddyInboxes.length
          ? 'Choose a Buddy for sandbox review'
          : 'No Buddy Inbox available'

  useEffect(() => {
    if (!inboxesQuery.isSuccess || !reviewerAgentId) return
    if (buddyInboxes.some((inbox) => inbox.agent.id === reviewerAgentId)) return
    setReviewerAgentId('')
  }, [buddyInboxes, inboxesQuery.isSuccess, reviewerAgentId])

  useEffect(() => {
    if (!inboxesQuery.isSuccess || reviewerAgentId) return
    const firstBuddy = buddyInboxes[0]
    if (!firstBuddy) return
    setReviewerAgentId(firstBuddy.agent.id)
  }, [buddyInboxes, inboxesQuery.isSuccess, reviewerAgentId])

  useEffect(() => {
    if (!rememberReviewer || !reviewerAgentId) {
      clearStoredReviewerPreference()
      return
    }
    if (!selectedReviewer) return
    writeStoredReviewerPreference({
      agentId: selectedReviewer.agent.id,
      label: buddyInboxLabel(selectedReviewer),
    })
  }, [rememberReviewer, reviewerAgentId, selectedReviewer])

  useEffect(() => {
    writeStoredReviewFocus(reviewFocus)
  }, [reviewFocus])

  const submit = useMutation({
    mutationFn: () =>
      createSubmission({
        challengeId,
        language,
        code: (code || starter).trim(),
        reviewer: reviewerAgentId
          ? {
              agentId: reviewerAgentId,
              assigneeLabel: selectedReviewer ? buddyInboxLabel(selectedReviewer) : undefined,
              displayName: selectedReviewer ? buddyInboxLabel(selectedReviewer) : undefined,
              reviewFocus,
            }
          : undefined,
      }),
    onSuccess: async (result) => {
      const { submission } = result
      if (reviewerAgentId) {
        const label = selectedReviewer ? buddyInboxLabel(selectedReviewer) : 'selected Buddy'
        const error = ShadowBridge.inboxErrors(result)[0]
        setSubmitNotice(
          error
            ? `Submitted, but ${label} assignment needs attention: ${error.error}`
            : `Submitted and assigned to ${label}.`,
        )
      } else {
        setSubmitNotice(null)
      }
      await Promise.all([
        client.invalidateQueries({ queryKey: ['challenge', challengeId] }),
        client.invalidateQueries({ queryKey: ['submissions'] }),
      ])
      void navigate({
        to: '/problems/$challengeId/submissions/$submissionId/waiting',
        params: { challengeId, submissionId: submission.id },
      })
    },
  })
  const canSubmit = !!reviewerAgentId && !submit.isPending && !!(code || starter).trim()
  const retryFromSubmission = () => {
    if (!selectedSubmission) return
    const retryLanguage = knownLanguage(selectedSubmission.language, language)
    window.localStorage.setItem(
      draftStorageKey(challengeId, retryLanguage),
      selectedSubmission.code,
    )
    setLanguage(retryLanguage)
    setCode(selectedSubmission.code)
    void navigate({ to: '/problems/$challengeId', params: { challengeId } })
  }

  if (challengeQuery.isLoading) {
    return (
      <main className="workspacePage">
        <EmptyState icon={<Loader2 className="spinIcon" />} title="Loading workspace" />
      </main>
    )
  }

  if (!challenge) {
    return (
      <main className="workspacePage">
        <EmptyState icon={<BookOpen size={24} />} title="Problem not found" />
      </main>
    )
  }

  return (
    <main className="workspacePage">
      <section className="problemPane">
        <ProblemTabs challengeId={challenge.id} count={submissions.length} view={view} />
        <div className="leftScrollArea">
          {view === 'description' ? (
            <ProblemStatement challenge={challenge} />
          ) : view === 'submissions' ? (
            <ProblemSubmissions challengeId={challenge.id} submissions={submissions} />
          ) : view === 'waiting' ? (
            <WaitingSubmission
              challengeId={challenge.id}
              isLoading={submissionQuery.isLoading}
              submission={selectedSubmission}
            />
          ) : (
            <SubmissionDetail
              challengeId={challenge.id}
              isLoading={submissionQuery.isLoading}
              submission={selectedSubmission}
            />
          )}
        </div>
      </section>

      <section className="codingPane">
        <div className="editorToolbar">
          <div className="toolbarGroup">
            <TerminalSquare size={17} />
            {submissionReviewMode ? (
              <span className="toolbarLabel">
                Submitted code <small>{submittedLanguageLabel}</small>
              </span>
            ) : (
              <select
                aria-label="Language"
                value={language}
                onChange={(event) => setLanguage(event.target.value as TrainerLanguage)}
              >
                {languageOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            )}
          </div>
          {!submissionReviewMode ? (
            <div className="toolbarActions">
              <button className="ghostButton" type="button" onClick={() => setCode(starter)}>
                <RotateCcw size={16} />
                Reset
              </button>
              <button
                className="ghostButton"
                disabled={!lastSubmitted}
                type="button"
                onClick={() => lastSubmitted && setCode(lastSubmitted.code)}
              >
                <History size={16} />
                Last submit
              </button>
            </div>
          ) : null}
        </div>
        <div className="editorFrame">
          <MonacoEditor
            height="100%"
            language={monacoLanguage(editorLanguage)}
            onChange={(value?: string) => {
              if (!submissionReviewMode) setCode(value ?? '')
            }}
            options={{
              automaticLayout: true,
              domReadOnly: submissionReviewMode,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              fontSize: 14,
              lineHeight: 22,
              minimap: { enabled: false },
              padding: { top: 14, bottom: 18 },
              readOnly: submissionReviewMode,
              renderLineHighlight: 'all',
              scrollBeyondLastLine: false,
              tabSize: 2,
              wordWrap: 'off',
            }}
            theme="vs-dark"
            value={editorValue}
          />
        </div>
        <EditorConsole
          challenge={challenge}
          challengeId={challenge.id}
          latestSubmission={submissionReviewMode ? selectedSubmission : latestSubmission}
          open={consoleOpen}
          view={consoleView}
          onOpenChange={setConsoleOpen}
          onViewChange={setConsoleView}
        />
        {submissionReviewMode ? (
          <SubmissionReplayBar
            challengeId={challenge.id}
            nextChallenge={nextChallenge}
            submission={selectedSubmission}
            onRetry={retryFromSubmission}
          />
        ) : (
          <>
            {submit.error ? <div className="errorText">{submit.error.message}</div> : null}
            {submitNotice ? <div className="noticeText">{submitNotice}</div> : null}
            <div className="submitBar">
              <div className="reviewerArea">
                <div className="reviewerSelect">
                  <Bot size={15} />
                  <select
                    aria-label="Buddy reviewer"
                    disabled={inboxesQuery.isLoading || !buddyInboxes.length}
                    value={reviewerAgentId}
                    onChange={(event) => {
                      setReviewerAgentId(event.target.value)
                      setSubmitNotice(null)
                    }}
                  >
                    <option value="">
                      {inboxesQuery.isLoading ? 'Loading Buddies' : 'Choose Buddy'}
                    </option>
                    {buddyInboxes.map((inbox) => (
                      <option key={inbox.agent.id} value={inbox.agent.id}>
                        {buddyInboxLabel(inbox)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="focusSelect">
                  <Lightbulb size={15} />
                  <select
                    aria-label="Buddy review focus"
                    value={reviewFocus}
                    onChange={(event) =>
                      setReviewFocus(event.target.value as SubmissionReviewFocus)
                    }
                  >
                    {reviewFocusOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <label className="rememberToggle">
                  <input
                    checked={rememberReviewer}
                    disabled={!reviewerAgentId}
                    type="checkbox"
                    onChange={(event) => setRememberReviewer(event.target.checked)}
                  />
                  <span>Remember</span>
                </label>
                <span className="reviewerHint">{reviewerHint}</span>
              </div>
              <div className="submitActions">
                <span className="submitMeta">{codeLength(code || starter)} chars</span>
                <button
                  className="primaryAction"
                  disabled={!canSubmit}
                  type="button"
                  onClick={() => submit.mutate()}
                >
                  {submit.isPending ? (
                    <Loader2 className="spinIcon" size={17} />
                  ) : (
                    <Send size={17} />
                  )}
                  {reviewerAgentId ? 'Submit' : 'Choose Buddy'}
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </main>
  )
}

function EditorConsole({
  challenge,
  challengeId,
  latestSubmission,
  open,
  view,
  onOpenChange,
  onViewChange,
}: {
  challenge: Challenge
  challengeId: string
  latestSubmission?: CodeSubmission
  open: boolean
  view: ConsoleView
  onOpenChange: (open: boolean) => void
  onViewChange: (view: ConsoleView) => void
}) {
  const setView = (nextView: ConsoleView) => {
    onViewChange(nextView)
    onOpenChange(true)
  }

  return (
    <div className={clsx('consolePane', open && 'open')}>
      <div className="consoleHeader">
        <div className="consoleTabs">
          <button
            className={clsx('consoleTab', view === 'testcase' && 'active')}
            type="button"
            onClick={() => setView('testcase')}
          >
            <FileText size={15} />
            Testcase
          </button>
          <button
            className={clsx('consoleTab', view === 'result' && 'active')}
            type="button"
            onClick={() => setView('result')}
          >
            {latestSubmission?.status === 'analyzed' ? (
              <CheckCircle2 size={15} />
            ) : (
              <Clock3 size={15} />
            )}
            Test Result
          </button>
        </div>
        <button
          aria-label={open ? 'Collapse console' : 'Expand console'}
          className="consoleToggle"
          type="button"
          onClick={() => onOpenChange(!open)}
        >
          {open ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>
      </div>
      {open ? (
        <div className="consoleBody">
          {view === 'testcase' ? (
            <div className="sampleStack compactCases">
              {challenge.examples.length ? (
                challenge.examples.map((example, index) => (
                  <div className="sampleCase" key={`${example.input}-${index}`}>
                    <span>Case {index + 1}</span>
                    <code>{example.input}</code>
                    <code>{example.output}</code>
                  </div>
                ))
              ) : (
                <p className="mutedText">No visible examples imported for this problem.</p>
              )}
            </div>
          ) : (
            <div className="consoleResult">
              <LatestResult submission={latestSubmission} />
              {latestSubmission ? (
                <Link
                  className="ghostLink"
                  params={{ challengeId, submissionId: latestSubmission.id }}
                  to="/problems/$challengeId/submissions/$submissionId"
                >
                  <History size={15} />
                  Open review
                </Link>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}

function ProblemTabs({
  challengeId,
  count,
  view,
}: {
  challengeId: string
  count: number
  view: WorkspaceView
}) {
  const tabbarRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    tabbarRef.current
      ?.querySelector('.tabButton.active')
      ?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [view])

  return (
    <div className="tabbar" ref={tabbarRef} role="tablist">
      <Link
        activeOptions={{ exact: true }}
        className={clsx('tabButton', view === 'description' && 'active')}
        params={{ challengeId }}
        to="/problems/$challengeId"
      >
        <FileText size={16} />
        Description
      </Link>
      <Link
        className={clsx('tabButton', view !== 'description' && 'active')}
        params={{ challengeId }}
        to="/problems/$challengeId/submissions"
      >
        <History size={16} />
        Submissions
        <span className="tabCount">{count}</span>
      </Link>
    </div>
  )
}

function ProblemStatement({ challenge }: { challenge: Challenge }) {
  return (
    <article className="statement">
      <header className="statementHeader">
        <div>
          <h1>{challenge.title}</h1>
          <div className="problemFactRow">
            <span className={clsx('difficultyBadge', challenge.difficulty)}>
              {difficultyLabel(challenge.difficulty)}
            </span>
            {challenge.source ? <span>{sourceLabel(challenge)}</span> : null}
          </div>
        </div>
        {challenge.source?.url ? (
          <a
            className="statementSourceLink"
            href={challenge.source.url}
            rel="noreferrer"
            target="_blank"
          >
            <ExternalLink size={15} />
            Source
          </a>
        ) : null}
      </header>
      <div className="tagRow">
        {challenge.tags.map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>
      <MarkdownView className="promptMarkdown" content={challenge.prompt} />
      {challenge.examples.length ? (
        <>
          <h2>Examples</h2>
          <div className="examplesList">
            {challenge.examples.map((example, index) => (
              <section className="exampleBlock" key={`${example.input}-${index}`}>
                <strong>Example {index + 1}</strong>
                <dl>
                  <div>
                    <dt>Input</dt>
                    <dd>{example.input}</dd>
                  </div>
                  <div>
                    <dt>Output</dt>
                    <dd>{example.output}</dd>
                  </div>
                  {example.explanation ? (
                    <div>
                      <dt>Explanation</dt>
                      <dd>{example.explanation}</dd>
                    </div>
                  ) : null}
                </dl>
              </section>
            ))}
          </div>
        </>
      ) : (
        <section className="exampleEmpty">
          <h2>No visible examples imported</h2>
          <p>
            Import could not read sample tests from the source. Buddy can still review the attempt,
            but ask it to generate edge cases from the statement before scoring.
          </p>
        </section>
      )}
    </article>
  )
}

function ProblemSubmissions({
  challengeId,
  submissions,
}: {
  challengeId: string
  submissions: CodeSubmission[]
}) {
  if (!submissions.length) {
    return <EmptyState icon={<History size={24} />} title="No submissions yet" />
  }

  return (
    <div className="submissionTable">
      <div className="submissionTableHeader">
        <span>Status</span>
        <span>Submitted</span>
        <span>Review</span>
      </div>
      <div className="submissionList compactSubmissionList">
        {submissions.map((submission) => (
          <SubmissionRow challengeId={challengeId} key={submission.id} submission={submission} />
        ))}
      </div>
    </div>
  )
}

function SubmissionRow({
  challengeId,
  challengeTitle,
  submission,
}: {
  challengeId: string
  challengeTitle?: string
  submission: CodeSubmission
}) {
  return (
    <Link
      className="submissionRow"
      params={{ challengeId, submissionId: submission.id }}
      to="/problems/$challengeId/submissions/$submissionId"
    >
      <span className="submissionStatusCell">
        <span className={clsx('statusDot', submission.analysis?.outcome ?? submission.status)} />
        <strong>{statusTitle(submission)}</strong>
      </span>
      <span className="submissionMeta">
        <strong>{challengeTitle ?? submission.id}</strong>
        <span>
          {submission.language} · {formatDate(submission.createdAt)}
          {submission.reviewRequest
            ? ` · Buddy: ${reviewRequestLabel(submission.reviewRequest)}`
            : ''}
        </span>
      </span>
      <span className={clsx('outcomeBadge', submission.analysis?.outcome ?? 'pending')}>
        {submission.analysis ? outcomeLabel(submission.analysis.outcome) : 'Pending'}
      </span>
    </Link>
  )
}

function WaitingSubmission({
  challengeId,
  isLoading,
  submission,
}: {
  challengeId: string
  isLoading: boolean
  submission?: CodeSubmission
}) {
  const challengesQuery = useQuery({
    queryKey: ['challenges', 'waiting-next'],
    queryFn: () => listChallenges({}),
  })
  const nextChallenge = useMemo(() => {
    const challenges = challengesQuery.data?.challenges ?? []
    const index = challenges.findIndex((challenge) => challenge.id === challengeId)
    return challenges[(index + 1) % challenges.length] ?? null
  }, [challengeId, challengesQuery.data?.challenges])

  if (isLoading) {
    return <EmptyState icon={<Loader2 className="spinIcon" />} title="Loading review status" />
  }

  if (!submission) {
    return <EmptyState icon={<History size={24} />} title="Submission not found" />
  }

  return (
    <article className="submissionDetail waitingDetail">
      <div className="waitingHero">
        {submission.analysis ? (
          <CheckCircle2 size={24} />
        ) : (
          <Loader2 className="spinIcon" size={24} />
        )}
        <div>
          <p className="eyebrow">{submission.language}</p>
          <h2>{submission.analysis ? 'Review ready' : 'Waiting for Buddy review'}</h2>
        </div>
      </div>
      <section className="analysisBlock">
        {submission.analysis ? (
          <>
            <MarkdownView className="analysisSummary" content={submission.analysis.summary} />
            <MarkdownView content={submission.analysis.explanation} />
          </>
        ) : (
          <p>
            {submission.reviewRequest
              ? `${reviewRequestLabel(
                  submission.reviewRequest,
                )} has the submission in Inbox. This page refreshes automatically while Buddy runs sandbox cases.`
              : 'Review assignment is missing.'}
          </p>
        )}
      </section>
      <div className="waitingActions">
        <Link
          className="primaryLink"
          params={{ challengeId, submissionId: submission.id }}
          to="/problems/$challengeId/submissions/$submissionId"
        >
          <FileText size={16} />
          Open feedback
        </Link>
        {nextChallenge && nextChallenge.id !== challengeId ? (
          <Link
            className="ghostLink"
            params={{ challengeId: nextChallenge.id }}
            to="/problems/$challengeId"
          >
            <ArrowRight size={16} />
            Next problem
          </Link>
        ) : null}
      </div>
    </article>
  )
}

function SubmissionDetail({
  challengeId,
  isLoading,
  submission,
}: {
  challengeId: string
  isLoading: boolean
  submission?: CodeSubmission
}) {
  if (isLoading) {
    return <EmptyState icon={<Loader2 className="spinIcon" />} title="Loading submission" />
  }

  if (!submission) {
    return <EmptyState icon={<History size={24} />} title="Submission not found" />
  }

  const assignedLabel = submission.reviewRequest
    ? reviewRequestLabel(submission.reviewRequest)
    : null

  return (
    <article className="submissionDetail reviewDetail">
      <div className="reviewTopline">
        <Link className="backLink" params={{ challengeId }} to="/problems/$challengeId/submissions">
          Back to submissions
        </Link>
        <span>{formatDate(submission.createdAt)}</span>
      </div>

      <header className="reviewResultHeader">
        <div className="reviewVerdict">
          <span className={clsx('outcomeBadge', submission.analysis?.outcome ?? 'pending')}>
            {submission.analysis ? outcomeLabel(submission.analysis.outcome) : 'Pending'}
          </span>
          <h2>{statusTitle(submission)}</h2>
          <p>
            {submission.language}
            {assignedLabel ? ` · Reviewed by ${assignedLabel}` : ''}
            {submission.reviewRequest?.reviewFocus
              ? ` · ${reviewFocusLabel(submission.reviewRequest.reviewFocus)}`
              : ''}
          </p>
        </div>
        <div className="reviewScoreBlock">
          <strong>{submission.analysis ? `${submission.analysis.score}/100` : '--'}</strong>
          <span>Score</span>
        </div>
      </header>

      {submission.analysis ? (
        <>
          <section className="reviewSection reviewSummarySection">
            <h3>Summary</h3>
            <MarkdownView content={submission.analysis.summary} />
          </section>

          <section className="reviewSection">
            <h3>Analysis</h3>
            <MarkdownView content={submission.analysis.explanation} />
          </section>

          <div className="reviewSectionGrid">
            {submission.analysis.complexity ? (
              <section className="reviewSection">
                <h3>Complexity</h3>
                <MarkdownView content={submission.analysis.complexity} />
              </section>
            ) : null}
            {submission.analysis.suggestions.length ? (
              <section className="reviewSection">
                <h3>Next Steps</h3>
                <ol className="suggestionList">
                  {submission.analysis.suggestions.map((suggestion) => (
                    <li key={suggestion}>
                      <MarkdownView content={suggestion} />
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}
          </div>
        </>
      ) : (
        <section className="analysisBlock pendingBlock">
          <Clock3 size={20} />
          <p>
            {submission.reviewRequest
              ? `Waiting for ${reviewRequestLabel(
                  submission.reviewRequest,
                )} to run sandbox cases and explain the result.`
              : 'Analysis pending.'}
          </p>
        </section>
      )}
    </article>
  )
}

function SubmissionReplayBar({
  challengeId,
  nextChallenge,
  submission,
  onRetry,
}: {
  challengeId: string
  nextChallenge?: Challenge | null
  submission: CodeSubmission
  onRetry: () => void
}) {
  return (
    <div className="submissionReplayBar">
      <div className="submissionReplayText">
        <strong>Review this attempt before retry.</strong>
        <span>
          Buddy feedback stays on the left; the submitted code is read-only here so the next attempt
          starts from an explicit retry.
        </span>
      </div>
      <div className="submissionReplayActions">
        <button className="ghostLightButton" type="button" onClick={onRetry}>
          <RotateCcw size={16} />
          Retry from this code
        </button>
        <Link
          className="ghostLink"
          params={{ challengeId }}
          to="/problems/$challengeId/submissions"
        >
          <History size={16} />
          All submissions
        </Link>
        {nextChallenge && nextChallenge.id !== challengeId ? (
          <Link
            className="primaryLink"
            params={{ challengeId: nextChallenge.id }}
            to="/problems/$challengeId"
          >
            <ArrowRight size={16} />
            Next problem
          </Link>
        ) : null}
      </div>
      <span className="submitMeta">{codeLength(submission.code)} chars</span>
    </div>
  )
}

function LatestResult({ submission }: { submission?: CodeSubmission }) {
  if (!submission) {
    return <p className="mutedText">No submissions yet.</p>
  }

  if (!submission.analysis) {
    return (
      <div className="resultBox">
        <span className="outcomeBadge pending">Pending</span>
        <p>
          {formatDate(submission.createdAt)}
          {submission.reviewRequest ? ` · ${reviewRequestLabel(submission.reviewRequest)}` : ''}
        </p>
      </div>
    )
  }

  return (
    <div className="resultBox">
      <span className={clsx('outcomeBadge', submission.analysis.outcome)}>
        {outcomeLabel(submission.analysis.outcome)}
      </span>
      <strong>{submission.analysis.score}/100</strong>
      <MarkdownView className="compactMarkdown" content={submission.analysis.summary} />
    </div>
  )
}

function SubmissionsPage() {
  const submissionsQuery = useQuery({
    queryKey: ['submissions'],
    queryFn: () => listSubmissions({ limit: 100 }),
  })
  const challengesQuery = useQuery({
    queryKey: ['challenges', 'all'],
    queryFn: () => listChallenges({}),
  })
  const challengeById = useMemo(() => {
    return new Map(
      (challengesQuery.data?.challenges ?? []).map((challenge) => [challenge.id, challenge]),
    )
  }, [challengesQuery.data?.challenges])
  const submissions = submissionsQuery.data?.submissions ?? []

  return (
    <main className="submissionsPage">
      <section className="libraryHeader">
        <div>
          <p className="eyebrow">History</p>
          <h1>Submissions</h1>
        </div>
      </section>
      {submissionsQuery.isLoading ? (
        <EmptyState icon={<Loader2 className="spinIcon" />} title="Loading submissions" />
      ) : submissions.length ? (
        <div className="submissionList globalList">
          {submissions.map((submission) => {
            const challenge = challengeById.get(submission.challengeId)
            return (
              <SubmissionRow
                challengeId={submission.challengeId}
                challengeTitle={challenge?.title ?? submission.challengeId}
                key={submission.id}
                submission={submission}
              />
            )
          })}
        </div>
      ) : (
        <EmptyState icon={<History size={24} />} title="No submissions yet" />
      )}
    </main>
  )
}

function MarkdownView({ className, content }: { className?: string; content: string }) {
  return (
    <div className={clsx('markdownView', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  )
}

function EmptyState({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="emptyState">
      {icon}
      <strong>{title}</strong>
    </div>
  )
}

function buddyInboxLabel(inbox: BuddyInboxOption) {
  return (
    inbox.agent.user?.displayName?.trim() || inbox.agent.user?.username?.trim() || inbox.agent.id
  )
}

function reviewRequestLabel(reviewRequest: NonNullable<CodeSubmission['reviewRequest']>) {
  return (
    reviewRequest.displayName?.trim() ||
    reviewRequest.assigneeLabel?.trim() ||
    reviewRequest.agentId?.trim() ||
    'Buddy'
  )
}

function reviewFocusLabel(value: SubmissionReviewFocus) {
  return reviewFocusOptions.find((option) => option.value === value)?.label ?? 'Sandbox review'
}

function readStoredReviewFocus(): SubmissionReviewFocus {
  if (typeof window === 'undefined') return 'standard'
  try {
    const value = window.localStorage.getItem(reviewFocusStorageKey)
    return value === 'interview' || value === 'debug' || value === 'complexity' ? value : 'standard'
  } catch {
    return 'standard'
  }
}

function writeStoredReviewFocus(value: SubmissionReviewFocus) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(reviewFocusStorageKey, value)
  } catch {
    /* local preference persistence is best-effort */
  }
}

function readStoredReviewerPreference() {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(reviewerStorageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { agentId?: unknown; label?: unknown }
    return typeof parsed.agentId === 'string' && parsed.agentId.trim()
      ? {
          agentId: parsed.agentId.trim(),
          label: typeof parsed.label === 'string' ? parsed.label : '',
        }
      : null
  } catch {
    return null
  }
}

function writeStoredReviewerPreference(input: { agentId: string; label: string }) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(reviewerStorageKey, JSON.stringify(input))
  } catch {
    /* local preference persistence is best-effort */
  }
}

function clearStoredReviewerPreference() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(reviewerStorageKey)
  } catch {
    /* local preference persistence is best-effort */
  }
}

function useTrainerRuntimeInvalidation() {
  const client = useQueryClient()
  useEffect(() => {
    return subscribeTrainerEvents((event) => {
      if (
        event.command !== 'submissions.analyze' &&
        event.command !== 'submissions.create' &&
        event.command !== 'challenges.upsert' &&
        event.command !== 'sources.import'
      ) {
        return
      }
      void client.invalidateQueries({ queryKey: ['challenge'] })
      void client.invalidateQueries({ queryKey: ['submission'] })
      void client.invalidateQueries({ queryKey: ['submissions'] })
      void client.invalidateQueries({ queryKey: ['challenges'] })
    })
  }, [client])
}

function usePersistentDraft(challengeId: string, language: TrainerLanguage, starter: string) {
  const key = draftStorageKey(challengeId, language)
  const [code, setCode] = useState(starter)

  useEffect(() => {
    const saved = window.localStorage.getItem(key)
    setCode(saved ?? starter)
  }, [key, starter])

  useEffect(() => {
    window.localStorage.setItem(key, code)
  }, [code, key])

  return [code, setCode] as const
}

function draftStorageKey(challengeId: string, language: TrainerLanguage) {
  return `trainer:draft:${challengeId}:${language}`
}

function knownLanguage(value: string | undefined, fallback: TrainerLanguage): TrainerLanguage {
  return languageOptions.find((item) => item.value === value)?.value ?? fallback
}

function starterForLanguage(challenge: Challenge, language: TrainerLanguage) {
  if (language === 'python') {
    return `# ${challenge.title}\n\ndef solve():\n    pass\n`
  }
  return challenge.starterCode
}

function monacoLanguage(language: TrainerLanguage) {
  return languageOptions.find((item) => item.value === language)?.monaco ?? 'javascript'
}

function difficultyLabel(value: Challenge['difficulty'] | 'all') {
  if (value === 'easy') return 'Easy'
  if (value === 'medium') return 'Medium'
  if (value === 'hard') return 'Hard'
  return 'All'
}

function sourceLabel(challenge: Challenge) {
  if (challenge.source?.provider === 'exercism') return 'Exercism'
  if (challenge.source?.provider === 'leetcode') return 'LeetCode'
  if (challenge.source?.provider === 'codeforces') return 'Codeforces'
  if (challenge.source?.provider === 'manual') return 'Manual'
  return 'Trainer'
}

function providerLabel(provider: ProblemSourceProvider) {
  if (provider === 'leetcode') return 'LeetCode'
  if (provider === 'codeforces') return 'Codeforces'
  return 'Exercism'
}

function sourceKey(source: ProblemSource) {
  return `${source.provider}:${source.id}`
}

function challengeMatchesTrack(challenge: Challenge, track: StudyTrack) {
  const haystack = [challenge.title, ...challenge.tags, challenge.prompt].join(' ').toLowerCase()
  return track.tags.some((tag) => haystack.includes(tag))
}

function firstMatchingTrackId(challenge: Challenge) {
  return studyTracks.find((track) => challengeMatchesTrack(challenge, track))?.id ?? null
}

function caseCountLabel(challenge: Challenge) {
  const count = challenge.testCases?.length ? challenge.testCases.length : challenge.examples.length
  return `${count} ${count === 1 ? 'case' : 'cases'}`
}

function statusTitle(submission: CodeSubmission) {
  if (!submission.analysis) return 'Analysis pending'
  return outcomeLabel(submission.analysis.outcome)
}

function outcomeLabel(value: NonNullable<CodeSubmission['analysis']>['outcome']) {
  if (value === 'accepted') return 'Accepted'
  if (value === 'needs_work') return 'Needs work'
  if (value === 'runtime_error') return 'Runtime error'
  return 'Incomplete'
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function codeLength(value: string) {
  return new Intl.NumberFormat().format(value.length)
}

const rootElement = document.getElementById('root') as HTMLElement
const trainerWindow = window as Window & { __shadowTrainerRoot?: Root }
trainerWindow.__shadowTrainerRoot ??= createRoot(rootElement)
trainerWindow.__shadowTrainerRoot.render(
  <QueryClientProvider client={queryClient}>
    <RouterProvider router={router} />
  </QueryClientProvider>,
)
