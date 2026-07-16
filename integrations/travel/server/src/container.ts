import { AttachmentDao } from './dao/attachment.dao.js'
import { AuditDao } from './dao/audit.dao.js'
import { AutomationDao } from './dao/automation.dao.js'
import { BackupDao } from './dao/backup.dao.js'
import { BookingDao } from './dao/booking.dao.js'
import { BudgetDao } from './dao/budget.dao.js'
import { ClientStateDao } from './dao/client-state.dao.js'
import { CollaborationDao } from './dao/collaboration.dao.js'
import { CommunityDao } from './dao/community.dao.js'
import { EmergencyReportDao } from './dao/emergency-report.dao.js'
import { IdentityDao } from './dao/identity.dao.js'
import { MetadataDao } from './dao/metadata.dao.js'
import { NotificationDao } from './dao/notification.dao.js'
import { PackingDao } from './dao/packing.dao.js'
import { PlanningDao } from './dao/planning.dao.js'
import { ProviderCacheDao } from './dao/provider-cache.dao.js'
import { RecruitmentDao } from './dao/recruitment.dao.js'
import { SettingsDao } from './dao/settings.dao.js'
import { SyncDao } from './dao/sync.dao.js'
import { TodoDao } from './dao/todo.dao.js'
import { TripDao } from './dao/trip.dao.js'
import { type TravelDataStore, travelDatabaseFromEnv } from './db/database.js'
import { ShadowGateway } from './gateways/shadow.gateway.js'
import { TravelProviderGateway } from './gateways/travel-provider.gateway.js'
import { AccessPolicy } from './security/access-policy.js'
import { CommandSecurity } from './security/command-auth.js'
import { AttachmentService } from './services/attachment.service.js'
import { AuditService } from './services/audit.service.js'
import { AutomationService } from './services/automation.service.js'
import { BackupService } from './services/backup.service.js'
import { BookingService } from './services/booking.service.js'
import { BudgetService } from './services/budget.service.js'
import { ChannelMembershipSyncService } from './services/channel-membership-sync.service.js'
import { ClientStateService } from './services/client-state.service.js'
import { CollaborationService } from './services/collaboration.service.js'
import { CommunityService } from './services/community.service.js'
import { DashboardService } from './services/dashboard.service.js'
import { EmergencyReportService } from './services/emergency-report.service.js'
import { IdentityService } from './services/identity.service.js'
import { MetadataService } from './services/metadata.service.js'
import { NotificationService } from './services/notification.service.js'
import { PackingService } from './services/packing.service.js'
import { PlanningService } from './services/planning.service.js'
import { RecruitmentService } from './services/recruitment.service.js'
import { ReminderService } from './services/reminder.service.js'
import { SettingsService } from './services/settings.service.js'
import { TodoService } from './services/todo.service.js'
import { TripService } from './services/trip.service.js'
import { AuditUseCase } from './usecases/audit.usecase.js'
import { AutomationUseCase } from './usecases/automation.usecase.js'
import { BackupUseCase } from './usecases/backup.usecase.js'
import { BookingUseCase } from './usecases/booking.usecase.js'
import { BudgetUseCase } from './usecases/budget.usecase.js'
import { ClientStateUseCase } from './usecases/client-state.usecase.js'
import { CollaborationUseCase } from './usecases/collaboration.usecase.js'
import { CommunityUseCase } from './usecases/community.usecase.js'
import { EmergencyReportUseCase } from './usecases/emergency-report.usecase.js'
import { MetadataUseCase } from './usecases/metadata.usecase.js'
import { NotificationUseCase } from './usecases/notification.usecase.js'
import { PackingUseCase } from './usecases/packing.usecase.js'
import { PlanningUseCase } from './usecases/planning.usecase.js'
import { ProviderUseCase } from './usecases/provider.usecase.js'
import { RecruitmentUseCase } from './usecases/recruitment.usecase.js'
import { ReminderUseCase } from './usecases/reminder.usecase.js'
import { SettingsUseCase } from './usecases/settings.usecase.js'
import { SyncUseCase } from './usecases/sync.usecase.js'
import { TodoUseCase } from './usecases/todo.usecase.js'
import { TripUseCase } from './usecases/trip.usecase.js'
import { TravelEventBus } from './ws/travel-events.js'

export interface AppContainer {
  db: TravelDataStore
  eventBus: TravelEventBus
  shadowGateway: ShadowGateway
  providerGateway: TravelProviderGateway
  accessPolicy: AccessPolicy
  commandSecurity: CommandSecurity
  identityService: IdentityService
  communityUseCase: CommunityUseCase
  auditUseCase: AuditUseCase
  tripUseCase: TripUseCase
  planningUseCase: PlanningUseCase
  bookingUseCase: BookingUseCase
  budgetUseCase: BudgetUseCase
  packingUseCase: PackingUseCase
  collaborationUseCase: CollaborationUseCase
  clientStateUseCase: ClientStateUseCase
  emergencyReportUseCase: EmergencyReportUseCase
  automationUseCase: AutomationUseCase
  todoUseCase: TodoUseCase
  metadataUseCase: MetadataUseCase
  settingsUseCase: SettingsUseCase
  syncUseCase: SyncUseCase
  backupUseCase: BackupUseCase
  notificationUseCase: NotificationUseCase
  providerUseCase: ProviderUseCase
  reminderUseCase: ReminderUseCase
  recruitmentUseCase: RecruitmentUseCase
  channelMembershipSyncService: ChannelMembershipSyncService
}

