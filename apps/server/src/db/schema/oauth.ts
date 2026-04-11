import { boolean, index, jsonb, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { users } from './users'

/* ──────────────── OAuth Apps (Provider) ──────────────── */

export const oauthApps = pgTable(
  'oauth_apps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    clientId: varchar('client_id', { length: 64 }).notNull().unique(),
    clientSecretHash: text('client_secret_hash').notNull(),
    name: varchar('name', { length: 128 }).notNull(),
    description: text('description'),
    homepageUrl: text('homepage_url'),
    logoUrl: text('logo_url'),
    redirectUris: jsonb('redirect_uris').$type<string[]>().notNull().default([]),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    oauthAppsUserIdIdx: index('oauth_apps_user_id_idx').on(t.userId),
  }),
)

/* ──────────────── Authorization Codes ──────────────── */

export const oauthAuthorizationCodes = pgTable(
  'oauth_authorization_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: varchar('code', { length: 128 }).notNull().unique(),
    appId: uuid('app_id')
      .notNull()
      .references(() => oauthApps.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    redirectUri: text('redirect_uri').notNull(),
    scope: varchar('scope', { length: 255 }).notNull().default('user:read'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    used: boolean('used').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    oauthAuthCodesAppIdIdx: index('oauth_authorization_codes_app_id_idx').on(t.appId),
    oauthAuthCodesUserIdIdx: index('oauth_authorization_codes_user_id_idx').on(t.userId),
  }),
)

/* ──────────────── Access Tokens ──────────────── */

export const oauthAccessTokens = pgTable(
  'oauth_access_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenHash: varchar('token_hash', { length: 128 }).notNull().unique(),
    appId: uuid('app_id')
      .notNull()
      .references(() => oauthApps.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    scope: varchar('scope', { length: 255 }).notNull().default('user:read'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    oauthAccessTokensAppIdIdx: index('oauth_access_tokens_app_id_idx').on(t.appId),
    oauthAccessTokensUserIdIdx: index('oauth_access_tokens_user_id_idx').on(t.userId),
  }),
)

/* ──────────────── Refresh Tokens ──────────────── */

export const oauthRefreshTokens = pgTable(
  'oauth_refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenHash: varchar('token_hash', { length: 128 }).notNull().unique(),
    accessTokenId: uuid('access_token_id')
      .notNull()
      .references(() => oauthAccessTokens.id, { onDelete: 'cascade' }),
    appId: uuid('app_id')
      .notNull()
      .references(() => oauthApps.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revoked: boolean('revoked').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    oauthRefreshTokensAccessTokenIdIdx: index('oauth_refresh_tokens_access_token_id_idx').on(
      t.accessTokenId,
    ),
    oauthRefreshTokensAppIdIdx: index('oauth_refresh_tokens_app_id_idx').on(t.appId),
    oauthRefreshTokensUserIdIdx: index('oauth_refresh_tokens_user_id_idx').on(t.userId),
  }),
)

/* ──────────────── User Consents ──────────────── */

export const oauthConsents = pgTable(
  'oauth_consents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    appId: uuid('app_id')
      .notNull()
      .references(() => oauthApps.id, { onDelete: 'cascade' }),
    scope: varchar('scope', { length: 255 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    oauthConsentsUserIdIdx: index('oauth_consents_user_id_idx').on(t.userId),
    oauthConsentsAppIdIdx: index('oauth_consents_app_id_idx').on(t.appId),
  }),
)

/* ──────────────── OAuth Accounts (Consumer — third-party login) ──────────────── */

export const oauthAccounts = pgTable(
  'oauth_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: varchar('provider', { length: 32 }).notNull(),
    providerAccountId: varchar('provider_account_id', { length: 255 }).notNull(),
    providerEmail: varchar('provider_email', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    oauthAccountsUserIdIdx: index('oauth_accounts_user_id_idx').on(t.userId),
    oauthAccountsProviderIdx: index('oauth_accounts_provider_idx').on(t.provider),
    oauthAccountsProviderAccountIdIdx: index('oauth_accounts_provider_account_id_idx').on(
      t.providerAccountId,
    ),
  }),
)
