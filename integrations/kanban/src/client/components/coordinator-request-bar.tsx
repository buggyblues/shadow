import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FormEvent } from 'react'
import { useState } from 'react'
import {
  bridgeAvailable,
  listBuddyInboxes,
  openBridgeBuddyCreator,
  sendCoordinatorRequest,
} from '../api.js'
import { t } from '../i18n.js'
import { buddyLabel, buddyOption, requestTitle } from '../identity.js'
import { boardQueryKey, inboxQueryKey } from '../query-keys.js'
import { BuddySelect } from './identity.js'

export function CoordinatorRequestBar(props: { showToast: (message: string) => void }) {
  const queryClient = useQueryClient()
  const [request, setRequest] = useState('')
  const [selectedAgentId, setSelectedAgentId] = useState('')
  const [expanded, setExpanded] = useState(false)
  const inboxes = useQuery({
    queryKey: inboxQueryKey,
    queryFn: () => listBuddyInboxes(),
  })
  const send = useMutation({
    mutationFn: sendCoordinatorRequest,
    onSuccess: () => {
      setRequest('')
      setExpanded(false)
      void queryClient.invalidateQueries({ queryKey: boardQueryKey })
      props.showToast(t('toast.taskDispatched'))
    },
    onError: (error) => props.showToast(error.message),
  })
  const createBuddy = useMutation({
    mutationFn: openBridgeBuddyCreator,
    onSuccess: async (result) => {
      const previousIds = new Set(options.map((inbox) => inbox.agent.id))
      const createdAgentId = createdBuddyAgentId(result)
      const refreshed = await queryClient.fetchQuery({
        queryKey: inboxQueryKey,
        queryFn: () => listBuddyInboxes({ refresh: true }),
      })
      const fallbackAgentId = refreshed.inboxes.find((inbox) => !previousIds.has(inbox.agent.id))
        ?.agent.id
      const nextAgentId = createdAgentId ?? fallbackAgentId
      if (nextAgentId) setSelectedAgentId(nextAgentId)
    },
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
    <div className={expanded ? 'requestComposerWrap open' : 'requestComposerWrap'}>
      <div className="requestDock">
        <button
          className="requestOpen"
          title={t('request.createTask')}
          type="button"
          aria-label={t('request.createTask')}
          aria-expanded={expanded}
          onClick={() => setExpanded((open) => !open)}
        >
          +
        </button>
      </div>
      {expanded ? (
        <form className="requestBar" onSubmit={submit}>
          <label className="requestField">
            <span>{t('request.taskLabel')}</span>
            <textarea
              autoFocus
              maxLength={2000}
              onChange={(event) => setRequest(event.target.value)}
              placeholder={
                bridgeAvailable() ? t('request.placeholder') : t('request.placeholderNoBridge')
              }
              rows={4}
              value={request}
            />
          </label>
          <div className="requestField">
            <span>{t('request.buddyLabel')}</span>
            <BuddySelect
              disabled={inboxes.isLoading}
              loading={inboxes.isLoading}
              onChange={setSelectedAgentId}
              options={buddyOptions}
              placeholder={t('buddy.select')}
              value={selectedAgentId}
            />
            <div className="requestBuddyHint">
              <span>{t('request.noBuddyMatch')}</span>
              <button
                disabled={!bridgeAvailable() || createBuddy.isPending}
                type="button"
                onClick={() => createBuddy.mutate()}
              >
                {t('request.createBuddyInline')}
              </button>
            </div>
          </div>
          <div className="requestActions">
            <button
              className="requestSend"
              disabled={!selected || !request.trim() || send.isPending}
            >
              {t('request.createTask')}
            </button>
            <button
              className="secondary"
              type="button"
              onClick={() => {
                setRequest('')
                setExpanded(false)
              }}
            >
              {t('board.cancel')}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  )
}

function createdBuddyAgentId(result: unknown) {
  if (!result || typeof result !== 'object') return null
  const agent = (result as { agent?: unknown }).agent
  if (!agent || typeof agent !== 'object') return null
  const id = (agent as { id?: unknown }).id
  return typeof id === 'string' ? id : null
}
