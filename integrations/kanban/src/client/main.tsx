import { SHADOW_SERVER_APP_COMMAND_COMPLETED_EVENT } from '@shadowob/sdk/bridge'
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
  RouterProvider,
  useNavigate,
} from '@tanstack/react-router'
import type { DragEvent, FormEvent } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { BoardCard, BoardCardArtifact, BoardPerson, BoardState } from '../types.js'
import {
  assignCard,
  bridgeAvailable,
  commentCard,
  createCard,
  dispatchCardToBuddy,
  getBoard,
  listBuddyInboxes,
  moveCard,
  openBridgeBuddyCreator,
  openWorkspaceArtifact,
  rerunCard,
  sendCoordinatorRequest,
  updateCard,
} from './api.js'
import { MarkdownText } from './markdown.js'
import { ReactSelect, type ReactSelectOption } from './react-select.js'
import './styles.css'

const queryClient = new QueryClient()
const boardQueryKey = ['kanban', 'board'] as const
const inboxQueryKey = ['kanban', 'buddy-inboxes'] as const
type BuddyInbox = Awaited<ReturnType<typeof listBuddyInboxes>>['inboxes'][number]

type BuddySelectOption = ReactSelectOption & {
  avatarUrl?: string | null
  status?: string | null
  userId?: string | null
}

function buddyLabel(inbox: BuddyInbox) {
  return inbox.agent.user?.displayName?.trim() || inbox.agent.user?.username || inbox.agent.id
}

function requestTitle(body: string) {
  const firstLine = body
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean)
  return (firstLine ?? 'Kanban task').slice(0, 96)
}

function buddyOption(inbox: BuddyInbox): BuddySelectOption {
  return {
    value: inbox.agent.id,
    label: buddyLabel(inbox),
    avatarUrl: inbox.agent.user?.avatarUrl ?? null,
    userId: inbox.agent.user?.id ?? inbox.agent.id,
    status: inbox.agent.status ?? null,
  }
}

function avatarColor(seed: string) {
  const colors = ['#172b4d', '#0f766e', '#7c3aed', '#b45309', '#be123c', '#1d4ed8', '#15803d']
  let hash = 0
  for (const char of seed) hash = (hash * 33 + char.charCodeAt(0)) % 100_003
  return colors[hash % colors.length]!
}

function normalizeBuddyStatus(status?: string | null) {
  if (
    status === 'online' ||
    status === 'busy' ||
    status === 'idle' ||
    status === 'offline' ||
    status === 'dnd'
  ) {
    return status
  }
  return 'offline'
}

export function BuddySelect(props: {
  disabled?: boolean
  loading?: boolean
  onChange: (value: string) => void
  options: BuddySelectOption[]
  placeholder: string
  value: string
}) {
  return (
    <ReactSelect
      className="buddySelect"
      disabled={props.disabled}
      emptyLabel="No Buddies available"
      loading={props.loading}
      loadingLabel="Loading Buddies"
      onChange={(value) => props.onChange(value)}
      options={props.options}
      placeholder={props.placeholder}
      renderOption={(option) => <BuddySelectOptionContent option={option} />}
      renderValue={(option) => <BuddySelectValue option={option} />}
      value={props.value}
    />
  )
}

function BuddySelectValue(props: { option: BuddySelectOption }) {
  return (
    <>
      <BuddySelectAvatar option={props.option} />
      <span className="reactSelectLabel">{props.option.label}</span>
    </>
  )
}

function BuddySelectOptionContent(props: { option: BuddySelectOption }) {
  return (
    <>
      <BuddySelectAvatar option={props.option} />
      <span className="reactSelectOptionText">
        <span className="reactSelectOptionLabel">{props.option.label}</span>
        <span className="reactSelectOptionMeta">{props.option.status ?? 'online'}</span>
      </span>
    </>
  )
}

function BuddySelectAvatar(props: { option: BuddySelectOption }) {
  const initial = labelInitials(props.option.label)
  const status = normalizeBuddyStatus(props.option.status)
  return (
    <span className="buddySelectAvatarWrap">
      <span
        className="buddySelectAvatar"
        style={{ background: avatarColor(props.option.userId ?? props.option.value) }}
      >
        {props.option.avatarUrl ? (
          <AvatarImage alt="" fallback={initial} src={props.option.avatarUrl} />
        ) : (
          <span>{initial}</span>
        )}
      </span>
      <span className={`buddySelectPresence status-${status}`} />
    </span>
  )
}

