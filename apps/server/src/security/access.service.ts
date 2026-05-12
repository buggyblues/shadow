import type { AppDao } from '../dao/app.dao'
import type { CloudDeploymentDao } from '../dao/cloud-deployment.dao'
import type { MessageDao } from '../dao/message.dao'
import type { OrderDao } from '../dao/order.dao'
import type { ProductDao } from '../dao/product.dao'
import type { ServerDao } from '../dao/server.dao'
import type { ShopDao } from '../dao/shop.dao'
import type { UserDao } from '../dao/user.dao'
import type { PolicyService } from '../services/policy.service'
import { type ActorInput, actorUserId } from './actor'
import { forbidden, notFoundForScope, platformAdminRequired, scopeMismatch } from './errors'

type ServerRole = 'owner' | 'admin' | 'member'

export class AccessService {
  constructor(
    private deps: {
      userDao: UserDao
      serverDao: ServerDao
      appDao: AppDao
      shopDao: ShopDao
      productDao: ProductDao
      orderDao: OrderDao
      messageDao: MessageDao
      cloudDeploymentDao: CloudDeploymentDao
      policyService: PolicyService
    },
  ) {}

  async requirePlatformAdmin(actor: ActorInput) {
    const userId = actorUserId(actor)
    const user = await this.deps.userDao.findById(userId)
    if (!user?.isAdmin) throw platformAdminRequired()
    return user
  }

  async requireServerRole(actor: ActorInput, serverId: string, minRole: ServerRole) {
    return this.deps.policyService.requireServerRole(actor, serverId, minRole)
  }

  async requireServerAdmin(actor: ActorInput, serverId: string) {
    return this.requireServerRole(actor, serverId, 'admin')
  }

  async requireServerOwner(actor: ActorInput, serverId: string) {
    return this.requireServerRole(actor, serverId, 'owner')
  }

  async requireAppManage(actor: ActorInput, serverId: string, appId: string) {
    await this.requireServerAdmin(actor, serverId)
    const app = await this.deps.appDao.findById(appId)
    if (!app) throw notFoundForScope('App not found')
    if (app.serverId !== serverId) throw scopeMismatch('App not found')
    return app
  }

  async requireShopManage(actor: ActorInput, shopId: string) {
    const userId = actorUserId(actor)
    const shop = await this.deps.shopDao.findById(shopId)
    if (!shop) throw notFoundForScope('Shop not found')

    if (shop.scopeKind === 'user') {
      if (shop.ownerUserId !== userId) throw scopeMismatch('Shop not found')
      return shop
    }

    if (!shop.serverId) throw scopeMismatch('Shop not found')
    await this.requireServerAdmin(actor, shop.serverId)
    return shop
  }

  async requireProductManage(actor: ActorInput, shopId: string, productId: string) {
    await this.requireShopManage(actor, shopId)
    const product = await this.deps.productDao.findById(productId)
    if (!product) throw notFoundForScope('Product not found')
    if (product.shopId !== shopId) throw scopeMismatch('Product not found')
    return product
  }

  async requireOrderManage(actor: ActorInput, shopId: string, orderId: string) {
    await this.requireShopManage(actor, shopId)
    const order = await this.deps.orderDao.findById(orderId)
    if (!order) throw notFoundForScope('Order not found')
    if (order.shopId !== shopId) throw scopeMismatch('Order not found')
    return order
  }

  async requireOrderRead(actor: ActorInput, orderId: string) {
    const userId = actorUserId(actor)
    const order = await this.deps.orderDao.findById(orderId)
    if (!order) throw notFoundForScope('Order not found')
    if (order.buyerId === userId) return order

    const shop = await this.deps.shopDao.findById(order.shopId)
    if (!shop) throw notFoundForScope('Order not found')
    if (shop.scopeKind === 'user' && shop.ownerUserId === userId) return order
    if (shop.serverId) {
      await this.requireServerAdmin(actor, shop.serverId)
      return order
    }

    throw scopeMismatch('Order not found')
  }

  async requireDeploymentOwner(actor: ActorInput, deploymentId: string) {
    const userId = actorUserId(actor)
    const deployment = await this.deps.cloudDeploymentDao.findById(deploymentId, userId)
    if (!deployment) throw notFoundForScope('Deployment not found')
    return deployment
  }

  async requireAttachmentRead(actor: ActorInput, attachmentId: string) {
    const attachment = await this.deps.messageDao.findAttachmentById(attachmentId)
    if (!attachment) throw notFoundForScope('Attachment not found')
    const message = await this.deps.messageDao.findById(attachment.messageId)
    if (!message) throw notFoundForScope('Attachment not found')
    await this.deps.policyService.requireChannelRead(actor, message.channelId)
    return { attachment, message }
  }

  async assertCanInstallAgentToServer(actor: ActorInput, serverId: string) {
    await this.requireServerAdmin(actor, serverId)
    return true
  }

  deny(message = 'Forbidden'): never {
    throw forbidden(message)
  }
}
