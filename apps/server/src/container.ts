import { type AwilixContainer, asClass, asValue, createContainer, InjectionMode } from 'awilix'
import type { Server as SocketIOServer } from 'socket.io'
import { AgentDao } from './dao/agent.dao'
import { AgentDashboardDao } from './dao/agent-dashboard.dao'
import { AgentListingDao } from './dao/agent-listing.dao'
import { AgentPolicyDao } from './dao/agent-policy.dao'
import { ApiTokenDao } from './dao/api-token.dao'
import { AppIntegrationDao } from './dao/app-integration.dao'
import { CartDao } from './dao/cart.dao'
import { ChannelDao } from './dao/channel.dao'
import { ChannelJoinRequestDao } from './dao/channel-join-request.dao'
import { ChannelMemberDao } from './dao/channel-member.dao'
import { CloudActivityDao } from './dao/cloud-activity.dao'
import { CloudClusterDao } from './dao/cloud-cluster.dao'
import { CloudConfigDao } from './dao/cloud-config.dao'
import { CloudDeploymentDao } from './dao/cloud-deployment.dao'
import { CloudDeploymentBackupDao } from './dao/cloud-deployment-backup.dao'
import { CloudEnvVarDao } from './dao/cloud-envvar.dao'
import { CloudTemplateDao } from './dao/cloud-template.dao'
import { CloudUsageDao } from './dao/cloud-usage.dao'
import { ConnectorDao } from './dao/connector.dao'
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
import { ServerJoinRequestDao } from './dao/server-join-request.dao'
import { ShopDao } from './dao/shop.dao'
import { TaskCenterDao } from './dao/task-center.dao'
// DAO classes
import { UserDao } from './dao/user.dao'
import { UserSessionDao } from './dao/user-session.dao'
import { WalletDao } from './dao/wallet.dao'
import { WorkspaceDao } from './dao/workspace.dao'
import { WorkspaceNodeDao } from './dao/workspace-node.dao'
import type { Database } from './db'
import { CommandGateway } from './gateways/command.gateway'
import { KubernetesOpsGateway } from './gateways/kubernetes-ops.gateway'
import { MediaAccessGateway } from './gateways/media-access.gateway'
import { SafeHttpClient } from './gateways/safe-http-client'
// Lib
import { logger } from './lib/logger'
import { AccessService } from './security/access.service'
import { AgentService } from './services/agent.service'
import { AgentDashboardService } from './services/agent-dashboard.service'
import { AgentPolicyService } from './services/agent-policy.service'
import { AppIntegrationService } from './services/app-integration.service'
import { AppIntegrationEventBus } from './services/app-integration-event-bus'
import { AuditLogService } from './services/audit-log.service'
// Service classes
import { AuthService } from './services/auth.service'
import { BuddyInboxService } from './services/buddy-inbox.service'
import { CartService } from './services/cart.service'
import { ChannelService } from './services/channel.service'
import { ChannelAccessService } from './services/channel-access.service'
import { CloudService } from './services/cloud.service'
import { CloudUsageService } from './services/cloud-usage.service'
import { CommerceCardService } from './services/commerce-card.service'
import { CommerceCheckoutService } from './services/commerce-checkout.service'
import { CommerceFulfillmentService } from './services/commerce-fulfillment.service'
import { CommerceOfferService } from './services/commerce-offer.service'
import { CommunityAssetService } from './services/community-asset.service'
import { ConnectorService } from './services/connector.service'
import { DiyCloudRunService } from './services/diy-cloud-run.service'
import { EconomyAuditService } from './services/economy-audit.service'
import { EconomyIdempotencyService } from './services/economy-idempotency.service'
import { EconomyPolicyService } from './services/economy-policy.service'
import { EntitlementService } from './services/entitlement.service'
import { EntitlementAccessService } from './services/entitlement-access.service'
import { EntitlementCancellationService } from './services/entitlement-cancellation.service'
import { EntitlementProvisionerService } from './services/entitlement-provisioner.service'
import { EntitlementPurchaseService } from './services/entitlement-purchase.service'
import { EntitlementRenewalService } from './services/entitlement-renewal.service'
import { ExternalOAuthService } from './services/external-oauth.service'
import { FriendshipService } from './services/friendship.service'
import { GiftService } from './services/gift.service'
import { GreetingService } from './services/greeting.service'
import { LedgerService } from './services/ledger.service'
import { MediaService } from './services/media.service'
import { MembershipService } from './services/membership.service'
import { MentionService } from './services/mention.service'
import { MessageService } from './services/message.service'
import { ModelProxyService } from './services/model-proxy.service'
import { NotificationService } from './services/notification.service'
import { NotificationDeliveryService } from './services/notification-delivery.service'
import { NotificationPlatformService } from './services/notification-platform.service'
import { NotificationTemplateService } from './services/notification-template.service'
import { NotificationTriggerService } from './services/notification-trigger.service'
import { OAuthService } from './services/oauth.service'
import { OrderService } from './services/order.service'
import { PaidFileService } from './services/paid-file.service'
import { PermissionService } from './services/permission.service'
import { PlayLaunchService } from './services/play-launch.service'
import { PolicyService } from './services/policy.service'
import { ProductService } from './services/product.service'
import { RechargeService } from './services/recharge.service'
import { RentalService } from './services/rental.service'
import { ReviewService } from './services/review.service'
import { SearchService } from './services/search.service'
import { ServerService } from './services/server.service'
import { SettlementService } from './services/settlement.service'
import { ShopService } from './services/shop.service'
import { ShopScopeService } from './services/shop-scope.service'
import { TaskCenterService } from './services/task-center.service'
import { TipService } from './services/tip.service'
import { VoiceChannelService } from './services/voice-channel.service'
import { VoiceEnhanceService } from './services/voice-enhance.service'
import { WalletService } from './services/wallet.service'
import { WorkspaceService } from './services/workspace.service'
import { AdminUseCase } from './usecases/admin.usecase'
import { ApiTokenUseCase } from './usecases/api-token.usecase'
import { AuthUseCase } from './usecases/auth.usecase'
import { ChannelUseCase } from './usecases/channel.usecase'
import { CloudUseCase } from './usecases/cloud.usecase'
import { CloudSaasUseCase } from './usecases/cloud-saas.usecase'
import { InviteUseCase } from './usecases/invite.usecase'
import { NotificationUseCase } from './usecases/notification.usecase'
import { ProductUseCase } from './usecases/product.usecase'
import { ProfileCommentUseCase } from './usecases/profile-comment.usecase'
import { ServerUseCase } from './usecases/server.usecase'
import { ShopUseCase } from './usecases/shop.usecase'

