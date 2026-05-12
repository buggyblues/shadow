import { createHash, randomInt, randomUUID } from 'node:crypto'
import { compare, hash } from 'bcryptjs'
import nodemailer from 'nodemailer'
import { Resend } from 'resend'
import type { AgentDao } from '../dao/agent.dao'
import type { InviteCodeDao } from '../dao/invite-code.dao'
import type { PasswordChangeLogDao } from '../dao/password-change-log.dao'
import type { UserDao } from '../dao/user.dao'
import type { SafeHttpClient } from '../gateways/safe-http-client'
import { randomFixedDigits } from '../lib/id'
import { signAccessToken, signRefreshToken, verifyToken } from '../lib/jwt'
import { logger } from '../lib/logger'
import { getRedisClient } from '../lib/redis'
import type {
  ChangePasswordInput,
  EmailLoginStartInput,
  EmailLoginVerifyInput,
  LoginInput,
  RegisterInput,
} from '../validators/auth.schema'
import type { MembershipService } from './membership.service'
import type { TaskCenterService } from './task-center.service'

const EMAIL_OTP_TTL_SECONDS = 10 * 60
const EMAIL_OTP_MAX_ATTEMPTS = 5
const fallbackOtpStore = new Map<
  string,
  { hash: string; expiresAt: number; attempts: number; code: string }
>()

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

function emailOtpContent(code: string, locale?: string) {
  const isZh = locale?.toLowerCase().startsWith('zh')
  if (isZh) {
    return {
      subject: '虾豆登录验证码',
      text: `您的虾豆登录验证码是 ${code}，10 分钟内有效。若非您本人操作，请忽略此邮件。`,
      html: `<p>您的虾豆登录验证码是 <strong>${code}</strong>，10 分钟内有效。</p><p>若非您本人操作，请忽略此邮件。</p>`,
    }
  }
  return {
    subject: 'Your Shadow login code',
    text: `Your Shadow login code is ${code}. It expires in 10 minutes. If you did not request this, ignore this email.`,
    html: `<p>Your Shadow login code is <strong>${code}</strong>. It expires in 10 minutes.</p><p>If you did not request this, ignore this email.</p>`,
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
      safeHttpClient: SafeHttpClient
    },
  ) {}

  async register(input: RegisterInput) {
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

    // Generate tokens
    const payload = { userId: user.id, email: user.email, username: user.username }
    const accessToken = signAccessToken(payload)
    const refreshToken = signRefreshToken(payload)

    return {
      user: await this.serializeUser(user),
      accessToken,
      refreshToken,
    }
  }

  async login(input: LoginInput) {
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

    const payload = { userId: user.id, email: user.email, username: user.username }
    const accessToken = signAccessToken(payload)
    const refreshToken = signRefreshToken(payload)

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
      accessToken,
      refreshToken,
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

  async verifyEmailLogin(input: EmailLoginVerifyInput) {
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

    const payload = { userId: user.id, email: user.email, username: user.username }
    return {
      user: await this.serializeUser(user),
      accessToken: signAccessToken(payload),
      refreshToken: signRefreshToken(payload),
    }
  }

  async refresh(refreshToken: string) {
    const { userDao } = this.deps

    try {
      const payload = verifyToken(refreshToken, 'refresh')
      const user = await userDao.findById(payload.userId)
      if (!user) {
        throw Object.assign(new Error('User not found'), { status: 401 })
      }

      const newPayload = { userId: user.id, email: user.email, username: user.username }
      const accessToken = signAccessToken(newPayload)
      const newRefreshToken = signRefreshToken(newPayload)

      return { accessToken, refreshToken: newRefreshToken }
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
      avatarUrl: user.avatarUrl,
      status: user.status,
      isBot: user.isBot,
      membership: await this.deps.membershipService.getMembership(user.id),
      ...(agentId ? { agentId } : {}),
    }
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
      avatarUrl: user.avatarUrl,
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

  private async deliverEmailOtp(email: string, code: string, locale?: string) {
    const webhookUrl = process.env.EMAIL_OTP_WEBHOOK_URL
    if (webhookUrl) {
      const res = await this.deps.safeHttpClient.fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: email, code, locale }),
      })
      if (!res.ok) {
        throw Object.assign(new Error('Failed to send verification email'), {
          status: 502,
          code: 'EMAIL_SEND_FAILED',
        })
      }
      return
    }

    const resendApiKey = envValue('RESEND_API_KEY', 'EMAIL_RESEND_API_KEY')
    const resendFrom = envValue('RESEND_FROM', 'EMAIL_RESEND_FROM')
    if (resendApiKey && resendFrom) {
      const content = emailOtpContent(code, locale)
      const resend = new Resend(resendApiKey)
      try {
        const result = await resend.emails.send({
          from: resendFrom,
          to: email,
          subject: content.subject,
          text: content.text,
          html: content.html,
        })
        if (result.error) {
          throw result.error
        }
      } catch (err) {
        logger.error({ err, email }, 'Failed to send email verification code via Resend')
        throw Object.assign(new Error('Failed to send verification email'), {
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
      const content = emailOtpContent(code, locale)

      try {
        await transporter.sendMail({
          from: smtpFrom,
          to: email,
          subject: content.subject,
          text: content.text,
          html: content.html,
        })
      } catch (err) {
        logger.error({ err, email }, 'Failed to send email verification code via SMTP')
        throw Object.assign(new Error('Failed to send verification email'), {
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

    logger.warn({ email, code }, 'Email delivery not configured; logging email verification code')
  }
}
