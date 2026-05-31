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
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { EmptyState } from '../../../../src/components/common/empty-state'
import { LoadingScreen } from '../../../../src/components/common/loading-screen'
import {
  AppText,
  BackgroundSurface,
  Button,
  GlassHeader,
  GlassPanel,
  MenuItem,
  MetricCard,
  Sheet,
  TextField,
} from '../../../../src/components/ui'
import { fetchApi, getImageUrl } from '../../../../src/lib/api'
import { showToast } from '../../../../src/lib/toast'
import { fontSize, iconSize, radius, size, spacing, useColors } from '../../../../src/theme'

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

type SignedWorkspaceMediaUrl = {
  url: string
  expiresAt: string
}

async function resolveWorkspaceMediaUrl(
  serverId: string,
  node: WorkspaceNode,
  disposition: 'inline' | 'attachment',
) {
  if (node.contentRef) {
    const params = new URLSearchParams({ disposition, contentRef: node.contentRef })
    const signed = await fetchApi<SignedWorkspaceMediaUrl>(
      `/api/servers/${serverId}/workspace/files/${node.id}/media-url?${params.toString()}`,
    )
    return getImageUrl(signed.url) ?? signed.url
  }
  const fallback = node.previewUrl ?? node.url
  return fallback ? (getImageUrl(fallback) ?? fallback) : null
}