const noopSocketServer = {
  to: () => ({
    emit: () => undefined,
  }),
} as unknown as SocketIOServer

export interface Cradle {
  // Infrastructure
  db: Database
  logger: typeof logger
  io: SocketIOServer

  // Security architecture
  accessService: AccessService
  auditLogService: AuditLogService
  safeHttpClient: SafeHttpClient
  kubernetesOpsGateway: KubernetesOpsGateway
  mediaAccessGateway: MediaAccessGateway
  commandGateway: CommandGateway
  cloudUseCase: CloudUseCase
  cloudSaasUseCase: CloudSaasUseCase
  adminUseCase: AdminUseCase
  notificationUseCase: NotificationUseCase
  inviteUseCase: InviteUseCase
  profileCommentUseCase: ProfileCommentUseCase
  authUseCase: AuthUseCase
  apiTokenUseCase: ApiTokenUseCase
  channelUseCase: ChannelUseCase
  serverUseCase: ServerUseCase
  shopUseCase: ShopUseCase
  productUseCase: ProductUseCase

  // DAOs
  userDao: UserDao
  serverDao: ServerDao
  serverJoinRequestDao: ServerJoinRequestDao
  apiTokenDao: ApiTokenDao
  channelDao: ChannelDao
  channelJoinRequestDao: ChannelJoinRequestDao
  channelMemberDao: ChannelMemberDao
  messageDao: MessageDao
  notificationDao: NotificationDao
  agentDao: AgentDao
  appIntegrationDao: AppIntegrationDao
  agentPolicyDao: AgentPolicyDao
  agentDashboardDao: AgentDashboardDao
  friendshipDao: FriendshipDao
  inviteCodeDao: InviteCodeDao
  oauthAppDao: OAuthAppDao
  oauthAccountDao: OAuthAccountDao
  taskCenterDao: TaskCenterDao
  userSessionDao: UserSessionDao

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
  agentListingDao: AgentListingDao
  rentalContractDao: RentalContractDao
  rentalUsageDao: RentalUsageDao
  rentalViolationDao: RentalViolationDao

