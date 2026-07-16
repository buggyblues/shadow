import {
  getPollMessageCards,
  type MessageCard,
  type MessagePollSummary,
  type PollOptionSummary,
  type PollVotersPage,
} from '@shadowob/shared'
import { Button, cn } from '@shadowob/ui'
import { type InfiniteData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Clock, Loader2, Users, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSocketEvent } from '../../../hooks/use-socket'
import { fetchApi } from '../../../lib/api'
import { showToast } from '../../../lib/toast'

function sameSelection(left: string[], right: string[]) {
  if (left.length !== right.length) return false
  const leftSorted = [...left].sort()
  const rightSorted = [...right].sort()
  return leftSorted.every((value, index) => value === rightSorted[index])
}

function toggleSelection(current: string[], optionId: string, allowMultiselect: boolean): string[] {
  if (!allowMultiselect) return current.includes(optionId) ? [] : [optionId]
  return current.includes(optionId)
    ? current.filter((id) => id !== optionId)
    : [...current, optionId]
}

function formatPollTime(value: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return value
  }
}

function votePercent(option: PollOptionSummary, totalVotes: number) {
  if (totalVotes <= 0) return 0
  return Math.round((option.voteCount / totalVotes) * 100)
}

type PollUpdatedPayload = {
  messageId: string
  channelId: string
}

export function PollCardsView({
  cards,
  currentUserId,
  messageId,
}: {
  cards: MessageCard[] | undefined
  currentUserId: string
  messageId: string
}) {
  const pollCards = useMemo(() => getPollMessageCards({ cards }), [cards])
  if (pollCards.length === 0) return null
  return (
    <div className="my-2 flex w-full max-w-full flex-col gap-2">
      {pollCards.map((card) => (
        <PollCardView
          key={card.id}
          cardTitle={card.title}
          currentUserId={currentUserId}
          messageId={messageId}
        />
      ))}
    </div>
  )
}

