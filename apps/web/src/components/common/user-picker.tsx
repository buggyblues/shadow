import { Check, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

interface User {
  id: string
  username: string
  displayName: string
  avatarUrl: string | null
}

interface UserPickerProps {
  users: User[]
  selectedUserIds: string[]
  onChange: (userIds: string[]) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
}

export function UserPicker({
  users,
  selectedUserIds,
  onChange,
  placeholder,
  searchPlaceholder,
  emptyText,
}: UserPickerProps) {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const selectedUsers = users.filter((u) => selectedUserIds.includes(u.id))

  const filteredUsers = users.filter((u) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return u.username.toLowerCase().includes(q) || u.displayName.toLowerCase().includes(q)
  })

  const toggleUser = (userId: string) => {
    if (selectedUserIds.includes(userId)) {
      onChange(selectedUserIds.filter((id) => id !== userId))
    } else {
      onChange([...selectedUserIds, userId])
    }
  }

  const removeUser = (userId: string) => {
    onChange(selectedUserIds.filter((id) => id !== userId))
  }

  return (
    <div className="space-y-2">
      {/* Selected user chips */}
      {selectedUsers.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedUsers.map((user) => (
            <span
              key={user.id}
              className="inline-flex items-center gap-1 bg-primary/20 text-primary text-xs px-2 py-1 rounded-full"
            >
              {user.avatarUrl && (
                <img src={user.avatarUrl} alt="" className="w-3.5 h-3.5 rounded-full" />
              )}
              {user.displayName}
              <button
                type="button"
                onClick={() => removeUser(user.id)}
                className="ml-0.5 hover:text-red-400 transition"
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Dropdown trigger */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="w-full bg-bg-primary border border-border-dim rounded-lg px-3 py-2 text-sm text-text-muted hover:border-primary/50 transition text-left"
        >
          {placeholder || t('common.select')}
        </button>

        {/* Dropdown */}
        {isOpen && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-bg-tertiary border border-border-dim rounded-lg shadow-xl z-10 max-h-[200px] overflow-y-auto">
            {/* Search input */}
            <div className="sticky top-0 bg-bg-tertiary p-1.5 border-b border-border-subtle">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={searchPlaceholder || t('common.search')}
                className="w-full bg-bg-primary border border-border-dim rounded px-2 py-1 text-xs text-text-primary placeholder:text-text-muted focus:outline-none"
              />
            </div>

            {/* User list */}
            {filteredUsers.length === 0 ? (
              <div className="px-3 py-2 text-sm text-text-muted text-center">
                {emptyText || t('common.noResults')}
              </div>
            ) : (
              filteredUsers.map((user) => {
                const isSelected = selectedUserIds.includes(user.id)
                return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => toggleUser(user.id)}
                    className="flex items-center gap-2 w-full px-3 py-1.5 text-sm hover:bg-bg-primary/50 transition"
                  >
                    <div
                      className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                        isSelected ? 'bg-primary border-primary' : 'border-border-dim'
                      }`}
                    >
                      {isSelected && <Check size={10} className="text-white" />}
                    </div>
                    {user.avatarUrl && (
                      <img
                        src={user.avatarUrl}
                        alt=""
                        className="w-5 h-5 rounded-full flex-shrink-0"
                      />
                    )}
                    <span className="text-text-primary truncate">{user.displayName}</span>
                    <span className="text-text-muted text-xs ml-auto">@{user.username}</span>
                  </button>
                )
              })
            )}
          </div>
        )}
      </div>
    </div>
  )
}