  // Cloud DAOs
  cloudDeploymentDao: CloudDeploymentDao
  cloudDeploymentBackupDao: CloudDeploymentBackupDao
  cloudTemplateDao: CloudTemplateDao
  cloudConfigDao: CloudConfigDao
  cloudEnvVarDao: CloudEnvVarDao
  cloudClusterDao: CloudClusterDao
  cloudActivityDao: CloudActivityDao
  cloudUsageDao: CloudUsageDao
  connectorDao: ConnectorDao
  // Cloud Service
  cloudService: CloudService
  cloudUsageService: CloudUsageService
  diyCloudRunService: DiyCloudRunService
  connectorService: ConnectorService

  // Profile Comment DAOs
  profileCommentDao: ProfileCommentDao

  // Password Change Log DAOs
  passwordChangeLogDao: PasswordChangeLogDao

  // Recharge DAOs
  rechargeDao: RechargeDao

  // Services
  authService: AuthService
  buddyInboxService: BuddyInboxService
  oauthService: OAuthService
  externalOAuthService: ExternalOAuthService
  serverService: ServerService
  channelService: ChannelService
  channelAccessService: ChannelAccessService
  messageService: MessageService
  searchService: SearchService
  mentionService: MentionService
  notificationService: NotificationService
  notificationTemplateService: NotificationTemplateService
  notificationDeliveryService: NotificationDeliveryService
  notificationPlatformService: NotificationPlatformService
  notificationTriggerService: NotificationTriggerService
  commerceCardService: CommerceCardService
  commerceCheckoutService: CommerceCheckoutService
  commerceOfferService: CommerceOfferService
  commerceFulfillmentService: CommerceFulfillmentService
  communityAssetService: CommunityAssetService
  economyAuditService: EconomyAuditService
  economyIdempotencyService: EconomyIdempotencyService
  economyPolicyService: EconomyPolicyService
  giftService: GiftService
  settlementService: SettlementService
  tipService: TipService
  permissionService: PermissionService
  policyService: PolicyService
  friendshipService: FriendshipService
  mediaService: MediaService
  agentService: AgentService
  appIntegrationService: AppIntegrationService
  appIntegrationEventBus: AppIntegrationEventBus
  agentPolicyService: AgentPolicyService
  shopService: ShopService
  shopScopeService: ShopScopeService
  productService: ProductService
  ledgerService: LedgerService
  walletService: WalletService
  cartService: CartService
  orderService: OrderService
  reviewService: ReviewService
  entitlementService: EntitlementService
  entitlementAccessService: EntitlementAccessService
  entitlementProvisionerService: EntitlementProvisionerService
  entitlementPurchaseService: EntitlementPurchaseService
  entitlementRenewalService: EntitlementRenewalService
  entitlementCancellationService: EntitlementCancellationService
  paidFileService: PaidFileService
  workspaceService: WorkspaceService
  rentalService: RentalService
  taskCenterService: TaskCenterService
  rechargeService: RechargeService
  voiceEnhanceService: VoiceEnhanceService
  voiceChannelService: VoiceChannelService
  agentDashboardService: AgentDashboardService
  membershipService: MembershipService
  greetingService: GreetingService
  playLaunchService: PlayLaunchService
  modelProxyService: ModelProxyService
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
    io: asValue(noopSocketServer),

