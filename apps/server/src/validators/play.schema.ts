import { z } from 'zod'

const playActionBaseSchema = z.object({
  buddyUserIds: z.array(z.string().uuid()).optional(),
  buddyTemplateSlug: z.string().min(1).max(128).optional(),
  greeting: z.string().max(1000).optional(),
})

export const playActionSchema = z.discriminatedUnion('kind', [
  playActionBaseSchema.extend({
    kind: z.literal('public_channel'),
    serverId: z.string().uuid().optional(),
    serverSlug: z.string().min(1).max(100).optional(),
    channelId: z.string().uuid().optional(),
    channelName: z.string().min(1).max(100).optional(),
    inviteCode: z.string().max(64).optional(),
  }),
  playActionBaseSchema.extend({
    kind: z.literal('private_room'),
    serverId: z.string().uuid().optional(),
    serverSlug: z.string().min(1).max(100).optional(),
    namePrefix: z.string().max(64).optional(),
  }),
  playActionBaseSchema.extend({
    kind: z.literal('cloud_deploy'),
    templateSlug: z.string().min(1).max(128),
    resourceTier: z.enum(['lightweight', 'standard', 'pro']).optional(),
    defaultChannelName: z.string().min(1).max(100).optional(),
  }),
  z.object({
    kind: z.literal('external_oauth_app'),
    clientId: z.string().min(1).max(128),
    redirectUri: z.string().url(),
    scopes: z.array(z.string().min(1).max(64)).optional(),
    state: z.string().max(512).optional(),
  }),
  z.object({
    kind: z.literal('landing_page'),
    url: z.string().min(1).max(2048),
  }),
])

export const playLaunchSchema = z
  .object({
    playId: z.string().min(1).max(128).optional(),
    launchSessionId: z
      .string()
      .min(8)
      .max(128)
      .regex(/^[A-Za-z0-9._:-]+$/)
      .optional(),
    inviteCode: z.string().min(1).max(64).optional(),
    locale: z.string().max(16).optional(),
  })
  .strict()

export type PlayLaunchInput = z.infer<typeof playLaunchSchema>
