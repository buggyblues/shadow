import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  CalendarDays,
  Check,
  ListChecks,
  MessageSquare,
  Paperclip,
  Plus,
  RefreshCw,
  Search,
} from 'lucide-react'
import type { DragEvent, FormEvent, MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import { useMemo, useState } from 'react'
import type { BoardCard, BoardState } from '../../types.js'
import type { KanbanOAuthSession } from '../api.js'
import {
  createBoard,
  createCard,
  createColumn,
  deleteBoard,
  deleteCard,
  deleteColumn,
  listBoards,
  moveCard,
  replaceBoardScope,
  updateBoard,
  updateCard,
} from '../api.js'
import { copyCardDetailLink } from '../card-link.js'
import { useBuddyDirectory } from '../hooks/use-buddy-directory.js'
import { t } from '../i18n.js'
import { type BuddyDirectory, labelClass, resolvePersonIdentity } from '../identity.js'
import { MarkdownText } from '../markdown.js'
import { boardQueryKey, boardsQueryKey } from '../query-keys.js'
import { BoardMenu } from './board-menu.js'
import { CardActionsMenu, ListActionsMenu } from './entity-actions.js'
import { AssigneeSummary } from './identity.js'

export function BoardView(props: {
  board: BoardState
  showToast: (message: string) => void
  toolbarActions?: ReactNode
  onRefresh?: () => void
  userProfile?: KanbanOAuthSession['profile'] | null
}) {
  const queryClient = useQueryClient()
  const buddyDirectory = useBuddyDirectory(props.userProfile)
  const [searchQuery, setSearchQuery] = useState('')
  const boards = useQuery({
    queryKey: boardsQueryKey,
    queryFn: listBoards,
  })
  const reloadBoard = () => {
    void queryClient.invalidateQueries({ queryKey: boardQueryKey })
    void queryClient.invalidateQueries({ queryKey: boardsQueryKey })
    void queryClient.refetchQueries({ queryKey: boardQueryKey, type: 'active' })
    void queryClient.refetchQueries({ queryKey: boardsQueryKey, type: 'active' })
  }
  const updateCachedBoard = (updater: (board: BoardState) => BoardState) => {
    queryClient.setQueryData<BoardState>(boardQueryKey, (current) =>
      current ? updater(current) : current,
    )
  }
  const create = useMutation({
    mutationFn: createCard,
    onSuccess: reloadBoard,
    onError: (error) => props.showToast(error.message),
  })
  const boardCreate = useMutation({
    mutationFn: createBoard,
    onSuccess: ({ board }) => {
      replaceBoardScope({ projectId: board.projectId, boardId: board.boardId })
      reloadBoard()
    },
    onError: (error) => props.showToast(error.message),
  })
  const boardUpdate = useMutation({
    mutationFn: updateBoard,
    onSuccess: reloadBoard,
    onError: (error) => props.showToast(error.message),
  })
  const boardDelete = useMutation({
    mutationFn: deleteBoard,
    onSuccess: ({ nextBoard }) => {
      replaceBoardScope({ projectId: nextBoard.projectId, boardId: nextBoard.boardId })
      reloadBoard()
    },
    onError: (error) => props.showToast(error.message),
  })
  const columnCreate = useMutation({
    mutationFn: createColumn,
    onSuccess: reloadBoard,
    onError: (error) => props.showToast(error.message),
  })
  const columnDelete = useMutation({
    mutationFn: deleteColumn,
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: boardQueryKey })
      const previous = queryClient.getQueryData<BoardState>(boardQueryKey)
      updateCachedBoard((board) => {
        const removedCardIds = new Set(
          board.cards.filter((card) => card.columnId === input.columnId).map((card) => card.id),
        )
        return {
          ...board,
          columns: board.columns.filter((column) => column.id !== input.columnId),
          cards: board.cards.filter((card) => card.columnId !== input.columnId),
          links: board.links.filter(
            (link) =>
              !removedCardIds.has(link.sourceCardId) && !removedCardIds.has(link.targetCardId),
          ),
          artifacts: board.artifacts.filter((artifact) => !removedCardIds.has(artifact.cardId)),
        }
      })
      return { previous }
    },
    onError: (error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(boardQueryKey, context.previous)
      props.showToast(error.message)
    },
    onSettled: reloadBoard,
  })
  const move = useMutation({
    mutationFn: moveCard,
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: boardQueryKey })
      const previous = queryClient.getQueryData<BoardState>(boardQueryKey)
      updateCachedBoard((board) => ({
        ...board,
        cards: board.cards.map((card) =>
          card.id === input.cardId
            ? { ...card, columnId: input.columnId, updatedAt: new Date().toISOString() }
            : card,
        ),
      }))
      return { previous }
    },
    onError: (error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(boardQueryKey, context.previous)
      props.showToast(error.message)
    },
    onSettled: reloadBoard,
  })
  const cardUpdate = useMutation({
    mutationFn: updateCard,
    onSuccess: reloadBoard,
    onError: (error) => props.showToast(error.message),
  })
  const cardDelete = useMutation({
    mutationFn: deleteCard,
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: boardQueryKey })
      const previous = queryClient.getQueryData<BoardState>(boardQueryKey)
      updateCachedBoard((board) => ({
        ...board,
        cards: board.cards.filter((card) => card.id !== input.cardId),
        links: board.links.filter(
          (link) => link.sourceCardId !== input.cardId && link.targetCardId !== input.cardId,
        ),
        artifacts: board.artifacts.filter((artifact) => artifact.cardId !== input.cardId),
      }))
      return { previous }
    },
    onError: (error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(boardQueryKey, context.previous)
      props.showToast(error.message)
    },
    onSettled: reloadBoard,
  })
  const filteredCards = useMemo(
    () =>
      props.board.cards.filter((card) =>
        cardMatchesBoardFilter(card, {
          directory: buddyDirectory,
          query: searchQuery,
        }),
      ),
    [buddyDirectory, props.board.cards, searchQuery],
  )
  const visibleCardsByColumn = new Map<string, BoardCard[]>()
  for (const column of props.board.columns) visibleCardsByColumn.set(column.id, [])
  for (const card of filteredCards) visibleCardsByColumn.get(card.columnId)?.push(card)
  return (
    <>
      <section className="boardToolbar" aria-label={t('board.toolbarLabel')}>
        <div className="boardToolbarSummary">
          <BoardMenu
            board={props.board}
            boards={boards.data?.boards ?? []}
            createBoard={(title) => boardCreate.mutate({ title })}
            deleteCurrentBoard={() => boardDelete.mutate({ boardId: props.board.boardId })}
            updateBoard={(title) => boardUpdate.mutate({ title })}
            onSelectBoard={(board) => {
              replaceBoardScope({ projectId: board.projectId, boardId: board.boardId })
              reloadBoard()
            }}
          />
        </div>
        <label className="boardSearch" aria-label={t('board.searchLabel')}>
          <Search aria-hidden="true" size={15} strokeWidth={2.4} />
          <input
            aria-label={t('board.searchLabel')}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={t('board.searchPlaceholder')}
            value={searchQuery}
          />
        </label>
        {props.toolbarActions ? (
          <div className="boardToolbarActions">{props.toolbarActions}</div>
        ) : null}
        <button
          className="refresh boardRefresh iconTextButton"
          type="button"
          onClick={props.onRefresh}
        >
          <RefreshCw aria-hidden="true" size={15} strokeWidth={2.4} />
          <span>{t('board.refresh')}</span>
        </button>
      </section>
      <section className="board" aria-label={t('board.columnsLabel')}>
        {props.board.columns.map((column) => {
          const cards = visibleCardsByColumn.get(column.id) ?? []
          const totalCards = props.board.cards.filter((card) => card.columnId === column.id).length
          return (
            <ColumnView
              board={props.board}
              cards={cards}
              columnId={column.id}
              count={cards.length}
              createCard={(title) => create.mutate({ title, columnId: column.id })}
              deleteCard={(cardId) => cardDelete.mutate({ cardId })}
              deleteColumn={() => columnDelete.mutate({ columnId: column.id })}
              directory={buddyDirectory}
              key={column.id}
              moveCard={(cardId) => move.mutate({ cardId, columnId: column.id })}
              showToast={props.showToast}
              toggleComplete={(card) =>
                cardUpdate.mutate({
                  cardId: card.id,
                  dueComplete: !card.dates?.dueComplete,
                })
              }
              title={column.title}
              totalCount={totalCards}
            />
          )
        })}
        <AddColumnComposer createColumn={(title) => columnCreate.mutate({ title })} />
      </section>
    </>
  )
}

