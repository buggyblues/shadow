import type { ShopDao } from '../dao/shop.dao'
import type { ProductCategoryDao } from '../dao/product-category.dao'

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
      shop = await this.deps.shopDao.create({ serverId, name: `${serverName}的店铺` })
    }
    return shop!
  }

  async getShopByServerId(serverId: string) {
    return this.deps.shopDao.findByServerId(serverId)
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

  async createCategory(shopId: string, data: { name: string; slug: string; parentId?: string; position?: number; iconUrl?: string }) {
    return this.deps.productCategoryDao.create({ shopId, ...data })
  }

  async updateCategory(id: string, data: Parameters<ProductCategoryDao['update']>[1]) {
    return this.deps.productCategoryDao.update(id, data)
  }

  async deleteCategory(id: string) {
    return this.deps.productCategoryDao.delete(id)
  }
}
