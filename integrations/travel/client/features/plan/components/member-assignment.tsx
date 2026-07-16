import { useTranslation } from 'react-i18next'
import { UserAvatar } from '../../../components/avatar-group.js'
import { MultiSelectInput } from '../../../components/multi-select-input.js'
import type { TravelMember } from '../api/trip-management.js'

export function MemberAssignment({
  label,
  members,
  onChange,
  selectedIds,
}: {
  label: string
  members: TravelMember[]
  onChange: (memberIds: string[]) => void
  selectedIds: string[]
}) {
  const { t } = useTranslation()
  return (
    <MultiSelectInput
      emptyLabel={t('workspace.assignment.empty')}
      label={label}
      onChange={onChange}
      options={members.map((member) => ({
        id: member.id,
        label: member.displayName,
        leading: (
          <UserAvatar
            className="size-5 text-[8px]"
            person={{
              avatarUrl: member.avatarUrl,
              color: member.avatarColor,
              id: member.id,
              name: member.displayName,
            }}
          />
        ),
        meta: t(`management.roles.${member.role}`),
      }))}
      placeholder={t('workspace.assignment.search')}
      selectedIds={selectedIds}
    />
  )
}