function ColumnView(props: {
  board: BoardState
  cards: BoardCard[]
  columnId: string
  count: number
  createCard: (title: string) => void
  deleteCard: (cardId: string) => void
  deleteColumn: () => void
  directory: BuddyDirectory
  moveCard: (cardId: string) => void
  showToast: (message: string) => void
  toggleComplete: (card: BoardCard) => void
  title: string
  totalCount: number
}) {
  const [isOver, setIsOver] = useState(false)
  const handleDragOver = (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setIsOver(true)
  }
  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    const relatedTarget = event.relatedTarget
    if (relatedTarget instanceof Node && event.currentTarget.contains(relatedTarget)) return
    setIsOver(false)
  }
  const handleDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setIsOver(false)
    const cardId = event.dataTransfer.getData('text/plain')
    if (!cardId) return
    props.moveCard(cardId)
  }

  return (
    <div
      className={isOver ? 'list over' : 'list'}
      data-column={props.columnId}
      data-droppable="true"
      onDragEnter={handleDragOver}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="list-header">
        <div className="list-title">{props.title}</div>
        <div className="listHeaderActions">
          <div
            className="count"
            title={t('board.visibleOfTotal', { count: props.count, total: props.totalCount })}
          >
            {props.count}
          </div>
          <ListActionsMenu cardCount={props.totalCount} onDelete={props.deleteColumn} />
        </div>
      </div>
      <div
        className={props.cards.length === 0 ? 'cards emptyDropZone' : 'cards'}
        onDragEnter={handleDragOver}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {props.cards.length === 0 && isOver ? (
          <div className="dropHint">{t('board.dropCardHere')}</div>
        ) : null}
        {props.cards.map((card) => (
          <CardTile
            board={props.board}
            card={card}
            deleteCard={props.deleteCard}
            directory={props.directory}
            key={card.id}
            showToast={props.showToast}
            toggleComplete={props.toggleComplete}
          />
        ))}
        {props.totalCount > 0 && props.count === 0 ? (
          <div className="listEmpty">{t('board.noMatchingCards')}</div>
        ) : null}
      </div>
      <AddCardComposer createCard={props.createCard} />
    </div>
  )
}