function WorkspaceThumbnail({ serverId, node }: { serverId: string; node: WorkspaceNode }) {
  const { data: url } = useQuery({
    queryKey: ['workspace-media-url', serverId, node.id, node.contentRef, 'thumbnail'],
    queryFn: () => resolveWorkspaceMediaUrl(serverId, node, 'inline'),
    enabled: Boolean(
      serverId && node.kind === 'file' && (node.contentRef || node.previewUrl || node.url),
    ),
    staleTime: 4 * 60 * 1000,
  })

  if (!url) return null
  return <Image source={{ uri: url }} style={styles.thumbnail} contentFit="cover" />
}

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

  const { data: previewMediaUrl } = useQuery({
    queryKey: [
      'workspace-media-url',
      server?.id,
      previewNode?.id,
      previewNode?.contentRef,
      'inline',
    ],
    queryFn: () => resolveWorkspaceMediaUrl(server!.id, previewNode!, 'inline'),
    enabled: Boolean(server?.id && previewNode?.id && previewNode?.contentRef),
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
      } as unknown as Blob)
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

  const hasResolvableFileUrl = (node: WorkspaceNode) => {
    return Boolean(node.contentRef || node.previewUrl || node.url)
  }

  const openFileUrl = (node: WorkspaceNode, disposition: 'inline' | 'attachment') => {
    if (!server?.id) return
    void resolveWorkspaceMediaUrl(server.id, node, disposition)
      .then((url) => {
        if (url) return Linking.openURL(url)
      })
      .catch((err: Error) => showToast(err.message, 'error'))
  }

  const previewFallbackMediaUrl = previewNode
    ? getImageUrl(previewNode.previewUrl ?? previewNode.url)
    : null
  const previewImageUrl =
    previewMediaUrl ?? (previewNode?.contentRef ? null : previewFallbackMediaUrl)

  if (isLoading) return <LoadingScreen />

  return (
    <BackgroundSurface style={styles.container}>
      {/* ── Toolbar ──────────────────────────────── */}
      <GlassHeader style={styles.toolbar}>
        {/* Back button when deep */}
        {folderPath.length > 1 && (
          <Button
            variant="ghost"
            size="icon"
            icon={ArrowLeft}
            iconColor={colors.text}
            onPress={() => {
              const prev = folderPath[folderPath.length - 2]
              if (prev) {
                navigateToFolder(prev.id, prev.name)
              }
            }}
            style={styles.toolBtn}
          />
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
              {i > 0 && <ChevronRight size={iconSize.xs} color={colors.textMuted} />}
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
          <Button
            variant={actionMode === 'search' ? 'primary' : 'ghost'}
            size="icon"
            icon={Search}
            iconColor={actionMode === 'search' ? undefined : colors.textMuted}
            onPress={() => setActionMode(actionMode === 'search' ? 'none' : 'search')}
            style={styles.toolBtn}
          />
          <Button
            variant="ghost"
            size="icon"
            icon={FolderPlus}
            iconColor={colors.primary}
            onPress={() => {
              setActionMode('create-folder')
              setInputValue('')
            }}
            style={styles.toolBtn}
          />
          <Button
            variant="ghost"
            size="icon"
            icon={FilePlus}
            iconColor={colors.primary}
            onPress={() => {
              setActionMode('create-file')
              setInputValue('')
            }}
            style={styles.toolBtn}
          />
          <Button
            variant="ghost"
            size="icon"
            icon={Upload}
            iconColor={colors.textMuted}
            onPress={handleUpload}
            style={styles.toolBtn}
          />
          {clipboard && (
            <Button
              variant="primary"
              size="icon"
              icon={Clipboard}
              onPress={() => pasteMutation.mutate()}
              style={styles.toolBtn}
            />
          )}
        </View>
      </GlassHeader>

      {/* ── Stats row ─────────────────────────────── */}
      {stats && (
        <View style={styles.statsRow}>
          <MetricCard label={t('workspace.folders')} value={stats.folderCount} icon={Folder} />
          <MetricCard label={t('workspace.files')} value={stats.fileCount} icon={File} />
        </View>
      )}

      {/* ── Search bar ────────────────────────────── */}
      {actionMode === 'search' && (
        <GlassPanel style={styles.searchBar}>
          <TextField
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={t('workspace.searchPlaceholder')}
            icon={Search}
            autoFocus
            right={
              searchQuery.length > 0 ? (
                <Button
                  variant="ghost"
                  size="icon"
                  icon={X}
                  iconSize={16}
                  iconColor={colors.textMuted}
                  onPress={() => setSearchQuery('')}
                />
              ) : null
            }
          />
        </GlassPanel>
      )}

      {/* ── Inline create/rename bar ──────────────── */}
      {(actionMode === 'create-folder' ||
        actionMode === 'create-file' ||
        actionMode === 'rename') && (
        <GlassHeader style={styles.inlineBar}>
          {actionMode === 'create-folder' && (
            <FolderPlus size={iconSize.md} color={colors.primary} />
          )}
          {actionMode === 'create-file' && <FilePlus size={iconSize.md} color={colors.primary} />}
          {actionMode === 'rename' && <Pencil size={iconSize.md} color={colors.primary} />}
          <TextField
            containerStyle={styles.inlineField}
            value={inputValue}
            onChangeText={setInputValue}
            placeholder={
              actionMode === 'create-folder'
                ? t('workspace.folderName')
                : actionMode === 'create-file'
                  ? t('workspace.fileName')
                  : t('workspace.newName')
            }
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
          <Button
            variant="ghost"
            size="icon"
            icon={Check}
            iconColor={colors.primary}
            onPress={() => {
              const trimmed = inputValue.trim()
              if (!trimmed) return
              if (actionMode === 'create-folder') createFolderMutation.mutate(trimmed)
              else if (actionMode === 'create-file') createFileMutation.mutate(trimmed)
              else if (actionMode === 'rename' && selectedNode)
                renameMutation.mutate({ node: selectedNode, name: trimmed })
            }}
            style={styles.toolBtn}
          />
          <Button
            variant="ghost"
            size="icon"
            icon={X}
            iconColor={colors.textMuted}
            onPress={() => {
              setActionMode('none')
              setInputValue('')
              setSelectedNode(null)
            }}
            style={styles.toolBtn}
          />
        </GlassHeader>
      )}

      {/* ── File list ─────────────────────────────── */}
      {displayNodes.length === 0 ? (
        <EmptyState
          icon={Folder}
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
            return (
              <MenuItem
                icon={FileIcon}
                tone={item.kind === 'dir' ? 'warning' : 'muted'}
                title={item.name}
                subtitle={
                  item.kind === 'file'
                    ? `${formatSize(item.sizeBytes)}${item.mime ? ` · ${item.mime.split('/')[1] ?? item.mime}` : ''}`
                    : undefined
                }
                onPress={() => handleNodePress(item)}
                onLongPress={() => openNodeActions(item)}
                right={
                  <View style={styles.nodeRight}>
                    {item.kind === 'dir' && (
                      <ChevronRight size={iconSize.md} color={colors.textMuted} />
                    )}
                    {server?.id && item.kind === 'file' && isImageFile(item) && (
                      <WorkspaceThumbnail serverId={server.id} node={item} />
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      icon={MoreHorizontal}
                      iconSize={16}
                      iconColor={colors.textMuted}
                      onPress={() => openNodeActions(item)}
                      style={styles.moreBtn}
                    />
                  </View>
                }
              />
            )
          }}
        />
      )}

      {/* ── Node actions bottom sheet ──────────────── */}
      <Sheet
        visible={showNodeActions}
        onClose={() => setShowNodeActions(false)}
        title={selectedNode?.name}
      >
        {selectedNode && (
          <>
            <MenuItem
              icon={Pencil}
              title={t('workspace.rename')}
              onPress={() => {
                setShowNodeActions(false)
                setInputValue(selectedNode.name)
                setActionMode('rename')
              }}
            />
            <MenuItem
              icon={Copy}
              title={t('workspace.copy')}
              onPress={() => {
                setClipboard({ node: selectedNode, mode: 'copy' })
                setShowNodeActions(false)
                showToast(t('common.copied'), 'success')
              }}
            />
            <MenuItem
              icon={Copy}
              title={t('workspace.cut')}
              onPress={() => {
                setClipboard({ node: selectedNode, mode: 'cut' })
                setShowNodeActions(false)
                showToast(t('workspace.cut'), 'success')
              }}
            />
            {selectedNode.kind === 'file' && hasResolvableFileUrl(selectedNode) && (
              <MenuItem
                icon={Download}
                title={t('workspace.download')}
                onPress={() => {
                  openFileUrl(selectedNode, 'attachment')
                  setShowNodeActions(false)
                }}
              />
            )}
            {selectedNode.kind === 'file' && (
              <MenuItem
                icon={Eye}
                title={t('workspace.preview')}
                onPress={() => {
                  setPreviewNode(selectedNode)
                  setShowNodeActions(false)
                }}
              />
            )}
            <MenuItem
              icon={Trash2}
              tone="danger"
              title={t('common.delete')}
              onPress={() => handleDelete(selectedNode)}
            />
          </>
        )}
      </Sheet>

      {/* ── File preview modal ────────────────────── */}
      <Sheet
        visible={!!previewNode}
        onClose={() => setPreviewNode(null)}
        title={previewNode?.name}
        action={
          <Button
            variant="ghost"
            size="icon"
            icon={X}
            iconColor={colors.textMuted}
            onPress={() => setPreviewNode(null)}
          />
        }
      >
        {previewNode && (
          <ScrollView contentContainerStyle={styles.previewBody}>
            {isImageFile(previewNode) && previewImageUrl ? (
              <Image
                source={{ uri: previewImageUrl }}
                style={styles.previewImage}
                contentFit="contain"
              />
            ) : (
              <View style={styles.previewPlaceholder}>
                <FileText size={iconSize.hero} color={colors.textMuted} />
                <AppText tone="secondary" style={styles.previewTextInfo}>
                  {previewNode.mime ?? t('workspace.unknownType')}
                </AppText>
                <AppText variant="label" tone="secondary" style={styles.previewTextInfo}>
                  {formatSize(previewNode.sizeBytes)}
                </AppText>
              </View>
            )}

            {/* File info table */}
            <GlassPanel style={styles.infoTable}>
              <View style={styles.infoRow}>
                <AppText variant="label" tone="secondary">
                  {t('workspace.size')}
                </AppText>
                <AppText>{formatSize(previewNode.sizeBytes)}</AppText>
              </View>
              <View style={styles.infoRow}>
                <AppText variant="label" tone="secondary">
                  {t('workspace.type')}
                </AppText>
                <AppText>{previewNode.mime ?? '—'}</AppText>
              </View>
              <View style={styles.infoRow}>
                <AppText variant="label" tone="secondary">
                  {t('workspace.path')}
                </AppText>
                <AppText style={styles.infoValue} numberOfLines={2}>
                  {previewNode.path ?? '—'}
                </AppText>
              </View>
            </GlassPanel>

            {/* Download button */}
            {hasResolvableFileUrl(previewNode) && (
              <Button
                variant="primary"
                size="md"
                icon={Download}
                onPress={() => openFileUrl(previewNode, 'attachment')}
              >
                {t('workspace.download')}
              </Button>
            )}
          </ScrollView>
        )}
      </Sheet>
    </BackgroundSurface>
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
  },
  breadcrumbs: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  breadcrumb: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.xxs,
  },
  toolbarActions: {
    flexDirection: 'row',
    gap: spacing.xxs,
  },
  toolBtn: { padding: spacing.xs },
  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  // Search
  searchBar: {
    margin: spacing.md,
    marginBottom: spacing.sm,
  },
  // Inline create/rename
  inlineBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  inlineField: {
    flex: 1,
  },
  // List
  list: { padding: spacing.sm, gap: spacing.xxs },
  nodeRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  thumbnail: {
    width: size.iconButtonSm,
    height: size.iconButtonSm,
    borderRadius: radius.sm,
  },
  moreBtn: {
    width: size.iconButtonMd,
    height: size.iconButtonMd,
  },
  // Preview
  previewBody: {
    gap: spacing.md,
    paddingBottom: spacing['3xl'],
  },
  previewImage: {
    width: '100%',
    height: size.previewImageHeight,
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
    gap: spacing.md,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoValue: {
    flex: 1,
    textAlign: 'right',
  },
})
