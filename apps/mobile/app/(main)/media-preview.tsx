import * as Clipboard from 'expo-clipboard'
import * as FileSystem from 'expo-file-system/legacy'
import { Image } from 'expo-image'
import * as MediaLibrary from 'expo-media-library'
import { useLocalSearchParams, useNavigation } from 'expo-router'
import * as Sharing from 'expo-sharing'
import JSZip from 'jszip'
import {
  Code,
  Copy,
  Download,
  Eye,
  FileText,
  Folder,
  MoreVertical,
  Save,
  Share2,
} from 'lucide-react-native'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import WebView from 'react-native-webview'
import { HeaderButton, HeaderButtonGroup } from '../../src/components/common/header-button'
import { API_BASE, getImageUrl } from '../../src/lib/api'
import { showToast } from '../../src/lib/toast'
import { useAuthStore } from '../../src/stores/auth.store'
import {
  border,
  fontSize,
  iconSize,
  lineHeight,
  palette,
  radius,
  size,
  spacing,
  useColors,
} from '../../src/theme'

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window')
const CSS_FULL_WIDTH = '100%'
const CSS_MAX_CONTENT = 'max-content'

// File extension to language mapping for syntax highlighting
const EXT_LANG_MAP: Record<string, string> = {
  js: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  swift: 'swift',
  c: 'c',
  cpp: 'cpp',
  h: 'c',
  cs: 'csharp',
  php: 'php',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  sql: 'sql',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  xml: 'xml',
  html: 'html',
  css: 'css',
  scss: 'scss',
  less: 'less',
  md: 'markdown',
  toml: 'toml',
  ini: 'ini',
  dockerfile: 'dockerfile',
  makefile: 'makefile',
  lua: 'lua',
  r: 'r',
  dart: 'dart',
}

const TEXT_CONTENT_TYPES = [
  'text/',
  'application/json',
  'application/xml',
  'application/javascript',
  'application/typescript',
  'application/x-yaml',
  'application/toml',
]

const CODE_EXTENSIONS = new Set(Object.keys(EXT_LANG_MAP))

function getFileExtension(name: string): string {
  const parts = name.toLowerCase().split('.')
  return parts.length > 1 ? parts[parts.length - 1]! : ''
}

type PreviewMode =
  | 'image'
  | 'pdf'
  | 'code'
  | 'markdown'
  | 'html'
  | 'csv'
  | 'text'
  | 'zip'
  | 'unknown'