function AddColumnComposer(props: { createColumn: (title: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  const [title, setTitle] = useState('')
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    props.createColumn(trimmed)
    setTitle('')
    setExpanded(false)
  }
  if (!expanded) {
    return (
      <button className="addListTrigger" type="button" onClick={() => setExpanded(true)}>
        <Plus aria-hidden="true" size={16} strokeWidth={2.6} />
        <span>{t('board.addListTrigger')}</span>
      </button>
    )
  }
  return (
    <form className="addListComposer" onSubmit={handleSubmit}>
      <input
        autoFocus
        maxLength={80}
        onChange={(event) => setTitle(event.target.value)}
        placeholder={t('board.addListPlaceholder')}
        value={title}
      />
      <div className="quick-add-actions">
        <button type="submit">{t('board.addList')}</button>
        <button
          className="secondary"
          type="button"
          onClick={() => {
            setTitle('')
            setExpanded(false)
          }}
        >
          {t('board.cancel')}
        </button>
      </div>
    </form>
  )
}

function AddCardComposer(props: { createCard: (title: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  const [title, setTitle] = useState('')
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    props.createCard(trimmed)
    setTitle('')
    setExpanded(false)
  }
  if (!expanded) {
    return (
      <button className="quick-add-trigger" type="button" onClick={() => setExpanded(true)}>
        <Plus aria-hidden="true" size={15} strokeWidth={2.6} />
        <span>{t('board.addCardTrigger')}</span>
      </button>
    )
  }
  return (
    <form className="quick-add" onSubmit={handleSubmit}>
      <textarea
        autoFocus
        maxLength={180}
        onChange={(event) => setTitle(event.target.value)}
        placeholder={t('board.addCardPlaceholder')}
        rows={3}
        value={title}
      />
      <div className="quick-add-actions">
        <button type="submit">{t('board.addCard')}</button>
        <button
          className="secondary"
          type="button"
          onClick={() => {
            setTitle('')
            setExpanded(false)
          }}
        >
          {t('board.cancel')}
        </button>
      </div>
    </form>
  )
}

function CardTile(props: {
  board: BoardState
  card: BoardCard
  deleteCard: (cardId: string) => void
  directory: BuddyDirectory
  showToast: (message: string) => void
  toggleComplete: (card: BoardCard) => void
}) {
  const navigate = useNavigate()
  const artifactCount = cardArtifactCount(props.board, props.card)
  const checklist = cardChecklistSummary(props.card)
  const due = cardDueSummary(props.card)
  const openCard = () => void navigate({ to: '/cards/$cardId', params: { cardId: props.card.id } })
  const handleCardClick = (event: ReactMouseEvent<HTMLElement>) => {
    if (isCardActionTarget(event.target)) return
    openCard()
  }
  const copyLink = () => {
    void copyCardDetailLink(props.card.id)
      .then(() => props.showToast(t('toast.cardLinkCopied')))
      .catch(() => props.showToast(t('toast.cardLinkCopyFailed')))
  }
  return (
    <article
      className="card"
      data-card-id={props.card.id}
      draggable
      role="button"
      tabIndex={0}
      onClick={handleCardClick}
      onDragStart={(event) => {
        event.currentTarget.classList.add('dragging')
        event.dataTransfer.setData('text/plain', props.card.id)
      }}
      onDragEnd={(event) => event.currentTarget.classList.remove('dragging')}
      onKeyDown={(event) => {
        if (event.currentTarget !== event.target) return
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        openCard()
      }}
    >
      <CardActionsMenu
        completed={props.card.dates?.dueComplete === true}
        onCopyLink={copyLink}
        onDelete={() => props.deleteCard(props.card.id)}
        onOpen={openCard}
        onToggleComplete={() => props.toggleComplete(props.card)}
      />
      <div className="labels">
        {props.card.labels.map((label) => (
          <span className={`label ${labelClass(label)}`} key={label} title={label}>
            {label}
          </span>
        ))}
      </div>
      <div className="card-title-row">
        <button
          className={props.card.dates?.dueComplete ? 'cardComplete done' : 'cardComplete'}
          type="button"
          title={t('card.toggleComplete')}
          aria-label={t('card.toggleComplete')}
          onClick={(event) => {
            event.stopPropagation()
            props.toggleComplete(props.card)
          }}
        >
          <Check aria-hidden="true" size={13} strokeWidth={3} />
        </button>
        <div className="card-title">{props.card.title}</div>
      </div>
      {props.card.description ? (
        <MarkdownText
          compact
          className="card-desc markdown markdown-compact"
          content={props.card.description}
        />
      ) : null}
      <div className="card-footer">
        <div className="cardBadges">
          {due ? (
            <span className={due.complete ? 'cardBadge done' : 'cardBadge'}>
              <CalendarDays aria-hidden="true" size={12} strokeWidth={2.4} />
              {due.label}
            </span>
          ) : null}
          {checklist.total > 0 ? (
            <span className={checklist.done === checklist.total ? 'cardBadge done' : 'cardBadge'}>
              <ListChecks aria-hidden="true" size={12} strokeWidth={2.4} />
              {checklist.done}/{checklist.total}
            </span>
          ) : null}
          {artifactCount > 0 ? (
            <span className="cardBadge">
              <Paperclip aria-hidden="true" size={12} strokeWidth={2.4} />
              {artifactCount}
            </span>
          ) : null}
          {props.card.comments.length > 0 ? (
            <span className="cardBadge">
              <MessageSquare aria-hidden="true" size={12} strokeWidth={2.4} />
              {props.card.comments.length}
            </span>
          ) : null}
        </div>
        <div className="avatars">
          <AssigneeSummary assignees={props.card.assignees} directory={props.directory} />
        </div>
      </div>
    </article>
  )
}

function isCardActionTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest('[data-card-action-menu="true"]'))
}

