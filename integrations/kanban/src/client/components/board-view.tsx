import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import type { DragEvent, FormEvent, ReactNode } from 'react'
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
} from '../api.js'
import { useBuddyDirectory } from '../hooks/use-buddy-directory.js'
import { t } from '../i18n.js'
import { type BuddyDirectory, labelClass, resolvePersonIdentity } from '../identity.js'
import { MarkdownText } from '../markdown.js'
import { boardQueryKey, boardsQueryKey } from '../query-keys.js'
import { BoardMenu } from './board-menu.js'
import { CardActionsMenu, ListActionsMenu } from './entity-actions.js'
import { AssigneeSummary } from './identity.js'

type BoardFilter = 'active' | 'all' | 'done' | 'review'

const boardFilters: BoardFilter[] = ['active', 'all', 'review', 'done']
const boardFilterLabels: Record<BoardFilter, Parameters<typeof t>[0]> = {
  active: 'board.filter.active',
  all: 'board.filter.all',
  done: 'board.filter.done',
  review: 'board.filter.review',
}

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
  const [filter, setFilter] = useState<BoardFilter>('active')
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
          filter,
          query: searchQuery,
        }),
      ),
    [buddyDirectory, filter, props.board.cards, searchQuery],
  )
  const visibleCardsByColumn = new Map<string, BoardCard[]>()
  for (const column of props.board.columns) visibleCardsByColumn.set(column.id, [])
  for (const card of filteredCards) visibleCardsByColumn.get(card.columnId)?.push(card)
  const filterCounts = {
    active: props.board.cards.filter((card) => cardStatus(card) !== 'done').length,
    all: props.board.cards.length,
    done: props.board.cards.filter((card) => cardStatus(card) === 'done').length,
    review: props.board.cards.filter((card) => cardStatus(card) === 'review').length,
  } satisfies Record<BoardFilter, number>

  return (
    <>
      <section className="boardToolbar" aria-label={t('board.toolbarLabel')}>
        <div className="boardToolbarSummary">
          <BoardMenu
            board={props.board}
            boards={boards.data?.boards ?? []}
            createBoard={(title) => boardCreate.mutate({ title })}
            deleteCurrentBoard={() => boardDelete.mutate({ boardId: props.board.boardId })}
            onSelectBoard={(board) => {
              replaceBoardScope({ projectId: board.projectId, boardId: board.boardId })
              reloadBoard()
            }}
          />
        </div>
        <label className="boardSearch">
          <span>{t('board.searchLabel')}</span>
          <input
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={t('board.searchPlaceholder')}
            value={searchQuery}
          />
        </label>
        <div className="boardFilters" role="group" aria-label={t('board.filterLabel')}>
          <span className="boardFiltersLabel">{t('board.viewLabel')}</span>
          {boardFilters.map((item) => (
            <button
              className={item === filter ? 'filterButton active' : 'filterButton'}
              aria-pressed={item === filter}
              key={item}
              type="button"
              onClick={() => setFilter(item)}
            >
              <span>{t(boardFilterLabels[item])}</span>
              <small>{filterCounts[item]}</small>
            </button>
          ))}
        </div>
        {props.toolbarActions ? (
          <div className="boardToolbarActions">{props.toolbarActions}</div>
        ) : null}
        <button className="refresh boardRefresh" type="button" onClick={props.onRefresh}>
          {t('board.refresh')}
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
        {t('board.addListTrigger')}
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
        {t('board.addCardTrigger')}
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
}) {
  const navigate = useNavigate()
  const artifactCount = cardArtifactCount(props.board, props.card)
  const progress = props.card.progress ?? progressFromStatus(props.card.status)
  const openCard = () => void navigate({ to: '/cards/$cardId', params: { cardId: props.card.id } })
  return (
    <article
      className="card"
      data-card-id={props.card.id}
      draggable
      role="button"
      tabIndex={0}
      onClick={openCard}
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
      <CardActionsMenu onDelete={() => props.deleteCard(props.card.id)} />
      <div className="labels">
        {props.card.labels.map((label) => (
          <span className={`label ${labelClass(label)}`} key={label} title={label}>
            {label}
          </span>
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
      <div className="cardSignals">
        {props.card.buddyStatus ? (
          <span className={`buddy-pill buddy-${props.card.buddyStatus}`}>
            {statusCopy(props.card.buddyStatus)}
          </span>
        ) : null}
        {props.card.issueStep ? (
          <span className="issueMeta">
            <span>{statusCopy(props.card.issueStep.status)}</span>
            <span>{props.card.issueStep.taskType}</span>
          </span>
        ) : null}
      </div>
      {typeof progress === 'number' ? (
        <div className="progressTrack" aria-label={t('card.progressLabel', { progress })}>
          <span style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
        </div>
      ) : null}
      <div className="card-footer">
        <div className="avatars">
          <AssigneeSummary assignees={props.card.assignees} directory={props.directory} />
        </div>
        <div className="cardMetaGroup">
          {artifactCount > 0 ? (
            <span className="meta">{t('card.artifacts', { count: artifactCount })}</span>
          ) : null}
          <span className="meta">{t('card.comments', { count: props.card.comments.length })}</span>
        </div>
      </div>
    </article>
  )
}

function progressFromStatus(status: BoardCard['status']) {
  if (status === 'done') return 100
  if (status === 'review') return 72
  if (status === 'running') return 48
  if (status === 'queued') return 12
  return undefined
}

function statusCopy(status: string) {
  return t(`status.${status}` as Parameters<typeof t>[0])
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
  input: { directory: BuddyDirectory; filter: BoardFilter; query: string },
) {
  const status = cardStatus(card)
  if (input.filter === 'active' && status === 'done') return false
  if (input.filter === 'review' && status !== 'review') return false
  if (input.filter === 'done' && status !== 'done') return false
  const query = input.query.trim().toLowerCase()
  if (!query) return true
  const assigneeText = card.assignees
    .map((person) => resolvePersonIdentity(person, input.directory).label)
    .join(' ')
  const haystack = [
    card.title,
    card.description,
    card.prompt,
    card.status,
    card.buddyStatus,
    card.issueStep?.taskType,
    ...card.labels,
    assigneeText,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return haystack.includes(query)
}

function cardStatus(card: BoardCard) {
  return card.status ?? card.issueStep?.status ?? 'queued'
}
