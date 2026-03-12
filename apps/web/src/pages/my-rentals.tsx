import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  ChevronLeft,
  Clock,
  Edit,
  Eye,
  PackageMinus,
  Pause,
  Play,
  Plus,
  Trash2,
  Users,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../lib/api'
import { showToast } from '../lib/toast'
import { useMarketplaceStore } from '../stores/marketplace.store'

interface Contract {
  id: string
  contractNo: string
  listingId: string
  ownerId: string
  tenantId: string
  status: 'pending' | 'active' | 'completed' | 'cancelled' | 'violated' | 'disputed'
  startsAt: string | null
  expiresAt: string | null
  terminatedAt: string | null
  hourlyRate: number
  depositAmount: number
  totalCost: number
  listing?: { title: string; deviceTier: string; osType: string } | null
  createdAt: string
}

interface MyListing {
  id: string
  title: string
  listingStatus: 'draft' | 'active' | 'paused' | 'expired' | 'closed'
  isListed: boolean
  deviceTier: string
  osType: string
  hourlyRate: number
  viewCount: number
  rentalCount: number
  createdAt: string
}

const STATUS_STYLES: Record<string, { labelKey: string; bg: string; text: string }> = {
  pending: { labelKey: 'marketplace.statusPending', bg: 'bg-yellow-50', text: 'text-yellow-700' },
  active: { labelKey: 'marketplace.statusActive', bg: 'bg-green-50', text: 'text-green-700' },
  completed: { labelKey: 'marketplace.statusCompleted', bg: 'bg-gray-50', text: 'text-gray-600' },
  cancelled: { labelKey: 'marketplace.statusCancelled', bg: 'bg-gray-50', text: 'text-gray-500' },
  violated: { labelKey: 'marketplace.statusViolated', bg: 'bg-red-50', text: 'text-red-700' },
  disputed: { labelKey: 'marketplace.statusDisputed', bg: 'bg-orange-50', text: 'text-orange-700' },
}

const LISTING_STATUS: Record<string, { labelKey: string; bg: string; text: string }> = {
  draft: { labelKey: 'marketplace.listingDraft', bg: 'bg-gray-50', text: 'text-gray-500' },
  active: { labelKey: 'marketplace.listingActive', bg: 'bg-green-50', text: 'text-green-700' },
  paused: { labelKey: 'marketplace.listingPaused', bg: 'bg-yellow-50', text: 'text-yellow-700' },
  expired: { labelKey: 'marketplace.listingExpired', bg: 'bg-gray-50', text: 'text-gray-500' },
  closed: { labelKey: 'marketplace.listingClosed', bg: 'bg-red-50', text: 'text-red-600' },
}

const DEVICE_TIERS: Record<string, { icon: string; labelKey: string }> = {
  high_end: { icon: '🔥', labelKey: 'marketplace.deviceHighEnd' },
  mid_range: { icon: '⚡', labelKey: 'marketplace.deviceMidRange' },
  low_end: { icon: '💡', labelKey: 'marketplace.deviceLowEnd' },
}