function cardArtifactCount(board: BoardState, card: BoardCard) {
  const legacyIds = card.issueStep?.artifactIds ?? []
  return [
    ...(board.artifacts ?? []).filter((artifact) => artifact.cardId === card.id),
    ...(board.issues.artifacts ?? []).filter((artifact) => legacyIds.includes(artifact.id)),
  ].filter(
    (artifact, index, artifacts) =>
      artifacts.findIndex((candidate) => candidate.id === artifact.id) === index,
  ).length
}

export function cardMatchesBoardFilter(
  card: BoardCard,
  input: { directory: BuddyDirectory; query: string },
) {
  const query = input.query.trim().toLowerCase()
  if (!query) return true
  const assigneeText = card.assignees
    .map((person) => resolvePersonIdentity(person, input.directory).label)
    .join(' ')
  const haystack = [
    card.title,
    card.description,
    card.prompt,
    ...card.labels,
    ...(card.checklists ?? []).flatMap((checklist) => [
      checklist.title,
      ...checklist.items.map((item) => item.text),
    ]),
    card.dates?.start,
    card.dates?.due,
    assigneeText,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return haystack.includes(query)
}

function cardChecklistSummary(card: BoardCard) {
  const items = (card.checklists ?? []).flatMap((checklist) => checklist.items)
  return {
    done: items.filter((item) => item.done).length,
    total: items.length,
  }
}

function cardDueSummary(card: BoardCard) {
  const due = card.dates?.due
  if (!due) return null
  const date = new Date(due)
  const label = Number.isNaN(date.getTime())
    ? due
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return {
    label,
    complete: card.dates?.dueComplete === true,
  }
}
