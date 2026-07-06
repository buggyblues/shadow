import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useContext,
  useEffect,
  useMemo,
} from 'react'

export type OsWindowMenuActionItem = {
  type?: 'item'
  id: string
  label: ReactNode
  icon?: ReactNode
  disabled?: boolean
  danger?: boolean
  onSelect: () => void
}

export type OsWindowMenuSubmenuItem = {
  type: 'submenu'
  id: string
  label: ReactNode
  icon?: ReactNode
  disabled?: boolean
  items: OsWindowMenuItem[]
}

export type OsWindowMenuSeparatorItem = {
  type: 'separator'
  id?: string
}

export type OsWindowMenuItem =
  | OsWindowMenuActionItem
  | OsWindowMenuSubmenuItem
  | OsWindowMenuSeparatorItem

export type OsWindowMenuContextValue = {
  setWindowMenuItems: (slotId: string, items: OsWindowMenuItem[] | null) => () => void
}

export const OsWindowMenuContext = createContext<OsWindowMenuContextValue | null>(null)

export function useOsWindowMenu(slotId: string, items: OsWindowMenuItem[] | null) {
  const context = useContext(OsWindowMenuContext)

  useEffect(() => {
    if (!context) return
    return context.setWindowMenuItems(slotId, items)
  }, [context, slotId, items])
}

export function useStableWindowMenu(items: OsWindowMenuItem[] | null, dependencies: unknown[]) {
  // Keep menu registration stable so the window frame only updates for intentional menu changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => items, dependencies)
}

export function useOsWindowMenuController(
  updateItems: Dispatch<SetStateAction<Record<string, OsWindowMenuItem[]>>>,
) {
  return useMemo<OsWindowMenuContextValue>(
    () => ({
      setWindowMenuItems: (slotId, items) => {
        updateItems((current) => {
          if (items === null || items.length === 0) {
            const { [slotId]: _removed, ...rest } = current
            return rest
          }
          return { ...current, [slotId]: items }
        })

        return () => {
          updateItems((current) => {
            const { [slotId]: _removed, ...rest } = current
            return rest
          })
        }
      },
    }),
    [updateItems],
  )
}
