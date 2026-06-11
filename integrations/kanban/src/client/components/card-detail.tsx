import * as Dialog from '@radix-ui/react-dialog'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlignLeft,
  CalendarDays,
  Check,
  ChevronDown,
  FileText,
  ListChecks,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Plus,
  Tag,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import type {
  BoardCard,
  BoardCardArtifact,
  BoardCardChecklist,
  BoardCardChecklistItem,
  BoardPerson,
  BoardState,
} from '../../types.js'
import type { KanbanOAuthSession } from '../api.js'
import {
  assignCard,
  commentCard,
  deleteCard,
  deleteComment,
  dispatchCardToBuddy,
  listBuddyInboxes,
  openWorkspaceArtifact,
  updateCard,
} from '../api.js'
import { t } from '../i18n.js'
import {
  buddyLabel,
  buddyOption,
  buildBuddyDirectory,
  labelClass,
  resolvePersonIdentity,
} from '../identity.js'
import { boardQueryKey, inboxQueryKey } from '../query-keys.js'
import { ConfirmActionButton } from './confirm-dialog.js'
import { BuddyAvatar, BuddySelect, PersonChip } from './identity.js'

type QuickPanel = 'labels' | 'dates' | 'checklist' | 'members' | null

export function CardDetail(props: {
  board: BoardState | null
  card: BoardCard | null
  open: boolean
  onClose: () => void
  showToast: (message: string) => void
  userProfile?: KanbanOAuthSession['profile'] | null
}) {
  const queryClient = useQueryClient()
  const [comment, setComment] = useState('')
  const [descriptionDraft, setDescriptionDraft] = useState('')
  const [labelDraft, setLabelDraft] = useState('')
  const [startDateDraft, setStartDateDraft] = useState('')
  const [dueDateDraft, setDueDateDraft] = useState('')
  const [checklistTitleDraft, setChecklistTitleDraft] = useState('')
  const [checklistItemDrafts, setChecklistItemDrafts] = useState<Record<string, string>>({})
  const [dispatchAgentId, setDispatchAgentId] = useState('')
  const [quickPanel, setQuickPanel] = useState<QuickPanel>(null)
  const reloadBoard = () => {
    void queryClient.invalidateQueries({ queryKey: boardQueryKey })
    void queryClient.refetchQueries({ queryKey: boardQueryKey, type: 'active' })
  }
  const inboxes = useQuery({
    queryKey: inboxQueryKey,
    queryFn: () => listBuddyInboxes(),
    enabled: props.open,
  })
  const update = useMutation({
    mutationFn: updateCard,
    onSuccess: reloadBoard,
    onError: (error) => props.showToast(error.message),
  })
  const assign = useMutation({
    mutationFn: assignCard,
    onSuccess: reloadBoard,
    onError: (error) => props.showToast(error.message),
  })
  const createComment = useMutation({
    mutationFn: commentCard,
    onSuccess: () => {
      setComment('')
      reloadBoard()
    },
    onError: (error) => props.showToast(error.message),
  })
  const removeComment = useMutation({
    mutationFn: deleteComment,
    onSuccess: reloadBoard,
    onError: (error) => props.showToast(error.message),
  })
  const removeCard = useMutation({
    mutationFn: deleteCard,
    onSuccess: () => {
      reloadBoard()
      props.onClose()
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
    }) => dispatchCardToBuddy(input),
    onSuccess: () => {
      setDispatchAgentId('')
      reloadBoard()
      props.showToast(t('toast.taskSentToBuddy'))
    },
    onError: (error) => props.showToast(error.message),
  })

  const artifacts = issueArtifacts(props.board, props.card)
  const column = props.board?.columns.find((item) => item.id === props.card?.columnId)
  const dispatchOptions = inboxes.data?.inboxes ?? []
  const buddyDirectory = useMemo(
    () => buildBuddyDirectory(dispatchOptions, [props.userProfile]),
    [dispatchOptions, props.userProfile],
  )
  const selectedDispatchInbox = dispatchOptions.find((inbox) => inbox.agent.id === dispatchAgentId)
  const dispatchBuddyOptions = dispatchOptions.map(buddyOption)

  useEffect(() => {
    setDescriptionDraft(props.card?.description ?? '')
    setStartDateDraft(dateInputValue(props.card?.dates?.start ?? null))
    setDueDateDraft(dateInputValue(props.card?.dates?.due ?? null))
    setDispatchAgentId('')
    setQuickPanel(null)
  }, [props.card?.id, props.card?.description, props.card?.dates?.due, props.card?.dates?.start])

  const saveDescription = () => {
    if (!props.card) return
    update.mutate({ cardId: props.card.id, description: descriptionDraft })
  }

  const toggleCardComplete = () => {
    if (!props.card) return
    update.mutate({
      cardId: props.card.id,
      dueComplete: !(props.card.dates?.dueComplete === true),
    })
  }

  const moveCardToColumn = (columnId: string) => {
    if (!props.card || props.card.columnId === columnId) return
    update.mutate({ cardId: props.card.id, columnId })
  }

  const moveCardByOffset = (offset: number) => {
    if (!props.card || !props.board) return
    const currentIndex = props.board.columns.findIndex((item) => item.id === props.card?.columnId)
    if (currentIndex === -1) return
    const nextColumn = props.board.columns[currentIndex + offset]
    if (!nextColumn) return
    moveCardToColumn(nextColumn.id)
  }

  const addLabel = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!props.card) return
    const label = labelDraft.trim()
    if (!label) return
    update.mutate({ cardId: props.card.id, labels: [...new Set([...props.card.labels, label])] })
    setLabelDraft('')
  }

  const saveDates = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!props.card) return
    update.mutate({
      cardId: props.card.id,
      startDate: startDateDraft ? dateValueToIso(startDateDraft, false) : null,
      dueDate: dueDateDraft ? dateValueToIso(dueDateDraft, true) : null,
      dueComplete: props.card.dates?.dueComplete === true,
    })
  }

  const addChecklist = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!props.card) return
    const title = checklistTitleDraft.trim() || t('detail.defaultChecklist')
    const next = [
      ...(props.card.checklists ?? []),
      {
        id: clientId('checklist'),
        title,
        items: [],
        createdAt: new Date().toISOString(),
      },
    ]
    update.mutate({ cardId: props.card.id, checklists: next })
    setChecklistTitleDraft('')
  }

  const addChecklistItem = (checklist: BoardCardChecklist) => {
    if (!props.card) return
    const text = checklistItemDrafts[checklist.id]?.trim()
    if (!text) return
    const next = updateChecklist(props.card, checklist.id, {
      ...checklist,
      items: [
        ...checklist.items,
        {
          id: clientId('check'),
          text,
          done: false,
          createdAt: new Date().toISOString(),
          completedAt: null,
        },
      ],
    })
    update.mutate({ cardId: props.card.id, checklists: next })
    setChecklistItemDrafts((drafts) => ({ ...drafts, [checklist.id]: '' }))
  }

  const toggleChecklistItem = (checklist: BoardCardChecklist, item: BoardCardChecklistItem) => {
    if (!props.card) return
    const done = !item.done
    const nextChecklist = {
      ...checklist,
      items: checklist.items.map((candidate) =>
        candidate.id === item.id
          ? { ...candidate, done, completedAt: done ? new Date().toISOString() : null }
          : candidate,
      ),
    }
    update.mutate({
      cardId: props.card.id,
      checklists: updateChecklist(props.card, checklist.id, nextChecklist),
    })
  }

  const submitCommentBody = () => {
    if (!props.card) return
    const body = comment.trim()
    if (!body) return
    createComment.mutate({ cardId: props.card.id, body })
  }

  const submitComment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    submitCommentBody()
  }

  const handleCommentKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault()
      submitCommentBody()
    }
  }

  useEffect(() => {
    if (!props.open || !props.card) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isEditableTarget(event.target)) return
      const key = event.key.toLowerCase()
      if (key === 'escape') {
        event.preventDefault()
        props.onClose()
        return
      }
      if (key === 'l') {
        event.preventDefault()
        setQuickPanel('labels')
        return
      }
      if (key === 'd') {
        event.preventDefault()
        setQuickPanel('dates')
        return
      }
      if (key === 'k') {
        event.preventDefault()
        setQuickPanel('checklist')
        return
      }
      if (key === 'm') {
        event.preventDefault()
        setQuickPanel('members')
        return
      }
      if (event.key === '[') {
        event.preventDefault()
        moveCardByOffset(-1)
        return
      }
      if (event.key === ']') {
        event.preventDefault()
        moveCardByOffset(1)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [props.open, props.card, props.board, props.onClose, moveCardByOffset])

  return (
    <Dialog.Root
      open={props.open}
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="trelloOverlay" />
        <Dialog.Content className="trelloModal" aria-label={t('detail.ariaLabel')}>
          {props.card ? (
            <>
              <header className="trelloModalHeader">
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger asChild>
                    <button
                      className="trelloListBadge"
                      type="button"
                      aria-label={t('detail.moveToList')}
                      aria-keyshortcuts="[ ]"
                    >
                      {column?.title ?? t('detail.unknownList')}
                      <ChevronDown aria-hidden="true" size={14} strokeWidth={2.5} />
                    </button>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content
                      align="start"
                      className="actionMenu trelloListMenu"
                      collisionPadding={12}
                      sideOffset={6}
                    >
                      {props.board?.columns.map((targetColumn) => (
                        <DropdownMenu.Item
                          className="actionMenuItem"
                          disabled={targetColumn.id === props.card?.columnId}
                          key={targetColumn.id}
                          onSelect={() => moveCardToColumn(targetColumn.id)}
                        >
                          <Check
                            aria-hidden="true"
                            className={
                              targetColumn.id === props.card?.columnId
                                ? 'listMenuCheck visible'
                                : 'listMenuCheck'
                            }
                            size={14}
                            strokeWidth={2.5}
                          />
                          {targetColumn.title}
                        </DropdownMenu.Item>
                      ))}
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
                <div className="trelloModalHeaderActions">
                  <ConfirmActionButton
                    className="trelloIconButton"
                    description={t('board.deleteCardBody')}
                    disabled={removeCard.isPending}
                    title={t('board.deleteCardTitle')}
                    onConfirm={() => removeCard.mutate({ cardId: props.card!.id })}
                  >
                    <MoreHorizontal aria-hidden="true" size={18} strokeWidth={2.5} />
                  </ConfirmActionButton>
                  <Dialog.Close asChild>
                    <button
                      className="trelloCloseButton"
                      type="button"
                      aria-label={t('detail.close')}
                    >
                      <X aria-hidden="true" size={22} strokeWidth={2.4} />
                    </button>
                  </Dialog.Close>
                </div>
              </header>
              <div className="trelloModalGrid">
                <section className="trelloMainPane">
                  <div className="trelloTitleRow">
                    <button
                      className={
                        props.card.dates?.dueComplete ? 'trelloComplete done' : 'trelloComplete'
                      }
                      type="button"
                      aria-label={t('card.toggleComplete')}
                      aria-keyshortcuts="Space"
                      title={t('card.toggleComplete')}
                      onClick={toggleCardComplete}
                    >
                      <Check aria-hidden="true" size={15} strokeWidth={3} />
                    </button>
                    <Dialog.Title asChild>
                      <h2>{props.card.title}</h2>
                    </Dialog.Title>
                  </div>

                  <div className="trelloQuickActions" aria-label={t('detail.cardActions')}>
                    <button type="button" onClick={() => setQuickPanel('labels')}>
                      <Plus aria-hidden="true" size={16} strokeWidth={2.5} />
                      {t('detail.add')}
                    </button>
                    <button
                      type="button"
                      aria-keyshortcuts="L"
                      onClick={() => setQuickPanel('labels')}
                    >
                      <Tag aria-hidden="true" size={16} strokeWidth={2.5} />
                      {t('detail.labels')}
                    </button>
                    <button
                      type="button"
                      aria-keyshortcuts="D"
                      onClick={() => setQuickPanel('dates')}
                    >
                      <CalendarDays aria-hidden="true" size={16} strokeWidth={2.5} />
                      {t('detail.dates')}
                    </button>
                    <button
                      type="button"
                      aria-keyshortcuts="K"
                      onClick={() => setQuickPanel('checklist')}
                    >
                      <ListChecks aria-hidden="true" size={16} strokeWidth={2.5} />
                      {t('detail.checklist')}
                    </button>
                    <button
                      type="button"
                      aria-keyshortcuts="M"
                      onClick={() => setQuickPanel('members')}
                    >
                      <Users aria-hidden="true" size={16} strokeWidth={2.5} />
                      {t('detail.members')}
                    </button>
                  </div>

                  {quickPanel ? (
                    <section className="trelloQuickPanel">
                      {quickPanel === 'labels' ? (
                        <form className="trelloInlineForm" onSubmit={addLabel}>
                          <label>
                            <span>{t('detail.labelName')}</span>
                            <input
                              maxLength={40}
                              onChange={(event) => setLabelDraft(event.target.value)}
                              placeholder={t('detail.labelPlaceholder')}
                              value={labelDraft}
                            />
                          </label>
                          <button className="primary" type="submit">
                            {t('detail.addLabel')}
                          </button>
                        </form>
                      ) : null}
                      {quickPanel === 'dates' ? (
                        <form className="trelloInlineForm dates" onSubmit={saveDates}>
                          <label>
                            <span>{t('detail.startDate')}</span>
                            <input
                              type="date"
                              onChange={(event) => setStartDateDraft(event.target.value)}
                              value={startDateDraft}
                            />
                          </label>
                          <label>
                            <span>{t('detail.dueDate')}</span>
                            <input
                              type="date"
                              onChange={(event) => setDueDateDraft(event.target.value)}
                              value={dueDateDraft}
                            />
                          </label>
                          <button className="primary" type="submit">
                            {t('detail.saveDates')}
                          </button>
                        </form>
                      ) : null}
                      {quickPanel === 'checklist' ? (
                        <form className="trelloInlineForm" onSubmit={addChecklist}>
                          <label>
                            <span>{t('detail.checklistTitle')}</span>
                            <input
                              maxLength={80}
                              onChange={(event) => setChecklistTitleDraft(event.target.value)}
                              placeholder={t('detail.defaultChecklist')}
                              value={checklistTitleDraft}
                            />
                          </label>
                          <button className="primary" type="submit">
                            {t('detail.addChecklist')}
                          </button>
                        </form>
                      ) : null}
                      {quickPanel === 'members' ? (
                        <div className="trelloInlineForm">
                          <button
                            className="secondary"
                            type="button"
                            onClick={() => assign.mutate({ cardId: props.card!.id })}
                          >
                            {t('detail.assignMe')}
                          </button>
                          <div className="dispatchRow">
                            <BuddySelect
                              disabled={inboxes.isLoading}
                              loading={inboxes.isLoading}
                              onChange={setDispatchAgentId}
                              options={dispatchBuddyOptions}
                              placeholder={t('buddy.select')}
                              value={dispatchAgentId}
                            />
                            <button
                              className="primary"
                              disabled={!selectedDispatchInbox || dispatchCard.isPending}
                              type="button"
                              onClick={() => {
                                if (!selectedDispatchInbox) return
                                dispatchCard.mutate({
                                  card: props.card!,
                                  agentId: selectedDispatchInbox.agent.id,
                                  channelId: selectedDispatchInbox.channel?.id ?? null,
                                  assigneeLabel: buddyLabel(selectedDispatchInbox),
                                  assigneeAvatarUrl:
                                    selectedDispatchInbox.agent.user?.avatarUrl ?? null,
                                })
                              }}
                            >
                              {t('detail.sendToBuddy')}
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </section>
                  ) : null}

                  <CardFieldSummary card={props.card} directory={buddyDirectory} />

                  <section className="trelloSection">
                    <div className="trelloSectionTitle">
                      <AlignLeft className="trelloSectionIcon" aria-hidden="true" size={24} />
                      <h3>{t('detail.description')}</h3>
                    </div>
                    <textarea
                      className="trelloDescriptionInput"
                      maxLength={4000}
                      onBlur={saveDescription}
                      onChange={(event) => setDescriptionDraft(event.target.value)}
                      placeholder={t('detail.descriptionPlaceholder')}
                      rows={4}
                      value={descriptionDraft}
                    />
                  </section>

                  {(props.card.checklists ?? []).map((checklist) => (
                    <ChecklistSection
                      checklist={checklist}
                      key={checklist.id}
                      itemDraft={checklistItemDrafts[checklist.id] ?? ''}
                      onAddItem={() => addChecklistItem(checklist)}
                      onItemDraftChange={(value) =>
                        setChecklistItemDrafts((drafts) => ({ ...drafts, [checklist.id]: value }))
                      }
                      onToggleItem={(item) => toggleChecklistItem(checklist, item)}
                    />
                  ))}

                  {artifacts.length ? (
                    <section className="trelloSection">
                      <div className="trelloSectionTitle">
                        <Paperclip className="trelloSectionIcon" aria-hidden="true" size={23} />
                        <h3>{t('detail.artifacts')}</h3>
                      </div>
                      <div className="artifactList">
                        {artifacts.map((artifact) => (
                          <ArtifactRow artifact={artifact} key={artifact.id} />
                        ))}
                      </div>
                    </section>
                  ) : null}
                </section>

                <aside className="trelloActivityPane">
                  <div className="activityHeader">
                    <h3>
                      <MessageSquare aria-hidden="true" size={18} strokeWidth={2.4} />
                      {t('detail.commentsAndActivity')}
                    </h3>
                    <button className="secondary" type="button">
                      {t('detail.showDetails')}
                    </button>
                  </div>
                  <form className="trelloCommentForm" onSubmit={submitComment}>
                    <textarea
                      maxLength={4000}
                      onChange={(event) => setComment(event.target.value)}
                      onKeyDown={handleCommentKeyDown}
                      placeholder={t('detail.commentPlaceholder')}
                      rows={2}
                      value={comment}
                    />
                    {comment.trim() ? (
                      <button className="primary" disabled={createComment.isPending} type="submit">
                        {t('detail.comment')}
                      </button>
                    ) : null}
                  </form>
                  <ActivityList
                    card={props.card}
                    directory={buddyDirectory}
                    onDeleteComment={(commentId) =>
                      removeComment.mutate({ cardId: props.card!.id, commentId })
                    }
                  />
                </aside>
              </div>
            </>
          ) : (
            <div className="detail-body">
              <Dialog.Title className="srOnly">{t('detail.ariaLabel')}</Dialog.Title>
              <div className="emptyState">{t('detail.cardNotFound')}</div>
              <Dialog.Close asChild>
                <button className="primary" type="button">
                  {t('detail.backToBoard')}
                </button>
              </Dialog.Close>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function CardFieldSummary(props: {
  card: BoardCard
  directory: ReturnType<typeof buildBuddyDirectory>
}) {
  const due = props.card.dates?.due
  const start = props.card.dates?.start
  const hasFields =
    props.card.labels.length > 0 || Boolean(due || start) || props.card.assignees.length > 0
  if (!hasFields) return null
  return (
    <div className="trelloFieldSummary">
      {props.card.labels.length ? (
        <div>
          <span>{t('detail.labels')}</span>
          <div className="labels">
            {props.card.labels.map((label) => (
              <span className={`label ${labelClass(label)}`} key={label}>
                {label}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {start || due ? (
        <div>
          <span>{t('detail.dates')}</span>
          <div className="datePills">
            {start ? (
              <span>
                {t('detail.starts')} {formatDate(start)}
              </span>
            ) : null}
            {due ? (
              <span className={props.card.dates?.dueComplete ? 'done' : ''}>
                {t('detail.due')} {formatDate(due)}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
      {props.card.assignees.length ? (
        <div>
          <span>{t('detail.members')}</span>
          <div className="people">
            {props.card.assignees.map((person) => (
              <PersonChip directory={props.directory} key={person.id} person={person} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function ChecklistSection(props: {
  checklist: BoardCardChecklist
  itemDraft: string
  onAddItem: () => void
  onItemDraftChange: (value: string) => void
  onToggleItem: (item: BoardCardChecklistItem) => void
}) {
  const done = props.checklist.items.filter((item) => item.done).length
  const total = props.checklist.items.length
  const percent = total ? Math.round((done / total) * 100) : 0
  return (
    <section className="trelloSection">
      <div className="trelloSectionTitle">
        <ListChecks className="trelloSectionIcon" aria-hidden="true" size={23} />
        <h3>{props.checklist.title}</h3>
      </div>
      <div className="checklistProgress">
        <span>{percent}%</span>
        <div>
          <b style={{ width: `${percent}%` }} />
        </div>
      </div>
      <div className="checklistItems">
        {props.checklist.items.map((item) => (
          <label className={item.done ? 'checklistItem done' : 'checklistItem'} key={item.id}>
            <input checked={item.done} type="checkbox" onChange={() => props.onToggleItem(item)} />
            <span>{item.text}</span>
          </label>
        ))}
      </div>
      <form
        className="checklistAdd"
        onSubmit={(event) => {
          event.preventDefault()
          props.onAddItem()
        }}
      >
        <input
          maxLength={220}
          onChange={(event) => props.onItemDraftChange(event.target.value)}
          placeholder={t('detail.addChecklistItem')}
          value={props.itemDraft}
        />
        <button className="secondary" disabled={!props.itemDraft.trim()} type="submit">
          {t('detail.add')}
        </button>
      </form>
    </section>
  )
}

function ActivityList(props: {
  card: BoardCard
  directory: ReturnType<typeof buildBuddyDirectory>
  onDeleteComment: (commentId: string) => void
}) {
  const commentItems = props.card.comments.map((comment) => ({
    id: comment.id,
    type: 'card.commented' as const,
    actor: comment.author,
    body: comment.body,
    createdAt: comment.createdAt,
    source: 'comment' as const,
    commentId: comment.id,
  }))
  const commentKeys = new Set(commentItems.map(activityDedupeKey))
  const items = [
    ...(props.card.activity ?? [])
      .filter((item) => item.type !== 'card.commented' || !commentKeys.has(activityDedupeKey(item)))
      .map((item) => ({ ...item, source: 'activity' as const })),
    ...commentItems,
  ]
    .filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  return (
    <div className="activityList">
      {items.map((item) => {
        const identity = resolvePersonIdentity(item.actor, props.directory)
        return (
          <div className="activityItem" key={`${item.type}:${item.id}`}>
            <BuddyAvatar identity={identity} />
            <div className="activityContent">
              <p>
                <strong>{identity.label}</strong> <span>{activityText(item.type, item.body)}</span>
              </p>
              <time>{relativeDate(item.createdAt)}</time>
            </div>
            {item.source === 'comment' ? (
              <ConfirmActionButton
                className="activityDeleteButton"
                description={t('detail.deleteCommentBody')}
                title={t('detail.deleteCommentTitle')}
                onConfirm={() => props.onDeleteComment(item.commentId)}
              >
                <Trash2 aria-hidden="true" size={14} strokeWidth={2.4} />
                <span className="srOnly">{t('detail.deleteComment')}</span>
              </ConfirmActionButton>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function activityDedupeKey(item: { actor: BoardPerson; body: string; createdAt: string }) {
  return `${item.actor.kind}:${item.actor.id}:${item.actor.userId ?? ''}:${
    item.actor.buddyAgentId ?? ''
  }:${item.createdAt}:${item.body}`
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
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
      <FileText className="artifactIcon" aria-hidden="true" size={18} strokeWidth={2.3} />
      <span className="artifactCopy">
        <strong>{props.artifact.title}</strong>
        <span>{artifactKindLabel(props.artifact)}</span>
      </span>
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
  if (artifactWorkspaceTarget(artifact)) return t('detail.workspaceFile')
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

function updateChecklist(card: BoardCard, checklistId: string, nextChecklist: BoardCardChecklist) {
  return (card.checklists ?? []).map((checklist) =>
    checklist.id === checklistId ? nextChecklist : checklist,
  )
}

function clientId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

function dateInputValue(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

function dateValueToIso(value: string, endOfDay: boolean) {
  return new Date(`${value}T${endOfDay ? '23:59:00' : '00:00:00'}`).toISOString()
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function relativeDate(value: string) {
  const time = Date.parse(value)
  if (!Number.isFinite(time)) return value
  const diff = Math.round((Date.now() - time) / 1000)
  if (diff < 60) return t('detail.justNow')
  if (diff < 3600) return t('detail.minutesAgo', { count: Math.floor(diff / 60) })
  if (diff < 86_400) return t('detail.hoursAgo', { count: Math.floor(diff / 3600) })
  return formatDate(value)
}

function activityText(type: string, body: string) {
  if (type === 'card.created') return t('detail.activityCreated')
  if (type === 'card.commented') return body
  return body
}