function AvatarImage(props: { alt: string; fallback: string; src: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) return <span>{props.fallback}</span>
  return <img alt={props.alt} src={props.src} onError={() => setFailed(true)} />
}

function IndexRoutePage() {
  return <KanbanApp />
}

function CardRoutePage() {
  const { cardId } = cardRoute.useParams()
  return <KanbanApp selectedCardId={cardId} />
}

const rootRoute = createRootRoute()

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: IndexRoutePage,
})

const cardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/cards/$cardId',
  component: CardRoutePage,
})

const routeTree = rootRoute.addChildren([indexRoute, cardRoute])

const router = createRouter({
  routeTree,
  history: createHashHistory(),
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

function KanbanApp(props: { selectedCardId?: string }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [toast, setToast] = useState<string | null>(null)
  const board = useQuery({ queryKey: boardQueryKey, queryFn: getBoard })
  const handleCommandEvent = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: boardQueryKey })
  }, [queryClient])
  const liveStatus = useLiveEvents(handleCommandEvent)
  const showToast = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(null), 2600)
  }
  const selectedCard = useMemo(
    () => board.data?.cards.find((card) => card.id === props.selectedCardId) ?? null,
    [board.data, props.selectedCardId],
  )

  const refresh = () => {
    void board.refetch().catch((error: Error) => showToast(error.message))
    void queryClient.invalidateQueries({ queryKey: inboxQueryKey })
  }
  const closeDetail = () => {
    void navigate({ to: '/' })
  }

  return (
    <>
      <header>
        <div>
          <h1>Kanban</h1>
          <div className="subtitle">Shared board for people and Buddies</div>
        </div>
        <div className="toolbar">
          <span className={liveStatus === 'live' ? 'status on' : 'status'}>{liveStatus}</span>
          <button className="refresh" type="button" onClick={refresh}>
            Refresh
          </button>
        </div>
      </header>
      <main>
        <CoordinatorRequestBar showToast={showToast} />
        {board.error ? <div className="emptyState">{board.error.message}</div> : null}
        {board.data ? <BoardView board={board.data} showToast={showToast} /> : null}
      </main>
      <CardDetail
        board={board.data ?? null}
        card={selectedCard}
        open={!!props.selectedCardId}
        onClose={closeDetail}
        showToast={showToast}
      />
      <div className={toast ? 'toast show' : 'toast'}>{toast}</div>
    </>
  )
}

function CoordinatorRequestBar(props: { showToast: (message: string) => void }) {
  const queryClient = useQueryClient()
  const [request, setRequest] = useState('')
  const [selectedAgentId, setSelectedAgentId] = useState('')
  const inboxes = useQuery({
    queryKey: inboxQueryKey,
    queryFn: listBuddyInboxes,
  })
  const send = useMutation({
    mutationFn: sendCoordinatorRequest,
    onSuccess: () => {
      setRequest('')
      void queryClient.invalidateQueries({ queryKey: boardQueryKey })
      props.showToast('Task added to Kanban and dispatched')
    },
    onError: (error) => props.showToast(error.message),
  })
  const createBuddy = useMutation({
    mutationFn: openBridgeBuddyCreator,
    onError: (error) => props.showToast(error.message),
  })
  const options = inboxes.data?.inboxes ?? []
  const selected = options.find((inbox) => inbox.agent.id === selectedAgentId)
  const buddyOptions = options.map(buddyOption)

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const body = request.trim()
    if (!selected || !body) return
    send.mutate({
      agentId: selected.agent.id,
      channelId: selected.channel?.id ?? null,
      assigneeLabel: buddyLabel(selected),
      assigneeAvatarUrl: selected.agent.user?.avatarUrl ?? null,
      title: requestTitle(body),
      body,
    })
  }

  return (
    <form className="requestBar" onSubmit={submit}>
      <textarea
        maxLength={2000}
        onChange={(event) => setRequest(event.target.value)}
        placeholder={
          bridgeAvailable()
            ? 'Describe the work for a coordinator Buddy...'
            : 'Open this board from Shadow to create a server Buddy'
        }
        rows={1}
        value={request}
      />
      <BuddySelect
        disabled={inboxes.isLoading}
        loading={inboxes.isLoading}
        onChange={setSelectedAgentId}
        options={buddyOptions}
        placeholder="Select Buddy"
        value={selectedAgentId}
      />
      <button className="requestSend" disabled={!selected || !request.trim() || send.isPending}>
        Send
      </button>
      <button
        className="requestBuddy"
        disabled={!bridgeAvailable() || createBuddy.isPending}
        type="button"
        onClick={() => createBuddy.mutate()}
      >
        New Buddy
      </button>
    </form>
  )
}