    // Security architecture
    accessService: asClass(AccessService).singleton(),
    auditLogService: asClass(AuditLogService).singleton(),
    safeHttpClient: asClass(SafeHttpClient).singleton(),
    kubernetesOpsGateway: asClass(KubernetesOpsGateway).singleton(),
    mediaAccessGateway: asClass(MediaAccessGateway).singleton(),
    commandGateway: asClass(CommandGateway).singleton(),
    cloudUseCase: asClass(CloudUseCase).singleton(),
    cloudSaasUseCase: asClass(CloudSaasUseCase).singleton(),
    adminUseCase: asClass(AdminUseCase).singleton(),
    notificationUseCase: asClass(NotificationUseCase).singleton(),
    inviteUseCase: asClass(InviteUseCase).singleton(),
    profileCommentUseCase: asClass(ProfileCommentUseCase).singleton(),
    authUseCase: asClass(AuthUseCase).singleton(),
    apiTokenUseCase: asClass(ApiTokenUseCase).singleton(),
    channelUseCase: asClass(ChannelUseCase).singleton(),
    serverUseCase: asClass(ServerUseCase).singleton(),
    shopUseCase: asClass(ShopUseCase).singleton(),
    productUseCase: asClass(ProductUseCase).singleton(),

    // DAOs
    userDao: asClass(UserDao).singleton(),
    serverDao: asClass(ServerDao).singleton(),
    serverJoinRequestDao: asClass(ServerJoinRequestDao).singleton(),
    apiTokenDao: asClass(ApiTokenDao).singleton(),
    channelDao: asClass(ChannelDao).singleton(),
    channelJoinRequestDao: asClass(ChannelJoinRequestDao).singleton(),
    channelMemberDao: asClass(ChannelMemberDao).singleton(),
    messageDao: asClass(MessageDao).singleton(),
    notificationDao: asClass(NotificationDao).singleton(),
    agentDao: asClass(AgentDao).singleton(),
    appIntegrationDao: asClass(AppIntegrationDao).singleton(),
    agentPolicyDao: asClass(AgentPolicyDao).singleton(),
    friendshipDao: asClass(FriendshipDao).singleton(),
    inviteCodeDao: asClass(InviteCodeDao).singleton(),
    oauthAppDao: asClass(OAuthAppDao).singleton(),
    oauthAccountDao: asClass(OAuthAccountDao).singleton(),
    taskCenterDao: asClass(TaskCenterDao).singleton(),
    userSessionDao: asClass(UserSessionDao).singleton(),

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
    agentListingDao: asClass(AgentListingDao).singleton(),
    rentalContractDao: asClass(RentalContractDao).singleton(),
    rentalUsageDao: asClass(RentalUsageDao).singleton(),
    rentalViolationDao: asClass(RentalViolationDao).singleton(),

    // Dashboard DAOs
    agentDashboardDao: asClass(AgentDashboardDao).singleton(),

    // Cloud DAOs
    cloudDeploymentDao: asClass(CloudDeploymentDao).singleton(),
    cloudDeploymentBackupDao: asClass(CloudDeploymentBackupDao).singleton(),
    cloudTemplateDao: asClass(CloudTemplateDao).singleton(),
    cloudConfigDao: asClass(CloudConfigDao).singleton(),
    cloudEnvVarDao: asClass(CloudEnvVarDao).singleton(),
    cloudClusterDao: asClass(CloudClusterDao).singleton(),
    cloudActivityDao: asClass(CloudActivityDao).singleton(),
    cloudUsageDao: asClass(CloudUsageDao).singleton(),
    connectorDao: asClass(ConnectorDao).singleton(),
    // Profile Comment DAOs
    profileCommentDao: asClass(ProfileCommentDao).singleton(),

    // Password Change Log DAOs
    passwordChangeLogDao: asClass(PasswordChangeLogDao).singleton(),

    // Recharge DAOs
    rechargeDao: asClass(RechargeDao).singleton(),

