import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Lock, Plus, Search, Shield, Trash2, UserCheck, UserX, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { UserAvatar } from '../common/avatar'
import { fetchApi } from '../../lib/api'

// Types
interface BuddyPermission {
  id: string
  buddyId: string
  serverId: string
  channelId: string | null
  userId: string
  user: {
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
  } | null
  canView: boolean
  canInteract: boolean
  canMention: boolean
  canManage: boolean
  createdAt: string
  updatedAt: string
}

interface BuddyServerSettings {
  id?: string
  buddyId: string
  serverId: string
  visibility: 'public' | 'private' | 'restricted'
  isPrivate: boolean
  defaultCanView: boolean
  defaultCanInteract: boolean
  defaultCanMention: boolean
}

interface Server {
  id: string
  name: string
  iconUrl: string | null
}

interface PermissionsPanelProps {
  buddyId: string
  servers: Server[]
}

export function PermissionsPanel({ buddyId, servers }: PermissionsPanelProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [selectedServerId, setSelectedServerId] = useState<string>(servers[0]?.id ?? '')
  const [showGrantModal, setShowGrantModal] = useState(false)
  const [editingPermission, setEditingPermission] = useState<BuddyPermission | null>(null)

  // Fetch server settings
  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ['buddy-server-settings', buddyId, selectedServerId],
    queryFn: () =>
      fetchApi<{ settings: BuddyServerSettings }>(
        `/api/agents/${buddyId}/server-settings?serverId=${selectedServerId}`
      ),
    enabled: !!selectedServerId,
  })

  // Fetch permissions
  const { data: permissionsData, isLoading: permissionsLoading } = useQuery({
    queryKey: ['buddy-permissions', buddyId, selectedServerId],
    queryFn: () =>
      fetchApi<{ permissions: BuddyPermission[] }>(
        `/api/agents/${buddyId}/permissions?serverId=${selectedServerId}`
      ),
    enabled: !!selectedServerId,
  })

  // Update settings mutation
  const updateSettingsMutation = useMutation({
    mutationFn: (data: Partial<BuddyServerSettings>) =>
      fetchApi<BuddyServerSettings>(`/api/agents/${buddyId}/server-settings`, {
        method: 'PUT',
        body: JSON.stringify({
          serverId: selectedServerId,
          ...data,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['buddy-server-settings', buddyId, selectedServerId],
      })
    },
  })

  // Delete permission mutation
  const deletePermissionMutation = useMutation({
    mutationFn: (permissionId: string) =>
      fetchApi(`/api/agents/${buddyId}/permissions/${permissionId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['buddy-permissions', buddyId, selectedServerId],
      })
    },
  })

  const currentSettings = settings?.settings ?? {
    buddyId,
    serverId: selectedServerId,
    visibility: 'public',
    isPrivate: false,
    defaultCanView: true,
    defaultCanInteract: true,
    defaultCanMention: true,
  }

  const permissions = permissionsData?.permissions ?? []

  return (
    <div className="space-y-6">
      {/* Server Selector */}
      <div className="bg-bg-secondary rounded-xl p-4 border border-border-subtle">
        <label className="block text-xs font-bold uppercase text-text-secondary mb-2">
          {t('buddyPermissions.selectServer')}
        </label>
        <select
          value={selectedServerId}
          onChange={(e) => setSelectedServerId(e.target.value)}
          className="w-full bg-bg-tertiary text-text-primary rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-primary transition"
        >
          {servers.map((server) => (
            <option key={server.id} value={server.id}>
              {server.name}
            </option>
          ))}
        </select>
      </div>

      {/* Visibility Settings */}
      <div className="bg-bg-secondary rounded-xl p-4 border border-border-subtle">
        <div className="flex items-center gap-2 mb-4">
          <Shield size={18} className="text-primary" />
          <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">
            {t('buddyPermissions.visibilityTitle')}
          </h3>
        </div>

        <div className="space-y-4">
          {/* Visibility Toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`p-2 rounded-lg ${currentSettings.isPrivate ? 'bg-amber-500/20' : 'bg-green-500/20'}`}
              >
                {currentSettings.isPrivate ? (
                  <Lock size={18} className="text-amber-500" />
                ) : (
                  <UserCheck size={18} className="text-green-500" />
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-text-primary">
                  {currentSettings.isPrivate
                    ? t('buddyPermissions.privateMode')
                    : t('buddyPermissions.publicMode')}
                </p>
                <p className="text-xs text-text-muted">
                  {currentSettings.isPrivate
                    ? t('buddyPermissions.privateModeDesc')
                    : t('buddyPermissions.publicModeDesc')}
                </p>
              </div>
            </div>
            <button
              onClick={() =>
                updateSettingsMutation.mutate({
                  isPrivate: !currentSettings.isPrivate,
                  visibility: !currentSettings.isPrivate ? 'private' : 'public',
                })
              }
              disabled={updateSettingsMutation.isPending}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                currentSettings.isPrivate ? 'bg-amber-500' : 'bg-green-500'
              } ${updateSettingsMutation.isPending ? 'opacity-50' : ''}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                  currentSettings.isPrivate ? 'translate-x-5' : ''
                }`}
              />
            </button>
          </div>

          {/* Default Permissions (only shown when private) */}
          {currentSettings.isPrivate && (
            <div className="pt-4 border-t border-border-subtle space-y-3">
              <p className="text-xs font-medium text-text-secondary">
                {t('buddyPermissions.defaultPermissions')}
              </p>
              <div className="grid grid-cols-3 gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={currentSettings.defaultCanView}
                    onChange={(e) =>
                      updateSettingsMutation.mutate({
                        defaultCanView: e.target.checked,
                      })
                    }
                    className="rounded border-border-subtle text-primary focus:ring-primary"
                  />
                  <span className="text-sm text-text-secondary">
                    {t('buddyPermissions.canView')}
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={currentSettings.defaultCanInteract}
                    onChange={(e) =>
                      updateSettingsMutation.mutate({
                        defaultCanInteract: e.target.checked,
                      })
                    }
                    className="rounded border-border-subtle text-primary focus:ring-primary"
                  />
                  <span className="text-sm text-text-secondary">
                    {t('buddyPermissions.canInteract')}
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={currentSettings.defaultCanMention}
                    onChange={(e) =>
                      updateSettingsMutation.mutate({
                        defaultCanMention: e.target.checked,
                      })
                    }
                    className="rounded border-border-subtle text-primary focus:ring-primary"
                  />
                  <span className="text-sm text-text-secondary">
                    {t('buddyPermissions.canMention')}
                  </span>
                </label>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Permissions List (only shown when private) */}
      {currentSettings.isPrivate && (
        <div className="bg-bg-secondary rounded-xl p-4 border border-border-subtle">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <UserCheck size={18} className="text-primary" />
              <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">
                {t('buddyPermissions.allowedUsers')}
              </h3>
            </div>
            <button
              onClick={() => setShowGrantModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary-hover text-white rounded-lg text-xs font-bold transition"
            >
              <Plus size={14} />
              {t('buddyPermissions.grantAccess')}
            </button>
          </div>

          {permissionsLoading ? (
            <div className="text-center py-8 text-text-muted">
              {t('common.loading')}
            </div>
          ) : permissions.length === 0 ? (
            <div className="text-center py-8 text-text-muted">
              <UserX size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">{t('buddyPermissions.noPermissions')}</p>
              <p className="text-xs mt-1">{t('buddyPermissions.noPermissionsDesc')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {permissions.map((permission) => (
                <div
                  key={permission.id}
                  className="flex items-center gap-3 p-3 bg-bg-tertiary rounded-lg border border-border-subtle"
                >
                  <UserAvatar
                    userId={permission.user?.id ?? permission.userId}
                    avatarUrl={permission.user?.avatarUrl}
                    displayName={permission.user?.displayName ?? undefined}
                    size="sm"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">
                      {permission.user?.displayName ?? permission.user?.username ?? 'Unknown'}
                    </p>
                    {permission.user?.username && (
                      <p className="text-xs text-text-muted">@{permission.user.username}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {permission.canView && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-500">
                        {t('buddyPermissions.view')}
                      </span>
                    )}
                    {permission.canInteract && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-500">
                        {t('buddyPermissions.interact')}
                      </span>
                    )}
                    {permission.canMention && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-500">
                        {t('buddyPermissions.mention')}
                      </span>
                    )}
                    {permission.canManage && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-500">
                        {t('buddyPermissions.manage')}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setEditingPermission(permission)}
                      className="p-1.5 text-text-muted hover:text-primary hover:bg-primary/10 rounded transition"
                    >
                      <Shield size={14} />
                    </button>
                    <button
                      onClick={() => deletePermissionMutation.mutate(permission.id)}
                      disabled={deletePermissionMutation.isPending}
                      className="p-1.5 text-text-muted hover:text-danger hover:bg-danger/10 rounded transition disabled:opacity-50"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Grant Permission Modal */}
      {showGrantModal && (
        <GrantPermissionModal
          buddyId={buddyId}
          serverId={selectedServerId}
          onClose={() => setShowGrantModal(false)}
          onSuccess={() => {
            setShowGrantModal(false)
            queryClient.invalidateQueries({
              queryKey: ['buddy-permissions', buddyId, selectedServerId],
            })
          }}
        />
      )}

      {/* Edit Permission Modal */}
      {editingPermission && (
        <EditPermissionModal
          buddyId={buddyId}
          permission={editingPermission}
          onClose={() => setEditingPermission(null)}
          onSuccess={() => {
            setEditingPermission(null)
            queryClient.invalidateQueries({
              queryKey: ['buddy-permissions', buddyId, selectedServerId],
            })
          }}
        />
      )}
    </div>
  )
}

// Grant Permission Modal
interface GrantPermissionModalProps {
  buddyId: string
  serverId: string
  onClose: () => void
  onSuccess: () => void
}

function GrantPermissionModal({ buddyId, serverId, onClose, onSuccess }: GrantPermissionModalProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [permissions, setPermissions] = useState({
    canView: true,
    canInteract: true,
    canMention: true,
    canManage: false,
  })

  // Search users
  const { data: searchResults } = useQuery({
    queryKey: ['user-search', searchQuery],
    queryFn: () =>
      fetchApi<Array<{ id: string; username: string; displayName: string | null; avatarUrl: string | null }>>(
        `/api/users/search?q=${encodeURIComponent(searchQuery)}`
      ),
    enabled: searchQuery.length >= 2,
  })

  // Grant mutation
  const grantMutation = useMutation({
    mutationFn: () =>
      fetchApi(`/api/agents/${buddyId}/permissions`, {
        method: 'POST',
        body: JSON.stringify({
          serverId,
          userId: selectedUserId,
          ...permissions,
        }),
      }),
    onSuccess,
  })

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-bg-secondary rounded-xl p-6 w-full max-w-md mx-4 border border-border-subtle">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-text-primary">
            {t('buddyPermissions.grantPermission')}
          </h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <X size={20} />
          </button>
        </div>

        {/* User Search */}
        <div className="mb-4">
          <label className="block text-xs font-bold uppercase text-text-secondary mb-2">
            {t('buddyPermissions.selectUser')}
          </label>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('buddyPermissions.searchUsers')}
              className="w-full bg-bg-tertiary text-text-primary rounded-lg pl-10 pr-4 py-2 outline-none focus:ring-2 focus:ring-primary transition"
            />
          </div>

          {/* Search Results */}
          {searchResults && searchResults.length > 0 && (
            <div className="mt-2 max-h-40 overflow-y-auto bg-bg-tertiary rounded-lg border border-border-subtle">
              {searchResults.map((user) => (
                <button
                  key={user.id}
                  onClick={() => setSelectedUserId(user.id)}
                  className={`flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-bg-primary/50 transition ${
                    selectedUserId === user.id ? 'bg-primary/10' : ''
                  }`}
                >
                  <UserAvatar
                    userId={user.id}
                    avatarUrl={user.avatarUrl}
                    displayName={user.displayName ?? undefined}
                    size="xs"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text-primary truncate">
                      {user.displayName ?? user.username}
                    </p>
                    <p className="text-xs text-text-muted">@{user.username}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Permissions */}
        <div className="mb-6">
          <label className="block text-xs font-bold uppercase text-text-secondary mb-2">
            {t('buddyPermissions.permissions')}
          </label>
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={permissions.canView}
                onChange={(e) =>
                  setPermissions((p) => ({ ...p, canView: e.target.checked }))
                }
                className="rounded border-border-subtle text-primary focus:ring-primary"
              />
              <span className="text-sm text-text-secondary">
                {t('buddyPermissions.canView')} - {t('buddyPermissions.canViewDesc')}
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={permissions.canInteract}
                onChange={(e) =>
                  setPermissions((p) => ({ ...p, canInteract: e.target.checked }))
                }
                className="rounded border-border-subtle text-primary focus:ring-primary"
              />
              <span className="text-sm text-text-secondary">
                {t('buddyPermissions.canInteract')} - {t('buddyPermissions.canInteractDesc')}
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={permissions.canMention}
                onChange={(e) =>
                  setPermissions((p) => ({ ...p, canMention: e.target.checked }))
                }
                className="rounded border-border-subtle text-primary focus:ring-primary"
              />
              <span className="text-sm text-text-secondary">
                {t('buddyPermissions.canMention')} - {t('buddyPermissions.canMentionDesc')}
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={permissions.canManage}
                onChange={(e) =>
                  setPermissions((p) => ({ ...p, canManage: e.target.checked }))
                }
                className="rounded border-border-subtle text-primary focus:ring-primary"
              />
              <span className="text-sm text-text-secondary">
                {t('buddyPermissions.canManage')} - {t('buddyPermissions.canManageDesc')}
              </span>
            </label>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-text-secondary hover:text-text-primary transition rounded-lg"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={() => grantMutation.mutate()}
            disabled={!selectedUserId || grantMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white font-bold rounded-lg transition disabled:opacity-50"
          >
            {grantMutation.isPending ? t('common.saving') : t('buddyPermissions.grantAccess')}
          </button>
        </div>
      </div>
    </div>
  )
}

// Edit Permission Modal
interface EditPermissionModalProps {
  buddyId: string
  permission: BuddyPermission
  onClose: () => void
  onSuccess: () => void
}

function EditPermissionModal({ buddyId, permission, onClose, onSuccess }: EditPermissionModalProps) {
  const { t } = useTranslation()
  const [permissions, setPermissions] = useState({
    canView: permission.canView,
    canInteract: permission.canInteract,
    canMention: permission.canMention,
    canManage: permission.canManage,
  })

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: () =>
      fetchApi(`/api/agents/${buddyId}/permissions/${permission.id}`, {
        method: 'PATCH',
        body: JSON.stringify(permissions),
      }),
    onSuccess,
  })

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-bg-secondary rounded-xl p-6 w-full max-w-md mx-4 border border-border-subtle">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-text-primary">
            {t('buddyPermissions.editPermission')}
          </h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <X size={20} />
          </button>
        </div>

        {/* User Info */}
        <div className="flex items-center gap-3 p-3 bg-bg-tertiary rounded-lg mb-4">
          <UserAvatar
            userId={permission.user?.id ?? permission.userId}
            avatarUrl={permission.user?.avatarUrl}
            displayName={permission.user?.displayName ?? undefined}
            size="sm"
          />
          <div>
            <p className="text-sm font-medium text-text-primary">
              {permission.user?.displayName ?? permission.user?.username ?? 'Unknown'}
            </p>
            {permission.user?.username && (
              <p className="text-xs text-text-muted">@{permission.user.username}</p>
            )}
          </div>
        </div>

        {/* Permissions */}
        <div className="mb-6">
          <label className="block text-xs font-bold uppercase text-text-secondary mb-2">
            {t('buddyPermissions.permissions')}
          </label>
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={permissions.canView}
                onChange={(e) =>
                  setPermissions((p) => ({ ...p, canView: e.target.checked }))
                }
                className="rounded border-border-subtle text-primary focus:ring-primary"
              />
              <span className="text-sm text-text-secondary">{t('buddyPermissions.canView')}</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={permissions.canInteract}
                onChange={(e) =>
                  setPermissions((p) => ({ ...p, canInteract: e.target.checked }))
                }
                className="rounded border-border-subtle text-primary focus:ring-primary"
              />
              <span className="text-sm text-text-secondary">
                {t('buddyPermissions.canInteract')}
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={permissions.canMention}
                onChange={(e) =>
                  setPermissions((p) => ({ ...p, canMention: e.target.checked }))
                }
                className="rounded border-border-subtle text-primary focus:ring-primary"
              />
              <span className="text-sm text-text-secondary">
                {t('buddyPermissions.canMention')}
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={permissions.canManage}
                onChange={(e) =>
                  setPermissions((p) => ({ ...p, canManage: e.target.checked }))
                }
                className="rounded border-border-subtle text-primary focus:ring-primary"
              />
              <span className="text-sm text-text-secondary">
                {t('buddyPermissions.canManage')}
              </span>
            </label>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-text-secondary hover:text-text-primary transition rounded-lg"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={() => updateMutation.mutate()}
            disabled={updateMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white font-bold rounded-lg transition disabled:opacity-50"
          >
            {updateMutation.isPending ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
