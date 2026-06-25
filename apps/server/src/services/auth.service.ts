import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto'
import { compare, hash } from 'bcryptjs'
import nodemailer from 'nodemailer'
import { Resend } from 'resend'
import type { AgentDao } from '../dao/agent.dao'
import type { InviteCodeDao } from '../dao/invite-code.dao'
import type { PasswordChangeLogDao } from '../dao/password-change-log.dao'
import type { UserDao } from '../dao/user.dao'
import type { UserSessionDao, UserSessionDevice } from '../dao/user-session.dao'
import type { SafeHttpClient } from '../gateways/safe-http-client'
import { resolveAvatarUrl } from '../lib/avatar-url'
import { randomFixedDigits } from '../lib/id'
import { signAccessToken, signRefreshToken, verifyToken } from '../lib/jwt'
import { logger } from '../lib/logger'
import { getRedisClient } from '../lib/redis'
import type {
  ChangePasswordInput,
  EmailLoginStartInput,
  EmailLoginVerifyInput,
  LoginInput,
  PasswordResetCompleteInput,
  PasswordResetStartInput,
  RegisterInput,
} from '../validators/auth.schema'
import type { MediaService } from './media.service'
import type { MembershipService } from './membership.service'
import type { TaskCenterService } from './task-center.service'

const EMAIL_OTP_TTL_SECONDS = 10 * 60
const EMAIL_OTP_MAX_ATTEMPTS = 5
const PASSWORD_RESET_TTL_SECONDS = 30 * 60
const fallbackOtpStore = new Map<
  string,
  { hash: string; expiresAt: number; attempts: number; code: string }
>()
const fallbackPasswordResetStore = new Map<
  string,
  { userId: string; email: string; expiresAt: number }
>()

export type AuthDeviceInfo = UserSessionDevice

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function hashOtp(email: string, code: string) {
  return createHash('sha256')
    .update(`${normalizeEmail(email)}:${code}`)
    .digest('hex')
}

function otpKey(email: string) {
  return `auth:email-otp:${normalizeEmail(email)}`
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function passwordResetKey(tokenHash: string) {
  return `auth:password-reset:${tokenHash}`
}

function envValue(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim()
    if (value) return value
  }
  return undefined
}

