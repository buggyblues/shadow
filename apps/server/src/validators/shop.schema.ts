import { z } from 'zod'

/* ═══════════════ Shop ═══════════════ */

export const updateShopSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(2000).nullable().optional(),
  logoUrl: z.string().url().nullable().optional(),
  bannerUrl: z.string().url().nullable().optional(),
  settings: z.record(z.unknown()).optional(),
})

/* ═══════════════ Category ═══════════════ */

export const createCategorySchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100),
  parentId: z.string().uuid().optional(),
  position: z.number().int().min(0).optional(),
  iconUrl: z.string().url().optional(),
})

export const updateCategorySchema = createCategorySchema.partial()

/* ═══════════════ Product ═══════════════ */

export const mediaItemSchema = z.object({
  type: z.enum(['image', 'video']).optional().default('image'),
  url: z.string().min(1),
  thumbnailUrl: z.string().optional(),
  position: z.number().int().min(0).optional(),
})

export const skuItemSchema = z.object({
  id: z.string().uuid().optional(),
  specValues: z.array(z.string()).optional().default([]),
  price: z.number().int().min(0),
  stock: z.number().int().min(0).optional().default(0),
  imageUrl: z.string().optional(),
  skuCode: z.string().max(100).optional(),
  isActive: z.boolean().optional().default(true),
})

export const entitlementConfigSchema = z.object({
  type: z.enum(['channel_access', 'channel_speak', 'app_access', 'custom_role', 'custom']),
  targetId: z.string().optional(),
  durationSeconds: z.number().int().positive().nullable().optional(),
  privilegeDescription: z.string().max(500).optional(),
})

export const createProductSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(200),
  type: z.enum(['physical', 'entitlement']).optional().default('physical'),
  status: z.enum(['draft', 'active', 'archived']).optional().default('draft'),
  description: z.string().optional(),
  summary: z.string().max(500).optional(),
  basePrice: z.number().int().min(0).optional().default(0),
  specNames: z.array(z.string()).optional().default([]),
  tags: z.array(z.string()).optional().default([]),
  categoryId: z.string().uuid().optional(),
  entitlementConfig: entitlementConfigSchema.optional(),
  media: z.array(mediaItemSchema).optional(),
  skus: z.array(skuItemSchema).optional(),
})

export const updateProductSchema = createProductSchema.partial().extend({
  status: z.enum(['draft', 'active', 'archived']).optional(),
  media: z.array(mediaItemSchema).optional(),
  skus: z.array(skuItemSchema).optional(),
})

/* ═══════════════ Cart ═══════════════ */

export const addToCartSchema = z.object({
  productId: z.string().uuid(),
  skuId: z.string().uuid().optional(),
  quantity: z.number().int().min(1).max(99).optional().default(1),
})

export const updateCartItemSchema = z.object({
  quantity: z.number().int().min(0).max(99),
})

/* ═══════════════ Order ═══════════════ */

export const createOrderSchema = z.object({
  items: z.array(
    z.object({
      productId: z.string().uuid(),
      skuId: z.string().uuid().optional(),
      quantity: z.number().int().min(1).max(99).default(1),
    }),
  ).min(1),
  buyerNote: z.string().max(500).optional(),
})

export const updateOrderStatusSchema = z.object({
  status: z.enum(['processing', 'shipped', 'delivered', 'completed', 'cancelled', 'refunded']),
  trackingNo: z.string().max(100).optional(),
  sellerNote: z.string().max(500).optional(),
})

/* ═══════════════ Review ═══════════════ */

export const createReviewSchema = z.object({
  productId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  content: z.string().max(2000).optional(),
  images: z.array(z.string().url()).max(9).optional(),
})

export const replyReviewSchema = z.object({
  reply: z.string().min(1).max(2000),
})

/* ═══════════════ Wallet ═══════════════ */

export const topUpSchema = z.object({
  amount: z.number().int().min(1).max(1_000_000),
  note: z.string().max(200).optional(),
})