function BoardView(props: { board: BoardState; showToast: (message: string) => void }) {
  const queryClient = useQueryClient()
  const reloadBoard = () => queryClient.invalidateQueries({ queryKey: boardQueryKey })
  const create = useMutation({
    mutationFn: createCard,
    onSuccess: reloadBoard,
    onError: (error) => props.showToast(error.message),
  })
  const move = useMutation({
    mutationFn: moveCard,
    onSuccess: reloadBoard,
    onError: (error) => props.showToast(error.message),
  })

  return (
    <section className="board">
      {props.board.columns.map((column) => {
        const cards = props.board.cards.filter((card) => card.columnId === column.id)
        return (
          <ColumnView
            cards={cards}
            columnId={column.id}
            count={cards.length}
            createCard={(title) => create.mutate({ title, columnId: column.id })}
            key={column.id}
            moveCard={(cardId) => move.mutate({ cardId, columnId: column.id })}
            title={column.title}
          />
        )
      })}
    </section>
  )
}

function ColumnView(props: {
  cards: BoardCard[]
  columnId: string
  count: number
  createCard: (title: string) => void
  moveCard: (cardId: string) => void
  title: string
}) {
  const [isOver, setIsOver] = useState(false)
  const [title, setTitle] = useState('')

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    props.createCard(trimmed)
    setTitle('')
  }
  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsOver(false)
    const cardId = event.dataTransfer.getData('text/plain')
    if (!cardId) return
    props.moveCard(cardId)
  }

  return (
    <div
      className={isOver ? 'list over' : 'list'}
      data-column={props.columnId}
      onDragOver={(event) => {
        event.preventDefault()
        setIsOver(true)
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={handleDrop}
    >
      <div className="list-header">
        <div className="list-title">{props.title}</div>
        <div className="count">{props.count}</div>
      </div>
      <div className="cards">
        {props.cards.map((card) => (
          <CardTile card={card} key={card.id} />
        ))}
      </div>
      <form className="quick-add" onSubmit={handleSubmit}>
        <input
          maxLength={180}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Add a card..."
          value={title}
        />
        <div className="quick-add-actions">
          <button type="submit">Add card</button>
        </div>
      </form>
    </div>
  )
}

function CardTile(props: { card: BoardCard }) {
  const navigate = useNavigate()
  return (
    <button
      className="card"
      draggable
      type="button"
      onClick={() => void navigate({ to: '/cards/$cardId', params: { cardId: props.card.id } })}
      onDragStart={(event) => {
        event.currentTarget.classList.add('dragging')
        event.dataTransfer.setData('text/plain', props.card.id)
      }}
      onDragEnd={(event) => event.currentTarget.classList.remove('dragging')}
    >
      <div className="labels">
        {props.card.labels.map((label) => (
          <span className={`label ${labelClass(label)}`} key={label} title={label} />
        ))}
      </div>
      <div className="card-title">{props.card.title}</div>
      {props.card.description ? (
        <MarkdownText
          compact
          className="card-desc markdown markdown-compact"
          content={props.card.description}
        />
      ) : null}
      {props.card.buddyStatus ? (
        <div className={`buddy-pill buddy-${props.card.buddyStatus}`}>{props.card.buddyStatus}</div>
      ) : null}
      {props.card.issueStep ? (
        <div className="issueMeta">
          <span>{props.card.issueStep.status}</span>
          <span>{props.card.issueStep.taskType}</span>
        </div>
      ) : null}
      <div className="card-footer">
        <div className="avatars">
          <AssigneeSummary assignees={props.card.assignees} />
        </div>
        <span className="meta">{props.card.comments.length} comments</span>
      </div>
    </button>
  )
}

function CardDetail(props: {
  board: BoardState | null
  card: BoardCard | null
  open: boolean
  onClose: () => void
  showToast: (message: string) => void
}) {
  const queryClient = useQueryClient()
  const [comment, setComment] = useState('')
  const [promptDraft, setPromptDraft] = useState('')
  const [dispatchAgentId, setDispatchAgentId] = useState('')
  const reloadBoard = () => queryClient.invalidateQueries({ queryKey: boardQueryKey })
  const inboxes = useQuery({
    queryKey: inboxQueryKey,
    queryFn: listBuddyInboxes,
    enabled: props.open,
  })
  const assign = useMutation({ mutationFn: assignCard, onSuccess: reloadBoard })
  const createComment = useMutation({
    mutationFn: commentCard,
    onSuccess: () => {
      setComment('')
      void reloadBoard()
    },
    onError: (error) => props.showToast(error.message),
  })
  const rerun = useMutation({
    mutationFn: rerunCard,
    onSuccess: () => {
      void reloadBoard()
      props.showToast('Card reopened')
    },
    onError: (error) => props.showToast(error.message),
  })
  const updatePrompt = useMutation({
    mutationFn: updateCard,
    onSuccess: () => {
      void reloadBoard()
      props.showToast('Prompt updated')
    },
    onError: (error) => props.showToast(error.message),
  })
  const markDone = useMutation({
    mutationFn: updateCard,
    onSuccess: () => {
      void reloadBoard()
      props.showToast('Card marked done')
    },
    onError: (error) => props.showToast(error.message),
  })
  const dispatchCard = useMutation({
    mutationFn: async (input: {
      card: BoardCard
      agentId: string
      channelId?: string | null
      assigneeLabel?: string
      assigneeAvatarUrl?: string | null
    }) => {
      const delivery = await dispatchCardToBuddy(input)
      return delivery
    },
    onSuccess: () => {
      setDispatchAgentId('')
      void reloadBoard()
      props.showToast('Task sent to Buddy Inbox')
    },
    onError: (error) => props.showToast(error.message),
  })
  const artifacts = issueArtifacts(props.board, props.card)
  const dispatchOptions = inboxes.data?.inboxes ?? []
  const selectedDispatchInbox = dispatchOptions.find((inbox) => inbox.agent.id === dispatchAgentId)
  const dispatchBuddyOptions = dispatchOptions.map(buddyOption)

  useEffect(() => {
    setPromptDraft(props.card?.prompt ?? props.card?.issueStep?.prompt ?? '')
    setDispatchAgentId('')
  }, [props.card?.id, props.card?.issueStep?.prompt, props.card?.prompt])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!props.card) return
    const body = comment.trim()
    if (!body) return
    createComment.mutate({ cardId: props.card.id, body })
  }

  return (
    <div
      className={props.open ? 'overlay' : 'overlay hidden'}
      onClick={(event) => {
        if (event.currentTarget === event.target) props.onClose()
      }}
    >
      <aside className="detail" aria-label="Card detail">
        {props.card ? (
          <>
            <div className="detail-header">
              <div>
                <h2>{props.card.title}</h2>
                <div className="meta">
                  Updated {new Date(props.card.updatedAt).toLocaleString()}
                </div>
              </div>
              <button className="close" type="button" onClick={props.onClose}>
                &times;
              </button>
            </div>
            <div className="detail-body">
              <section className="section">
                <div className="section-title">Assignees</div>
                <div className="people">
                  {props.card.assignees.length ? (
                    props.card.assignees.map((person) => (
                      <PersonChip key={person.id} person={person} />
                    ))
                  ) : (
                    <span className="meta">Unassigned</span>
                  )}
                </div>
                <div className="actions">
                  <button
                    className="secondary"
                    type="button"
                    onClick={() => assign.mutate({ cardId: props.card!.id })}
                  >
                    Assign me
                  </button>
                </div>
              </section>
              <section className="section">
                <div className="section-title">Dispatch</div>
                <div className="dispatchRow">
                  <BuddySelect
                    disabled={inboxes.isLoading}
                    loading={inboxes.isLoading}
                    onChange={setDispatchAgentId}
                    options={dispatchBuddyOptions}
                    placeholder="Select Buddy"
                    value={dispatchAgentId}
                  />
                  <button
                    className="primary"
                    disabled={!props.card || !selectedDispatchInbox || dispatchCard.isPending}
                    type="button"
                    onClick={() => {
                      if (!props.card || !selectedDispatchInbox) return
                      const label = buddyLabel(selectedDispatchInbox)
                      dispatchCard.mutate({
                        card: props.card,
                        agentId: selectedDispatchInbox.agent.id,
                        channelId: selectedDispatchInbox.channel?.id ?? null,
                        assigneeLabel: label,
                        assigneeAvatarUrl: selectedDispatchInbox.agent.user?.avatarUrl ?? null,
                      })
                    }}
                  >
                    Dispatch
                  </button>
                </div>
              </section>
              <section className="section">
                <div className="section-title">Description</div>
                {props.card.description ? (
                  <MarkdownText className="description markdown" content={props.card.description} />
                ) : (
                  <p className="description">No description</p>
                )}
              </section>
              <section className="section">
                <div className="section-title">Task context</div>
                <div className="issueGrid">
                  <span>Type</span>
                  <strong>{props.card.issueStep?.taskType ?? 'card.task'}</strong>
                  <span>Status</span>
                  <strong>{props.card.status ?? props.card.issueStep?.status ?? 'queued'}</strong>
                  <span>Attempt</span>
                  <strong>{props.card.issueStep?.attempt ?? 1}</strong>
                </div>
                <textarea
                  maxLength={4000}
                  onChange={(event) => setPromptDraft(event.target.value)}
                  rows={5}
                  value={promptDraft}
                />
                <div className="actions">
                  <button
                    className="secondary"
                    type="button"
                    disabled={updatePrompt.isPending}
                    onClick={() =>
                      updatePrompt.mutate({ cardId: props.card!.id, prompt: promptDraft })
                    }
                  >
                    Save prompt
                  </button>
                  <button
                    className="secondary"
                    type="button"
                    disabled={rerun.isPending}
                    onClick={() =>
                      rerun.mutate({
                        cardId: props.card!.id,
                        prompt: promptDraft,
                        reason: 'Reopened from Kanban detail.',
                      })
                    }
                  >
                    Reopen
                  </button>
                  <button
                    className="primary"
                    type="button"
                    disabled={markDone.isPending}
                    onClick={() =>
                      markDone.mutate({
                        cardId: props.card!.id,
                        status: 'done',
                        progress: 100,
                      })
                    }
                  >
                    Mark done
                  </button>
                </div>
              </section>
              {artifacts.length ? (
                <section className="section">
                  <div className="section-title">Artifacts</div>
                  <div className="artifactList">
                    {artifacts.map((artifact) => (
                      <ArtifactRow artifact={artifact} key={artifact.id} />
                    ))}
                  </div>
                </section>
              ) : null}
              <section className="section">
                <div className="section-title">Created by</div>
                <div className="people">
                  <PersonChip person={props.card.createdBy} />
                </div>
              </section>
              <section className="section">
                <div className="section-title">Comments</div>
                <div className="comments">
                  {props.card.comments.length ? (
                    props.card.comments.map((item) => (
                      <div className="comment-row" key={item.id}>
                        <Avatar person={item.author} />
                        <div className="comment-box">
                          <div className="comment-head">
                            <strong>{item.author.displayName || 'Unknown'}</strong>
                            <span>{new Date(item.createdAt).toLocaleString()}</span>
                          </div>
                          <MarkdownText className="comment-body markdown" content={item.body} />
                        </div>
                      </div>
                    ))
                  ) : (
                    <span className="meta">No comments</span>
                  )}
                </div>
              </section>
              <form className="section" onSubmit={handleSubmit}>
                <div className="section-title">Add comment</div>
                <textarea
                  maxLength={4000}
                  onChange={(event) => setComment(event.target.value)}
                  rows={4}
                  value={comment}
                />
                {createComment.error ? (
                  <div className="errorText">{createComment.error.message}</div>
                ) : null}
                <button className="primary" type="submit">
                  Comment
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="detail-body">
            <div className="emptyState">Card not found.</div>
            <button className="primary" type="button" onClick={props.onClose}>
              Back to board
            </button>
          </div>
        )}
      </aside>
    </div>
  )
}