    // Services
    authService: asClass(AuthService).singleton(),
    buddyInboxService: asClass(BuddyInboxService).singleton(),
    oauthService: asClass(OAuthService).singleton(),
    externalOAuthService: asClass(ExternalOAuthService).singleton(),
    serverService: asClass(ServerService).singleton(),
    channelService: asClass(ChannelService).singleton(),
    channelAccessService: asClass(ChannelAccessService).singleton(),
    messageService: asClass(MessageService).singleton(),
    searchService: asClass(SearchService).singleton(),
    mentionService: asClass(MentionService).singleton(),
    notificationService: asClass(NotificationService).singleton(),
    notificationTemplateService: asClass(NotificationTemplateService).singleton(),
    notificationDeliveryService: asClass(NotificationDeliveryService).singleton(),
    notificationPlatformService: asClass(NotificationPlatformService).singleton(),
    notificationTriggerService: asClass(NotificationTriggerService).singleton(),
    commerceCardService: asClass(CommerceCardService).singleton(),
    commerceCheckoutService: asClass(CommerceCheckoutService).singleton(),
    commerceOfferService: asClass(CommerceOfferService).singleton(),
    commerceFulfillmentService: asClass(CommerceFulfillmentService).singleton(),
    communityAssetService: asClass(CommunityAssetService).singleton(),
    economyAuditService: asClass(EconomyAuditService).singleton(),
    economyIdempotencyService: asClass(EconomyIdempotencyService).singleton(),
    economyPolicyService: asClass(EconomyPolicyService).singleton(),
    giftService: asClass(GiftService).singleton(),
    settlementService: asClass(SettlementService).singleton(),
    tipService: asClass(TipService).singleton(),
    permissionService: asClass(PermissionService).singleton(),
    policyService: asClass(PolicyService).singleton(),
    friendshipService: asClass(FriendshipService).singleton(),
    mediaService: asClass(MediaService).singleton(),
    agentService: asClass(AgentService).singleton(),
    appIntegrationService: asClass(AppIntegrationService).singleton(),
    appIntegrationEventBus: asClass(AppIntegrationEventBus).singleton(),
    agentPolicyService: asClass(AgentPolicyService).singleton(),
    shopService: asClass(ShopService).singleton(),
    shopScopeService: asClass(ShopScopeService).singleton(),
    productService: asClass(ProductService).singleton(),
    ledgerService: asClass(LedgerService).singleton(),
    walletService: asClass(WalletService).singleton(),
    cartService: asClass(CartService).singleton(),
    orderService: asClass(OrderService).singleton(),
    reviewService: asClass(ReviewService).singleton(),
    entitlementService: asClass(EntitlementService).singleton(),
    entitlementAccessService: asClass(EntitlementAccessService).singleton(),
    entitlementProvisionerService: asClass(EntitlementProvisionerService).singleton(),
    entitlementPurchaseService: asClass(EntitlementPurchaseService).singleton(),
    entitlementRenewalService: asClass(EntitlementRenewalService).singleton(),
    entitlementCancellationService: asClass(EntitlementCancellationService).singleton(),
    paidFileService: asClass(PaidFileService).singleton(),
    workspaceService: asClass(WorkspaceService).singleton(),
    rentalService: asClass(RentalService).singleton(),
    taskCenterService: asClass(TaskCenterService).singleton(),
    rechargeService: asClass(RechargeService).singleton(),
    voiceEnhanceService: asClass(VoiceEnhanceService).singleton(),
    voiceChannelService: asClass(VoiceChannelService).singleton(),
    agentDashboardService: asClass(AgentDashboardService).singleton(),
    cloudService: asClass(CloudService).singleton(),
    cloudUsageService: asClass(CloudUsageService).singleton(),
    diyCloudRunService: asClass(DiyCloudRunService).singleton(),
    connectorService: asClass(ConnectorService).singleton(),
    membershipService: asClass(MembershipService).singleton(),
    greetingService: asClass(GreetingService).singleton(),
    playLaunchService: asClass(PlayLaunchService).singleton(),
    modelProxyService: asClass(ModelProxyService).singleton(),
  })

  return container
}
