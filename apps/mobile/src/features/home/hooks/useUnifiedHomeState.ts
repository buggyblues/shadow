import { useState } from 'react'
import type { UnifiedWorkspaceNode } from '../types'

export function useUnifiedHomeState() {
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null)
  const [showDirectMessagePicker, setShowDirectMessagePicker] = useState(false)
  const [showCreateMenu, setShowCreateMenu] = useState(false)
  const [showCreateServer, setShowCreateServer] = useState(false)
  const [collapsedHomeGroups, setCollapsedHomeGroups] = useState<Set<string>>(new Set())
  const [workspaceFolderStack, setWorkspaceFolderStack] = useState<UnifiedWorkspaceNode[]>([])
  const [createName, setCreateName] = useState('')
  const [isPublic, setIsPublic] = useState(true)

  return {
    selectedServerId,
    setSelectedServerId,
    showDirectMessagePicker,
    setShowDirectMessagePicker,
    showCreateMenu,
    setShowCreateMenu,
    showCreateServer,
    setShowCreateServer,
    collapsedHomeGroups,
    setCollapsedHomeGroups,
    workspaceFolderStack,
    setWorkspaceFolderStack,
    createName,
    setCreateName,
    isPublic,
    setIsPublic,
  }
}
