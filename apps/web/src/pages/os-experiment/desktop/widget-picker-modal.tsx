import type { ShadowWidgetCategory } from '@shadowob/shared'
import {
  cn,
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader,
  PillSegmentedControl,
  Search as SearchField,
} from '@shadowob/ui'
import {
  AppWindow,
  CircleDollarSign,
  Code2,
  Globe,
  Heart,
  ImageIcon,
  Info,
  LayoutGrid,
  type LucideIcon,
  MessageSquare,
  Shapes,
  StickyNote,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AppIcon } from '../components'

export interface OsWidgetPickerItem {
  id: string
  title: string
  description?: string
  category: ShadowWidgetCategory
  icon: LucideIcon
  provider: {
    id: string
    name: string
    iconUrl?: string | null
  }
  onSelect: () => void
}

type WidgetPickerMode = 'function' | 'app'

interface WidgetPickerGroup {
  id: string
  title: string
  icon?: LucideIcon
  provider?: OsWidgetPickerItem['provider']
  items: OsWidgetPickerItem[]
}

const categoryGroups: Array<{
  id: ShadowWidgetCategory
  icon: LucideIcon
  labelKey: string
}> = [
  { id: 'productivity', icon: StickyNote, labelKey: 'os.widgetCategoryProductivity' },
  { id: 'communication', icon: MessageSquare, labelKey: 'os.widgetCategoryCommunication' },
  { id: 'media', icon: ImageIcon, labelKey: 'os.widgetCategoryMedia' },
  { id: 'finance', icon: CircleDollarSign, labelKey: 'os.widgetCategoryFinance' },
  { id: 'information', icon: Info, labelKey: 'os.widgetCategoryInformation' },
  { id: 'lifestyle', icon: Heart, labelKey: 'os.widgetCategoryLifestyle' },
  { id: 'developer', icon: Code2, labelKey: 'os.widgetCategoryDeveloper' },
  { id: 'web', icon: Globe, labelKey: 'os.widgetCategoryWeb' },
  { id: 'other', icon: Shapes, labelKey: 'os.widgetCategoryOther' },
]

function ProviderIcon({
  provider,
  className,
}: {
  provider: OsWidgetPickerItem['provider']
  className?: string
}) {
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center overflow-hidden rounded-xl border border-white/10 bg-white/[0.06] text-text-muted',
        className,
      )}
    >
      <AppIcon iconUrl={provider.iconUrl} />
    </span>
  )
}