export function MyRentalsPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { rentalsTab, setRentalsTab } = useMarketplaceStore()
  const [subTab, setSubTab] = useState<'contracts' | 'listings'>('contracts')

  // Fetch contracts as tenant
  const { data: rentingContracts, isLoading: isLoadingRenting } = useQuery({
    queryKey: ['marketplace', 'contracts', 'tenant'],
    queryFn: () => fetchApi<{ contracts: Contract[] }>('/api/marketplace/contracts?role=tenant'),
  })

  // Fetch contracts as owner
  const { data: rentingOutContracts, isLoading: isLoadingOut } = useQuery({
    queryKey: ['marketplace', 'contracts', 'owner'],
    queryFn: () => fetchApi<{ contracts: Contract[] }>('/api/marketplace/contracts?role=owner'),
  })

  // Fetch my listings
  const { data: myListings, isLoading: isLoadingListings } = useQuery({
    queryKey: ['marketplace', 'my-listings'],
    queryFn: () => fetchApi<{ listings: MyListing[] }>('/api/marketplace/my-listings'),
  })

  // Toggle listing status
  const toggleMutation = useMutation({
    mutationFn: ({ id, listingStatus }: { id: string; listingStatus: string }) =>
      fetchApi(`/api/marketplace/listings/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingStatus }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketplace'] })
      showToast(t('marketplace.statusUpdated', '状态已更新'), 'success')
    },
    onError: (err: Error) => showToast(err.message, 'error'),
  })

  // Delete listing
  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetchApi(`/api/marketplace/listings/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketplace'] })
      showToast(t('marketplace.listingDeleted', '挂单已删除'), 'success')
    },
    onError: (err: Error) => showToast(err.message, 'error'),
  })

  // Delist listing (toggle isListed to false)
  const delistMutation = useMutation({
    mutationFn: (id: string) =>
      fetchApi(`/api/marketplace/listings/${id}/toggle`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isListed: false }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketplace'] })
      showToast(t('marketplace.delistSuccess', 'Claw 已下架'), 'success')
    },
    onError: (err: Error) => showToast(err.message, 'error'),
  })

  const contracts =
    rentalsTab === 'renting' ? rentingContracts?.contracts : rentingOutContracts?.contracts
  const isLoadingContracts = rentalsTab === 'renting' ? isLoadingRenting : isLoadingOut

  return (
    <div
      className="min-h-screen bg-[#f2f7fc] text-gray-800"
      style={{ fontFamily: "'Nunito', 'ZCOOL KuaiLe', sans-serif" }}
    >
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link
              to="/buddies"
              className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-800 transition-colors font-bold mb-2"
            >
              <ChevronLeft className="w-5 h-5" />
              {t('marketplace.backToMarket', '返回集市')}
            </Link>
            <h1 style={{ fontFamily: "'ZCOOL KuaiLe', cursive" }} className="text-3xl font-bold">
              {t('marketplace.myRentals', '我的租赁')}
            </h1>
          </div>
          <Link
            to="/app/marketplace/create"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 text-gray-900 font-bold hover:from-amber-500 hover:to-amber-600 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
            style={{ fontFamily: "'ZCOOL KuaiLe', cursive" }}
          >
            <Plus className="w-4 h-4" />
            {t('marketplace.createListing', '创建挂单')}
          </Link>
        </div>

        {/* Main Tabs: renting / renting-out */}
        <div className="flex gap-2 mb-6">
          <button
            type="button"
            onClick={() => setRentalsTab('renting')}
            className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${
              rentalsTab === 'renting'
                ? 'bg-white shadow-lg text-cyan-700 border-2 border-cyan-200'
                : 'bg-white/50 text-gray-500 border-2 border-transparent hover:bg-white/70'
            }`}
          >
            {t('marketplace.renting', '我的租入')}
          </button>
          <button
            type="button"
            onClick={() => setRentalsTab('renting-out')}
            className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${
              rentalsTab === 'renting-out'
                ? 'bg-white shadow-lg text-amber-700 border-2 border-amber-200'
                : 'bg-white/50 text-gray-500 border-2 border-transparent hover:bg-white/70'
            }`}
          >
            {t('marketplace.rentingOut', '我的出租')}
          </button>
        </div>

        {/* Sub-tab for renting-out: contracts / listings */}
        {rentalsTab === 'renting-out' && (
          <div className="flex gap-2 mb-6">
            <button
              type="button"
              onClick={() => setSubTab('contracts')}
              className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${
                subTab === 'contracts'
                  ? 'bg-amber-100 text-amber-800'
                  : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              {t('marketplace.outContracts', '租赁合同')}
            </button>
            <button
              type="button"
              onClick={() => setSubTab('listings')}
              className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${
                subTab === 'listings'
                  ? 'bg-amber-100 text-amber-800'
                  : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              {t('marketplace.myListings', '我的挂单')}
            </button>
          </div>
        )}

        {/* Contract List */}
        {(rentalsTab === 'renting' || subTab === 'contracts') && (
          <div className="space-y-4">
            {isLoadingContracts ? (
              [0, 1, 2].map((n) => (
                <div
                  key={`skel-${n}`}
                  className="bg-white/60 rounded-2xl border-2 border-white/90 p-6 animate-pulse h-28"
                />
              ))
            ) : !contracts?.length ? (
              <div className="text-center py-16">
                <div className="text-5xl mb-4">📋</div>
                <p className="text-gray-400 font-bold">
                  {t('marketplace.noContracts', '暂无租赁合同')}
                </p>
              </div>
            ) : (
              contracts.map((c) => {
                const st = STATUS_STYLES[c.status] ?? STATUS_STYLES.pending!
                return (
                  <Link
                    key={c.id}
                    to={`/app/marketplace/contracts/${c.id}`}
                    className="block bg-white/80 backdrop-blur rounded-2xl border-2 border-white/90 shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all p-6"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-3 mb-2">
                          <span
                            className={`px-2.5 py-1 rounded-full text-xs font-bold ${st.bg} ${st.text}`}
                          >
                            {t(st.labelKey)}
                          </span>
                          <span className="text-xs text-gray-400 font-mono">#{c.contractNo}</span>
                        </div>
                        <h3 className="font-bold text-lg">
                          {c.listing?.title || t('marketplace.unknownListing', '未知挂单')}
                        </h3>
                        <div className="flex items-center gap-4 text-sm text-gray-500 font-medium mt-1">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            {c.startsAt && c.expiresAt
                              ? `${Math.round((new Date(c.expiresAt).getTime() - new Date(c.startsAt).getTime()) / 3600000)}h`
                              : t('marketplace.unlimited', '不限时')}
                          </span>
                          <span>{c.hourlyRate} 🦐/h</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-amber-600">{c.totalCost} 🦐</div>
                        <div className="text-xs text-gray-400 font-medium">
                          {new Date(c.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  </Link>
                )
              })
            )}
          </div>
        )}

        {/* My Listings (owner, sub-tab) */}
        {rentalsTab === 'renting-out' && subTab === 'listings' && (
          <div className="space-y-4">
            {isLoadingListings ? (
              [0, 1, 2].map((n) => (
                <div
                  key={`lskel-${n}`}
                  className="bg-white/60 rounded-2xl border-2 border-white/90 p-6 animate-pulse h-24"
                />
              ))
            ) : !myListings?.listings?.length ? (
              <div className="text-center py-16">
                <div className="text-5xl mb-4">📦</div>
                <p className="text-gray-400 font-bold">
                  {t('marketplace.noListings', '还没有挂单，快去创建一个吧')}
                </p>
              </div>
            ) : (
              myListings.listings.map((l) => {
                const ls = LISTING_STATUS[l.listingStatus] ?? LISTING_STATUS.draft!
                return (
                  <div
                    key={l.id}
                    className="bg-white/80 backdrop-blur rounded-2xl border-2 border-white/90 shadow-md p-6"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1">
                          <span
                            className={`px-2.5 py-1 rounded-full text-xs font-bold ${ls.bg} ${ls.text}`}
                          >
                            {t(ls.labelKey)}
                          </span>
                          <span className="text-xs text-gray-400">
                            {(() => {
                              const d = DEVICE_TIERS[l.deviceTier]
                              return d ? `${d.icon} ${t(d.labelKey)}` : ''
                            })()} · {l.osType}
                          </span>
                        </div>
                        <h3 className="font-bold text-lg">{l.title}</h3>
                        <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                          <span>{l.hourlyRate} 🦐/h</span>
                          <span className="flex items-center gap-1">
                            <Eye className="w-3.5 h-3.5" /> {l.viewCount}
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="w-3.5 h-3.5" /> {l.rentalCount}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Delist button for active listed items */}
                        {l.listingStatus === 'active' && l.isListed && (
                          <button
                            type="button"
                            onClick={() => {
                              if (
                                window.confirm(
                                  t('marketplace.confirmDelist', '确定要下架此 Claw 吗？'),
                                )
                              ) {
                                delistMutation.mutate(l.id)
                              }
                            }}
                            className="p-2 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                            title={t('marketplace.delistClaw', '下架 Claw')}
                          >
                            <PackageMinus className="w-4 h-4" />
                          </button>
                        )}
                        {l.listingStatus === 'active' && (
                          <button
                            type="button"
                            onClick={() =>
                              toggleMutation.mutate({ id: l.id, listingStatus: 'paused' })
                            }
                            className="p-2 rounded-lg text-yellow-600 hover:bg-yellow-50 transition-colors"
                            title={t('marketplace.pause', '暂停')}
                          >
                            <Pause className="w-4 h-4" />
                          </button>
                        )}
                        {l.listingStatus === 'paused' && (
                          <button
                            type="button"
                            onClick={() =>
                              toggleMutation.mutate({ id: l.id, listingStatus: 'active' })
                            }
                            className="p-2 rounded-lg text-green-600 hover:bg-green-50 transition-colors"
                            title={t('marketplace.resume', '恢复')}
                          >
                            <Play className="w-4 h-4" />
                          </button>
                        )}
                        <Link
                          to={`/app/marketplace/edit/${l.id}`}
                          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
                          title={t('marketplace.edit', '编辑')}
                        >
                          <Edit className="w-4 h-4" />
                        </Link>
                        {(l.listingStatus === 'draft' ||
                          l.listingStatus === 'paused' ||
                          l.listingStatus === 'closed') && (
                          <button
                            type="button"
                            onClick={() => {
                              if (
                                window.confirm(t('marketplace.confirmDelete', '确定删除此挂单？'))
                              ) {
                                deleteMutation.mutate(l.id)
                              }
                            }}
                            className="p-2 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                            title={t('marketplace.delete', '删除')}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>
    </div>
  )
}
