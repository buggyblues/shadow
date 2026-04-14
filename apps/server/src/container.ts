import { type AwilixContainer, asClass, asValue, createContainer, InjectionMode } from 'awilix'
import type { Server as SocketIOServer } from 'socket.io'
import { AgentDao } from './dao/agent.dao'
import { AgentDashboardDao } from './dao/agent-dashboard.dao'
import { AgentPolicyDao } from './dao/agent-policy.dao'
import { ApiTokenDao } from './dao/api-token.dao'
import { AppDao } from './dao/app.dao'
import { CartDao } from './dao/cart.dao'
import { ChannelDao } from './dao/channel.dao'
import { ChannelMemberDao } from './dao/channel-member.dao'
import { ClawListingDao } from './dao/claw-listing.dao'
import { EntitlementDao } from './dao/entitlement.dao'
import { FriendshipDao } from './dao/friendship.dao'
import { InviteCodeDao } from './dao/invite-code.dao'
import { MessageDao } from './dao/message.dao'
import { NotificationDao } from './dao/notification.dao'
import { OAuthAppDao } from './dao/oauth.dao'
import { OAuthAccountDao } from './dao/oauth-account.dao'
import { OrderDao } from './dao/order.dao'
import { PasswordChangeLogDao } from './dao/password-change-log.dao'
import { ProductDao, ProductMediaDao, SkuDao } from './dao/product.dao'
import { ProductCategoryDao } from './dao/product-category.dao'
import { ProfileCommentDao } from './dao/profile-comment.dao'
import { RechargeDao } from './dao/recharge.dao'
import { RentalContractDao, RentalUsageDao, RentalViolationDao } from './dao/rental-contract.dao'
import { ReviewDao } from './dao/review.dao'
import { ServerDao } from './dao/server.dao'
import { ShopDao } from './dao/shop.dao'
import { TaskCenterDao } from './dao/task-center.dao'
// DAO classes
import { UserDao } from './dao/user.dao'
import { WalletDao } from './dao/wallet.dao'
import { WorkspaceDao } from './dao/workspace.dao'
import { WorkspaceNodeDao } from './dao/workspace-node.dao'
import type { Database } from './db'
// Lib
import { logger } from './lib/logger'
import { AgentService } from './services/agent.service'
import { AgentDashboardService } from './services/agent-dashboard.service'
import { AgentPolicyService } from './services/agent-policy.service'
import { AppService } from './services/app.service'
// Service classes
import { AuthService } from './services/auth.service'
import { CartService } from './services/cart.service'
import { ChannelService } from './services/channel.service'
import { DmService } from './services/dm.service'
import { EntitlementService } from './services/entitlement.service'
import { ExternalOAuthService } from './services/external-oauth.service'
import { FriendshipService } from './services/friendship.service'
import { MediaService } from './services/media.service'
import { MessageService } from './services/message.service'
import { NotificationService } from './services/notification.service'
import { OAuthService } from './services/oauth.service'
import { OrderService } from './services/order.service'
import { PermissionService } from './services/permission.service'
import { ProductService } from './services/product.service'
import { RechargeService } from './services/recharge.service'
import { RentalService } from './services/rental.service'
import { ReviewService } from './services/review.service'
import { SearchService } from './services/search.service'
import { ServerService } from './services/server.service'
import { ShopService } from './services/shop.service'
import { TaskCenterService } from './services/task-center.service'
import { VoiceEnhanceService } from './services/voice-enhance.service'
import { WalletService } from './services/wallet.service'
import { WorkspaceService } from './services/workspace.service'

export interface Cradle {
  // Infrastructure
  db: Database
  logger: typeof logger
  io: SocketIOServer

  // DAOs
  userDao: UserDao
  serverDao: ServerDao
  apiTokenDao: ApiTokenDao
  channelDao: ChannelDao
  channelMemberDao: ChannelMemberDao
  messageDao: MessageDao
  notificationDao: NotificationDao
  agentDao: AgentDao
  agentPolicyDao: AgentPolicyDao
  agentDashboardDao: AgentDashboardDao
  friendshipDao: FriendshipDao
  inviteCodeDao: InviteCodeDao
  oauthAppDao: OAuthAppDao
  oauthAccountDao: OAuthAccountDao
  taskCenterDao: TaskCenterDao

  // App DAOs
  appDao: AppDao

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

  // Workspace DAOs
  workspaceDao: WorkspaceDao
  workspaceNodeDao: WorkspaceNodeDao

  // Rental DAOs
  clawListingDao: ClawListingDao
  rentalContractDao: RentalContractDao
  rentalUsageDao: RentalUsageDao
  rentalViolationDao: RentalViolationDao

