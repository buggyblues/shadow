import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams } from 'expo-router'
import { Plus, Trash2 } from 'lucide-react-native'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { EmptyState } from '../../../../src/components/common/empty-state'
import { LoadingScreen } from '../../../../src/components/common/loading-screen'
import { PriceCompact } from '../../../../src/components/common/price-display'
import { fetchApi } from '../../../../src/lib/api'
import { showToast } from '../../../../src/lib/toast'
import { fontSize, radius, spacing, useColors } from '../../../../src/theme'

interface Product {
  id: string
  name: string
  description: string | null
  price: number
  imageUrl: string | null
  stock: number | null
  status: string
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

  const { data: server } = useQuery({
    queryKey: ['server', serverSlug],
    queryFn: () => fetchApi<{ id: string }>(`/api/servers/${serverSlug}`),
    enabled: !!serverSlug,
  })

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['shop-products-admin', server?.id],
    queryFn: () =>
      fetchApi<Product[]>(`/api/servers/${server!.id}/shop/products?includeInactive=true`),
    enabled: !!server?.id,
  })

  const createMutation = useMutation({
    mutationFn: () =>
      fetchApi(`/api/servers/${server!.id}/shop/products`, {
        method: 'POST',
        body: JSON.stringify({
          name: newName,
          price: Number(newPrice),
          description: newDesc || undefined,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shop-products-admin', server?.id] })
      setShowCreate(false)
      setNewName('')
      setNewPrice('')
      setNewDesc('')
    },
    onError: (err: Error) => showToast(err.message, 'error'),
  })

  const deleteMutation = useMutation({
    mutationFn: (productId: string) =>
      fetchApi(`/api/servers/${server!.id}/shop/products/${productId}`, { method: 'DELETE' }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['shop-products-admin', server?.id] }),
  })

  if (isLoading) return <LoadingScreen />

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Pressable
        style={[styles.addBtn, { backgroundColor: colors.primary }]}
        onPress={() => setShowCreate(true)}
      >
        <Plus size={18} color="#fff" />
        <Text style={{ color: '#fff', fontWeight: '700' }}>{t('shop.addProduct')}</Text>
      </Pressable>

      {products.length === 0 ? (
        <EmptyState icon="📦" title={t('shop.noProducts')} />
      ) : (
        <FlatList
          data={products}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: colors.text }]}>{item.name}</Text>
                <Text style={{ color: colors.primary, fontWeight: '700' }}>
                  <PriceCompact amount={item.price} size={14} />
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: fontSize.xs }}>
                  {item.status} · {item.stock != null ? `${t('shop.stock')}: ${item.stock}` : '∞'}
                </Text>
              </View>
              <Pressable onPress={() => deleteMutation.mutate(item.id)} style={styles.iconBtn}>
                <Trash2 size={18} color="#f23f43" />
              </Pressable>
            </View>
          )}
        />
      )}

      <Modal visible={showCreate} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setShowCreate(false)}>
          <View
            style={[styles.modalContent, { backgroundColor: colors.surface }]}
            onStartShouldSetResponder={() => true}
          >
            <Text style={[styles.modalTitle, { color: colors.text }]}>{t('shop.addProduct')}</Text>

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
              <Pressable onPress={() => setShowCreate(false)}>
                <Text style={{ color: colors.textSecondary }}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable
                style={[styles.createBtn, { backgroundColor: colors.primary }]}
                onPress={() => createMutation.mutate()}
                disabled={!newName.trim() || !newPrice.trim()}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>{t('common.create')}</Text>
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
  name: { fontSize: fontSize.md, fontWeight: '700' },
  iconBtn: { padding: spacing.sm },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  modalContent: { borderRadius: radius.xl, padding: spacing.xl },
  modalTitle: { fontSize: fontSize.xl, fontWeight: '800', marginBottom: spacing.lg },
  input: {
    height: 44,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.md,
    borderWidth: 1,
  },
  textArea: { height: 80, paddingTop: spacing.md, textAlignVertical: 'top' },
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