function issueArtifacts(board: BoardState | null, card: BoardCard | null) {
  if (!board || !card) return []
  const legacyIds = card.issueStep?.artifactIds ?? []
  return [
    ...(board.artifacts ?? []).filter((artifact) => artifact.cardId === card.id),
    ...(board.issues.artifacts ?? []).filter((artifact) => legacyIds.includes(artifact.id)),
  ].filter(
    (artifact, index, artifacts) =>
      artifacts.findIndex((candidate) => candidate.id === artifact.id) === index,
  )
}

function ArtifactRow(props: { artifact: BoardCardArtifact }) {
  const content = (
    <>
      <strong>{props.artifact.title}</strong>
      <span>{artifactKindLabel(props.artifact)}</span>
    </>
  )
  const workspaceTarget = artifactWorkspaceTarget(props.artifact)
  if (workspaceTarget) {
    return (
      <button
        className="artifactRow"
        type="button"
        onClick={() => {
          void openWorkspaceArtifact(props.artifact)
        }}
      >
        {content}
      </button>
    )
  }
  return props.artifact.url ? (
    <a className="artifactRow" href={props.artifact.url} rel="noreferrer" target="_blank">
      {content}
    </a>
  ) : (
    <div className="artifactRow">{content}</div>
  )
}

function artifactKindLabel(artifact: BoardCardArtifact) {
  if (artifact.uri?.startsWith('workspace://')) return 'workspace.uri'
  return artifact.kind
}

