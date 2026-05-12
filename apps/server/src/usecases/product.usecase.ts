import type { EntitlementConfigInput } from '../services/product.service'
import type { AccessService } from '../security/access.service'
import type { AuditLogService } from '../services/audit-log.service'
import type { CommerceOfferService } from '../services/commerce-offer.service'
import type { ProductService } from '../services/product.service'
import type { ServerService } from '../services/server.service'
import type { ShopService } from '../services/shop.service'
import type { SecureUseCaseInput } from './_security-usecase'
import { auditUseCase } from './_security-usecase'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type ProductData = {
  name: string
  slug: string
  type?: 'physical' | 'entitlement'
  billingMode?: 'one_time' | 'fixed_duration' | 'subscription'
  status?: 'draft' | 'active' | 'archived'
  description?: string
  summary?: string
  basePrice?: number
  specNames?: string[]
  tags?: string[]
  entitlementConfig?: EntitlementConfigInput
  categoryId?: string
  media?: Array<{ type?: string; url: string; thumbnailUrl?: string; position?: number }>
  skus?: Array<{
    id?: string
    specValues?: string[]
    price: number
    stock?: number
    imageUrl?: string
    skuCode?: string
  }>
}

export class ProductUseCase {
  constructor(
    private deps: {
      accessService: AccessService
      auditLogService: AuditLogService
      serverService: ServerService
      shopService: ShopService
      productService: ProductService
      commerceOfferService: CommerceOfferService
    },
  ) {}

  private async resolveServerId(identifier: string): Promise<string> {
    if (UUID_RE.test(identifier)) return identifier
    const server = await this.deps.serverService.getBySlug(identifier)
    return server.id
  }

  private async getOrCreateServerShop(serverId: string) {
    const server = await this.deps.serverService.getById(serverId)
    return this.deps.shopService.getOrCreateShop(server.id, server.name)
  }

  async getProducts(
    input: SecureUseCaseInput & {
      identifier: string
      userId: string
      status?: string
      categoryId?: string
      keyword?: string
      limit?: number
      offset?: number
    },
  ) {
    const serverId = await this.resolveServerId(input.identifier)
    const shop = await this.deps.shopService.getShopByServerId(serverId)
    if (!shop) return { products: [], total: 0 }

    let effectiveStatus = input.status
    try {
      await this.deps.accessService.requireServerAdmin(input.ctx.actor, serverId)
    } catch {
      effectiveStatus = 'active'
    }

    const [products, total] = await Promise.all([
      this.deps.productService.getProducts(shop.id, {
        status: effectiveStatus as 'draft' | 'active' | 'archived' | undefined,
        categoryId: input.categoryId,
        keyword: input.keyword,
        limit: input.limit,
        offset: input.offset,
      }),
      this.deps.productService.getProductCount(shop.id, {
        status: effectiveStatus as 'draft' | 'active' | 'archived' | undefined,
        categoryId: input.categoryId,
        keyword: input.keyword,
      }),
    ])
    return { products, total }
  }

  async getProductDetail(input: SecureUseCaseInput & { productId: string }) {
    return this.deps.productService.getProductDetail(input.productId)
  }

  async createProduct(
    input: SecureUseCaseInput & {
      identifier: string
      userId: string
      data: ProductData
    },
  ) {
    return auditUseCase(this.deps, input, {
      action: 'product.create',
      run: async () => {
        const serverId = await this.resolveServerId(input.identifier)
        await this.deps.accessService.requireServerAdmin(input.ctx.actor, serverId)
        const shop = await this.getOrCreateServerShop(serverId)
        const product = await this.deps.productService.createProduct(shop.id, input.data)
        await this.deps.commerceOfferService.ensureDefaultOfferForProduct({
          productId: product.id,
          sellerUserId: input.userId,
        })
        return product
      },
    })
  }

  async updateProduct(
    input: SecureUseCaseInput & {
      identifier: string
      productId: string
      data: Partial<ProductData>
    },
  ) {
    return auditUseCase(this.deps, input, {
      action: 'product.update',
      run: async () => {
        const serverId = await this.resolveServerId(input.identifier)
        await this.deps.accessService.requireServerAdmin(input.ctx.actor, serverId)
        const shop = await this.getOrCreateServerShop(serverId)
        return this.deps.productService.updateProductInShop(
          shop.id,
          input.productId,
          input.data,
        )
      },
    })
  }

  async deleteProduct(
    input: SecureUseCaseInput & {
      identifier: string
      productId: string
    },
  ) {
    return auditUseCase(this.deps, input, {
      action: 'product.delete',
      run: async () => {
        const serverId = await this.resolveServerId(input.identifier)
        await this.deps.accessService.requireServerAdmin(input.ctx.actor, serverId)
        const shop = await this.getOrCreateServerShop(serverId)
        return this.deps.productService.deleteProductInShop(shop.id, input.productId)
      },
    })
  }
}