  // Profile Comment DAOs
  profileCommentDao: ProfileCommentDao

  // Password Change Log DAOs
  passwordChangeLogDao: PasswordChangeLogDao

  // Recharge DAOs
  rechargeDao: RechargeDao

  // Services
  authService: AuthService
  oauthService: OAuthService
  externalOAuthService: ExternalOAuthService
  serverService: ServerService
  channelService: ChannelService
  messageService: MessageService
  searchService: SearchService
  notificationService: NotificationService
  permissionService: PermissionService
  dmService: DmService
  friendshipService: FriendshipService
  mediaService: MediaService
  agentService: AgentService
  agentPolicyService: AgentPolicyService
  appService: AppService
  shopService: ShopService
  productService: ProductService
  walletService: WalletService
  cartService: CartService
  orderService: OrderService
  reviewService: ReviewService
  entitlementService: EntitlementService
  workspaceService: WorkspaceService
  rentalService: RentalService
  taskCenterService: TaskCenterService
  rechargeService: RechargeService
  voiceEnhanceService: VoiceEnhanceService
  agentDashboardService: AgentDashboardService
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
    apiTokenDao: asClass(ApiTokenDao).singleton(),
    channelDao: asClass(ChannelDao).singleton(),
    channelMemberDao: asClass(ChannelMemberDao).singleton(),
    messageDao: asClass(MessageDao).singleton(),
    notificationDao: asClass(NotificationDao).singleton(),
    agentDao: asClass(AgentDao).singleton(),
    agentPolicyDao: asClass(AgentPolicyDao).singleton(),
    friendshipDao: asClass(FriendshipDao).singleton(),
    inviteCodeDao: asClass(InviteCodeDao).singleton(),
    oauthAppDao: asClass(OAuthAppDao).singleton(),
    oauthAccountDao: asClass(OAuthAccountDao).singleton(),
    taskCenterDao: asClass(TaskCenterDao).singleton(),

    // App DAOs
    appDao: asClass(AppDao).singleton(),

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

    // Workspace DAOs
    workspaceDao: asClass(WorkspaceDao).singleton(),
    workspaceNodeDao: asClass(WorkspaceNodeDao).singleton(),

    // Rental DAOs
    clawListingDao: asClass(ClawListingDao).singleton(),
    rentalContractDao: asClass(RentalContractDao).singleton(),
    rentalUsageDao: asClass(RentalUsageDao).singleton(),
    rentalViolationDao: asClass(RentalViolationDao).singleton(),

    // Dashboard DAOs
    agentDashboardDao: asClass(AgentDashboardDao).singleton(),

    // Profile Comment DAOs
    profileCommentDao: asClass(ProfileCommentDao).singleton(),

    // Password Change Log DAOs
    passwordChangeLogDao: asClass(PasswordChangeLogDao).singleton(),

    // Recharge DAOs
    rechargeDao: asClass(RechargeDao).singleton(),

    // Services
    authService: asClass(AuthService).singleton(),
    oauthService: asClass(OAuthService).singleton(),
    externalOAuthService: asClass(ExternalOAuthService).singleton(),
    serverService: asClass(ServerService).singleton(),
    channelService: asClass(ChannelService).singleton(),
    messageService: asClass(MessageService).singleton(),
    searchService: asClass(SearchService).singleton(),
    notificationService: asClass(NotificationService).singleton(),
    permissionService: asClass(PermissionService).singleton(),
    dmService: asClass(DmService).singleton(),
    friendshipService: asClass(FriendshipService).singleton(),
    mediaService: asClass(MediaService).singleton(),
    agentService: asClass(AgentService).singleton(),
    agentPolicyService: asClass(AgentPolicyService).singleton(),
    appService: asClass(AppService).singleton(),
    shopService: asClass(ShopService).singleton(),
    productService: asClass(ProductService).singleton(),
    walletService: asClass(WalletService).singleton(),
    cartService: asClass(CartService).singleton(),
    orderService: asClass(OrderService).singleton(),
    reviewService: asClass(ReviewService).singleton(),
    entitlementService: asClass(EntitlementService).singleton(),
    workspaceService: asClass(WorkspaceService).singleton(),
    rentalService: asClass(RentalService).singleton(),
    taskCenterService: asClass(TaskCenterService).singleton(),
    rechargeService: asClass(RechargeService).singleton(),
    voiceEnhanceService: asClass(VoiceEnhanceService).singleton(),
    agentDashboardService: asClass(AgentDashboardService).singleton(),
  })

  return container
}
