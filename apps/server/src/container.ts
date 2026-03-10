import { type AwilixContainer, asClass, asValue, createContainer, InjectionMode } from 'awilix'
import type { Server as SocketIOServer } from 'socket.io'
import { AgentDao } from './dao/agent.dao'
import { AgentPolicyDao } from './dao/agent-policy.dao'
import { ChannelDao } from './dao/channel.dao'
import { ChannelMemberDao } from './dao/channel-member.dao'
import { InviteCodeDao } from './dao/invite-code.dao'
import { MessageDao } from './dao/message.dao'
import { NotificationDao } from './dao/notification.dao'
import { ServerDao } from './dao/server.dao'
import { CartDao } from './dao/cart.dao'
import { EntitlementDao } from './dao/entitlement.dao'
import { OrderDao } from './dao/order.dao'
import { ProductCategoryDao } from './dao/product-category.dao'
import { ProductDao, ProductMediaDao, SkuDao } from './dao/product.dao'
import { ReviewDao } from './dao/review.dao'
import { ShopDao } from './dao/shop.dao'
import { WalletDao } from './dao/wallet.dao'
// DAO classes
import { UserDao } from './dao/user.dao'
import type { Database } from './db'
// Lib
import { logger } from './lib/logger'
import { AgentService } from './services/agent.service'
import { AgentPolicyService } from './services/agent-policy.service'
// Service classes
import { AuthService } from './services/auth.service'
import { ChannelService } from './services/channel.service'
import { DmService } from './services/dm.service'
import { MediaService } from './services/media.service'
import { MessageService } from './services/message.service'
import { NotificationService } from './services/notification.service'
import { PermissionService } from './services/permission.service'
import { SearchService } from './services/search.service'
import { ServerService } from './services/server.service'
import { ShopService } from './services/shop.service'
import { ProductService } from './services/product.service'
import { WalletService } from './services/wallet.service'
import { CartService } from './services/cart.service'
import { OrderService } from './services/order.service'
import { ReviewService } from './services/review.service'
import { EntitlementService } from './services/entitlement.service'

export interface Cradle {
  // Infrastructure
  db: Database
  logger: typeof logger
  io: SocketIOServer

  // DAOs
  userDao: UserDao
  serverDao: ServerDao
  channelDao: ChannelDao
  channelMemberDao: ChannelMemberDao
  messageDao: MessageDao
  notificationDao: NotificationDao
  agentDao: AgentDao
  agentPolicyDao: AgentPolicyDao
  inviteCodeDao: InviteCodeDao

  // Shop DAOs
  shopDao: ShopDao
  productDao: ProductDao
  productCategoryDao: ProductCategoryDao
  productMediaDao: ProductMediaDao
  skuDao: SkuDao
  walletDao: WalletDao
  orderDao: OrderDao
  reviewDao: ReviewDao
  entitlementDao: EntitlementDao
  cartDao: CartDao

  // Services
  authService: AuthService
  serverService: ServerService
  channelService: ChannelService
  messageService: MessageService
  searchService: SearchService
  notificationService: NotificationService
  permissionService: PermissionService
  dmService: DmService
  mediaService: MediaService
  agentService: AgentService
  agentPolicyService: AgentPolicyService
  shopService: ShopService
  productService: ProductService
  walletService: WalletService
  cartService: CartService
  orderService: OrderService
  reviewService: ReviewService
  entitlementService: EntitlementService
}

export type AppContainer = AwilixContainer<Cradle>

export function createAppContainer(db: Database): AppContainer {
  const container = createContainer<Cradle>({
    injectionMode: InjectionMode.PROXY,
    strict: true,
  })

  container.register({
    // Infrastructure
    db: asValue(db),
    logger: asValue(logger),

    // DAOs
    userDao: asClass(UserDao).singleton(),
    serverDao: asClass(ServerDao).singleton(),
    channelDao: asClass(ChannelDao).singleton(),
    channelMemberDao: asClass(ChannelMemberDao).singleton(),
    messageDao: asClass(MessageDao).singleton(),
    notificationDao: asClass(NotificationDao).singleton(),
    agentDao: asClass(AgentDao).singleton(),
    agentPolicyDao: asClass(AgentPolicyDao).singleton(),
    inviteCodeDao: asClass(InviteCodeDao).singleton(),

    // Shop DAOs
    shopDao: asClass(ShopDao).singleton(),
    productDao: asClass(ProductDao).singleton(),
    productCategoryDao: asClass(ProductCategoryDao).singleton(),
    productMediaDao: asClass(ProductMediaDao).singleton(),
    skuDao: asClass(SkuDao).singleton(),
    walletDao: asClass(WalletDao).singleton(),
    orderDao: asClass(OrderDao).singleton(),
    reviewDao: asClass(ReviewDao).singleton(),
    entitlementDao: asClass(EntitlementDao).singleton(),
    cartDao: asClass(CartDao).singleton(),

    // Services
    authService: asClass(AuthService).singleton(),
    serverService: asClass(ServerService).singleton(),
    channelService: asClass(ChannelService).singleton(),
    messageService: asClass(MessageService).singleton(),
    searchService: asClass(SearchService).singleton(),
    notificationService: asClass(NotificationService).singleton(),
    permissionService: asClass(PermissionService).singleton(),
    dmService: asClass(DmService).singleton(),
    mediaService: asClass(MediaService).singleton(),
    agentService: asClass(AgentService).singleton(),
    agentPolicyService: asClass(AgentPolicyService).singleton(),
    shopService: asClass(ShopService).singleton(),
    productService: asClass(ProductService).singleton(),
    walletService: asClass(WalletService).singleton(),
    cartService: asClass(CartService).singleton(),
    orderService: asClass(OrderService).singleton(),
    reviewService: asClass(ReviewService).singleton(),
    entitlementService: asClass(EntitlementService).singleton(),
  })

  return container
}
