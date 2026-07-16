import { createContext, createElement, type ReactNode, useContext, useRef } from 'react'
import { useStore } from 'zustand'
import { createStore, type StoreApi } from 'zustand/vanilla'

export interface WorkspaceNode {
  id: string
  workspaceId: string
  parentId: string | null
  kind: 'dir' | 'file'
  name: string
  path: string
  pos: number
  ext: string | null
  mime: string | null
  sizeBytes: number | null
  contentRef: string | null
  previewUrl: string | null
  flags: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
  children?: WorkspaceNode[]
}

export interface WorkspaceInfo {
  id: string
  serverId: string
  name: string
  description: string | null
  createdAt: string
  updatedAt: string
}

export interface ClipboardPayload {
  mode: 'copy' | 'cut'
  sourceWorkspaceId: string
  nodeIds: string[]
  updatedAt: number
}

export interface WorkspaceState {
  // Current file source identity. WorkspacePage is reused across servers and cloud computers.
  sourceId: string | null
  resetForSource: (sourceId: string) => void

  // Workspace info
  workspace: WorkspaceInfo | null
  setWorkspace: (ws: WorkspaceInfo | null) => void

  // Tree state
  tree: WorkspaceNode[]
  setTree: (nodes: WorkspaceNode[]) => void

  // Loaded children cache (parentId -> children)
  childrenCache: Map<string, WorkspaceNode[]>
  setChildren: (parentId: string | null, children: WorkspaceNode[]) => void
  clearChildrenCache: () => void

  // Expand/collapse state
  expandedIds: Set<string>
  toggleExpanded: (id: string) => void
  setExpanded: (id: string, expanded: boolean) => void

  // Selection state
  selectedNodeId: string | null
  setSelectedNodeId: (id: string | null) => void
  selectedIds: Set<string>
  toggleSelected: (id: string) => void
  clearSelection: () => void
  selectMultiple: (ids: string[]) => void

  // Active file being viewed
  activeFileId: string | null
  setActiveFileId: (id: string | null) => void

  // Context menu state
  contextMenu: { x: number; y: number; node: WorkspaceNode | null } | null
  setContextMenu: (menu: { x: number; y: number; node: WorkspaceNode | null } | null) => void

  // Rename state
  renamingNodeId: string | null
  setRenamingNodeId: (id: string | null) => void

  // Loading
  loadingFolderIds: Set<string>
  setFolderLoading: (id: string, loading: boolean) => void

  // Clipboard
  clipboard: ClipboardPayload | null
  setClipboard: (payload: ClipboardPayload | null) => void

  // Search
  searchQuery: string
  setSearchQuery: (query: string) => void
}

function storageKey(base: string, sourceId: string | null) {
  return sourceId ? `${base}:source:${encodeURIComponent(sourceId)}` : base
}

