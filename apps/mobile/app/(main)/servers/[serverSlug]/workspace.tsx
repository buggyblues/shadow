import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as DocumentPicker from 'expo-document-picker'
import { Image } from 'expo-image'
import { useLocalSearchParams } from 'expo-router'
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Clipboard,
  Copy,
  Download,
  Eye,
  File,
  FileArchive,
  FileCode,
  FileImage,
  FilePlus,
  FileText,
  Film,
  Folder,
  FolderPlus,
  MoreHorizontal,
  Music,
  Pencil,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react-native'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Alert,
  FlatList,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { EmptyState } from '../../../../src/components/common/empty-state'
import { LoadingScreen } from '../../../../src/components/common/loading-screen'
import { fetchApi, getImageUrl } from '../../../../src/lib/api'
import { showToast } from '../../../../src/lib/toast'
import { fontSize, radius, spacing, useColors } from '../../../../src/theme'

// ── Types ────────────────────────────────────────────────────────────────────

interface WorkspaceNode {
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
  // Legacy field compat
  type?: 'file' | 'folder'
  mimeType?: string | null
  size?: number
  url?: string
}

interface WorkspaceStats {
  folderCount: number
  fileCount: number
  totalCount: number
}

type ActionMode = 'none' | 'rename' | 'create-file' | 'create-folder' | 'search'

