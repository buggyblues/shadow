import {
  Button,
  cn,
  Modal,
  ModalBody,
  ModalButtonGroup,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Terminal } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BuddyMarketContent } from '../components/buddy-market/buddy-market-content'
import { AgentDetail } from '../components/buddy-management/agent-detail'
import { CreateAgentDialog, EditAgentDialog } from '../components/buddy-management/agent-dialogs'
import type { Agent, TokenResponse } from '../components/buddy-management/types'
import { UserAvatar } from '../components/common/avatar'
import { fetchApi } from '../lib/api'
import { useUIStore } from '../stores/ui.store'
import { MyRentalsPage } from './my-rentals'

/* ── Embeddable Buddy Management Content (for Settings page) ── */

type MyBuddySettingsSection = 'buddies' | 'market' | 'rentals'

function getAgentOnlineDotClass(agent: Agent): string {
  if (agent.status === 'error') return 'bg-danger'
  if (agent.status === 'stopped') return 'bg-text-muted/50'
  if (agent.lastHeartbeat && Date.now() - new Date(agent.lastHeartbeat).getTime() < 90000) {
    return 'bg-success'
  }
  return 'bg-text-muted/50'
}

export function MyBuddySettingsContent({
  initialSection = 'buddies',
}: {
  initialSection?: MyBuddySettingsSection
}) {
  const { t } = useTranslation()
  const [section, setSection] = useState<MyBuddySettingsSection>(initialSection)

  useEffect(() => {
    setSection(initialSection)
  }, [initialSection])

  const sections: Array<{ id: MyBuddySettingsSection; label: string }> = [
    { id: 'buddies', label: t('agentMgmt.myBuddies', '我的 Buddy') },
    { id: 'market', label: t('marketplace.title', 'Buddy 市场') },
    { id: 'rentals', label: t('marketplace.rentalsAndListings', '租赁与挂单') },
  ]

  return (
    <div className="flex flex-1 min-w-0 min-h-0 flex-col gap-3">
      <div className="shrink-0 flex items-center gap-2 overflow-x-auto">
        {sections.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSection(item.id)}
            className={cn(
              'h-9 rounded-full px-4 text-sm font-bold transition-colors whitespace-nowrap',
              section === item.id
                ? 'bg-primary/15 text-primary'
                : 'text-text-muted hover:bg-bg-tertiary/60 hover:text-text-primary',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {section === 'buddies' ? (
        <div className="flex flex-1 min-h-0 gap-3">
          <BuddyManagementContent />
        </div>
      ) : section === 'market' ? (
        <BuddyMarketContent />
      ) : (
        <MyRentalsPage embedded />
      )}
    </div>
  )
}

export function BuddyManagementContent() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const [showCreate, setShowCreate] = useState<{
    name?: string
    username?: string
    description?: string
  } | null>(null)
  const [showEdit, setShowEdit] = useState(false)
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [generatedToken, setGeneratedToken] = useState<string | null>(null)
  const [tokenCopied, setTokenCopied] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; success: boolean } | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Listen for 'create-buddy' pending action from task center
  const pendingAction = useUIStore((s) => s.pendingAction)
  const setPendingAction = useUIStore((s) => s.setPendingAction)
  useEffect(() => {
    if (pendingAction === 'create-buddy') {
      setShowCreate({})
      setPendingAction(null)
    }
  }, [pendingAction, setPendingAction])

  const { data: agents = [], isLoading } = useQuery({
    queryKey: ['agents'],
    queryFn: () => fetchApi<Agent[]>('/api/agents'),
    refetchInterval: 30000,
  })

  const filteredAgents = agents.filter((agent) => {
    if (!searchQuery) return true
    const searchLower = searchQuery.toLowerCase()
    const name = (agent.botUser?.displayName ?? agent.botUser?.username ?? 'Node').toLowerCase()
    const id = agent.id.toLowerCase()
    return name.includes(searchLower) || id.includes(searchLower)
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetchApi(`/api/agents/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] })
      setDeleteConfirmId(null)
      if (selectedAgent?.id === deleteConfirmId) setSelectedAgent(null)
      showMsg(t('agentMgmt.deleteSuccess'), true)
    },
    onError: () => showMsg(t('agentMgmt.deleteFailed'), false),
  })

  const tokenMutation = useMutation({
    mutationFn: (id: string) =>
      fetchApi<TokenResponse>(`/api/agents/${id}/token`, { method: 'POST' }),
    onSuccess: (data) => {
      setGeneratedToken(data.token)
      setTokenCopied(false)
      queryClient.invalidateQueries({ queryKey: ['agents'] })
    },
  })

  const toggleMutation = useMutation({
    mutationFn: (agent: Agent) =>
      fetchApi<Agent>(`/api/agents/${agent.id}/${agent.status === 'running' ? 'stop' : 'start'}`, {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] })
      if (selectedAgent) {
        fetchApi<Agent>(`/api/agents/${selectedAgent.id}`).then((a) => setSelectedAgent(a))
      }
    },
  })

  const showMsg = (text: string, success: boolean) => {
    setMessage({ text, success })
    setTimeout(() => setMessage(null), 3000)
  }

  const copyToken = async (token: string) => {
    await navigator.clipboard.writeText(token)
    setTokenCopied(true)
    showMsg(t('agentMgmt.tokenCopied'), true)
  }

  // Main full-height split layout
  return (
    <>
      {/* Left Sidebar */}
      <div className="w-full md:w-72 lg:w-80 shrink-0 flex-col hidden md:flex">
        <div className="bg-[var(--glass-bg)] backdrop-blur-3xl border border-[var(--glass-line)] rounded-2xl flex-1 flex flex-col overflow-hidden shadow-sm">
          <div className="shrink-0 flex flex-col gap-3 p-4 border-b border-[var(--glass-line)]">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase tracking-[0.2em] text-text-muted/60">
                {t('agentMgmt.myBuddies', '我的 Buddy')}
              </span>
              <Button
                variant="primary"
                size="sm"
                className="rounded-full !px-3"
                onClick={() => setShowCreate({})}
              >
                <Plus size={14} className="md:mr-1" />
                <span className="hidden md:inline">{t('agentMgmt.newAgent', '添加')}</span>
              </Button>
            </div>
            {agents.length > 0 && (
              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
                />
                <input
                  type="text"
                  placeholder={t('agentMgmt.searchPlaceholder', '搜索节点或 ID...')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-bg-tertiary/50 border border-border-subtle rounded-xl pl-8 pr-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/40 transition-shadow"
                />
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {/* Message */}
            {message && (
              <div
                className={cn(
                  'mx-2 my-2 px-3 py-2 rounded-xl text-xs font-bold border',
                  message.success
                    ? 'bg-success/10 text-success border-success/20'
                    : 'bg-danger/10 text-danger border-danger/20',
                )}
              >
                {message.text}
              </div>
            )}

            {/* Agent list */}
            {isLoading ? (
              <div className="text-center text-text-muted font-bold italic py-8">
                {t('common.loading')}
              </div>
            ) : agents.length === 0 ? (
              <div className="text-center p-4">
                <p className="text-sm text-text-muted mb-4">
                  {t('agentMgmt.noAgents', '暂无节点')}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => setShowCreate({})}
                >
                  <Plus size={14} className="mr-1" />
                  {t('agentMgmt.createFirst', '配置节点')}
                </Button>
              </div>
            ) : filteredAgents.length === 0 ? (
              <div className="text-center p-4">
                <p className="text-sm text-text-muted">{t('common.noResults', '未找到结果')}</p>
              </div>
            ) : (
              filteredAgents.map((agent) => {
                const name = agent.botUser?.displayName ?? agent.botUser?.username ?? 'Node'
                const isSelected = selectedAgent?.id === agent.id
                return (
                  <button
                    type="button"
                    key={agent.id}
                    onClick={() => {
                      setSelectedAgent(isSelected ? null : agent)
                      setGeneratedToken(null)
                    }}
                    className={cn(
                      'flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-left transition-all duration-200 border',
                      isSelected
                        ? 'bg-primary/10 border-primary/30 shadow-sm'
                        : 'border-transparent hover:bg-bg-tertiary/60 hover:border-border-dim',
                    )}
                  >
                    <div className="relative">
                      <UserAvatar
                        userId={agent.botUser?.id ?? agent.userId}
                        avatarUrl={agent.botUser?.avatarUrl}
                        displayName={name}
                        size="sm"
                      />
                      <span
                        className={cn(
                          'absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-bg-secondary shadow-sm',
                          getAgentOnlineDotClass(agent),
                        )}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className={cn(
                          'text-[14px] font-bold truncate transition-colors',
                          isSelected ? 'text-primary' : 'text-text-primary',
                        )}
                      >
                        {name}
                      </p>
                      <p className="text-[11px] text-text-muted truncate font-mono">
                        ID: {agent.id.slice(0, 8)}
                      </p>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* Right column: Details or placeholder */}
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="bg-[var(--glass-bg)] backdrop-blur-3xl border border-[var(--glass-line)] rounded-2xl flex-1 overflow-y-auto shadow-sm p-4 md:p-6 lg:p-8 relative">
          {showCreate ? (
            <CreateAgentDialog
              onClose={() => setShowCreate(null)}
              onSuccess={(agent) => {
                queryClient.invalidateQueries({ queryKey: ['agents'] })
                setShowCreate(null)
                setSelectedAgent(agent)
                showMsg(t('agentMgmt.createSuccess'), true)
              }}
              onError={(message) => showMsg(message || t('agentMgmt.createFailed'), false)}
              t={t}
              initialData={showCreate}
            />
          ) : selectedAgent ? (
            <div className="max-w-2xl mx-auto animate-in fade-in slide-in-from-right-4 duration-300">
              <AgentDetail
                agent={selectedAgent}
                generatedToken={generatedToken}
                tokenCopied={tokenCopied}
                tokenMutation={tokenMutation}
                onCopyToken={copyToken}
                onDelete={() => setDeleteConfirmId(selectedAgent.id)}
                onEdit={() => setShowEdit(true)}
                onToggle={(agent) => toggleMutation.mutate(agent)}
                togglePending={toggleMutation.isPending}
                t={t}
              />
            </div>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-8 animate-in fade-in duration-300">
              <div className="text-center opacity-40">
                <Terminal size={48} className="mx-auto mb-4" strokeWidth={1} />
                <p className="text-sm font-black uppercase tracking-[0.2em] mb-2">
                  {t('agentMgmt.selectBuddy', '选择 Buddy')}
                </p>
                <p className="text-xs text-text-muted">
                  {t('agentMgmt.selectBuddyDesc', '从左侧选择一个 Buddy 管理配置。')}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showEdit && selectedAgent && (
        <EditAgentDialog
          agent={selectedAgent}
          onClose={() => setShowEdit(false)}
          onSuccess={(agent) => {
            queryClient.invalidateQueries({ queryKey: ['agents'] })
            setShowEdit(false)
            setSelectedAgent(agent)
            showMsg(t('agentMgmt.editSuccess'), true)
          }}
          onError={() => showMsg(t('agentMgmt.editFailed'), false)}
          t={t}
        />
      )}

      <Modal open={!!deleteConfirmId} onClose={() => setDeleteConfirmId(null)}>
        <ModalContent maxWidth="max-w-md">
          <ModalHeader title={t('common.confirm')} closeLabel={t('common.close', '关闭')} />
          <ModalBody className="py-5">
            <p className="text-sm font-bold italic text-text-muted">
              {t('agentMgmt.deleteConfirm')}
            </p>
          </ModalBody>
          <ModalFooter>
            <ModalButtonGroup>
              <Button variant="ghost" size="sm" onClick={() => setDeleteConfirmId(null)}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => deleteConfirmId && deleteMutation.mutate(deleteConfirmId)}
                disabled={deleteMutation.isPending}
              >
                {t('common.delete')}
              </Button>
            </ModalButtonGroup>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  )
}
