import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../../components/button.js'
import { IconButton } from '../../../components/icon-button.js'
import { Chat, CheckCircle, MagicWand, Route, X } from '../../../components/icons.js'
import { Sheet } from '../../../components/sheet.js'
import { travelShadowSpaceApp } from '../../../services/shadow-host.js'
import { type DiscussionRef, listDiscussionRefs, startDiscussion } from '../api/community.js'
import { useTravelCommunity } from '../hooks/use-travel-community.js'

interface ContextCollaborationProps {
  compact?: boolean
  discussion?: boolean
  planner?: boolean
  plannerAppearance?: 'button' | 'icon'
  subjectId?: string
  subjectType: 'assignment' | 'day' | 'expense' | 'ledger' | 'place' | 'trip'
  title: string
  tripId: string
}

const promptTemplateKeys = ['balanced', 'rain', 'family', 'budget'] as const

export function ContextCollaboration({
  discussion = true,
  planner = false,
  plannerAppearance = 'icon',
  subjectId,
  subjectType,
  title,
  tripId,
}: ContextCollaborationProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const community = useTravelCommunity(tripId)
  const [plannerOpen, setPlannerOpen] = useState(false)
  const [selectedAgentId, setSelectedAgentId] = useState('')
  const [prompt, setPrompt] = useState('')
  const [error, setError] = useState(false)
  const discussionsKey = ['travel', 'discussions', tripId]
  const discussions = useQuery({
    queryKey: discussionsKey,
    queryFn: () => listDiscussionRefs(tripId),
    enabled: discussion && community.available,
  })
  const related = useMemo(
    () =>
      (discussions.data ?? []).filter(
        (item) => item.subjectType === subjectType && item.subjectId === subjectId,
      ),
    [discussions.data, subjectId, subjectType],
  )
  const start = useMutation({
    mutationFn: () =>
      startDiscussion(tripId, {
        body: t('contextCollaboration.discussionBody', { title }),
        subjectId,
        subjectType,
        title,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: discussionsKey }),
  })
  const effectiveAgentId =
    selectedAgentId || community.bindings[0]?.agentId || community.inboxes[0]?.agentId || ''
  const selectedBinding = community.bindings.find((item) => item.agentId === effectiveAgentId)
  const selectedInbox = community.inboxes.find((item) => item.agentId === effectiveAgentId)
  const proposedDrafts = community.drafts.filter((draft) => draft.status === 'proposed')
  const planningTasks = community.tasks.filter((task) => task.source === 'buddy').slice(0, 3)

  const openRef = async (ref: DiscussionRef) => {
    if (!ref.channelId) return
    setError(false)
    try {
      await travelShadowSpaceApp.openChannel({ channelId: ref.channelId, messageId: ref.messageId })
    } catch {
      setError(true)
    }
  }

  const handleDiscussion = async () => {
    setError(false)
    try {
      const ref = await start.mutateAsync()
      await openRef(ref)
    } catch {
      setError(true)
    }
  }

  const dispatch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!effectiveAgentId || !prompt.trim()) return
    setError(false)
    try {
      if (!selectedBinding && selectedInbox) await community.bind.mutateAsync(selectedInbox)
      await community.dispatch.mutateAsync({
        agentId: effectiveAgentId,
        prompt: prompt.trim(),
        title: t('contextCollaboration.planner.taskTitle', { title }),
      })
      setPrompt('')
    } catch {
      setError(true)
    }
  }

  if (!community.available) return null

  return (
    <span className="relative inline-flex items-center gap-1.5">
      {discussion ? (
        <span className="relative inline-flex">
          <IconButton
            active={Boolean(related.length)}
            className="disabled:cursor-wait disabled:opacity-55"
            disabled={start.isPending}
            label={
              start.isPending
                ? t('contextCollaboration.creatingDiscussion')
                : related.length
                  ? t('contextCollaboration.openDiscussion')
                  : t('contextCollaboration.startDiscussion')
            }
            onClick={() => void handleDiscussion()}
          >
            <Chat className={start.isPending ? 'animate-pulse' : undefined} size={17} />
          </IconButton>
          {related.length ? (
            <span className="pointer-events-none absolute -top-0.5 -right-0.5 grid size-4 place-items-center rounded-full bg-olive text-[8px] text-white ring-2 ring-white">
              {related.length}
            </span>
          ) : null}
        </span>
      ) : null}
      {planner ? (
        plannerAppearance === 'button' ? (
          <Button
            icon={<MagicWand size={14} />}
            onClick={() => setPlannerOpen(true)}
            size="sm"
            variant="outline"
          >
            {t('contextCollaboration.planWithAi')}
          </Button>
        ) : (
          <IconButton
            label={t('contextCollaboration.planWithAi')}
            onClick={() => setPlannerOpen(true)}
          >
            <MagicWand size={17} />
          </IconButton>
        )
      ) : null}
      {plannerOpen ? (
        <Sheet className="sm:w-[440px]" onClose={() => setPlannerOpen(false)}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] text-muted">
                {t('contextCollaboration.planner.eyebrow')}
              </div>
              <h2 className="mt-1 mb-0 font-serif text-[25px] leading-8">
                {t('contextCollaboration.planner.title')}
              </h2>
            </div>
            <IconButton label={t('actions.close')} onClick={() => setPlannerOpen(false)}>
              <X size={18} />
            </IconButton>
          </div>
          <form className="mt-5 grid gap-3" onSubmit={dispatch}>
            <label className="grid gap-1.5">
              <span className="font-bold text-[11px] text-muted">
                {t('contextCollaboration.planner.buddy')}
              </span>
              <select
                className="h-11 rounded-[14px] border border-line bg-white px-3 text-[13px] outline-none focus:border-olive"
                onChange={(event) => setSelectedAgentId(event.target.value)}
                value={effectiveAgentId}
              >
                {!community.inboxes.length ? (
                  <option value="">{t('contextCollaboration.planner.noBuddy')}</option>
                ) : null}
                {community.inboxes.map((inbox) => (
                  <option key={inbox.agentId} value={inbox.agentId}>
                    {inbox.displayName ?? inbox.username ?? inbox.agentId}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {promptTemplateKeys.map((key) => (
                <button
                  className="rounded-[14px] bg-paper/80 p-3 text-left transition hover:bg-sage"
                  key={key}
                  onClick={() =>
                    setPrompt(t(`contextCollaboration.planner.templates.${key}.prompt`))
                  }
                  type="button"
                >
                  <Route className="mb-2 text-olive" size={16} />
                  <strong className="block text-[11px]">
                    {t(`contextCollaboration.planner.templates.${key}.title`)}
                  </strong>
                </button>
              ))}
            </div>
            <textarea
              aria-label={t('contextCollaboration.planner.request')}
              className="min-h-28 resize-none rounded-[14px] border border-line bg-white px-3 py-2 text-[13px] outline-none focus:border-olive"
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={t('contextCollaboration.planner.placeholder')}
              value={prompt}
            />
            <Button
              disabled={!effectiveAgentId || !prompt.trim() || community.dispatch.isPending}
              icon={<MagicWand size={15} />}
              size="lg"
              type="submit"
              variant="action"
            >
              {community.dispatch.isPending
                ? t('contextCollaboration.planner.sending')
                : t('contextCollaboration.planner.send')}
            </Button>
          </form>
          {planningTasks.length ? (
            <section className="mt-5 grid gap-2" aria-live="polite">
              <strong className="text-[12px] text-muted">
                {t('contextCollaboration.planner.tasks')}
              </strong>
              {planningTasks.map((task) => {
                const retryAgentId =
                  typeof task.input.agentId === 'string' ? task.input.agentId : ''
                const retryPrompt = typeof task.input.prompt === 'string' ? task.input.prompt : ''
                return (
                  <article
                    className="flex items-center gap-3 rounded-[16px] bg-paper/80 p-3"
                    key={task.id}
                  >
                    <MagicWand className="shrink-0 text-olive" size={16} />
                    <span className="min-w-0 flex-1">
                      <strong className="block truncate text-[12px]">{task.title}</strong>
                      <span className="mt-0.5 block text-[11px] text-muted">
                        {t(`contextCollaboration.planner.taskStatus.${task.status}`)}
                      </span>
                    </span>
                    {task.status === 'failed' && retryAgentId && retryPrompt ? (
                      <Button
                        disabled={community.dispatch.isPending}
                        onClick={() =>
                          community.dispatch.mutate({
                            agentId: retryAgentId,
                            prompt: retryPrompt,
                            title: task.title,
                          })
                        }
                        size="sm"
                        variant="outline"
                      >
                        {t('contextCollaboration.planner.retry')}
                      </Button>
                    ) : null}
                  </article>
                )
              })}
            </section>
          ) : null}
          {proposedDrafts.length ? (
            <section className="mt-5 grid gap-2">
              <strong className="text-[12px] text-muted">
                {t('contextCollaboration.planner.review')}
              </strong>
              {proposedDrafts.map((draft) => (
                <article className="rounded-[16px] bg-paper/80 p-3" key={draft.id}>
                  <strong className="block text-[13px]">{draft.title}</strong>
                  <span className="mt-1 block text-[11px] text-muted">
                    {draft.summary ??
                      t('contextCollaboration.planner.operationCount', {
                        count: draft.operations.length,
                      })}
                  </span>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button
                      icon={<CheckCircle size={14} />}
                      onClick={() =>
                        community.review.mutate({ draftId: draft.id, status: 'accepted' })
                      }
                      size="sm"
                      variant="action"
                    >
                      {t('contextCollaboration.planner.accept')}
                    </Button>
                    <Button
                      onClick={() =>
                        community.review.mutate({ draftId: draft.id, status: 'rejected' })
                      }
                      size="sm"
                      variant="outline"
                    >
                      {t('contextCollaboration.planner.reject')}
                    </Button>
                  </div>
                </article>
              ))}
            </section>
          ) : null}
          {error ? (
            <p className="mt-3 rounded-[12px] bg-coral/10 p-3 text-[11px] text-coral" role="alert">
              {t('contextCollaboration.error')}
            </p>
          ) : null}
        </Sheet>
      ) : null}
      {error && !plannerOpen ? (
        <span className="sr-only" role="alert">
          {t('contextCollaboration.error')}
        </span>
      ) : null}
    </span>
  )
}
