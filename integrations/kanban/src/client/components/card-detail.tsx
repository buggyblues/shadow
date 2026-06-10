import * as Dialog from '@radix-ui/react-dialog'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import type { BoardCard, BoardCardArtifact, BoardState } from '../../types.js'
import type { KanbanOAuthSession } from '../api.js'
import {
  assignCard,
  commentCard,
  deleteCard,
  dispatchCardToBuddy,
  listBuddyInboxes,
  openWorkspaceArtifact,
  rerunCard,
  updateCard,
} from '../api.js'
import { t } from '../i18n.js'
import { buddyLabel, buddyOption, buildBuddyDirectory, resolvePersonIdentity } from '../identity.js'
import { MarkdownText } from '../markdown.js'
import { boardQueryKey, inboxQueryKey } from '../query-keys.js'
import { ConfirmActionButton } from './confirm-dialog.js'
import { BuddyAvatar, BuddySelect, PersonChip } from './identity.js'

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
  const [promptDraft, setPromptDraft] = useState('')
  const [dispatchAgentId, setDispatchAgentId] = useState('')
  const reloadBoard = () => {
    void queryClient.invalidateQueries({ queryKey: boardQueryKey })
    void queryClient.refetchQueries({ queryKey: boardQueryKey, type: 'active' })
  }
  const inboxes = useQuery({
    queryKey: inboxQueryKey,
    queryFn: () => listBuddyInboxes(),
    enabled: props.open,
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
      void reloadBoard()
    },
    onError: (error) => props.showToast(error.message),
  })
  const rerun = useMutation({
    mutationFn: rerunCard,
    onSuccess: () => {
      void reloadBoard()
      props.showToast(t('toast.cardReopened'))
    },
    onError: (error) => props.showToast(error.message),
  })
  const updatePrompt = useMutation({
    mutationFn: updateCard,
    onSuccess: () => {
      void reloadBoard()
      props.showToast(t('toast.promptUpdated'))
    },
    onError: (error) => props.showToast(error.message),
  })
  const markDone = useMutation({
    mutationFn: updateCard,
    onSuccess: () => {
      void reloadBoard()
      props.showToast(t('toast.cardMarkedDone'))
    },
    onError: (error) => props.showToast(error.message),
  })
  const removeCard = useMutation({
    mutationFn: deleteCard,
    onSuccess: () => {
      void reloadBoard()
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
      void reloadBoard()
      props.showToast(t('toast.taskSentToBuddy'))
    },
    onError: (error) => props.showToast(error.message),
  })
  const artifacts = issueArtifacts(props.board, props.card)
  const dispatchOptions = inboxes.data?.inboxes ?? []
  const buddyDirectory = useMemo(
    () => buildBuddyDirectory(dispatchOptions, [props.userProfile]),
    [dispatchOptions, props.userProfile],
  )
  const selectedDispatchInbox = dispatchOptions.find((inbox) => inbox.agent.id === dispatchAgentId)
  const dispatchBuddyOptions = dispatchOptions.map(buddyOption)
  const cardStatus = props.card?.status ?? props.card?.issueStep?.status ?? 'queued'
  const cardDone = cardStatus === 'done'

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
    <Dialog.Root
      open={props.open}
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="detailOverlay" />
        <Dialog.Content className="detail" aria-label={t('detail.ariaLabel')}>
          {props.card ? (
            <>
              <div className="detail-header">
                <div className="detailTitleBlock">
                  <Dialog.Title asChild>
                    <h2>{props.card.title}</h2>
                  </Dialog.Title>
                  <div className="detailHeaderMeta">
                    <span className={`detailStatus status-${cardStatus}`}>
                      {statusCopy(cardStatus)}
                    </span>
                    <span>
                      {t('detail.updated', {
                        date: new Date(props.card.updatedAt).toLocaleString(),
                      })}
                    </span>
                  </div>
                </div>
                <Dialog.Close asChild>
                  <button className="close" type="button" aria-label={t('detail.close')}>
                    &times;
                  </button>
                </Dialog.Close>
              </div>
              <div className="detail-body">
                <section className="detailActionPanel">
                  <div className="detailAssigneeBlock">
                    <div className="section-title">{t('detail.assignees')}</div>
                    <div className="people">
                      {props.card.assignees.length ? (
                        props.card.assignees.map((person) => (
                          <PersonChip directory={buddyDirectory} key={person.id} person={person} />
                        ))
                      ) : (
                        <span className="meta">{t('card.unassigned')}</span>
                      )}
                    </div>
                  </div>
                  <div className="detailActionGroup">
                    <button
                      className="secondary"
                      type="button"
                      onClick={() => assign.mutate({ cardId: props.card!.id })}
                    >
                      {t('detail.assignMe')}
                    </button>
                    {cardDone ? (
                      <button
                        className="primary"
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
                        {t('detail.reopen')}
                      </button>
                    ) : (
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
                        {t('detail.markDone')}
                      </button>
                    )}
                  </div>
                </section>
                <section className="section">
                  <div className="section-title">{t('detail.description')}</div>
                  {props.card.description ? (
                    <MarkdownText
                      className="description markdown"
                      content={props.card.description}
                    />
                  ) : (
                    <p className="description">{t('detail.noDescription')}</p>
                  )}
                </section>
                <section className="section">
                  <div className="section-title">{t('detail.dispatch')}</div>
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
                      {t('detail.dispatch')}
                    </button>
                  </div>
                </section>
                <section className="section">
                  <div className="section-title">{t('detail.taskContext')}</div>
                  <div className="issueGrid">
                    <span>{t('detail.type')}</span>
                    <strong>{props.card.issueStep?.taskType ?? 'card.task'}</strong>
                    <span>{t('detail.status')}</span>
                    <strong>
                      {statusCopy(props.card.status ?? props.card.issueStep?.status ?? 'queued')}
                    </strong>
                    <span>{t('detail.attempt')}</span>
                    <strong>{props.card.issueStep?.attempt ?? 1}</strong>
                  </div>
                  <label className="fieldBlock">
                    <span className="section-title">{t('detail.instructions')}</span>
                    <textarea
                      maxLength={4000}
                      onChange={(event) => setPromptDraft(event.target.value)}
                      rows={5}
                      value={promptDraft}
                    />
                  </label>
                  <div className="actions">
                    <button
                      className="secondary"
                      type="button"
                      disabled={updatePrompt.isPending}
                      onClick={() =>
                        updatePrompt.mutate({ cardId: props.card!.id, prompt: promptDraft })
                      }
                    >
                      {t('detail.savePrompt')}
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
                      {t('detail.rerunWithPrompt')}
                    </button>
                  </div>
                </section>
                <section className="section dangerZone">
                  <div>
                    <div className="section-title">{t('detail.dangerZone')}</div>
                    <p>{t('board.deleteCardBody')}</p>
                  </div>
                  <ConfirmActionButton
                    className="dangerButton"
                    description={t('board.deleteCardBody')}
                    disabled={removeCard.isPending}
                    title={t('board.deleteCardTitle')}
                    onConfirm={() => {
                      if (!props.card) return
                      removeCard.mutate({ cardId: props.card.id })
                    }}
                  >
                    {t('board.deleteCard')}
                  </ConfirmActionButton>
                </section>
                {artifacts.length ? (
                  <section className="section">
                    <div className="section-title">{t('detail.artifacts')}</div>
                    <div className="artifactList">
                      {artifacts.map((artifact) => (
                        <ArtifactRow artifact={artifact} key={artifact.id} />
                      ))}
                    </div>
                  </section>
                ) : null}
                <section className="section">
                  <div className="section-title">{t('detail.createdBy')}</div>
                  <div className="people">
                    <PersonChip directory={buddyDirectory} person={props.card.createdBy} />
                  </div>
                </section>
                <section className="section">
                  <div className="section-title">{t('detail.comments')}</div>
                  <div className="comments">
                    {props.card.comments.length ? (
                      props.card.comments.map((item) => (
                        <div className="comment-row" key={item.id}>
                          <BuddyAvatar
                            identity={resolvePersonIdentity(item.author, buddyDirectory)}
                          />
                          <div className="comment-box">
                            <div className="comment-head">
                              <strong>
                                {resolvePersonIdentity(item.author, buddyDirectory).label ||
                                  t('detail.unknown')}
                              </strong>
                              <span>{new Date(item.createdAt).toLocaleString()}</span>
                            </div>
                            <MarkdownText className="comment-body markdown" content={item.body} />
                          </div>
                        </div>
                      ))
                    ) : (
                      <span className="meta">{t('detail.noComments')}</span>
                    )}
                  </div>
                </section>
                <form className="section" onSubmit={handleSubmit}>
                  <div className="section-title">{t('detail.addComment')}</div>
                  <textarea
                    maxLength={4000}
                    onChange={(event) => setComment(event.target.value)}
                    rows={4}
                    value={comment}
                  />
                  {createComment.error ? (
                    <div className="errorText">{createComment.error.message}</div>
                  ) : null}
                  <button
                    className="primary"
                    disabled={!comment.trim() || createComment.isPending}
                    type="submit"
                  >
                    {t('detail.comment')}
                  </button>
                </form>
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

function statusCopy(status: string) {
  return t(`status.${status}` as Parameters<typeof t>[0])
}
