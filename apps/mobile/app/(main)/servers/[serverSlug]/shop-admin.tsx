import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import { useLocalSearchParams } from 'expo-router'
import {
  Award,
  FileText,
  ImagePlus,
  Package,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react-native'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FlatList, Modal, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native'
import { EmptyState } from '../../../../src/components/common/empty-state'
import { LoadingScreen } from '../../../../src/components/common/loading-screen'
import { PriceCompact } from '../../../../src/components/common/price-display'
import { fetchApi, getImageUrl } from '../../../../src/lib/api'
import { showToast } from '../../../../src/lib/toast'
import {
  border,
  fontSize,
  iconSize,
  palette,
  radius,
  size,
  spacing,
  useColors,
} from '../../../../src/theme'

interface ProductMedia {
  type?: 'image' | 'video'
  url?: string | null
  thumbnailUrl?: string | null
  position?: number
}

interface Product {
  id: string
  name: string
  description: string | null
  basePrice?: number
  price?: number
  imageUrl: string | null
  media?: ProductMedia[]
  stock: number | null
  status: string
}

interface ProductsResponse {
  products: Product[]
  total: number
}

type ProductTemplate = 'ai_service' | 'paid_file' | 'membership' | 'badge_gift' | 'physical'

const PRODUCT_TEMPLATES: Array<{
  key: ProductTemplate
  icon: typeof Package
  resourceType: string
  capability: string
}> = [
  { key: 'ai_service', icon: Sparkles, resourceType: 'service', capability: 'use' },
  { key: 'paid_file', icon: FileText, resourceType: 'workspace_file', capability: 'download' },
  { key: 'membership', icon: ShieldCheck, resourceType: 'subscription', capability: 'use' },
  { key: 'badge_gift', icon: Award, resourceType: 'community_asset', capability: 'redeem' },
  { key: 'physical', icon: Package, resourceType: '', capability: 'use' },
]

function makeProductSlug(name: string) {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return `${base || 'product'}-${Date.now().toString(36)}`
}

export default function ShopAdminScreen() {
  const { serverSlug } = useLocalSearchParams<{ serverSlug: string }>()
  const { t } = useTranslation()
  const colors = useColors()
  const queryClient = useQueryClient()

  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPrice, setNewPrice] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newTags, setNewTags] = useState('')
  const [globalPublic, setGlobalPublic] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<ProductTemplate>('ai_service')
  const [repeatable, setRepeatable] = useState(true)
  const [coverUrl, setCoverUrl] = useState<string | null>(null)
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null)
  const [uploadingCover, setUploadingCover] = useState(false)

  const { data: server } = useQuery({
    queryKey: ['server', serverSlug],
    queryFn: () => fetchApi<{ id: string }>(`/api/servers/${serverSlug}`),
    enabled: !!serverSlug,
  })

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['shop-products-admin', server?.id],
    queryFn: async () => {
      const result = await fetchApi<Product[] | ProductsResponse>(
        `/api/servers/${server!.id}/shop/products?includeInactive=true`,
      )
      return Array.isArray(result) ? result : result.products
    },
    enabled: !!server?.id,
  })

  const createMutation = useMutation({
    mutationFn: () => {
      const template = PRODUCT_TEMPLATES.find((item) => item.key === selectedTemplate)
      const isPhysical = selectedTemplate === 'physical'
      const baseTags =
        selectedTemplate === 'badge_gift'
          ? ['badge', 'gift']
          : selectedTemplate === 'physical'
            ? ['physical']
            : selectedTemplate.split('_')
      const customTags = newTags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)
      const entitlementConfig = isPhysical
        ? undefined
        : {
            resourceType: template?.resourceType || 'service',
            capability: template?.capability || 'use',
            durationSeconds: selectedTemplate === 'paid_file' ? null : 30 * 24 * 60 * 60,
            repeatable,
            privilegeDescription: newDesc || t(`shop.productTemplates.${selectedTemplate}.promise`),
          }
      return fetchApi(`/api/servers/${server!.id}/shop/products`, {
        method: 'POST',
        body: JSON.stringify({
          name: newName.trim(),
          slug: makeProductSlug(newName),
          type: isPhysical ? 'physical' : 'entitlement',
          status: 'active',
          basePrice: Number(newPrice),
          description: newDesc || t(`shop.productTemplates.${selectedTemplate}.promise`),
          summary: newDesc || t(`shop.productTemplates.${selectedTemplate}.summary`),
          tags: [...new Set([...baseTags, ...customTags])],
          globalPublic,
          entitlementConfig,
          media: coverUrl
            ? [{ type: 'image', url: coverUrl, thumbnailUrl: coverUrl, position: 0 }]
            : undefined,
        }),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shop-products-admin', server?.id] })
      queryClient.invalidateQueries({ queryKey: ['shop-products', server?.id] })
      setShowCreate(false)
      setNewName('')
      setNewPrice('')
      setNewDesc('')
      setNewTags('')
      setGlobalPublic(false)
      setSelectedTemplate('ai_service')
      setRepeatable(true)
      setCoverUrl(null)
      setCoverPreviewUrl(null)
    },
    onError: (err: Error) => showToast(err.message, 'error'),
  })

  const deleteMutation = useMutation({
    mutationFn: (productId: string) =>
      fetchApi(`/api/servers/${server!.id}/shop/products/${productId}`, { method: 'DELETE' }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['shop-products-admin', server?.id] }),
  })

  const pickCover = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      showToast(t('shop.mediaPermissionDenied'), 'error')
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [3, 2],
      quality: 0.85,
    })
    if (result.canceled || !result.assets[0]) return

    setUploadingCover(true)
    try {
      const asset = result.assets[0]
      const formData = new FormData()
      formData.append('file', {
        uri: asset.uri,
        name: asset.fileName || 'product-cover.jpg',
        type: asset.mimeType || 'image/jpeg',
      } as unknown as Blob)
      const data = await fetchApi<{ url: string; signedUrl?: string }>('/api/media/upload', {
        method: 'POST',
        body: formData,
      })
      setCoverUrl(data.url)
      setCoverPreviewUrl(data.signedUrl ?? getImageUrl(data.url))
    } catch (err) {
      showToast(err instanceof Error ? err.message : t('shop.coverUploadFailed'), 'error')
    } finally {
      setUploadingCover(false)
    }
  }

  const resetCreateForm = () => {
    setShowCreate(false)
    setNewName('')
    setNewPrice('')
    setNewDesc('')
    setNewTags('')
    setGlobalPublic(false)
    setRepeatable(true)
    setCoverUrl(null)
    setCoverPreviewUrl(null)
  }

  const getProductImage = (product: Product) => {
    const url = product.media?.[0]?.thumbnailUrl ?? product.media?.[0]?.url ?? product.imageUrl
    return getImageUrl(url)
  }

  if (isLoading) return <LoadingScreen />

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Pressable
        style={[styles.addBtn, { backgroundColor: colors.primary }]}
        onPress={() => setShowCreate(true)}
      >
        <Plus size={iconSize.lg} color={palette.foundation} />
        <Text style={{ color: palette.foundation, fontWeight: '700' }}>{t('shop.addProduct')}</Text>
      </Pressable>

      {products.length === 0 ? (
        <EmptyState icon={Package} title={t('shop.noProducts')} />
      ) : (
        <FlatList
          data={products}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              <View style={[styles.thumb, { backgroundColor: colors.inputBackground }]}>
                {getProductImage(item) ? (
                  <Image source={{ uri: getProductImage(item)! }} style={styles.thumbImage} />
                ) : (
                  <Package size={iconSize['2xl']} color={colors.textMuted} />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: colors.text }]}>{item.name}</Text>
                <Text style={{ color: colors.primary, fontWeight: '700' }}>
                  <PriceCompact amount={item.basePrice ?? item.price ?? 0} size={iconSize.sm} />
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: fontSize.xs }}>
                  {item.status} · {item.stock != null ? `${t('shop.stock')}: ${item.stock}` : '∞'}
                </Text>
              </View>
              <Pressable onPress={() => deleteMutation.mutate(item.id)} style={styles.iconBtn}>
                <Trash2 size={iconSize.lg} color={palette.crimson} />
              </Pressable>
            </View>
          )}
        />
      )}

      <Modal visible={showCreate} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={resetCreateForm}>
          <View
            style={[styles.modalContent, { backgroundColor: colors.surface }]}
            onStartShouldSetResponder={() => true}
          >
            <Text style={[styles.modalTitle, { color: colors.text }]}>{t('shop.addProduct')}</Text>

            <View style={styles.templateGrid}>
              {PRODUCT_TEMPLATES.map((template) => {
                const Icon = template.icon
                const active = selectedTemplate === template.key
                return (
                  <Pressable
                    key={template.key}
                    style={[
                      styles.templateChip,
                      {
                        backgroundColor: active ? colors.surfaceHover : colors.inputBackground,
                        borderColor: active ? colors.primary : colors.border,
                      },
                    ]}
                    onPress={() => setSelectedTemplate(template.key)}
                  >
                    <Icon size={iconSize.md} color={active ? colors.primary : colors.textMuted} />
                    <Text
                      style={[
                        styles.templateText,
                        { color: active ? colors.primary : colors.text },
                      ]}
                    >
                      {t(`shop.productTemplates.${template.key}.label`)}
                    </Text>
                  </Pressable>
                )
              })}
            </View>

            <Pressable
              style={[
                styles.coverPicker,
                {
                  backgroundColor: colors.inputBackground,
                  borderColor: colors.border,
                },
              ]}
              onPress={pickCover}
              disabled={uploadingCover}
            >
              {coverPreviewUrl ? (
                <>
                  <Image source={{ uri: coverPreviewUrl }} style={styles.coverImage} />
                  <Pressable
                    style={[styles.removeCoverBtn, { backgroundColor: colors.surface }]}
                    onPress={() => {
                      setCoverUrl(null)
                      setCoverPreviewUrl(null)
                    }}
                  >
                    <X size={iconSize.md} color={colors.text} />
                  </Pressable>
                </>
              ) : (
                <View style={styles.coverPlaceholder}>
                  <ImagePlus size={iconSize['4xl']} color={colors.primary} />
                  <Text style={[styles.coverTitle, { color: colors.text }]}>
                    {uploadingCover ? t('shop.uploadingCover') : t('shop.uploadCover')}
                  </Text>
                  <Text style={[styles.coverHint, { color: colors.textMuted }]}>
                    {t('shop.coverHint')}
                  </Text>
                </View>
              )}
            </Pressable>

            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.inputBackground,
                  color: colors.text,
                  borderColor: colors.border,
                },
              ]}
              value={newName}
              onChangeText={setNewName}
              placeholder={t('shop.productName')}
              placeholderTextColor={colors.textMuted}
            />
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.inputBackground,
                  color: colors.text,
                  borderColor: colors.border,
                  marginTop: spacing.sm,
                },
              ]}
              value={newPrice}
              onChangeText={setNewPrice}
              placeholder={t('shop.price')}
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
            />
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.inputBackground,
                  color: colors.text,
                  borderColor: colors.border,
                  marginTop: spacing.sm,
                },
              ]}
              value={newTags}
              onChangeText={setNewTags}
              placeholder={t('commerceMarketplace.productTagsPlaceholder')}
              placeholderTextColor={colors.textMuted}
            />
            <View style={styles.repeatableRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.repeatableTitle, { color: colors.text }]}>
                  {t('commerceMarketplace.globalPublic')}
                </Text>
                <Text style={[styles.repeatableHint, { color: colors.textMuted }]}>
                  {t('commerceMarketplace.globalPublicHint')}
                </Text>
              </View>
              <Switch value={globalPublic} onValueChange={setGlobalPublic} />
            </View>
            {selectedTemplate !== 'physical' && (
              <View style={styles.repeatableRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.repeatableTitle, { color: colors.text }]}>
                    {t('commerce.repeatablePurchase')}
                  </Text>
                  <Text style={[styles.repeatableHint, { color: colors.textMuted }]}>
                    {t('commerce.repeatablePurchaseHint')}
                  </Text>
                </View>
                <Switch value={repeatable} onValueChange={setRepeatable} />
              </View>
            )}
            <TextInput
              style={[
                styles.input,
                styles.textArea,
                {
                  backgroundColor: colors.inputBackground,
                  color: colors.text,
                  borderColor: colors.border,
                  marginTop: spacing.sm,
                },
              ]}
              value={newDesc}
              onChangeText={setNewDesc}
              placeholder={t('shop.description')}
              placeholderTextColor={colors.textMuted}
              multiline
            />

            <View style={styles.modalActions}>
              <Pressable onPress={resetCreateForm}>
                <Text style={{ color: colors.textSecondary }}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable
                style={[styles.createBtn, { backgroundColor: colors.primary }]}
                onPress={() => createMutation.mutate()}
                disabled={!newName.trim() || !newPrice.trim() || createMutation.isPending}
              >
                <Text style={{ color: palette.foundation, fontWeight: '700' }}>
                  {t('common.create')}
                </Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    margin: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    justifyContent: 'center',
  },
  list: { padding: spacing.md, gap: spacing.sm },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: radius.xl,
    gap: spacing.md,
  },
  thumb: {
    width: size.navBar,
    height: size.navBar,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbImage: { width: '100%', height: '100%' },
  name: { fontSize: fontSize.md, fontWeight: '700' },
  iconBtn: { padding: spacing.sm },
  modalOverlay: {
    flex: 1,
    backgroundColor: palette.black,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  modalContent: { borderRadius: radius.xl, padding: spacing.xl },
  modalTitle: { fontSize: fontSize.xl, fontWeight: '800', marginBottom: spacing.lg },
  templateGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  templateChip: {
    minWidth: '30%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: border.hairline,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  templateText: { fontSize: fontSize.xs, fontWeight: '800' },
  coverPicker: {
    aspectRatio: 3 / 2,
    borderRadius: radius.xl,
    borderWidth: border.hairline,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  coverImage: { width: '100%', height: '100%' },
  coverPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  coverTitle: { marginTop: spacing.sm, fontSize: fontSize.md, fontWeight: '700' },
  coverHint: { marginTop: spacing.xs, fontSize: fontSize.xs, textAlign: 'center' },
  repeatableRow: {
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  repeatableTitle: { fontSize: fontSize.sm, fontWeight: '800' },
  repeatableHint: { marginTop: spacing.xs, fontSize: fontSize.xs },
  removeCoverBtn: {
    position: 'absolute',
    right: spacing.sm,
    top: spacing.sm,
    width: size.iconButtonSm,
    height: size.iconButtonSm,
    borderRadius: radius['2lg'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    height: size.controlMd,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.md,
    borderWidth: border.hairline,
  },
  textArea: { height: size.textareaMin, paddingTop: spacing.md, textAlignVertical: 'top' },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.lg,
    marginTop: spacing.xl,
    alignItems: 'center',
  },
  createBtn: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
  },
})
