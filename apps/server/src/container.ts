import { type AwilixContainer, asClass, asValue, createContainer, InjectionMode } from 'awilix'
import type { Server as SocketIOServer } from 'socket.io'
import { AgentDao } from './dao/agent.dao'
import { AgentPolicyDao } from './dao/agent-policy.dao'
import { ChannelDao } from './dao/channel.dao'
import { InviteCodeDao } from './dao/invite-code.dao'
import { MessageDao } from './dao/message.dao'
import { NotificationDao } from './dao/notification.dao'
import { ServerDao } from './dao/server.dao'
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

export interface Cradle {
  // Infrastructure
  db: Database
  logger: typeof logger
  io: SocketIOServer

  // DAOs
  userDao: UserDao
  serverDao: ServerDao
  channelDao: ChannelDao
  messageDao: MessageDao
  notificationDao: NotificationDao
  agentDao: AgentDao
  agentPolicyDao: AgentPolicyDao
  inviteCodeDao: InviteCodeDao

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
    messageDao: asClass(MessageDao).singleton(),
    notificationDao: asClass(NotificationDao).singleton(),
    agentDao: asClass(AgentDao).singleton(),
    agentPolicyDao: asClass(AgentPolicyDao).singleton(),
    inviteCodeDao: asClass(InviteCodeDao).singleton(),

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
  })

  return container
}