function detectPreviewMode(ct: string, fname: string): PreviewMode {
  if (ct.startsWith('image/')) return 'image'
  if (ct === 'application/pdf') return 'pdf'

  const ext = getFileExtension(fname)
  if (ext === 'zip' || ct === 'application/zip' || ct === 'application/x-zip-compressed')
    return 'zip'
  if (ext === 'md' || ext === 'markdown') return 'markdown'
  if (ext === 'html' || ext === 'htm') return 'html'
  if (ext === 'csv' || ct === 'text/csv') return 'csv'
  if (ext === 'xlsx' || ext === 'xls' || ct.includes('spreadsheet')) return 'csv'
  if (CODE_EXTENSIONS.has(ext)) return 'code'
  if (TEXT_CONTENT_TYPES.some((t) => ct.startsWith(t))) return 'text'
  if (['txt', 'log', 'env', 'gitignore', 'editorconfig'].includes(ext)) return 'text'
  return 'unknown'
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function shouldAttachAuthHeaders(targetUrl: string): boolean {
  try {
    return new URL(targetUrl, API_BASE).origin === new URL(API_BASE).origin
  } catch {
    return false
  }
}

export default function MediaPreviewScreen() {
  const { url, filename, contentType } = useLocalSearchParams<{
    url: string
    filename: string
    contentType: string
  }>()
  const { t } = useTranslation()
  const colors = useColors()
  const navigation = useNavigation()
  const [loading, setLoading] = useState(true)
  const [imageError, setImageError] = useState(false)
  const [textContent, setTextContent] = useState<string | null>(null)
  const [showSource, setShowSource] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [localPreviewUri, setLocalPreviewUri] = useState<string | null>(null)
  const [zipEntries, setZipEntries] = useState<
    { name: string; size: number; isDir: boolean; date: Date | null }[] | null
  >(null)

  const resolvedUrl = getImageUrl(url ?? '') ?? url ?? ''
  const fname = (filename ?? 'file').replace(/[/\\?#%:*"<>|\s]/g, '_')
  const ct = contentType ?? 'application/octet-stream'
  const mode = useMemo(() => detectPreviewMode(ct, fname), [ct, fname])

  const getAuthHeaders = useCallback((targetUrl: string): Record<string, string> => {
    if (!shouldAttachAuthHeaders(targetUrl)) return {}
    const token = useAuthStore.getState().accessToken
    return token ? { Authorization: `Bearer ${token}` } : {}
  }, [])

  const mediaSource = useMemo(
    () => ({
      uri: localPreviewUri ?? resolvedUrl,
      headers: localPreviewUri ? undefined : getAuthHeaders(resolvedUrl),
    }),
    [localPreviewUri, resolvedUrl, getAuthHeaders],
  )

  const buildLocalFileUri = useCallback((name: string) => {
    const extMatch = name.match(/\.[A-Za-z0-9]+$/)
    const ext = extMatch?.[0] ?? ''
    const safeBase = name
      .replace(/\.[A-Za-z0-9]+$/, '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9._-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^[._-]+|[._-]+$/g, '')
      .slice(0, 80)
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    return `${FileSystem.cacheDirectory}${safeBase || 'file'}-${unique}${ext}`
  }, [])

  const downloadWithAuth = useCallback(
    async (targetUrl: string, localPath: string) => {
      return FileSystem.downloadAsync(targetUrl, localPath, {
        headers: getAuthHeaders(targetUrl),
      })
    },
    [getAuthHeaders],
  )

  const handleShare = useCallback(async () => {
    try {
      const localUri = buildLocalFileUri(fname)
      const { uri } = await downloadWithAuth(resolvedUrl, localUri)
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri)
      } else {
        showToast(t('chat.shareUnavailable', 'Sharing is not available on this device'), 'error')
      }
    } catch (err) {
      console.error('Share failed:', err)
      showToast(t('chat.shareFailed', 'Failed to share file'), 'error')
    }
  }, [resolvedUrl, fname, downloadWithAuth, t, buildLocalFileUri])

  const handleSaveImage = useCallback(async () => {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync()
      if (status !== 'granted') {
        showToast(t('chat.permissionDenied', 'Permission denied'), 'error')
        return
      }
      const localUri = buildLocalFileUri(fname)
      const { uri } = await downloadWithAuth(resolvedUrl, localUri)
      await MediaLibrary.saveToLibraryAsync(uri)
      showToast(t('chat.imageSaved', 'Image saved to library'), 'success')
    } catch (err) {
      console.error('Save failed:', err)
      showToast(t('chat.saveFailed', 'Failed to save file'), 'error')
    }
  }, [resolvedUrl, fname, t, downloadWithAuth, buildLocalFileUri])

  const handleCopyLink = useCallback(async () => {
    await Clipboard.setStringAsync(resolvedUrl)
    showToast(t('chat.linkCopied', 'Link copied'), 'success')
  }, [resolvedUrl, t])

  const handleDownload = useCallback(async () => {
    setShowMenu(false)
    try {
      if (mode === 'image') {
        await handleSaveImage()
      } else {
        const localUri = buildLocalFileUri(fname)
        await downloadWithAuth(resolvedUrl, localUri)
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(localUri, {
            UTI: 'public.item',
            mimeType: 'application/octet-stream',
          })
        }
      }
    } catch (err) {
      console.error('Download failed:', err)
      showToast(t('chat.saveFailed', 'Failed to save file'), 'error')
    }
  }, [mode, fname, resolvedUrl, downloadWithAuth, handleSaveImage, t, buildLocalFileUri])

  useEffect(() => {
    let cancelled = false
    setImageError(false)
    if (mode !== 'image' && mode !== 'pdf') {
      setLocalPreviewUri(null)
      return
    }
    setLoading(true)
    const localUri = buildLocalFileUri(fname)
    downloadWithAuth(resolvedUrl, localUri)
      .then(({ uri }) => {
        if (!cancelled) {
          setLocalPreviewUri(uri)
        }
      })
      .catch((err) => {
        console.error('Preview preload failed:', err)
        if (!cancelled) {
          setLocalPreviewUri(null)
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [mode, fname, resolvedUrl, buildLocalFileUri, downloadWithAuth])

  const handleMoreMenu = useCallback(() => {
    setShowMenu(true)
  }, [])

  // Fetch text content for text-based files
  useEffect(() => {
    if (
      mode === 'code' ||
      mode === 'text' ||
      mode === 'markdown' ||
      mode === 'html' ||
      mode === 'csv'
    ) {
      setLoading(true)
      fetch(resolvedUrl, { headers: getAuthHeaders(resolvedUrl) })
        .then((res) => res.text())
        .then((text) => {
          setTextContent(text)
          setLoading(false)
        })
        .catch(() => {
          setTextContent(null)
          setLoading(false)
        })
    }
  }, [resolvedUrl, mode, getAuthHeaders])

  // Fetch and parse zip file contents
  useEffect(() => {
    if (mode !== 'zip') return
    setLoading(true)
    fetch(resolvedUrl, { headers: getAuthHeaders(resolvedUrl) })
      .then((res) => res.arrayBuffer())
      .then((buf) => JSZip.loadAsync(buf))
      .then((zip) => {
        const entries: { name: string; size: number; isDir: boolean; date: Date | null }[] = []
        zip.forEach((path, file) => {
          const zipFileData = file as unknown as { _data?: { uncompressedSize?: number } }
          entries.push({
            name: path,
            size: zipFileData._data?.uncompressedSize ?? 0,
            isDir: file.dir,
            date: file.date ?? null,
          })
        })
        entries.sort((a, b) => {
          if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
          return a.name.localeCompare(b.name)
        })
        setZipEntries(entries)
        setLoading(false)
      })
      .catch(() => {
        setZipEntries(null)
        setLoading(false)
      })
  }, [resolvedUrl, mode, getAuthHeaders])

  useEffect(() => {
    navigation.setOptions({
      title: fname || t('chat.previewTab'),
      headerRight: () => (
        <HeaderButtonGroup>
          {(mode === 'markdown' || mode === 'html') && (
            <HeaderButton
              icon={showSource ? Eye : Code}
              onPress={() => setShowSource((v) => !v)}
              color={showSource ? colors.primary : undefined}
            />
          )}
          <HeaderButton icon={MoreVertical} onPress={handleMoreMenu} />
        </HeaderButtonGroup>
      ),
    })
  }, [navigation, fname, colors, t, handleMoreMenu, mode, showSource])

  const renderContent = () => {
    if (mode === 'image') {
      return (
        <View style={[styles.container, { backgroundColor: palette.black }]}>
          <Pressable onLongPress={handleSaveImage} delayLongPress={500}>
            <ScrollView
              style={styles.scrollContainer}
              contentContainerStyle={styles.scrollContent}
              maximumZoomScale={5}
              minimumZoomScale={1}
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
              bouncesZoom
            >
              <Image
                source={mediaSource}
                style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT * 0.8 }}
                contentFit="contain"
                transition={200}
                onLoad={() => {
                  setLoading(false)
                  setImageError(false)
                }}
                onError={() => {
                  setLoading(false)
                  setImageError(true)
                }}
              />
            </ScrollView>
          </Pressable>
          {loading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color={palette.white} />
            </View>
          )}
          {imageError && (
            <View style={styles.loadingOverlay}>
              <FileText size={iconSize.hero} color={palette.neutral400} />
              <Text style={{ color: palette.neutral400, marginTop: spacing.sm }}>
                {t('chat.imageLoadFailed', 'Failed to load image')}
              </Text>
            </View>
          )}
        </View>
      )
    }

    if (mode === 'pdf') {
      return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
          <WebView
            source={mediaSource}
            style={styles.webview}
            onLoadStart={() => setLoading(true)}
            onLoadEnd={() => setLoading(false)}
            startInLoadingState
            renderLoading={() => (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            )}
          />
        </View>
      )
    }

    // Loading state for text content
    if (loading && textContent === null && mode !== 'unknown') {
      return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        </View>
      )
    }

    // Code preview with syntax highlighting
    if (mode === 'code' && textContent !== null) {
      const ext = getFileExtension(fname)
      const lang = EXT_LANG_MAP[ext] ?? 'plaintext'
      const isDark =
        colors.background === palette.black ||
        colors.background.startsWith('#1') ||
        colors.background.startsWith('#0')
      const htmlContent = `<!DOCTYPE html><html><head>
      <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=3">
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/${isDark ? 'github-dark' : 'github'}.min.css">
      <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
      <style>body{margin:${spacing.none}px;padding:${spacing.md}px;background:${colors.background};overflow-x:auto}
      pre{margin:${spacing.none}px;font-size:${fontSize.xs}px;line-height:${lineHeight.xs}px}code{font-family:'SF Mono',Menlo,monospace}</style>
      </head><body><pre><code class="language-${lang}">${escapeHtml(textContent)}</code></pre>
      <script>hljs.highlightAll()</script></body></html>`
      return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
          <WebView
            source={{ html: htmlContent }}
            style={styles.webview}
            originWhitelist={['*']}
            scrollEnabled
          />
        </View>
      )
    }

    // Markdown preview / source toggle
    if (mode === 'markdown' && textContent !== null) {
      if (showSource) {
        return (
          <View style={[styles.container, { backgroundColor: colors.background }]}>
            <ScrollView style={styles.textScroll} contentContainerStyle={styles.textContent}>
              <Text style={[styles.monoText, { color: colors.text }]}>{textContent}</Text>
            </ScrollView>
          </View>
        )
      }
      const isDark =
        colors.background === palette.black ||
        colors.background.startsWith('#1') ||
        colors.background.startsWith('#0')
      const htmlContent = `<!DOCTYPE html><html><head>
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/${isDark ? 'github-dark' : 'github'}.min.css">
      <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
	      <style>body{margin:${spacing.none}px;padding:${spacing.lg}px;background:${colors.background};color:${colors.text};font-family:-apple-system,system-ui,sans-serif;font-size:${fontSize.md}px;line-height:${lineHeight.md}px}
	      pre{background:${isDark ? palette.surface : palette.neutral50};padding:${spacing.md}px;border-radius:${radius.sm}px;overflow-x:auto}
	      code{font-family:'SF Mono',Menlo,monospace;font-size:${fontSize.sm}px}
	      img{max-width:${CSS_FULL_WIDTH};border-radius:${radius.md}px}
	      table{border-collapse:collapse;width:${CSS_FULL_WIDTH}}th,td{border:${border.hairline}px solid ${colors.border};padding:${spacing.sm}px}
	      blockquote{border-left:${border.active}px solid ${colors.primary};margin:${spacing.none}px;padding-left:${spacing.md}px;color:${colors.textSecondary}}
	      a{color:${colors.primary}}h1,h2,h3{margin-top:${spacing.lg}px;margin-bottom:${spacing.sm}px}</style>
      </head><body><div id="c"></div>
      <script>
        marked.setOptions({highlight:(code,lang)=>{try{return hljs.highlight(code,{language:lang||'plaintext'}).value}catch{return code}}});
        document.getElementById('c').innerHTML=marked.parse(${JSON.stringify(textContent)});
      </script></body></html>`
      return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
          <WebView source={{ html: htmlContent }} style={styles.webview} originWhitelist={['*']} />
        </View>
      )
    }

    // HTML preview / source toggle
    if (mode === 'html' && textContent !== null) {
      if (showSource) {
        return (
          <View style={[styles.container, { backgroundColor: colors.background }]}>
            <ScrollView style={styles.textScroll} contentContainerStyle={styles.textContent}>
              <Text style={[styles.monoText, { color: colors.text }]}>{textContent}</Text>
            </ScrollView>
          </View>
        )
      }
      return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
          <WebView source={{ html: textContent }} style={styles.webview} originWhitelist={['*']} />
        </View>
      )
    }

    // CSV preview as table
    if (mode === 'csv' && textContent !== null) {
      const lines = textContent.split('\n').filter((l) => l.trim())
      const rows = lines.map((line) => {
        const cells: string[] = []
        let current = ''
        let inQuote = false
        for (const ch of line) {
          if (ch === '"') {
            inQuote = !inQuote
          } else if (ch === ',' && !inQuote) {
            cells.push(current.trim())
            current = ''
          } else {
            current += ch
          }
        }
        cells.push(current.trim())
        return cells
      })
      const isDark = colors.background.startsWith('#0') || colors.background.startsWith('#1')
      const tableHtml = `<!DOCTYPE html><html><head>
      <meta name="viewport" content="width=device-width,initial-scale=1">
	      <style>body{margin:${spacing.none}px;padding:${spacing.sm}px;background:${colors.background};overflow-x:auto}
	      table{border-collapse:collapse;width:${CSS_MAX_CONTENT};min-width:${CSS_FULL_WIDTH};font-family:-apple-system,system-ui,sans-serif;font-size:${fontSize.sm}px}
	      th{background:${isDark ? palette.neutral800 : palette.neutral100};color:${colors.text};position:sticky;top:${spacing.none}px;font-weight:600;text-align:left}
	      td{color:${colors.text}}
	      th,td{border:${border.hairline}px solid ${colors.border};padding:${spacing.tight}px ${spacing.md}px;white-space:nowrap}
      tr:nth-child(even){background:${isDark ? palette.neutral900 : palette.neutral50}}</style>
      </head><body><table>${rows
        .map(
          (row, i) =>
            `<tr>${row.map((cell) => (i === 0 ? `<th>${escapeHtml(cell)}</th>` : `<td>${escapeHtml(cell)}</td>`)).join('')}</tr>`,
        )
        .join('')}</table></body></html>`
      return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
          <WebView source={{ html: tableHtml }} style={styles.webview} originWhitelist={['*']} />
        </View>
      )
    }

    // Zip file contents listing
    if (mode === 'zip') {
      if (loading) {
        return (
          <View style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          </View>
        )
      }
      if (!zipEntries) {
        return (
          <View style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={styles.filePreview}>
              <FileText size={iconSize.hero} color={colors.textMuted} />
              <Text style={[styles.fileTitle, { color: colors.text }]}>{fname}</Text>
              <Text style={[styles.fileType, { color: colors.textMuted }]}>
                {t('chat.zipParseFailed', 'Cannot read zip contents')}
              </Text>
              <Pressable
                style={[styles.downloadBtn, { backgroundColor: colors.primary }]}
                onPress={handleShare}
              >
                <Share2 size={iconSize.lg} color={palette.white} />
                <Text style={styles.downloadBtnText}>{t('chat.downloadFile')}</Text>
              </Pressable>
            </View>
          </View>
        )
      }
      const formatSize = (bytes: number) => {
        if (bytes === 0) return '-'
        if (bytes < 1024) return `${bytes} B`
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
      }
      return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
          <View style={[styles.zipHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.zipHeaderText, { color: colors.textSecondary }]}>
              {zipEntries.length} {t('chat.zipItems', 'items')}
            </Text>
          </View>
          <ScrollView style={styles.textScroll}>
            {zipEntries.map((entry) => (
              <View key={entry.name} style={[styles.zipRow, { borderBottomColor: colors.border }]}>
                {entry.isDir ? (
                  <Folder size={iconSize.md} color={colors.primary} />
                ) : (
                  <FileText size={iconSize.md} color={colors.textMuted} />
                )}
                <Text
                  style={[styles.zipName, { color: colors.text }]}
                  numberOfLines={1}
                  ellipsizeMode="middle"
                >
                  {entry.name}
                </Text>
                {!entry.isDir && (
                  <Text style={[styles.zipSize, { color: colors.textSecondary }]}>
                    {formatSize(entry.size)}
                  </Text>
                )}
              </View>
            ))}
          </ScrollView>
        </View>
      )
    }

    // Plain text preview
    if (mode === 'text' && textContent !== null) {
      return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
          <ScrollView style={styles.textScroll} contentContainerStyle={styles.textContent}>
            <Text style={[styles.monoText, { color: colors.text }]}>{textContent}</Text>
          </ScrollView>
        </View>
      )
    }

    // Unknown file type - show info and share button
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.filePreview}>
          <FileText size={iconSize.hero} color={colors.textMuted} />
          <Text style={[styles.fileTitle, { color: colors.text }]}>{fname}</Text>
          <Text style={[styles.fileType, { color: colors.textMuted }]}>{ct}</Text>
          <Pressable
            style={[styles.downloadBtn, { backgroundColor: colors.primary }]}
            onPress={handleShare}
          >
            <Share2 size={iconSize.lg} color={palette.white} />
            <Text style={styles.downloadBtnText}>{t('chat.downloadFile')}</Text>
          </Pressable>
        </View>
      </View>
    )
  }

  return (
    <>
      {renderContent()}
      {/* Dropdown menu modal */}
      <Modal
        visible={showMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMenu(false)}
      >
        <Pressable style={styles.menuOverlay} onPress={() => setShowMenu(false)}>
          <View style={[styles.menuSheet, { backgroundColor: colors.surface }]}>
            <Text style={[styles.menuTitle, { color: colors.text }]} numberOfLines={1}>
              {fname}
            </Text>
            {mode === 'image' && (
              <Pressable
                style={({ pressed }) => [
                  styles.menuItem,
                  { backgroundColor: pressed ? colors.surfaceHover : colors.surface },
                ]}
                onPress={() => {
                  setShowMenu(false)
                  handleSaveImage()
                }}
              >
                <Save size={iconSize.lg} color={colors.text} />
                <Text style={[styles.menuItemLabel, { color: colors.text }]}>
                  {t('chat.saveToLibrary', 'Save to Library')}
                </Text>
              </Pressable>
            )}
            <Pressable
              style={({ pressed }) => [
                styles.menuItem,
                { backgroundColor: pressed ? colors.surfaceHover : colors.surface },
              ]}
              onPress={() => {
                setShowMenu(false)
                handleDownload()
              }}
            >
              <Download size={iconSize.lg} color={colors.text} />
              <Text style={[styles.menuItemLabel, { color: colors.text }]}>
                {t('chat.download', 'Download')}
              </Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.menuItem,
                { backgroundColor: pressed ? colors.surfaceHover : colors.surface },
              ]}
              onPress={() => {
                setShowMenu(false)
                handleShare()
              }}
            >
              <Share2 size={iconSize.lg} color={colors.text} />
              <Text style={[styles.menuItemLabel, { color: colors.text }]}>
                {t('common.share', 'Share')}
              </Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.menuItem,
                { backgroundColor: pressed ? colors.surfaceHover : colors.surface },
              ]}
              onPress={() => {
                setShowMenu(false)
                handleCopyLink()
              }}
            >
              <Copy size={iconSize.lg} color={colors.text} />
              <Text style={[styles.menuItemLabel, { color: colors.text }]}>
                {t('chat.copyLink', 'Copy Link')}
              </Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.menuCancel,
                { backgroundColor: pressed ? colors.surfaceHover : colors.background },
              ]}
              onPress={() => setShowMenu(false)}
            >
              <Text style={[styles.menuItemLabel, { color: colors.textMuted }]}>
                {t('common.cancel', 'Cancel')}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContainer: { flex: 1 },
  scrollContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  webview: { flex: 1 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textScroll: { flex: 1 },
  textContent: { padding: spacing.md },
  monoText: {
    fontFamily: 'Menlo',
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
  },
  filePreview: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  fileTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    textAlign: 'center',
  },
  fileType: {
    fontSize: fontSize.sm,
  },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingHorizontal: spacing['2xl'],
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  downloadBtnText: {
    color: palette.white,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  zipHeader: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  zipHeaderText: {
    fontSize: fontSize.sm,
  },
  zipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  zipName: {
    flex: 1,
    fontSize: fontSize.sm,
  },
  zipSize: {
    fontSize: fontSize.xs,
    minWidth: size.controlLg + spacing.xxs,
    textAlign: 'right',
  },
  // Menu modal styles
  menuOverlay: {
    flex: 1,
    backgroundColor: palette.black,
    justifyContent: 'flex-end',
  },
  menuSheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.md,
    paddingBottom: spacing['3xl'] + spacing.xxs,
    gap: spacing.xs,
  },
  menuTitle: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: spacing.sm,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  menuItemLabel: {
    fontSize: fontSize.md,
    fontWeight: '500',
  },
  menuCancel: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    borderRadius: radius.md,
    marginTop: spacing.sm,
  },
})
