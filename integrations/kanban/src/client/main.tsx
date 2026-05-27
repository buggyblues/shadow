import { SHADOW_SERVER_APP_COMMAND_COMPLETED_EVENT, ShadowBridge } from '@shadowob/sdk/bridge'
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
import type { BoardCard, BoardPerson, BoardState } from '../types.js'
import {
  assignCard,
  commentCard,
  createAndDispatchCard,
  createCard,
  dispatchCard,
  getBoard,
  moveCard,
} from './api.js'
import './styles.css'

const queryClient = new QueryClient()
const boardQueryKey = ['kanban', 'board'] as const

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
  }
  const closeDetail = () => {
    void navigate({ to: '/' })
  }

  return (
    <>
      <header>
        <div>
          <h1>Shadow Kanban</h1>
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
        {board.error ? <div className="emptyState">{board.error.message}</div> : null}
        {board.data ? <BoardView board={board.data} showToast={showToast} /> : null}
      </main>
      <CardDetail
        card={selectedCard}
        open={!!props.selectedCardId}
        onClose={closeDetail}
        showToast={showToast}
      />
      <div className={toast ? 'toast show' : 'toast'}>{toast}</div>
    </>
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
  const createDispatch = useMutation({
    mutationFn: createAndDispatchCard,
    onSuccess: (payload) => {
      void reloadBoard()
      const delivered = ShadowBridge.inboxDeliveries(payload).length > 0
      props.showToast(delivered ? 'Card created and delivered to Inbox' : 'Card created')
    },
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
            createAndDispatchCard={(input) =>
              createDispatch.mutate({ ...input, columnId: column.id })
            }
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
  createAndDispatchCard: (input: { title: string; assigneeLabel?: string }) => void
  createCard: (title: string) => void
  moveCard: (cardId: string) => void
  title: string
}) {
  const [isOver, setIsOver] = useState(false)
  const [title, setTitle] = useState('')
  const [assigneeLabel, setAssigneeLabel] = useState('Strategy Buddy')

  const nextTitle = () => title.trim()
  const resetForm = () => setTitle('')
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = nextTitle()
    if (!trimmed) return
    props.createCard(trimmed)
    resetForm()
  }
  const handleCreateAndDispatch = () => {
    const trimmed = nextTitle()
    if (!trimmed) return
    props.createAndDispatchCard({ title: trimmed, assigneeLabel })
    resetForm()
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
        <input
          maxLength={80}
          onChange={(event) => setAssigneeLabel(event.target.value)}
          placeholder="Buddy"
          value={assigneeLabel}
        />
        <div className="quick-add-actions">
          <button type="submit">Add card</button>
          <button className="dispatch" type="button" onClick={handleCreateAndDispatch}>
            Add & dispatch
          </button>
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
      {props.card.description ? <div className="card-desc">{props.card.description}</div> : null}
      {props.card.buddyStatus ? (
        <div className={`buddy-pill buddy-${props.card.buddyStatus}`}>{props.card.buddyStatus}</div>
      ) : null}
      <div className="card-footer">
        <div className="avatars">
          {props.card.assignees.slice(0, 4).map((person) => (
            <Avatar key={person.id} person={person} />
          ))}
        </div>
        <span className="meta">{props.card.comments.length} comments</span>
      </div>
    </button>
  )
}

function CardDetail(props: {
  card: BoardCard | null
  open: boolean
  onClose: () => void
  showToast: (message: string) => void
}) {
  const queryClient = useQueryClient()
  const [comment, setComment] = useState('')
  const [buddyLabel, setBuddyLabel] = useState('Strategy Buddy')
  const reloadBoard = () => queryClient.invalidateQueries({ queryKey: boardQueryKey })
  const assign = useMutation({ mutationFn: assignCard, onSuccess: reloadBoard })
  const dispatch = useMutation({
    mutationFn: dispatchCard,
    onSuccess: (payload) => {
      void reloadBoard()
      const delivered = ShadowBridge.inboxDeliveries(payload).length > 0
      props.showToast(delivered ? 'Card delivered to Inbox' : 'Card dispatched')
    },
    onError: (error) => props.showToast(error.message),
  })
  const createComment = useMutation({
    mutationFn: commentCard,
    onSuccess: (payload) => {
      setComment('')
      void reloadBoard()
      if (ShadowBridge.inboxDeliveries(payload).length > 0) {
        props.showToast('Comment delivered to Inbox')
      }
    },
  })

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
                <div className="section-title">Description</div>
                <p className="description">{props.card.description || 'No description'}</p>
              </section>
              <section className="section">
                <div className="section-title">Buddy Inbox</div>
                <div className="dispatch-row">
                  <input
                    maxLength={80}
                    onChange={(event) => setBuddyLabel(event.target.value)}
                    value={buddyLabel}
                  />
                  <button
                    className="primary"
                    disabled={dispatch.isPending}
                    type="button"
                    onClick={() =>
                      dispatch.mutate({
                        cardId: props.card!.id,
                        assigneeLabel: buddyLabel,
                        reason: 'Kanban card dispatched from the board detail panel.',
                      })
                    }
                  >
                    Dispatch
                  </button>
                </div>
                {props.card.lastDispatchedAt ? (
                  <div className="meta">
                    Last dispatched {new Date(props.card.lastDispatchedAt).toLocaleString()}
                  </div>
                ) : null}
              </section>
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
                          <div className="comment-body">{item.body}</div>
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
                  maxLength={1000}
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
    <span className="avatar" title={name}>
      {props.person?.avatarUrl ? (
        <img alt="" referrerPolicy="no-referrer" src={props.person.avatarUrl} />
      ) : (
        initials(props.person)
      )}
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
  return value
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

function labelClass(label: string) {
  return `label-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <QueryClientProvider client={queryClient}>
    <RouterProvider router={router} />
  </QueryClientProvider>,
)
