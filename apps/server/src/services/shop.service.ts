import type { ProductCategoryDao } from '../dao/product-category.dao'
import type { ShopDao } from '../dao/shop.dao'

/**
 * ShopService — manages shop metadata and categories.
 * Each server has exactly one shop, auto-created on first access.
 */
export class ShopService {
  constructor(
    private deps: {
      shopDao: ShopDao
      productCategoryDao: ProductCategoryDao
    },
  ) {}

  /* ───────── Shop CRUD ───────── */

  async getOrCreateShop(serverId: string, serverName: string) {
    let shop = await this.deps.shopDao.findByServerId(serverId)
    if (!shop) {
      shop = await this.deps.shopDao.create({
        scopeKind: 'server',
        serverId,
        name: `${serverName}的店铺`,
      })
    }
    return shop!
  }

  async getOrCreatePersonalShop(ownerUserId: string, ownerName: string) {
    let shop = await this.deps.shopDao.findByOwnerUserId(ownerUserId)
    if (!shop) {
      shop = await this.deps.shopDao.create({
        scopeKind: 'user',
        ownerUserId,
        visibility: 'login_required',
        name: `${ownerName}的个人店铺`,
      })
    }
    return shop!
  }

  async getShopByServerId(serverId: string) {
    return this.deps.shopDao.findByServerId(serverId)
  }

  async getShopByOwnerUserId(ownerUserId: string) {
    return this.deps.shopDao.findByOwnerUserId(ownerUserId)
  }

  async getShopById(shopId: string) {
    return this.deps.shopDao.findById(shopId)
  }

  async updateShop(shopId: string, data: Parameters<ShopDao['update']>[1]) {
    return this.deps.shopDao.update(shopId, data)
  }

  /* ───────── Categories ───────── */

  async getCategories(shopId: string) {
    return this.deps.productCategoryDao.findByShopId(shopId)
  }

  async getCategoryById(categoryId: string) {
    return this.deps.productCategoryDao.findById(categoryId)
  }

  async createCategory(
    shopId: string,
    data: { name: string; slug: string; parentId?: string; position?: number; iconUrl?: string },
  ) {
    return this.deps.productCategoryDao.create({ shopId, ...data })
  }

  async updateCategory(id: string, data: Parameters<ProductCategoryDao['update']>[1]) {
    const category = await this.deps.productCategoryDao.findById(id)
    if (!category) return null
    return this.updateCategoryInShop(category.shopId, id, data)
  }

  async updateCategoryInShop(
    shopId: string,
    id: string,
    data: Parameters<ProductCategoryDao['update']>[1],
  ) {
    const category = await this.deps.productCategoryDao.findById(id)
    if (!category || category.shopId !== shopId) return null
    return this.deps.productCategoryDao.updateByShopIdAndId(shopId, id, data)
  }

  async deleteCategory(id: string) {
    const category = await this.deps.productCategoryDao.findById(id)
    if (!category) return
    return this.deleteCategoryInShop(category.shopId, id)
  }

  async deleteCategoryInShop(shopId: string, id: string) {
    const category = await this.deps.productCategoryDao.findById(id)
    if (!category || category.shopId !== shopId) return
    return this.deps.productCategoryDao.deleteByShopIdAndId(shopId, id)
  }
}
