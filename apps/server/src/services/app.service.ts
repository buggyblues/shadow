import type { AppDao } from '../dao/app.dao'
import type { ChannelDao } from '../dao/channel.dao'
import type { WorkspaceDao } from '../dao/workspace.dao'
import type { WorkspaceNodeDao } from '../dao/workspace-node.dao'
import type {
  CreateAppInput,
  PublishFromWorkspaceInput,
  UpdateAppInput,
} from '../validators/app.schema'

export class AppService {
  constructor(
    private deps: {
      appDao: AppDao
      channelDao: ChannelDao
      workspaceDao: WorkspaceDao
      workspaceNodeDao: WorkspaceNodeDao
    },
  ) {}

  // ─── List / Get ───

  async listApps(serverId: string, opts?: { status?: string; limit?: number; offset?: number }) {
    const [items, total] = await Promise.all([
      this.deps.appDao.findByServerId(serverId, opts),
      this.deps.appDao.countByServerId(serverId, opts?.status),
    ])
    return { items, total }
  }

  async getApp(appId: string) {
    const app = await this.deps.appDao.findById(appId)
    if (!app) throw Object.assign(new Error('App not found'), { status: 404 })
    return app
  }

  async getAppBySlug(serverId: string, slug: string) {
    const app = await this.deps.appDao.findBySlug(serverId, slug)
    if (!app) throw Object.assign(new Error('App not found'), { status: 404 })
    return app
  }

  async getHomepageApp(serverId: string) {
    return this.deps.appDao.findHomepage(serverId)
  }

  async getAppByChannelId(channelId: string) {
    return this.deps.appDao.findByChannelId(channelId)
  }

  async viewApp(appId: string) {
    await this.deps.appDao.incrementViewCount(appId)
  }

  // ─── Create ───

  async createApp(serverId: string, publisherId: string, input: CreateAppInput) {
    // If marking as homepage, clear any existing one
    if (input.isHomepage) {
      await this.deps.appDao.clearHomepage(serverId)
    }

    // Create a hidden channel for this app
    const channel = await this.deps.channelDao.create({
      name: `app:${input.slug ?? input.name}`,
      serverId,
      type: 'text',
      isPrivate: true,
    })

    const app = await this.deps.appDao.create({
      serverId,
      publisherId,
      channelId: channel?.id,
      name: input.name,
      slug: input.slug,
      description: input.description,
      iconUrl: input.iconUrl ?? undefined,
      bannerUrl: input.bannerUrl ?? undefined,
      sourceType: input.sourceType,
      sourceUrl: input.sourceUrl,
      version: input.version,
      status: input.status,
      isHomepage: input.isHomepage,
      settings: input.settings,
    })

    return app
  }

  // ─── Update ───

  async updateApp(appId: string, _publisherId: string, input: UpdateAppInput) {
    const app = await this.deps.appDao.findById(appId)
    if (!app) throw Object.assign(new Error('App not found'), { status: 404 })
    return this.updateAppInServer(app.serverId, appId, input)
  }

  async updateAppInServer(serverId: string, appId: string, input: UpdateAppInput) {
    const app = await this.deps.appDao.findById(appId)
    if (!app || app.serverId !== serverId) {
      throw Object.assign(new Error('App not found'), { status: 404 })
    }

    if (input.isHomepage && !app.isHomepage) {
      await this.deps.appDao.clearHomepage(serverId)
    }

    if ((input.slug !== undefined || input.name !== undefined) && app.channelId) {
      const newChannelName = `app:${input.slug ?? input.name ?? app.name}`
      await this.deps.channelDao.update(app.channelId, { name: newChannelName })
    }

    const updated = await this.deps.appDao.updateByServerIdAndId(serverId, appId, input)
    if (!updated) throw Object.assign(new Error('App not found'), { status: 404 })
    return updated
  }

  // ─── Delete ───

  async deleteApp(appId: string, _publisherId: string) {
    const app = await this.deps.appDao.findById(appId)
    if (!app) throw Object.assign(new Error('App not found'), { status: 404 })
    await this.deleteAppInServer(app.serverId, appId)
  }

  async deleteAppInServer(serverId: string, appId: string) {
    const app = await this.deps.appDao.findById(appId)
    if (!app || app.serverId !== serverId) {
      throw Object.assign(new Error('App not found'), { status: 404 })
    }

    if (app.channelId) {
      await this.deps.channelDao.delete(app.channelId)
    }

    await this.deps.appDao.deleteByServerIdAndId(serverId, appId)
  }

  // ─── Publish from Workspace ───

  async publishFromWorkspace(
    serverId: string,
    publisherId: string,
    input: PublishFromWorkspaceInput,
  ) {
    // Get the workspace
    const workspace = await this.deps.workspaceDao.findByServerId(serverId)
    if (!workspace) throw Object.assign(new Error('Workspace not found'), { status: 404 })

    // Get the file node
    const fileNode = await this.deps.workspaceNodeDao.findById(input.fileId)
    if (!fileNode || fileNode.workspaceId !== workspace.id) {
      throw Object.assign(new Error('File not found in workspace'), { status: 404 })
    }
    if (fileNode.kind !== 'file') {
      throw Object.assign(new Error('Node is not a file'), { status: 400 })
    }
    if (!fileNode.contentRef) {
      throw Object.assign(new Error('File has no content reference'), { status: 400 })
    }

    // Check if an app with this slug already exists → update it
    if (input.slug) {
      const existing = await this.deps.appDao.findBySlug(serverId, input.slug)
      if (existing) {
        return this.updateAppInServer(serverId, existing.id, {
          name: input.name,
          description: input.description,
          iconUrl: input.iconUrl,
          sourceType: 'zip',
          sourceUrl: fileNode.contentRef,
          version: input.version,
          isHomepage: input.isHomepage,
          status: 'active',
        })
      }
    }

    // If marking as homepage, clear existing
    if (input.isHomepage) {
      await this.deps.appDao.clearHomepage(serverId)
    }

    // Create hidden channel
    const channel = await this.deps.channelDao.create({
      name: `app:${input.slug ?? input.name}`,
      serverId,
      type: 'text',
      isPrivate: true,
    })

    return this.deps.appDao.create({
      serverId,
      publisherId,
      channelId: channel?.id,
      name: input.name,
      slug: input.slug,
      description: input.description,
      iconUrl: input.iconUrl ?? undefined,
      sourceType: 'zip',
      sourceUrl: fileNode.contentRef,
      version: input.version,
      status: 'active',
      isHomepage: input.isHomepage,
    })
  }
}
