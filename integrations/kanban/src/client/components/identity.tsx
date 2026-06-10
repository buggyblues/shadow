import { useState } from 'react'
import type { BoardPerson } from '../../types.js'
import { t } from '../i18n.js'
import {
  avatarColor,
  type BuddyDirectory,
  type BuddyIdentity,
  type BuddySelectOption,
  labelInitials,
  normalizeBuddyStatus,
  resolvePersonIdentity,
} from '../identity.js'
import { ReactSelect } from '../react-select.js'

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
      emptyLabel={t('buddy.empty')}
      loading={props.loading}
      loadingLabel={t('buddy.loading')}
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
      <BuddyAvatar identity={props.option} />
      <span className="reactSelectLabel">{props.option.label}</span>
    </>
  )
}

function BuddySelectOptionContent(props: { option: BuddySelectOption }) {
  return (
    <>
      <BuddyAvatar identity={props.option} />
      <span className="reactSelectOptionText">
        <span className="reactSelectOptionLabel">{props.option.label}</span>
        <span className="reactSelectOptionMeta">{normalizeBuddyStatus(props.option.status)}</span>
      </span>
    </>
  )
}

export function BuddyAvatar(props: { identity: BuddyIdentity; size?: 'sm' | 'md' }) {
  const initial = labelInitials(props.identity.label)
  const status = props.identity.status ? normalizeBuddyStatus(props.identity.status) : null
  return (
    <span className={`identityAvatarWrap ${props.size === 'md' ? 'medium' : ''}`}>
      <span
        className="identityAvatar"
        style={{
          background: avatarColor(
            props.identity.userId ?? props.identity.agentId ?? props.identity.id,
          ),
        }}
      >
        {props.identity.avatarUrl ? (
          <AvatarImage
            alt={props.identity.label}
            fallback={initial}
            src={props.identity.avatarUrl}
          />
        ) : (
          <span>{initial}</span>
        )}
      </span>
      {status ? <span className={`identityPresence status-${status}`} /> : null}
    </span>
  )
}

export function BuddyIdentityChip(props: { identity: BuddyIdentity; compact?: boolean }) {
  return (
    <span className={props.compact ? 'identityChip compact' : 'identityChip'}>
      <BuddyAvatar identity={props.identity} size={props.compact ? 'sm' : 'md'} />
      <span className="identityName">{props.identity.label}</span>
    </span>
  )
}

function AvatarImage(props: { alt: string; fallback: string; src: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) return <span>{props.fallback}</span>
  return <img alt={props.alt} src={props.src} onError={() => setFailed(true)} />
}

export function AssigneeSummary(props: { assignees: BoardPerson[]; directory: BuddyDirectory }) {
  const [first, ...rest] = props.assignees
  if (!first) return <span className="assigneeEmpty">{t('card.unassigned')}</span>
  const identity = resolvePersonIdentity(first, props.directory)
  return (
    <span className="assigneeSummary">
      <BuddyAvatar identity={identity} />
      <span className="assigneeName">{identity.label}</span>
      {rest.length > 0 ? <span className="assigneeMore">+{rest.length}</span> : null}
    </span>
  )
}

export function PersonChip(props: { person: BoardPerson; directory: BuddyDirectory }) {
  return <BuddyIdentityChip identity={resolvePersonIdentity(props.person, props.directory)} />
}