function readStoredJson<T>(key: string, fallback: T): T {
  try {
    const raw = globalThis.localStorage?.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeStoredJson(key: string, value: unknown | null) {
  try {
    if (value === null) globalThis.localStorage?.removeItem(key)
    else globalThis.localStorage?.setItem(key, JSON.stringify(value))
  } catch {
    // Persistence is optional in non-browser and privacy-restricted environments.
  }
}

export function createWorkspaceStore(initialSourceId: string | null = null) {
  const expandedStorageKey = storageKey('workspace-expanded:v1', initialSourceId)
  const clipboardStorageKey = storageKey('workspace-clipboard:v1', initialSourceId)
  return createStore<WorkspaceState>((set) => ({
    sourceId: initialSourceId,
    resetForSource: (sourceId) =>
      set((state) => {
        if (state.sourceId === sourceId) return {}
        return {
          sourceId,
          workspace: null,
          tree: [],
          childrenCache: new Map(),
          selectedNodeId: null,
          selectedIds: new Set(),
          activeFileId: null,
          contextMenu: null,
          renamingNodeId: null,
          loadingFolderIds: new Set(),
          searchQuery: '',
        }
      }),

    workspace: null,
    setWorkspace: (ws) => set({ workspace: ws }),

    tree: [],
    setTree: (nodes) => set({ tree: nodes }),

    childrenCache: new Map(),
    setChildren: (parentId, children) =>
      set((state) => {
        const cache = new Map(state.childrenCache)
        cache.set(parentId ?? '__ROOT__', children)
        return { childrenCache: cache }
      }),
    clearChildrenCache: () => set({ childrenCache: new Map() }),

    expandedIds: new Set(readStoredJson<string[]>(expandedStorageKey, [])),
    toggleExpanded: (id) =>
      set((state) => {
        const next = new Set(state.expandedIds)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        writeStoredJson(expandedStorageKey, [...next])
        return { expandedIds: next }
      }),
    setExpanded: (id, expanded) =>
      set((state) => {
        const next = new Set(state.expandedIds)
        if (expanded) next.add(id)
        else next.delete(id)
        writeStoredJson(expandedStorageKey, [...next])
        return { expandedIds: next }
      }),

    selectedNodeId: null,
    setSelectedNodeId: (id) => set({ selectedNodeId: id }),

    selectedIds: new Set(),
    toggleSelected: (id) =>
      set((state) => {
        const next = new Set(state.selectedIds)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return { selectedIds: next }
      }),
    clearSelection: () => set({ selectedIds: new Set() }),
    selectMultiple: (ids) => set({ selectedIds: new Set(ids) }),

    activeFileId: null,
    setActiveFileId: (id) => set({ activeFileId: id }),

    contextMenu: null,
    setContextMenu: (menu) => set({ contextMenu: menu }),

    renamingNodeId: null,
    setRenamingNodeId: (id) => set({ renamingNodeId: id }),

    loadingFolderIds: new Set(),
    setFolderLoading: (id, loading) =>
      set((state) => {
        const next = new Set(state.loadingFolderIds)
        if (loading) next.add(id)
        else next.delete(id)
        return { loadingFolderIds: next }
      }),

    clipboard: readStoredJson<ClipboardPayload | null>(clipboardStorageKey, null),
    setClipboard: (payload) => {
      writeStoredJson(clipboardStorageKey, payload)
      set({ clipboard: payload })
    },

    searchQuery: '',
    setSearchQuery: (query) => set({ searchQuery: query }),
  }))
}

const defaultWorkspaceStore = createWorkspaceStore()
const WorkspaceStoreContext = createContext<StoreApi<WorkspaceState> | null>(null)

export function WorkspaceStoreProvider({
  sourceId,
  children,
}: {
  sourceId: string
  children: ReactNode
}) {
  const parentStore = useContext(WorkspaceStoreContext)
  const scopedStoreRef = useRef<{
    sourceId: string
    store: StoreApi<WorkspaceState>
  } | null>(null)
  if (!scopedStoreRef.current || scopedStoreRef.current.sourceId !== sourceId) {
    scopedStoreRef.current = { sourceId, store: createWorkspaceStore(sourceId) }
  }
  const store =
    parentStore?.getState().sourceId === sourceId ? parentStore : scopedStoreRef.current.store
  return createElement(WorkspaceStoreContext.Provider, { value: store }, children)
}

export function useWorkspaceStoreApi() {
  return useContext(WorkspaceStoreContext) ?? defaultWorkspaceStore
}

type WorkspaceStoreHook = {
  (): WorkspaceState
  <T>(selector: (state: WorkspaceState) => T): T
  getState: () => WorkspaceState
}

export const useWorkspaceStore = Object.assign(
  <T = WorkspaceState>(selector?: (state: WorkspaceState) => T) => {
    const store = useWorkspaceStoreApi()
    return useStore(store, selector ?? ((state: WorkspaceState) => state as T))
  },
  { getState: defaultWorkspaceStore.getState },
) as WorkspaceStoreHook