function artifactWorkspaceTarget(artifact: BoardCardArtifact) {
  const metadata = artifact.metadata ?? {}
  return Boolean(
    artifact.uri?.startsWith('workspace://') ||
      artifact.path?.startsWith('workspace://') ||
      artifact.url?.startsWith('workspace://') ||
      typeof metadata.workspaceFileId === 'string' ||
      typeof metadata.workspaceNodeId === 'string' ||
      (typeof metadata.workspaceUri === 'string' &&
        metadata.workspaceUri.startsWith('workspace://')),
  )
}

function useLiveEvents(onCommand: () => void) {
  const [status, setStatus] = useState('manual')
  useEffect(() => {
    const eventStream = new URLSearchParams(window.location.search).get('shadow_event_stream')
    if (!eventStream) return
    const source = new EventSource(eventStream)
    source.addEventListener('ready', () => setStatus('live'))
    source.addEventListener(SHADOW_SERVER_APP_COMMAND_COMPLETED_EVENT, (event) => {
      try {
        const payload = JSON.parse(event.data || '{}') as { command?: string }
        if (payload.command === 'boards.get') return
      } catch {
        // Older Shadow servers may omit event details.
      }
      onCommand()
    })
    source.onerror = () => setStatus('reconnecting')
    return () => source.close()
  }, [onCommand])
  return status
}

