import { cn, Search as SearchField } from '@shadowob/ui'
import { Search as SearchIcon } from 'lucide-react'
import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

export type OsWindowHeaderToolsContextValue = {
  setHeaderTools: (slotId: string, tools: ReactNode | null) => () => void
  setHeaderSearch: (slotId: string, search: ReactNode | null) => () => void
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

export type OsWindowHeaderSearchProps = {
  value: string
  onChange: (value: string) => void
  placeholder: string
  ariaLabel?: string
  clearLabel?: string
  filter?: ReactNode
}

export function OsWindowHeaderSearch({
  value,
  onChange,
  placeholder,
  ariaLabel = placeholder,
  clearLabel,
  filter,
}: OsWindowHeaderSearchProps) {
  const [expanded, setExpanded] = useState(() => value.length > 0)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (value) setExpanded(true)
  }, [value])

  useEffect(() => {
    if (!expanded) return
    inputRef.current?.focus()
  }, [expanded])

  if (!expanded) {
    return (
      <button
        type="button"
        className={cn(
          'relative grid h-8 w-8 shrink-0 place-items-center rounded-lg text-text-muted transition hover:bg-white/8 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
          value && 'text-primary',
        )}
        aria-label={ariaLabel}
        title={ariaLabel}
        aria-expanded="false"
        onClick={() => setExpanded(true)}
      >
        <SearchIcon size={16} />
        {value ? (
          <span
            aria-hidden="true"
            className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-primary ring-2 ring-bg-primary"
          />
        ) : null}
      </button>
    )
  }

  return (
    <div
      className="flex min-w-0 items-center gap-1"
      onBlur={(event) => {
        if (event.relatedTarget && event.currentTarget.contains(event.relatedTarget as Node)) {
          return
        }
        setExpanded(false)
      }}
    >
      <div className="w-[min(280px,30vw)] min-w-[160px]">
        <SearchField
          ref={inputRef}
          variant="small"
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          aria-label={ariaLabel}
          onClear={value ? () => onChange('') : undefined}
          clearLabel={clearLabel}
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return
            setExpanded(false)
          }}
        />
      </div>
      {filter}
    </div>
  )
}

export function useOsWindowHeaderSearch(slotId: string, props: OsWindowHeaderSearchProps | null) {
  const context = useContext(OsWindowHeaderToolsContext)
  const search = useMemo(
    () => (props ? <OsWindowHeaderSearch {...props} /> : null),
    [
      props?.ariaLabel,
      props?.clearLabel,
      props?.filter,
      props?.onChange,
      props?.placeholder,
      props?.value,
    ],
  )

  useEffect(() => {
    if (!context) return
    return context.setHeaderSearch(slotId, search)
  }, [context, search, slotId])
}

export function useStableHeaderTool(tool: ReactNode, dependencies: unknown[]) {
  // This tiny wrapper keeps window-frame updates intentional when a layout registers header tools.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => tool, dependencies)
}

export function useOsWindowHeaderToolsController(
  updateTools: Dispatch<SetStateAction<Record<string, ReactNode>>>,
  updateSearch: Dispatch<SetStateAction<Record<string, ReactNode>>>,
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
      setHeaderSearch: (slotId, search) => {
        updateSearch((current) => {
          if (search === null) {
            const { [slotId]: _removed, ...rest } = current
            return rest
          }
          return { ...current, [slotId]: search }
        })

        return () => {
          updateSearch((current) => {
            const { [slotId]: _removed, ...rest } = current
            return rest
          })
        }
      },
    }),
    [updateSearch, updateTools],
  )
}