function envFlag(...keys: string[]) {
  const value = envValue(...keys)
  if (!value) return undefined
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function authEmailLayout(input: {
  title: string
  intro: string
  actionHtml: string
  note: string
  footer: string
}) {
  return `<!doctype html>
<html>
  <body style="margin:0;background:#f6f8fb;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#111827;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;border-collapse:collapse;background:#ffffff;border:1px solid #e5edf4;border-radius:28px;overflow:hidden;">
            <tr>
              <td style="padding:34px 34px 26px;">
                <div style="font-size:13px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:#00a6b3;">Shadow</div>
                <h1 style="margin:18px 0 10px;font-size:28px;line-height:1.2;color:#0f172a;">${input.title}</h1>
                <p style="margin:0;color:#526176;font-size:16px;line-height:1.65;">${input.intro}</p>
                <div style="padding:28px 0 22px;">${input.actionHtml}</div>
                <p style="margin:0;color:#526176;font-size:14px;line-height:1.6;">${input.note}</p>
              </td>
            </tr>
            <tr>
              <td style="border-top:1px solid #e5edf4;padding:18px 34px;color:#7b8798;font-size:12px;line-height:1.6;background:#fbfdff;">${input.footer}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

function emailOtpContent(code: string, locale?: string) {
  const isZh = locale?.toLowerCase().startsWith('zh')
  if (isZh) {
    return {
      subject: '虾豆登录验证码',
      text: `您的虾豆登录验证码是 ${code}，10 分钟内有效。若非您本人操作，请忽略此邮件。`,
      html: authEmailLayout({
        title: '登录虾豆',
        intro: '输入下面的一次性验证码即可继续登录。未注册邮箱会自动创建账号。',
        actionHtml: `<div style="display:inline-block;border-radius:20px;background:#f1fbfc;border:1px solid #c5f4f7;padding:18px 26px;font-size:34px;font-weight:900;letter-spacing:.24em;color:#009aa8;">${code}</div>`,
        note: '验证码 10 分钟内有效。若非您本人操作，请忽略此邮件。',
        footer: '这封邮件由虾豆账号安全系统发送，请勿回复。',
      }),
    }
  }
  return {
    subject: 'Your Shadow login code',
    text: `Your Shadow login code is ${code}. It expires in 10 minutes. If you did not request this, ignore this email.`,
    html: authEmailLayout({
      title: 'Sign in to Shadow',
      intro: 'Enter this one-time code to continue. New email addresses are created automatically.',
      actionHtml: `<div style="display:inline-block;border-radius:20px;background:#f1fbfc;border:1px solid #c5f4f7;padding:18px 26px;font-size:34px;font-weight:900;letter-spacing:.24em;color:#009aa8;">${code}</div>`,
      note: 'This code expires in 10 minutes. If you did not request it, ignore this email.',
      footer: 'This email was sent by Shadow account security. Please do not reply.',
    }),
  }
}

function passwordResetContent(resetUrl: string, locale?: string) {
  const safeUrl = escapeHtml(resetUrl)
  const isZh = locale?.toLowerCase().startsWith('zh')
  if (isZh) {
    return {
      subject: '重设您的虾豆密码',
      text: `请打开以下链接重设您的虾豆密码：${resetUrl}。链接 30 分钟内有效，且只能使用一次。若非您本人操作，请忽略此邮件。`,
      html: authEmailLayout({
        title: '重设密码',
        intro: '点击按钮打开安全页面，输入新的密码完成重设。',
        actionHtml: `<a href="${safeUrl}" style="display:inline-block;border-radius:999px;background:#00d9e6;color:#071014;text-decoration:none;font-size:16px;font-weight:900;padding:15px 24px;">重设密码</a>`,
        note: `链接 30 分钟内有效，且只能使用一次。按钮无法打开时，请复制此链接：<br><span style="word-break:break-all;color:#009aa8;">${safeUrl}</span>`,
        footer: '如果您没有请求重设密码，可以安全忽略此邮件；您的密码不会被更改。',
      }),
    }
  }
  return {
    subject: 'Reset your Shadow password',
    text: `Open this link to reset your Shadow password: ${resetUrl}. The link expires in 30 minutes and can only be used once. If you did not request this, ignore this email.`,
    html: authEmailLayout({
      title: 'Reset your password',
      intro: 'Open the secure page below and enter a new password to finish the reset.',
      actionHtml: `<a href="${safeUrl}" style="display:inline-block;border-radius:999px;background:#00d9e6;color:#071014;text-decoration:none;font-size:16px;font-weight:900;padding:15px 24px;">Reset password</a>`,
      note: `This link expires in 30 minutes and can only be used once. If the button does not open, copy this link:<br><span style="word-break:break-all;color:#009aa8;">${safeUrl}</span>`,
      footer:
        'If you did not request a password reset, you can ignore this email. Your password will not change.',
    }),
  }
}

export class AuthService {
  constructor(
    private deps: {
      userDao: UserDao
      inviteCodeDao: InviteCodeDao
      agentDao: AgentDao
      taskCenterService: TaskCenterService
      passwordChangeLogDao: PasswordChangeLogDao
      membershipService: MembershipService
      mediaService?: Pick<MediaService, 'resolveMediaUrl'> &
        Partial<Pick<MediaService, 'resolveAvatarUrl'>>
      safeHttpClient: SafeHttpClient
      userSessionDao: UserSessionDao
    },
  ) {}

  private async createSessionTokens(
    user: { id: string; email: string; username: string },
    device?: AuthDeviceInfo,
    sessionId: string = randomUUID(),
  ) {
    const payload = {
      userId: user.id,
      email: user.email,
      username: user.username,
      sessionId,
    }
    const accessToken = signAccessToken(payload)
    const refreshToken = signRefreshToken(payload)
    const refreshTokenHash = hashToken(refreshToken)
    const existing = await this.deps.userSessionDao.findById(sessionId)
    if (existing) {
      await this.deps.userSessionDao.updateRefreshTokenHash(sessionId, refreshTokenHash, device)
    } else {
      await this.deps.userSessionDao.create({
        id: sessionId,
        userId: user.id,
        refreshTokenHash,
        deviceName: device?.deviceName,
        userAgent: device?.userAgent,
        ipAddress: device?.ipAddress,
      })
    }
    return { accessToken, refreshToken, sessionId }
  }

  async register(input: RegisterInput, device?: AuthDeviceInfo) {
    const { userDao, inviteCodeDao, taskCenterService } = this.deps
    const inviteCode = input.inviteCode?.trim().toUpperCase()
    const code = inviteCode ? await inviteCodeDao.findAvailable(inviteCode) : null
    if (inviteCode && !code) {
      throw Object.assign(new Error('Invalid or already used invite code'), { status: 400 })
    }

    // Check existing email
    const email = normalizeEmail(input.email)
    const existingEmail = await userDao.findByEmail(email)
    if (existingEmail) {
      throw Object.assign(new Error('Email already in use'), { status: 409 })
    }

    // Auto-generate username if not provided
    let username = input.username
    if (!username) {
      username = await this.generateUniqueUsername(email)
    } else {
      // Check existing username only when explicitly provided
      const existingUsername = await userDao.findByUsername(username)
      if (existingUsername) {
        throw Object.assign(new Error('Username already taken'), { status: 409 })
      }
    }

    // Hash password
    const passwordHash = await hash(input.password, 12)

    // Create user
    const user = await userDao.create({
      email,
      username: username,
      passwordHash,
      displayName: input.displayName,
    })
    if (!user) {
      throw Object.assign(new Error('Failed to create user'), { status: 500 })
    }

    if (code) {
      await inviteCodeDao.markUsed(code.id, user.id)
    }

    // Campaign reward: signup bonus
    await taskCenterService.grantWelcomeReward(user.id)

    const tokens = await this.createSessionTokens(user, device)

    return {
      user: await this.serializeUser(user),
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    }
  }

  async login(input: LoginInput, device?: AuthDeviceInfo) {
    const { userDao, inviteCodeDao, taskCenterService } = this.deps

    // Support login with email or username
    let user = await userDao.findByEmail(normalizeEmail(input.email))
    if (!user) {
      // Try to find by username
      user = await userDao.findByUsername(input.email)
    }
    if (!user) {
      throw Object.assign(new Error('Invalid credentials'), { status: 401 })
    }

    const valid = await compare(input.password, user.passwordHash)
    if (!valid) {
      throw Object.assign(new Error('Invalid credentials'), { status: 401 })
    }

    const tokens = await this.createSessionTokens(user, device)

    // Update user status to online
    await userDao.updateStatus(user.id, 'online')

    // Referral campaign reward trigger: on first successful login after registration.
    // grantInviteRewards is idempotent by (userId + rewardKey + inviteCodeId).
    const usedInvite = await inviteCodeDao.findByUsedBy(user.id)
    if (usedInvite?.createdBy && usedInvite.createdBy !== user.id) {
      await taskCenterService.grantInviteRewards(usedInvite.createdBy, user.id, usedInvite.id)
    }

    return {
      user: await this.serializeUser(user),
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    }
  }

  async startEmailLogin(input: EmailLoginStartInput) {
    const email = normalizeEmail(input.email)
    const code = randomInt(100000, 1000000).toString()
    const payload = {
      hash: hashOtp(email, code),
      expiresAt: Date.now() + EMAIL_OTP_TTL_SECONDS * 1000,
      attempts: 0,
      code,
    }

    const redis = await getRedisClient()
    if (redis) {
      await redis.set(otpKey(email), JSON.stringify(payload), { EX: EMAIL_OTP_TTL_SECONDS })
    } else {
      fallbackOtpStore.set(otpKey(email), payload)
    }

    try {
      await this.deliverEmailOtp(email, code, input.locale)
    } catch (err) {
      await this.clearEmailOtp(email)
      throw err
    }

    return {
      ok: true,
      expiresIn: EMAIL_OTP_TTL_SECONDS,
      ...(process.env.NODE_ENV !== 'production' ? { devCode: code } : {}),
    }
  }

  async verifyEmailLogin(input: EmailLoginVerifyInput, device?: AuthDeviceInfo) {
    const email = normalizeEmail(input.email)
    const stored = await this.readEmailOtp(email)
    if (!stored || Date.now() > stored.expiresAt) {
      await this.clearEmailOtp(email)
      throw Object.assign(new Error('Verification code expired'), {
        status: 400,
        code: 'VERIFICATION_CODE_EXPIRED',
      })
    }

    if (stored.attempts >= EMAIL_OTP_MAX_ATTEMPTS) {
      await this.clearEmailOtp(email)
      throw Object.assign(new Error('Too many verification attempts'), {
        status: 429,
        code: 'TOO_MANY_VERIFICATION_ATTEMPTS',
      })
    }

    if (stored.hash !== hashOtp(email, input.code.trim())) {
      await this.writeEmailOtp(email, { ...stored, attempts: stored.attempts + 1 })
      throw Object.assign(new Error('Invalid verification code'), {
        status: 400,
        code: 'INVALID_VERIFICATION_CODE',
      })
    }

    await this.clearEmailOtp(email)

    const { user, isNew } = await this.findOrCreateEmailUser(email, input.displayName)
    if (isNew) {
      await this.deps.taskCenterService.grantWelcomeReward(user.id)
    }
    await this.deps.userDao.updateStatus(user.id, 'online')

    const tokens = await this.createSessionTokens(user, device)
    return {
      user: await this.serializeUser(user),
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    }
  }

  async startPasswordReset(input: PasswordResetStartInput) {
    const email = normalizeEmail(input.email)
    const user = await this.deps.userDao.findByEmail(email)

    if (!user) {
      return { ok: true, expiresIn: PASSWORD_RESET_TTL_SECONDS }
    }

    const token = randomBytes(32).toString('base64url')
    const tokenHash = hashToken(token)
    const payload = {
      userId: user.id,
      email,
      expiresAt: Date.now() + PASSWORD_RESET_TTL_SECONDS * 1000,
    }

    await this.writePasswordResetToken(tokenHash, payload)

    try {
      await this.deliverPasswordResetEmail(email, this.buildPasswordResetUrl(token), input.locale)
    } catch (err) {
      await this.clearPasswordResetToken(tokenHash)
      logger.warn({ err, email }, 'Password reset email delivery failed')
      return { ok: true, expiresIn: PASSWORD_RESET_TTL_SECONDS }
    }

    return {
      ok: true,
      expiresIn: PASSWORD_RESET_TTL_SECONDS,
      ...(process.env.NODE_ENV !== 'production' ? { devToken: token } : {}),
    }
  }

  async completePasswordReset(
    input: PasswordResetCompleteInput,
    meta?: { ipAddress?: string; userAgent?: string },
  ) {
    const tokenHash = hashToken(input.token.trim())
    const stored = await this.readPasswordResetToken(tokenHash)
    if (!stored) {
      throw Object.assign(new Error('Password reset link is invalid or expired'), {
        status: 400,
        code: 'PASSWORD_RESET_TOKEN_INVALID',
      })
    }

    if (Date.now() > stored.expiresAt) {
      await this.clearPasswordResetToken(tokenHash)
      await this.deps.passwordChangeLogDao.create({
        userId: stored.userId,
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
        success: false,
        failureReason: 'Expired password reset token',
      })
      throw Object.assign(new Error('Password reset link is invalid or expired'), {
        status: 400,
        code: 'PASSWORD_RESET_TOKEN_INVALID',
      })
    }

    const user = await this.deps.userDao.findById(stored.userId)
    if (!user || normalizeEmail(user.email) !== stored.email) {
      await this.clearPasswordResetToken(tokenHash)
      await this.deps.passwordChangeLogDao.create({
        userId: stored.userId,
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
        success: false,
        failureReason: 'Password reset user mismatch',
      })
      throw Object.assign(new Error('Password reset link is invalid or expired'), {
        status: 400,
        code: 'PASSWORD_RESET_TOKEN_INVALID',
      })
    }

    await this.clearPasswordResetToken(tokenHash)

    const newPasswordHash = await hash(input.newPassword, 12)
    await this.deps.userDao.update(user.id, { passwordHash: newPasswordHash })
    await this.deps.userSessionDao.revokeAllByUserId(user.id)
    await this.deps.passwordChangeLogDao.create({
      userId: user.id,
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
      success: true,
    })

    return { success: true }
  }

  async refresh(refreshToken: string, device?: AuthDeviceInfo) {
    const { userDao, userSessionDao } = this.deps

    try {
      const payload = verifyToken(refreshToken, 'refresh')
      const user = await userDao.findById(payload.userId)
      if (!user) {
        throw Object.assign(new Error('User not found'), { status: 401 })
      }

      let sessionId = payload.sessionId
      if (sessionId) {
        const session = await userSessionDao.findById(sessionId)
        if (
          !session ||
          session.userId !== user.id ||
          session.revokedAt ||
          session.refreshTokenHash !== hashToken(refreshToken)
        ) {
          throw Object.assign(new Error('Invalid refresh token'), { status: 401 })
        }
      } else {
        sessionId = randomUUID()
      }

      const tokens = await this.createSessionTokens(user, device, sessionId)

      return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken }
    } catch {
      throw Object.assign(new Error('Invalid refresh token'), { status: 401 })
    }
  }

  async getMe(userId: string) {
    const { userDao, agentDao } = this.deps

    const user = await userDao.findById(userId)
    if (!user) {
      throw Object.assign(new Error('User not found'), { status: 404 })
    }

    // For bot users, look up and include the agentId
    let agentId: string | undefined
    if (user.isBot) {
      const agent = await agentDao.findByUserId(userId)
      if (agent) {
        agentId = agent.id
      }
    }

    return {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: resolveAvatarUrl(this.deps.mediaService, user.avatarUrl),
      status: user.status,
      isBot: user.isBot,
      membership: await this.deps.membershipService.getMembership(user.id),
      ...(agentId ? { agentId } : {}),
    }
  }

  async listSessions(userId: string, currentSessionId?: string) {
    const sessions = await this.deps.userSessionDao.listByUserId(userId)
    return sessions.map((session) => ({
      id: session.id,
      deviceName: session.deviceName,
      userAgent: session.userAgent,
      ipAddress: session.ipAddress,
      lastSeenAt: session.lastSeenAt,
      createdAt: session.createdAt,
      revokedAt: session.revokedAt,
      current: currentSessionId === session.id,
    }))
  }

  async revokeSession(userId: string, sessionId: string) {
    const session = await this.deps.userSessionDao.revoke(sessionId, userId)
    if (!session) {
      throw Object.assign(new Error('Session not found'), { status: 404 })
    }
    return session
  }

  async updateProfile(userId: string, input: { displayName?: string; avatarUrl?: string | null }) {
    const { userDao } = this.deps

    const user = await userDao.findById(userId)
    if (!user) {
      throw Object.assign(new Error('User not found'), { status: 404 })
    }

    const updated = await userDao.update(userId, {
      ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
      ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
    })

    return {
      ...(await this.serializeUser(updated!)),
    }
  }

  async changePassword(
    userId: string,
    input: ChangePasswordInput,
    meta?: { ipAddress?: string; userAgent?: string },
  ) {
    const { userDao, passwordChangeLogDao } = this.deps

    const user = await userDao.findById(userId)
    if (!user) {
      throw Object.assign(new Error('User not found'), { status: 404 })
    }

    // Verify old password
    const valid = await compare(input.oldPassword, user.passwordHash)
    if (!valid) {
      // Log failed attempt
      await passwordChangeLogDao.create({
        userId,
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
        success: false,
        failureReason: 'Invalid old password',
      })
      throw Object.assign(new Error('Current password is incorrect'), { status: 400 })
    }

    // Hash new password
    const newPasswordHash = await hash(input.newPassword, 12)

    // Update password
    await userDao.update(userId, { passwordHash: newPasswordHash })

    // Log successful change
    await passwordChangeLogDao.create({
      userId,
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
      success: true,
    })

    return { success: true }
  }

  private async serializeUser(user: {
    id: string
    email: string
    username: string
    displayName: string | null
    avatarUrl: string | null
  }) {
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: resolveAvatarUrl(this.deps.mediaService, user.avatarUrl),
      membership: await this.deps.membershipService.getMembership(user.id),
    }
  }

  private async generateUniqueUsername(email: string) {
    const emailLocalPart = email.split('@')[0] ?? 'user'
    const prefix = emailLocalPart.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 24) || 'user'
    for (let attempt = 0; attempt < 10; attempt++) {
      const suffix = randomFixedDigits(6)
      const candidate = `${prefix}_${suffix}`
      const existing = await this.deps.userDao.findByUsername(candidate)
      if (!existing) return candidate
    }
    throw Object.assign(new Error('Failed to generate unique username'), { status: 500 })
  }

  private async findOrCreateEmailUser(email: string, displayName?: string) {
    const existing = await this.deps.userDao.findByEmail(email)
    if (existing) return { user: existing, isNew: false }

    const username = await this.generateUniqueUsername(email)
    const passwordHash = await hash(randomUUID(), 12)
    const user = await this.deps.userDao.create({
      email,
      username,
      passwordHash,
      displayName,
    })
    if (!user) {
      throw Object.assign(new Error('Failed to create user'), { status: 500 })
    }
    return { user, isNew: true }
  }

  private async readEmailOtp(email: string) {
    const key = otpKey(email)
    const redis = await getRedisClient()
    const raw = redis ? await redis.get(key) : JSON.stringify(fallbackOtpStore.get(key) ?? null)
    if (!raw) return null
    const parsed = JSON.parse(raw) as {
      hash: string
      expiresAt: number
      attempts: number
      code?: string
    } | null
    return parsed
  }

  private async writeEmailOtp(
    email: string,
    payload: { hash: string; expiresAt: number; attempts: number; code?: string },
  ) {
    const key = otpKey(email)
    const secondsLeft = Math.max(1, Math.ceil((payload.expiresAt - Date.now()) / 1000))
    const redis = await getRedisClient()
    if (redis) {
      await redis.set(key, JSON.stringify(payload), { EX: secondsLeft })
    } else {
      fallbackOtpStore.set(key, { ...payload, code: payload.code ?? '' })
    }
  }

  private async clearEmailOtp(email: string) {
    const key = otpKey(email)
    const redis = await getRedisClient()
    if (redis) {
      await redis.del(key)
    } else {
      fallbackOtpStore.delete(key)
    }
  }

  private buildPasswordResetUrl(token: string) {
    const explicitUrl = envValue('PASSWORD_RESET_URL')
    if (explicitUrl) {
      const url = new URL(explicitUrl)
      url.searchParams.set('token', token)
      return url.toString()
    }

    const rawBase =
      envValue(
        'PASSWORD_RESET_BASE_URL',
        'WEB_APP_URL',
        'WEB_ORIGIN',
        'APP_ORIGIN',
        'OAUTH_BASE_URL',
      ) ??
      (process.env.NODE_ENV === 'production' ? 'https://shadowob.com' : 'http://localhost:3000')
    const url = new URL(rawBase)
    const basePath = url.pathname.replace(/\/+$/, '')
    url.pathname = `${basePath.endsWith('/app') ? basePath : '/app'}/reset-password`
    url.search = ''
    url.hash = ''
    url.searchParams.set('token', token)
    return url.toString()
  }

  private async readPasswordResetToken(tokenHash: string) {
    const key = passwordResetKey(tokenHash)
    const redis = await getRedisClient()
    const raw = redis
      ? await redis.get(key)
      : JSON.stringify(fallbackPasswordResetStore.get(key) ?? null)
    if (!raw) return null
    return JSON.parse(raw) as { userId: string; email: string; expiresAt: number } | null
  }

  private async writePasswordResetToken(
    tokenHash: string,
    payload: { userId: string; email: string; expiresAt: number },
  ) {
    const key = passwordResetKey(tokenHash)
    const redis = await getRedisClient()
    if (redis) {
      await redis.set(key, JSON.stringify(payload), { EX: PASSWORD_RESET_TTL_SECONDS })
    } else {
      fallbackPasswordResetStore.set(key, payload)
    }
  }

  private async clearPasswordResetToken(tokenHash: string) {
    const key = passwordResetKey(tokenHash)
    const redis = await getRedisClient()
    if (redis) {
      await redis.del(key)
    } else {
      fallbackPasswordResetStore.delete(key)
    }
  }

  private async deliverEmailOtp(email: string, code: string, locale?: string) {
    await this.deliverAuthEmail({
      email,
      content: emailOtpContent(code, locale),
      webhookPayload: { type: 'email_login', to: email, code, locale },
      failureMessage: 'Failed to send verification email',
      failureLog: 'Failed to send email verification code',
    })
  }

  private async deliverPasswordResetEmail(email: string, resetUrl: string, locale?: string) {
    await this.deliverAuthEmail({
      email,
      content: passwordResetContent(resetUrl, locale),
      webhookPayload: { type: 'password_reset', to: email, resetUrl, locale },
      failureMessage: 'Failed to send password reset email',
      failureLog: 'Failed to send password reset email',
    })
  }

  private async deliverAuthEmail(input: {
    email: string
    content: { subject: string; text: string; html: string }
    webhookPayload: Record<string, unknown>
    failureMessage: string
    failureLog: string
  }) {
    const webhookUrl = process.env.EMAIL_OTP_WEBHOOK_URL
    if (webhookUrl) {
      const res = await this.deps.safeHttpClient.fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input.webhookPayload),
      })
      if (!res.ok) {
        throw Object.assign(new Error(input.failureMessage), {
          status: 502,
          code: 'EMAIL_SEND_FAILED',
        })
      }
      return
    }

    const resendApiKey = envValue('RESEND_API_KEY', 'EMAIL_RESEND_API_KEY')
    const resendFrom = envValue('RESEND_FROM', 'EMAIL_RESEND_FROM')
    if (resendApiKey && resendFrom) {
      const resend = new Resend(resendApiKey)
      try {
        const result = await resend.emails.send({
          from: resendFrom,
          to: input.email,
          subject: input.content.subject,
          text: input.content.text,
          html: input.content.html,
        })
        if (result.error) {
          throw result.error
        }
      } catch (err) {
        logger.error({ err, email: input.email }, `${input.failureLog} via Resend`)
        throw Object.assign(new Error(input.failureMessage), {
          status: 502,
          code: 'EMAIL_SEND_FAILED',
        })
      }
      return
    }

    const smtpHost = envValue('EMAIL_SMTP_HOST', 'SMTP_HOST')
    const smtpFrom = envValue('EMAIL_SMTP_FROM', 'SMTP_FROM', 'MAIL_FROM')
    if (smtpHost && smtpFrom) {
      const smtpPort = Number(envValue('EMAIL_SMTP_PORT', 'SMTP_PORT') ?? 587)
      const smtpUser = envValue('EMAIL_SMTP_USER', 'SMTP_USER')
      const smtpPassword = envValue('EMAIL_SMTP_PASSWORD', 'SMTP_PASSWORD')
      const secure = envFlag('EMAIL_SMTP_SECURE', 'SMTP_SECURE') ?? smtpPort === 465
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: Number.isFinite(smtpPort) ? smtpPort : 587,
        secure,
        auth: smtpUser && smtpPassword ? { user: smtpUser, pass: smtpPassword } : undefined,
      })

      try {
        await transporter.sendMail({
          from: smtpFrom,
          to: input.email,
          subject: input.content.subject,
          text: input.content.text,
          html: input.content.html,
        })
      } catch (err) {
        logger.error({ err, email: input.email }, `${input.failureLog} via SMTP`)
        throw Object.assign(new Error(input.failureMessage), {
          status: 502,
          code: 'EMAIL_SEND_FAILED',
        })
      }
      return
    }

    if (process.env.NODE_ENV === 'production') {
      throw Object.assign(new Error('Email delivery is not configured'), {
        status: 503,
        code: 'EMAIL_DELIVERY_NOT_CONFIGURED',
      })
    }

    logger.warn(
      { email: input.email, subject: input.content.subject },
      'Email delivery not configured; logging auth email request',
    )
  }
}