export default function WorkspaceScreen() {
  const { serverSlug } = useLocalSearchParams<{ serverSlug: string }>()
  const { t } = useTranslation()
  const colors = useColors()
  const queryClient = useQueryClient()

  // Navigation state
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [folderPath, setFolderPath] = useState<{ id: string | null; name: string }[]>([
    { id: null, name: t('workspace.root') },
  ])

  // Action modals
  const [actionMode, setActionMode] = useState<ActionMode>('none')
  const [inputValue, setInputValue] = useState('')
  const [selectedNode, setSelectedNode] = useState<WorkspaceNode | null>(null)
  const [showNodeActions, setShowNodeActions] = useState(false)

  // Preview
  const [previewNode, setPreviewNode] = useState<WorkspaceNode | null>(null)

  // Search
  const [searchQuery, setSearchQuery] = useState('')

  // Clipboard (copy/cut for paste)
  const [clipboard, setClipboard] = useState<{ node: WorkspaceNode; mode: 'copy' | 'cut' } | null>(
    null,
  )

  // ── Server ──────────────────────────────────────
  const { data: server } = useQuery({
    queryKey: ['server', serverSlug],
    queryFn: () => fetchApi<{ id: string; name: string }>(`/api/servers/${serverSlug}`),
    enabled: !!serverSlug,
  })

  // ── Children list ───────────────────────────────
  const {
    data: rawNodes = [],
    isLoading,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['workspace-nodes', server?.id, currentFolderId],
    queryFn: () =>
      fetchApi<WorkspaceNode[]>(
        `/api/servers/${server!.id}/workspace/children${currentFolderId ? `?parentId=${currentFolderId}` : ''}`,
      ),
    enabled: !!server?.id,
  })

  // ── Stats ───────────────────────────────────────
  const { data: stats } = useQuery({
    queryKey: ['workspace-stats', server?.id],
    queryFn: () => fetchApi<WorkspaceStats>(`/api/servers/${server!.id}/workspace/stats`),
    enabled: !!server?.id,
  })

  // ── Search ──────────────────────────────────────
  const { data: searchResults = [] } = useQuery({
    queryKey: ['workspace-search', server?.id, searchQuery],
    queryFn: () =>
      fetchApi<WorkspaceNode[]>(
        `/api/servers/${server!.id}/workspace/files/search?keyword=${encodeURIComponent(searchQuery)}`,
      ),
    enabled: !!server?.id && searchQuery.length >= 2,
  })

  // Normalize nodes for compatibility
  const normalizeNode = useCallback(
    (node: WorkspaceNode): WorkspaceNode => ({
      ...node,
      kind: node.kind ?? (node.type === 'folder' ? 'dir' : 'file'),
      sizeBytes: node.sizeBytes ?? node.size ?? null,
      mime: node.mime ?? node.mimeType ?? null,
      contentRef: node.contentRef ?? node.url ?? null,
    }),
    [],
  )

  const nodes = useMemo(() => rawNodes.map(normalizeNode), [rawNodes, normalizeNode])
  const folders = useMemo(
    () =>
      nodes
        .filter((n) => n.kind === 'dir')
        .sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0) || a.name.localeCompare(b.name)),
    [nodes],
  )
  const files = useMemo(
    () =>
      nodes
        .filter((n) => n.kind === 'file')
        .sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0) || a.name.localeCompare(b.name)),
    [nodes],
  )
  const allNodes = useMemo(() => [...folders, ...files], [folders, files])

  const displayNodes =
    actionMode === 'search' && searchQuery.length >= 2 ? searchResults.map(normalizeNode) : allNodes

  // ── Mutations ──────────────────────────────────

  const createFolderMutation = useMutation({
    mutationFn: (name: string) =>
      fetchApi(`/api/servers/${server!.id}/workspace/folders`, {
        method: 'POST',
        body: JSON.stringify({ name, parentId: currentFolderId }),
      }),
    onSuccess: () => {
      invalidate()
      setActionMode('none')
      setInputValue('')
    },
    onError: (err: Error) => showToast(err.message, 'error'),
  })

  const createFileMutation = useMutation({
    mutationFn: (name: string) =>
      fetchApi(`/api/servers/${server!.id}/workspace/files`, {
        method: 'POST',
        body: JSON.stringify({ name, parentId: currentFolderId }),
      }),
    onSuccess: () => {
      invalidate()
      setActionMode('none')
      setInputValue('')
    },
    onError: (err: Error) => showToast(err.message, 'error'),
  })

  const renameMutation = useMutation({
    mutationFn: ({ node, name }: { node: WorkspaceNode; name: string }) => {
      const endpoint =
        node.kind === 'dir'
          ? `/api/servers/${server!.id}/workspace/folders/${node.id}`
          : `/api/servers/${server!.id}/workspace/files/${node.id}`
      return fetchApi(endpoint, {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      })
    },
    onSuccess: () => {
      invalidate()
      setActionMode('none')
      setInputValue('')
      setSelectedNode(null)
    },
    onError: (err: Error) => showToast(err.message, 'error'),
  })

  const deleteMutation = useMutation({
    mutationFn: (node: WorkspaceNode) => {
      const endpoint =
        node.kind === 'dir'
          ? `/api/servers/${server!.id}/workspace/folders/${node.id}`
          : `/api/servers/${server!.id}/workspace/files/${node.id}`
      return fetchApi(endpoint, { method: 'DELETE' })
    },
    onSuccess: () => invalidate(),
    onError: (err: Error) => showToast(err.message, 'error'),
  })

  const pasteMutation = useMutation({
    mutationFn: () => {
      if (!clipboard) throw new Error('No clipboard')
      return fetchApi(`/api/servers/${server!.id}/workspace/nodes/paste`, {
        method: 'POST',
        body: JSON.stringify({
          nodeIds: [clipboard.node.id],
          targetParentId: currentFolderId,
          operation: clipboard.mode,
        }),
      })
    },
    onSuccess: () => {
      invalidate()
      if (clipboard?.mode === 'cut') setClipboard(null)
      showToast(t('workspace.pasteSuccess'), 'success')
    },
    onError: (err: Error) => showToast(err.message, 'error'),
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['workspace-nodes', server?.id, currentFolderId] })
    queryClient.invalidateQueries({ queryKey: ['workspace-stats', server?.id] })
  }

  const handleUpload = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ multiple: false })
      if (result.canceled || !result.assets?.[0]) return
      const asset = result.assets[0]

      const formData = new FormData()
      formData.append('file', {
        uri: asset.uri,
        name: asset.name,
        type: asset.mimeType ?? 'application/octet-stream',
      } as any)
      if (currentFolderId) formData.append('parentId', currentFolderId)

      await fetchApi(`/api/servers/${server!.id}/workspace/upload`, {
        method: 'POST',
        body: formData,
        headers: {},
      })
      invalidate()
      showToast(t('workspace.uploadSuccess'), 'success')
    } catch (err) {
      showToast((err as Error).message, 'error')
    }
  }

  const navigateToFolder = (folderId: string | null, folderName: string) => {
    if (folderId === currentFolderId) return
    const existingIdx = folderPath.findIndex((f) => f.id === folderId)
    if (existingIdx >= 0) {
      setFolderPath(folderPath.slice(0, existingIdx + 1))
    } else {
      setFolderPath([...folderPath, { id: folderId, name: folderName }])
    }
    setCurrentFolderId(folderId)
    setActionMode('none')
    setSearchQuery('')
  }

  const handleDelete = (node: WorkspaceNode) => {
    Alert.alert(t('common.delete'), `${t('workspace.confirmDelete')} "${node.name}"?`, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => deleteMutation.mutate(node),
      },
    ])
    setShowNodeActions(false)
  }

  const handleNodePress = (node: WorkspaceNode) => {
    if (node.kind === 'dir') {
      navigateToFolder(node.id, node.name)
    } else {
      // Preview file
      setPreviewNode(node)
    }
  }

  const openNodeActions = (node: WorkspaceNode) => {
    setSelectedNode(node)
    setShowNodeActions(true)
  }

  // ── Helpers ────────────────────────────────────
  const getFileIcon = (node: WorkspaceNode) => {
    const mime = node.mime ?? ''
    const ext = node.ext ?? ''
    if (mime.startsWith('image/') || ['.jpg', '.png', '.gif', '.webp', '.svg'].includes(ext))
      return FileImage
    if (mime.startsWith('audio/') || ['.mp3', '.wav', '.ogg', '.flac'].includes(ext)) return Music
    if (mime.startsWith('video/') || ['.mp4', '.mov', '.avi', '.webm'].includes(ext)) return Film
    if (
      mime.includes('zip') ||
      mime.includes('archive') ||
      ['.zip', '.tar', '.rar', '.7z', '.gz'].includes(ext)
    )
      return FileArchive
    if (
      mime.includes('json') ||
      mime.includes('javascript') ||
      mime.includes('typescript') ||
      mime.includes('xml') ||
      mime.includes('html') ||
      mime.includes('css') ||
      [
        '.js',
        '.ts',
        '.jsx',
        '.tsx',
        '.py',
        '.rb',
        '.go',
        '.rs',
        '.java',
        '.c',
        '.cpp',
        '.h',
        '.sh',
        '.yaml',
        '.yml',
        '.toml',
        '.md',
      ].includes(ext)
    )
      return FileCode
    return FileText
  }

  const formatSize = (bytes: number | null) => {
    if (bytes == null || bytes === 0) return '—'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const isImageFile = (node: WorkspaceNode) => {
    const mime = node.mime ?? ''
    const ext = node.ext ?? ''
    return (
      mime.startsWith('image/') ||
      ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'].includes(ext)
    )
  }

  const getFileUrl = (node: WorkspaceNode) => {
    const ref = node.contentRef ?? node.previewUrl ?? node.url
    return ref ? (getImageUrl(ref) ?? ref) : null
  }

  if (isLoading) return <LoadingScreen />

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Toolbar ──────────────────────────────── */}
      <View
        style={[
          styles.toolbar,
          { backgroundColor: colors.surface, borderBottomColor: colors.border },
        ]}
      >
        {/* Back button when deep */}
        {folderPath.length > 1 && (
          <Pressable
            onPress={() => {
              const prev = folderPath[folderPath.length - 2]
              if (prev) {
                navigateToFolder(prev.id, prev.name)
              }
            }}
            style={styles.toolBtn}
          >
            <ArrowLeft size={18} color={colors.text} />
          </Pressable>
        )}

        {/* Breadcrumbs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flex: 1 }}
          contentContainerStyle={styles.breadcrumbs}
        >
          {folderPath.map((item, i) => (
            <Pressable
              key={item.id ?? 'root'}
              onPress={() => navigateToFolder(item.id, item.name)}
              style={styles.breadcrumb}
            >
              {i > 0 && <ChevronRight size={12} color={colors.textMuted} />}
              <Text
                style={{
                  color: i === folderPath.length - 1 ? colors.text : colors.textMuted,
                  fontSize: fontSize.sm,
                  fontWeight: i === folderPath.length - 1 ? '700' : '500',
                }}
              >
                {item.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Actions */}
        <View style={styles.toolbarActions}>
          <Pressable
            onPress={() => setActionMode(actionMode === 'search' ? 'none' : 'search')}
            style={styles.toolBtn}
          >
            <Search size={18} color={actionMode === 'search' ? colors.primary : colors.textMuted} />
          </Pressable>
          <Pressable
            onPress={() => {
              setActionMode('create-folder')
              setInputValue('')
            }}
            style={styles.toolBtn}
          >
            <FolderPlus size={18} color={colors.textMuted} />
          </Pressable>
          <Pressable
            onPress={() => {
              setActionMode('create-file')
              setInputValue('')
            }}
            style={styles.toolBtn}
          >
            <FilePlus size={18} color={colors.textMuted} />
          </Pressable>
          <Pressable onPress={handleUpload} style={styles.toolBtn}>
            <Upload size={18} color={colors.textMuted} />
          </Pressable>
          {clipboard && (
            <Pressable onPress={() => pasteMutation.mutate()} style={styles.toolBtn}>
              <Clipboard size={18} color={colors.primary} />
            </Pressable>
          )}
        </View>
      </View>

      {/* ── Stats row ─────────────────────────────── */}
      {stats && (
        <View
          style={[
            styles.statsRow,
            { backgroundColor: colors.surface, borderBottomColor: colors.border },
          ]}
        >
          <View style={styles.statChip}>
            <Folder size={12} color={colors.primary} />
            <Text style={[styles.statText, { color: colors.textMuted }]}>{stats.folderCount}</Text>
          </View>
          <View style={styles.statChip}>
            <File size={12} color={colors.primary} />
            <Text style={[styles.statText, { color: colors.textMuted }]}>{stats.fileCount}</Text>
          </View>
        </View>
      )}

      {/* ── Search bar ────────────────────────────── */}
      {actionMode === 'search' && (
        <View
          style={[
            styles.searchBar,
            { backgroundColor: colors.surface, borderBottomColor: colors.border },
          ]}
        >
          <Search size={16} color={colors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={t('workspace.searchPlaceholder')}
            placeholderTextColor={colors.textMuted}
            autoFocus
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')}>
              <X size={16} color={colors.textMuted} />
            </Pressable>
          )}
        </View>
      )}

      {/* ── Inline create/rename bar ──────────────── */}
      {(actionMode === 'create-folder' ||
        actionMode === 'create-file' ||
        actionMode === 'rename') && (
        <View
          style={[
            styles.inlineBar,
            { backgroundColor: colors.surface, borderBottomColor: colors.border },
          ]}
        >
          {actionMode === 'create-folder' && <FolderPlus size={16} color={colors.primary} />}
          {actionMode === 'create-file' && <FilePlus size={16} color={colors.primary} />}
          {actionMode === 'rename' && <Pencil size={16} color={colors.primary} />}
          <TextInput
            style={[
              styles.inlineInput,
              {
                color: colors.text,
                backgroundColor: colors.inputBackground,
                borderColor: colors.border,
              },
            ]}
            value={inputValue}
            onChangeText={setInputValue}
            placeholder={
              actionMode === 'create-folder'
                ? t('workspace.folderName')
                : actionMode === 'create-file'
                  ? t('workspace.fileName')
                  : t('workspace.newName')
            }
            placeholderTextColor={colors.textMuted}
            autoFocus
            onSubmitEditing={() => {
              const trimmed = inputValue.trim()
              if (!trimmed) return
              if (actionMode === 'create-folder') createFolderMutation.mutate(trimmed)
              else if (actionMode === 'create-file') createFileMutation.mutate(trimmed)
              else if (actionMode === 'rename' && selectedNode)
                renameMutation.mutate({ node: selectedNode, name: trimmed })
            }}
          />
          <Pressable
            onPress={() => {
              const trimmed = inputValue.trim()
              if (!trimmed) return
              if (actionMode === 'create-folder') createFolderMutation.mutate(trimmed)
              else if (actionMode === 'create-file') createFileMutation.mutate(trimmed)
              else if (actionMode === 'rename' && selectedNode)
                renameMutation.mutate({ node: selectedNode, name: trimmed })
            }}
            style={styles.toolBtn}
          >
            <Check size={18} color={colors.primary} />
          </Pressable>
          <Pressable
            onPress={() => {
              setActionMode('none')
              setInputValue('')
              setSelectedNode(null)
            }}
            style={styles.toolBtn}
          >
            <X size={18} color={colors.textMuted} />
          </Pressable>
        </View>
      )}

      {/* ── File list ─────────────────────────────── */}
      {displayNodes.length === 0 ? (
        <EmptyState
          icon="📁"
          title={actionMode === 'search' ? t('workspace.noResults') : t('workspace.empty')}
        />
      ) : (
        <FlatList
          data={displayNodes}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => refetch()}
              tintColor={colors.primary}
            />
          }
          renderItem={({ item }) => {
            const FileIcon = item.kind === 'dir' ? Folder : getFileIcon(item)
            const iconColor = item.kind === 'dir' ? '#f0b132' : colors.textMuted
            return (
              <Pressable
                style={[styles.nodeRow, { backgroundColor: colors.surface }]}
                onPress={() => handleNodePress(item)}
                onLongPress={() => openNodeActions(item)}
              >
                <FileIcon size={20} color={iconColor} />
                <View style={styles.nodeInfo}>
                  <Text style={[styles.nodeName, { color: colors.text }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  {item.kind === 'file' && (
                    <Text style={[styles.nodeMeta, { color: colors.textMuted }]}>
                      {formatSize(item.sizeBytes)}
                      {item.mime ? ` · ${item.mime.split('/')[1] ?? item.mime}` : ''}
                    </Text>
                  )}
                </View>
                {item.kind === 'dir' && <ChevronRight size={16} color={colors.textMuted} />}
                {item.kind === 'file' && isImageFile(item) && getFileUrl(item) && (
                  <Image
                    source={{ uri: getFileUrl(item)! }}
                    style={styles.thumbnail}
                    contentFit="cover"
                  />
                )}
                <Pressable onPress={() => openNodeActions(item)} style={styles.moreBtn}>
                  <MoreHorizontal size={16} color={colors.textMuted} />
                </Pressable>
              </Pressable>
            )
          }}
        />
      )}

      {/* ── Node actions bottom sheet ──────────────── */}
      <Modal visible={showNodeActions} transparent animationType="slide">
        <Pressable style={styles.modalOverlay} onPress={() => setShowNodeActions(false)}>
          <View
            style={[styles.actionSheet, { backgroundColor: colors.surface }]}
            onStartShouldSetResponder={() => true}
          >
            {selectedNode && (
              <>
                <View style={styles.actionSheetHeader}>
                  {selectedNode.kind === 'dir' ? (
                    <Folder size={20} color="#f0b132" />
                  ) : (
                    <File size={20} color={colors.textMuted} />
                  )}
                  <Text style={[styles.actionSheetTitle, { color: colors.text }]} numberOfLines={1}>
                    {selectedNode.name}
                  </Text>
                </View>

                {/* Rename */}
                <Pressable
                  style={styles.actionItem}
                  onPress={() => {
                    setShowNodeActions(false)
                    setInputValue(selectedNode.name)
                    setActionMode('rename')
                  }}
                >
                  <Pencil size={18} color={colors.textSecondary} />
                  <Text style={[styles.actionItemText, { color: colors.text }]}>
                    {t('workspace.rename')}
                  </Text>
                </Pressable>

                {/* Copy */}
                <Pressable
                  style={styles.actionItem}
                  onPress={() => {
                    setClipboard({ node: selectedNode, mode: 'copy' })
                    setShowNodeActions(false)
                    showToast(t('common.copied'), 'success')
                  }}
                >
                  <Copy size={18} color={colors.textSecondary} />
                  <Text style={[styles.actionItemText, { color: colors.text }]}>
                    {t('workspace.copy')}
                  </Text>
                </Pressable>

                {/* Cut */}
                <Pressable
                  style={styles.actionItem}
                  onPress={() => {
                    setClipboard({ node: selectedNode, mode: 'cut' })
                    setShowNodeActions(false)
                    showToast(t('workspace.cut'), 'success')
                  }}
                >
                  <Copy size={18} color={colors.textSecondary} />
                  <Text style={[styles.actionItemText, { color: colors.text }]}>
                    {t('workspace.cut')}
                  </Text>
                </Pressable>

                {/* Download (files only) */}
                {selectedNode.kind === 'file' && getFileUrl(selectedNode) && (
                  <Pressable
                    style={styles.actionItem}
                    onPress={() => {
                      const url = getFileUrl(selectedNode)
                      if (url) Linking.openURL(url)
                      setShowNodeActions(false)
                    }}
                  >
                    <Download size={18} color={colors.textSecondary} />
                    <Text style={[styles.actionItemText, { color: colors.text }]}>
                      {t('workspace.download')}
                    </Text>
                  </Pressable>
                )}

                {/* Preview (files only) */}
                {selectedNode.kind === 'file' && (
                  <Pressable
                    style={styles.actionItem}
                    onPress={() => {
                      setPreviewNode(selectedNode)
                      setShowNodeActions(false)
                    }}
                  >
                    <Eye size={18} color={colors.textSecondary} />
                    <Text style={[styles.actionItemText, { color: colors.text }]}>
                      {t('workspace.preview')}
                    </Text>
                  </Pressable>
                )}

                {/* Delete */}
                <Pressable style={styles.actionItem} onPress={() => handleDelete(selectedNode)}>
                  <Trash2 size={18} color="#f23f43" />
                  <Text style={[styles.actionItemText, { color: '#f23f43' }]}>
                    {t('common.delete')}
                  </Text>
                </Pressable>
              </>
            )}
          </View>
        </Pressable>
      </Modal>

      {/* ── File preview modal ────────────────────── */}
      <Modal visible={!!previewNode} transparent animationType="slide">
        <Pressable style={styles.modalOverlay} onPress={() => setPreviewNode(null)}>
          <View
            style={[styles.previewSheet, { backgroundColor: colors.surface }]}
            onStartShouldSetResponder={() => true}
          >
            {previewNode && (
              <>
                <View style={styles.previewHeader}>
                  <Text style={[styles.previewTitle, { color: colors.text }]} numberOfLines={1}>
                    {previewNode.name}
                  </Text>
                  <Pressable onPress={() => setPreviewNode(null)}>
                    <X size={22} color={colors.textMuted} />
                  </Pressable>
                </View>

                <ScrollView contentContainerStyle={styles.previewBody}>
                  {isImageFile(previewNode) && getFileUrl(previewNode) ? (
                    <Image
                      source={{ uri: getFileUrl(previewNode)! }}
                      style={styles.previewImage}
                      contentFit="contain"
                    />
                  ) : (
                    <View style={styles.previewPlaceholder}>
                      <FileText size={48} color={colors.textMuted} />
                      <Text style={[styles.previewTextInfo, { color: colors.textSecondary }]}>
                        {previewNode.mime ?? t('workspace.unknownType')}
                      </Text>
                      <Text style={[styles.previewTextInfo, { color: colors.textMuted }]}>
                        {formatSize(previewNode.sizeBytes)}
                      </Text>
                    </View>
                  )}

                  {/* File info table */}
                  <View style={[styles.infoTable, { borderTopColor: colors.border }]}>
                    <View style={styles.infoRow}>
                      <Text style={[styles.infoLabel, { color: colors.textMuted }]}>
                        {t('workspace.size')}
                      </Text>
                      <Text style={{ color: colors.text }}>
                        {formatSize(previewNode.sizeBytes)}
                      </Text>
                    </View>
                    <View style={styles.infoRow}>
                      <Text style={[styles.infoLabel, { color: colors.textMuted }]}>
                        {t('workspace.type')}
                      </Text>
                      <Text style={{ color: colors.text }}>{previewNode.mime ?? '—'}</Text>
                    </View>
                    <View style={styles.infoRow}>
                      <Text style={[styles.infoLabel, { color: colors.textMuted }]}>
                        {t('workspace.path')}
                      </Text>
                      <Text
                        style={{ color: colors.text, flex: 1, textAlign: 'right' }}
                        numberOfLines={2}
                      >
                        {previewNode.path ?? '—'}
                      </Text>
                    </View>
                  </View>

                  {/* Download button */}
                  {getFileUrl(previewNode) && (
                    <Pressable
                      style={[styles.downloadBtn, { backgroundColor: colors.primary }]}
                      onPress={() => {
                        const url = getFileUrl(previewNode)
                        if (url) Linking.openURL(url)
                      }}
                    >
                      <Download size={16} color="#fff" />
                      <Text style={{ color: '#fff', fontWeight: '700' }}>
                        {t('workspace.download')}
                      </Text>
                    </Pressable>
                  )}
                </ScrollView>
              </>
            )}
          </View>
        </Pressable>
      </Modal>
    </View>
  )
}

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  // Toolbar
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
  },
  breadcrumbs: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  breadcrumb: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 2,
  },
  toolbarActions: {
    flexDirection: 'row',
    gap: 2,
  },
  toolBtn: { padding: spacing.xs },
  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
  },
  statChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statText: { fontSize: fontSize.xs, fontWeight: '600' },
  // Search
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    borderBottomWidth: 1,
  },
  searchInput: { flex: 1, fontSize: fontSize.md },
  // Inline create/rename
  inlineBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    borderBottomWidth: 1,
  },
  inlineInput: {
    flex: 1,
    height: 36,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.sm,
    borderWidth: 1,
  },
  // List
  list: { padding: spacing.sm, gap: 3 },
  nodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
  },
  nodeInfo: { flex: 1 },
  nodeName: { fontSize: fontSize.md, fontWeight: '500' },
  nodeMeta: { fontSize: fontSize.xs, marginTop: 1 },
  thumbnail: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
  },
  moreBtn: { padding: spacing.xs },
  // Action sheet
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  actionSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: spacing['3xl'],
  },
  actionSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  actionSheetTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    flex: 1,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  actionItemText: {
    fontSize: fontSize.md,
    fontWeight: '500',
  },
  // Preview
  previewSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.xl,
  },
  previewTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    flex: 1,
    marginRight: spacing.md,
  },
  previewBody: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing['3xl'],
  },
  previewImage: {
    width: '100%',
    height: 300,
    borderRadius: radius.lg,
  },
  previewPlaceholder: {
    alignItems: 'center',
    paddingVertical: spacing['3xl'],
    gap: spacing.sm,
  },
  previewTextInfo: {
    fontSize: fontSize.sm,
  },
  infoTable: {
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    gap: spacing.md,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 44,
    borderRadius: radius.lg,
    marginTop: spacing.xl,
  },
})