export function OsWidgetPickerModal({
  items,
  open,
  onClose,
}: {
  items: OsWidgetPickerItem[]
  open: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<WidgetPickerMode>('function')
  const [query, setQuery] = useState('')
  const groups = useMemo<WidgetPickerGroup[]>(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    const visibleItems = normalizedQuery
      ? items.filter((item) =>
          [item.title, item.description, item.provider.name].some((value) =>
            value?.toLocaleLowerCase().includes(normalizedQuery),
          ),
        )
      : items

    if (mode === 'function') {
      return categoryGroups.flatMap((category) => {
        const categoryItems = visibleItems.filter((item) => item.category === category.id)
        return categoryItems.length > 0
          ? [
              {
                id: category.id,
                title: t(category.labelKey),
                icon: category.icon,
                items: categoryItems,
              },
            ]
          : []
      })
    }

    const providers = new Map<string, WidgetPickerGroup>()
    for (const item of visibleItems) {
      const existing = providers.get(item.provider.id)
      if (existing) {
        existing.items.push(item)
        continue
      }
      providers.set(item.provider.id, {
        id: item.provider.id,
        title: item.provider.name,
        provider: item.provider,
        items: [item],
      })
    }
    return [...providers.values()].sort((left, right) => {
      if (left.id === 'system') return -1
      if (right.id === 'system') return 1
      return left.title.localeCompare(right.title)
    })
  }, [items, mode, query, t])

  return (
    <Modal open={open} onClose={onClose}>
      <ModalContent
        maxWidth="max-w-[920px]"
        className="z-[900] h-[min(84vh,760px)] overflow-hidden"
      >
        <ModalHeader
          className="items-center [&>div:first-child]:items-center [&>div:first-child>div:first-child]:mt-0"
          icon={<LayoutGrid size={18} />}
          title={t('os.addWidget')}
          closeLabel={t('common.close')}
        />
        <div className="flex shrink-0 flex-col gap-3 border-b border-border-subtle/80 bg-bg-secondary/10 px-5 py-4 sm:flex-row sm:items-center sm:px-6">
          <div className="min-w-0 flex-1 sm:max-w-sm">
            <SearchField
              value={query}
              onChange={setQuery}
              placeholder={t('common.search')}
              aria-label={t('common.search')}
              variant="small"
            />
          </div>
          <div className="sm:ml-auto">
            <PillSegmentedControl
              className="max-w-full"
              size="sm"
              value={mode}
              onValueChange={setMode}
              items={[
                {
                  value: 'function',
                  label: t('os.widgetPickerGroupByFunction'),
                  icon: <Shapes size={15} />,
                },
                {
                  value: 'app',
                  label: t('os.widgetPickerGroupByApp'),
                  icon: <AppWindow size={15} />,
                },
              ]}
            />
          </div>
        </div>

        <ModalBody className="min-h-0 overflow-y-auto px-5 py-5 sm:px-6">
          <div className="space-y-7">
            {groups.length === 0 ? (
              <div className="flex min-h-48 items-center justify-center text-sm font-semibold text-text-muted">
                {t('common.noResults')}
              </div>
            ) : (
              groups.map((group) => {
                const GroupIcon = group.icon
                return (
                  <section key={group.id} aria-labelledby={`widget-group-${group.id}`}>
                    <div className="mb-3 flex items-center gap-2.5">
                      {group.provider ? (
                        <ProviderIcon provider={group.provider} className="h-8 w-8" />
                      ) : GroupIcon ? (
                        <span className="grid h-8 w-8 place-items-center rounded-xl border border-white/10 bg-white/[0.06] text-primary">
                          <GroupIcon size={17} />
                        </span>
                      ) : null}
                      <h3
                        id={`widget-group-${group.id}`}
                        className="text-sm font-black text-text-primary"
                      >
                        {group.title}
                      </h3>
                    </div>
                    <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(210px,1fr))]">
                      {group.items.map((item) => {
                        return (
                          <button
                            key={item.id}
                            type="button"
                            aria-label={t('os.addWidgetNamed', { name: item.title })}
                            className={cn(
                              'group/card flex flex-col rounded-2xl border border-white/10 bg-white/[0.045] p-4 text-left transition hover:-translate-y-0.5 hover:border-primary/35 hover:bg-primary/[0.075] hover:shadow-[0_16px_36px_rgba(0,0,0,0.2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
                              item.provider.id !== 'system' && 'min-h-32',
                            )}
                            onClick={() => {
                              onClose()
                              item.onSelect()
                            }}
                          >
                            <span className="block text-sm font-black text-text-primary">
                              {item.title}
                            </span>
                            <span className="mt-1 line-clamp-2 min-h-9 text-xs leading-[1.45] text-text-muted/80">
                              {item.description ?? t('os.widgetDescriptionFallback')}
                            </span>
                            {item.provider.id !== 'system' ? (
                              <span className="mt-auto flex items-center gap-2 border-t border-white/[0.07] pt-3 text-[11px] font-bold text-text-muted/75">
                                <ProviderIcon
                                  provider={item.provider}
                                  className="h-5 w-5 rounded-md"
                                />
                                <span className="truncate">{item.provider.name}</span>
                              </span>
                            ) : null}
                          </button>
                        )
                      })}
                    </div>
                  </section>
                )
              })
            )}
          </div>
        </ModalBody>
      </ModalContent>
    </Modal>
  )
}