export async function createAppContainer(): Promise<AppContainer> {
  const db = travelDatabaseFromEnv()
  await db.init()

  const tripDao = new TripDao(db)
  const auditDao = new AuditDao(db)
  const planningDao = new PlanningDao(db)
  const providerCacheDao = new ProviderCacheDao(db)
  const recruitmentDao = new RecruitmentDao(db)
  const bookingDao = new BookingDao(db)
  const budgetDao = new BudgetDao(db)
  const packingDao = new PackingDao(db)
  const attachmentDao = new AttachmentDao(db)
  const collaborationDao = new CollaborationDao(db)
  const clientStateDao = new ClientStateDao(db)
  const communityDao = new CommunityDao(db)
  const identityDao = new IdentityDao(db)
  const emergencyReportDao = new EmergencyReportDao(db)
  const automationDao = new AutomationDao(db)
  const todoDao = new TodoDao(db)
  const metadataDao = new MetadataDao(db)
  const settingsDao = new SettingsDao(db)
  const syncDao = new SyncDao(db)
  const backupDao = new BackupDao(db)
  const notificationDao = new NotificationDao(db)

  const eventBus = new TravelEventBus()
  const shadowGateway = new ShadowGateway()
  const providerGateway = new TravelProviderGateway(providerCacheDao)
  const accessPolicy = new AccessPolicy(tripDao, communityDao)
  const identityService = new IdentityService(identityDao)
  const commandSecurity = new CommandSecurity()

  const auditService = new AuditService(auditDao)
  const planningService = new PlanningService(planningDao)
  const settingsService = new SettingsService(settingsDao)
  const budgetService = new BudgetService(budgetDao, tripDao, providerGateway)
  const tripService = new TripService(
    tripDao,
    planningDao,
    bookingDao,
    budgetDao,
    packingDao,
    todoDao,
    attachmentDao,
    collaborationDao,
    automationDao,
    settingsService,
  )
  const bookingService = new BookingService(bookingDao, budgetService)
  const packingService = new PackingService(packingDao)
  const attachmentService = new AttachmentService(attachmentDao, shadowGateway)
  const collaborationService = new CollaborationService(collaborationDao)
  const clientStateService = new ClientStateService(clientStateDao)
  const communityService = new CommunityService(communityDao, shadowGateway, automationDao)
  const emergencyReportService = new EmergencyReportService(emergencyReportDao)
  const automationService = new AutomationService(automationDao, shadowGateway)
  const todoService = new TodoService(todoDao)
  const metadataService = new MetadataService(metadataDao)
  const backupService = new BackupService(backupDao, tripDao)
  const notificationService = new NotificationService(notificationDao, settingsService)
  const reminderService = new ReminderService(
    planningDao,
    bookingDao,
    settingsService,
    notificationService,
  )
  const recruitmentService = new RecruitmentService(recruitmentDao, tripDao)
  const channelMembershipSyncService = new ChannelMembershipSyncService(
    recruitmentDao,
    tripDao,
    shadowGateway,
  )
  const dashboardService = new DashboardService(
    tripDao,
    planningDao,
    bookingDao,
    budgetService,
    packingDao,
    todoDao,
    attachmentDao,
    collaborationDao,
    automationDao,
    settingsService,
  )

  return {
    db,
    eventBus,
    shadowGateway,
    providerGateway,
    accessPolicy,
    commandSecurity,
    identityService,
    communityUseCase: new CommunityUseCase(
      communityService,
      accessPolicy,
      eventBus,
      planningService,
      bookingService,
      todoService,
      dashboardService,
    ),
    auditUseCase: new AuditUseCase(auditService, accessPolicy),
    tripUseCase: new TripUseCase(
      tripService,
      dashboardService,
      accessPolicy,
      eventBus,
      channelMembershipSyncService,
    ),
    planningUseCase: new PlanningUseCase(planningService, accessPolicy, eventBus, providerGateway),
    bookingUseCase: new BookingUseCase(
      bookingService,
      accessPolicy,
      eventBus,
      settingsService,
      planningService,
    ),
    budgetUseCase: new BudgetUseCase(budgetService, accessPolicy, eventBus),
    packingUseCase: new PackingUseCase(
      packingService,
      accessPolicy,
      eventBus,
      planningDao,
      bookingDao,
    ),
    collaborationUseCase: new CollaborationUseCase(
      collaborationService,
      attachmentService,
      accessPolicy,
      eventBus,
      shadowGateway,
    ),
    clientStateUseCase: new ClientStateUseCase(clientStateService, accessPolicy, eventBus),
    emergencyReportUseCase: new EmergencyReportUseCase(
      emergencyReportService,
      eventBus,
      tripService,
      shadowGateway,
    ),
    automationUseCase: new AutomationUseCase(automationService, accessPolicy, eventBus),
    todoUseCase: new TodoUseCase(todoService, accessPolicy, eventBus),
    metadataUseCase: new MetadataUseCase(metadataService),
    settingsUseCase: new SettingsUseCase(settingsService, accessPolicy, eventBus),
    syncUseCase: new SyncUseCase(syncDao, accessPolicy, eventBus),
    backupUseCase: new BackupUseCase(backupService, accessPolicy, eventBus),
    notificationUseCase: new NotificationUseCase(notificationService, accessPolicy),
    providerUseCase: new ProviderUseCase(providerGateway, settingsService),
    reminderUseCase: new ReminderUseCase(
      reminderService,
      accessPolicy,
      eventBus,
      tripService,
      shadowGateway,
    ),
    recruitmentUseCase: new RecruitmentUseCase(
      recruitmentService,
      accessPolicy,
      eventBus,
      shadowGateway,
      channelMembershipSyncService,
    ),
    channelMembershipSyncService,
  }
}
