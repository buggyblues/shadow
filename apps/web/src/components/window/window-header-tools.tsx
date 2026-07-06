import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useContext,
  useEffect,
  useMemo,
} from 'react'

export type OsWindowHeaderToolsContextValue = {
  setHeaderTools: (slotId: string, tools: ReactNode | null) => () => void
}

export const OsWindowHeaderToolsContext = createContext<OsWindowHeaderToolsContextValue | null>(
  null,
)

export function useOsWindowHeaderTools(slotId: string, tools: ReactNode | null) {
  const context = useContext(OsWindowHeaderToolsContext)

  useEffect(() => {
    if (!context) return
    return context.setHeaderTools(slotId, tools)
  }, [context, slotId, tools])
}

export function useStableHeaderTool(tool: ReactNode, dependencies: unknown[]) {
  // This tiny wrapper keeps window-frame updates intentional when a layout registers header tools.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => tool, dependencies)
}

export function useOsWindowHeaderToolsController(
  updateTools: Dispatch<SetStateAction<Record<string, ReactNode>>>,
) {
  return useMemo<OsWindowHeaderToolsContextValue>(
    () => ({
      setHeaderTools: (slotId, tools) => {
        updateTools((current) => {
          if (tools === null) {
            const { [slotId]: _removed, ...rest } = current
            return rest
          }
          return { ...current, [slotId]: tools }
        })

        return () => {
          updateTools((current) => {
            const { [slotId]: _removed, ...rest } = current
            return rest
          })
        }
      },
    }),
    [updateTools],
  )
}