function PollCardView({
  cardTitle,
  currentUserId,
  messageId,
}: {
  cardTitle: string
  currentUserId: string
  messageId: string
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([])
  const [showResults, setShowResults] = useState(false)
  const [votersOption, setVotersOption] = useState<PollOptionSummary | null>(null)
  const queryKey = ['message-poll', messageId] as const

  const pollQuery = useQuery({
    queryKey,
    queryFn: () => fetchApi<MessagePollSummary>(`/api/messages/${messageId}/poll`),
    staleTime: 10_000,
  })
  const poll = pollQuery.data
  const isOpen = poll ? poll.status === 'active' && !poll.isExpired : false
  const canEnd = Boolean(poll && (poll.viewerCanEnd || poll.creatorId === currentUserId) && isOpen)
  const hasViewerVote = Boolean(poll?.viewerOptionIds.length)
  const hasPendingChange = poll
    ? !sameSelection(selectedOptionIds, poll.viewerOptionIds) && selectedOptionIds.length > 0
    : false

  useEffect(() => {
    if (!poll) return
    setSelectedOptionIds(poll.viewerOptionIds)
  }, [poll?.viewerOptionIds, poll])

  useSocketEvent<PollUpdatedPayload>('poll:updated', (payload) => {
    if (payload.messageId !== messageId) return
    queryClient.invalidateQueries({ queryKey })
  })

  const voteMutation = useMutation({
    mutationFn: (optionIds: string[]) =>
      fetchApi<MessagePollSummary>(`/api/messages/${messageId}/poll/votes`, {
        method: 'POST',
        body: JSON.stringify({ optionIds }),
      }),
    onSuccess: (nextPoll) => {
      queryClient.setQueryData(queryKey, nextPoll)
      setSelectedOptionIds(nextPoll.viewerOptionIds)
      setShowResults(true)
    },
    onError: (error: Error) => showToast(error.message || t('chat.pollVoteFailed'), 'error'),
  })

  const removeVoteMutation = useMutation({
    mutationFn: () =>
      fetchApi<MessagePollSummary>(`/api/messages/${messageId}/poll/votes`, {
        method: 'DELETE',
      }),
    onSuccess: (nextPoll) => {
      queryClient.setQueryData(queryKey, nextPoll)
      setSelectedOptionIds([])
      setShowResults(false)
    },
    onError: (error: Error) => showToast(error.message || t('chat.pollVoteFailed'), 'error'),
  })

  const endMutation = useMutation({
    mutationFn: () =>
      fetchApi<MessagePollSummary>(`/api/messages/${messageId}/poll/end`, { method: 'POST' }),
    onSuccess: (nextPoll) => {
      queryClient.setQueryData(queryKey, nextPoll)
      showToast(t('chat.pollEndedToast'), 'success')
    },
    onError: (error: Error) => showToast(error.message || t('chat.pollEndFailed'), 'error'),
  })

  if (pollQuery.isLoading) {
    return (
      <div className="rounded-xl border border-border-subtle bg-bg-primary p-3 text-sm font-semibold text-text-muted">
        {t('chat.pollLoading')}
      </div>
    )
  }

  if (!poll) {
    return (
      <div className="rounded-xl border border-border-subtle bg-bg-primary p-3 text-sm font-semibold text-text-muted">
        {t('chat.pollUnavailable')}
      </div>
    )
  }

  const title = poll.question || cardTitle
  const busy = voteMutation.isPending || removeVoteMutation.isPending || endMutation.isPending
  const pollStatus =
    poll.status === 'ended' || poll.isExpired
      ? t('chat.pollEnded')
      : t('chat.pollEndsAt', { time: formatPollTime(poll.expiresAt) })
  const revealResults = showResults || hasViewerVote || !isOpen
  const canSelect = isOpen && !hasViewerVote && !busy
  const selectionHint = poll.allowMultiselect
    ? t('chat.pollSelectMultipleHint')
    : t('chat.pollSelectOneHint')

  return (
    <article className="w-full overflow-hidden rounded-xl border border-border-subtle/70 bg-bg-primary/95 p-4 shadow-[0_10px_28px_rgba(0,0,0,0.10)]">
      <div>
        <h3 className="break-words text-[16px] font-black leading-[22px] text-text-primary">
          {title}
        </h3>
        <p className="mt-1 text-sm font-semibold text-text-muted">{selectionHint}</p>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {poll.options.map((option) => {
          const selected = selectedOptionIds.includes(option.id)
          const percent = votePercent(option, poll.totalVotes)
          return (
            <button
              key={option.id}
              type="button"
              disabled={!canSelect}
              className={cn(
                'group relative min-h-[58px] overflow-hidden rounded-xl border px-4 py-3 text-left transition',
                revealResults && selected
                  ? 'border-primary/60 bg-primary/14'
                  : selected
                    ? 'border-primary/70 bg-bg-secondary'
                    : 'border-transparent bg-bg-secondary/85 hover:border-border-subtle hover:bg-bg-tertiary/70',
                !canSelect && 'cursor-default',
              )}
              onClick={() =>
                setSelectedOptionIds((current) =>
                  toggleSelection(current, option.id, poll.allowMultiselect),
                )
              }
            >
              {revealResults && (
                <span
                  className={cn(
                    'absolute inset-y-0 left-0 transition-[width]',
                    selected ? 'bg-primary/18' : 'bg-text-muted/10',
                  )}
                  style={{ width: `${percent}%` }}
                  aria-hidden="true"
                />
              )}
              <span className="relative flex items-center gap-3">
                {option.emoji && (
                  <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-bg-primary/45 text-[19px]">
                    {option.emoji}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-[15px] font-bold leading-5 text-text-primary">
                    {option.text}
                  </span>
                  {revealResults && (
                    <span
                      role="button"
                      tabIndex={0}
                      className="mt-1 inline-flex rounded-md text-xs font-black text-text-muted hover:text-text-secondary"
                      onClick={(event) => {
                        event.stopPropagation()
                        setVotersOption(option)
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return
                        event.preventDefault()
                        event.stopPropagation()
                        setVotersOption(option)
                      }}
                    >
                      {percent}% · {t('chat.pollVotes', { count: option.voteCount })}
                    </span>
                  )}
                </span>
                <span
                  className={cn(
                    'grid size-7 shrink-0 place-items-center rounded-full border-2 transition',
                    selected
                      ? 'border-primary bg-primary text-bg-primary'
                      : 'border-text-muted/70 text-transparent group-hover:border-text-secondary',
                  )}
                  aria-hidden="true"
                >
                  {selected && <Check size={15} strokeWidth={3} />}
                </span>
              </span>
            </button>
          )
        })}
      </div>

      {isOpen ? (
        <div className="mt-4">
          {hasViewerVote ? (
            <Button
              variant="outline"
              size="sm"
              className="h-11 w-full rounded-xl text-xs"
              onClick={() => removeVoteMutation.mutate()}
              disabled={busy}
            >
              {t('chat.pollRemoveVote')}
            </Button>
          ) : (
            <Button
              size="sm"
              className="h-11 w-full rounded-xl text-xs"
              onClick={() => voteMutation.mutate(selectedOptionIds)}
              disabled={!hasPendingChange || busy}
            >
              {voteMutation.isPending && <Loader2 size={13} className="mr-1 animate-spin" />}
              {t('chat.pollVote')}
            </Button>
          )}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs font-semibold text-text-muted">
        <span className="inline-flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs font-semibold text-text-muted">
          {t('chat.pollTotalVotes', { count: poll.totalVotes })}
          <span aria-hidden="true">·</span>
          <span className="inline-flex min-w-0 items-center gap-1">
            <Clock size={12} />
            <span className="min-w-0 truncate">{pollStatus}</span>
          </span>
        </span>
        {isOpen && !revealResults && (
          <button
            type="button"
            className="ml-auto text-xs font-black text-primary/80 transition hover:text-primary disabled:cursor-default disabled:opacity-50"
            onClick={() => setShowResults(true)}
            disabled={busy}
          >
            {t('chat.pollShowResults')}
          </button>
        )}
        {canEnd && (
          <button
            type="button"
            className={cn(
              'text-xs font-black text-text-muted transition hover:text-text-secondary disabled:cursor-default disabled:opacity-50',
              revealResults && 'ml-auto',
            )}
            onClick={() => endMutation.mutate()}
            disabled={busy}
          >
            {t('chat.pollEnd')}
          </button>
        )}
      </div>

      {votersOption && (
        <PollVotersModal
          messageId={messageId}
          option={votersOption}
          onClose={() => setVotersOption(null)}
        />
      )}
    </article>
  )
}

function PollVotersModal({
  messageId,
  onClose,
  option,
}: {
  messageId: string
  onClose: () => void
  option: PollOptionSummary
}) {
  const { t } = useTranslation()
  const query = useQuery({
    queryKey: ['message-poll-voters', messageId, option.id],
    queryFn: () =>
      fetchApi<PollVotersPage>(`/api/messages/${messageId}/poll/options/${option.id}/voters`),
  })
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/35 px-4 pb-6 pt-20 sm:items-center">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-border-subtle bg-bg-primary shadow-2xl">
        <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-black text-text-primary">
              <Users size={16} className="text-primary" />
              {t('chat.pollVotersTitle')}
            </div>
            <div className="mt-0.5 truncate text-xs font-semibold text-text-muted">
              {option.text}
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onClose}>
            <X size={16} />
          </Button>
        </div>
        <div className="max-h-[320px] overflow-y-auto p-2">
          {query.isLoading ? (
            <div className="px-4 py-8 text-center text-sm font-semibold text-text-muted">
              {t('chat.pollLoadingVoters')}
            </div>
          ) : query.data?.voters.length ? (
            query.data.voters.map((voter) => (
              <div key={voter.id} className="flex items-center gap-3 rounded-xl px-3 py-2">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/12 text-xs font-black text-primary">
                  {(voter.displayName ?? voter.username).slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-text-primary">
                    {voter.displayName ?? voter.username}
                  </div>
                  <div className="truncate text-xs font-semibold text-text-muted">
                    @{voter.username}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="px-4 py-8 text-center text-sm font-semibold text-text-muted">
              {t('chat.pollNoVoters')}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