function Avatar(props: { person?: BoardPerson | null }) {
  const name = props.person?.displayName || props.person?.id || 'Unknown'
  return (
    <span
      className="avatar"
      title={name}
      style={{ background: avatarColor(props.person?.buddyAgentId ?? props.person?.id ?? name) }}
    >
      {props.person?.avatarUrl ? (
        <AvatarImage alt="" fallback={initials(props.person)} src={props.person.avatarUrl} />
      ) : (
        initials(props.person)
      )}
    </span>
  )
}

function AssigneeSummary(props: { assignees: BoardPerson[] }) {
  const [first, ...rest] = props.assignees
  if (!first) return <span className="assigneeEmpty">Unassigned</span>
  return (
    <span className="assigneeSummary">
      <Avatar person={first} />
      <span className="assigneeName">{first.displayName}</span>
      {rest.length > 0 ? <span className="assigneeMore">+{rest.length}</span> : null}
    </span>
  )
}

function PersonChip(props: { person: BoardPerson }) {
  return (
    <span className="person">
      <Avatar person={props.person} />
      <span className="person-name">{props.person.displayName}</span>
    </span>
  )
}

function initials(person?: BoardPerson | null) {
  const value = person?.displayName || person?.id || '?'
  const result = value
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
  return result || '?'
}

function labelInitials(label: string) {
  const result = label
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
  return result || '?'
}

function labelClass(label: string) {
  return `label-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
}

const rootElement = document.getElementById('root')

if (rootElement) {
  createRoot(rootElement).render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}
