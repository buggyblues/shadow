import { z } from 'zod'

export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(32, 'Username must be at most 32 characters')
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      'Username can only contain letters, numbers, hyphens and underscores',
    )
    .optional(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters'),
  displayName: z.string().max(64).optional(),
  inviteCode: z.string().max(64).optional(),
  referralCode: z.string().max(64).optional(),
})

export const loginSchema = z.object({
  email: z.string().min(1, 'Username or email is required').max(128, 'Input is too long'),
  password: z.string().min(1, 'Password is required'),
})

export const emailLoginStartSchema = z.object({
  email: z.string().email('Invalid email address'),
  locale: z.string().max(16).optional(),
})

export const emailLoginVerifySchema = z.object({
  email: z.string().email('Invalid email address'),
  code: z.string().min(4).max(12),
  displayName: z.string().max(64).optional(),
})

export const passwordResetStartSchema = z.object({
  email: z.string().email('Invalid email address'),
  locale: z.string().max(16).optional(),
})

export const passwordResetCompleteSchema = z
  .object({
    token: z.string().min(32, 'Reset token is required').max(512, 'Reset token is too long'),
    newPassword: z
      .string()
      .min(8, 'New password must be at least 8 characters')
      .max(128, 'New password must be at most 128 characters'),
    confirmPassword: z.string().min(1, 'Password confirmation is required'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

export const googleIdTokenSchema = z.object({
  credential: z.string().min(1),
})

export const appleMobileLoginSchema = z.object({
  identityToken: z.string().min(1),
  email: z.string().email().optional().nullable(),
  fullName: z
    .object({
      givenName: z.string().optional().nullable(),
      familyName: z.string().optional().nullable(),
      middleName: z.string().optional().nullable(),
      nickname: z.string().optional().nullable(),
    })
    .optional()
    .nullable(),
})

export const changePasswordSchema = z
  .object({
    oldPassword: z.string().min(1, 'Current password is required').optional(),
    currentPassword: z.string().min(1, 'Current password is required').optional(),
    newPassword: z
      .string()
      .min(8, 'New password must be at least 8 characters')
      .max(128, 'New password must be at most 128 characters'),
    confirmPassword: z.string().min(1, 'Password confirmation is required').optional(),
  })
  .refine((data) => Boolean(data.oldPassword ?? data.currentPassword), {
    message: 'Current password is required',
    path: ['oldPassword'],
  })
  .refine((data) => !data.confirmPassword || data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })
  .transform((data) => ({
    oldPassword: data.oldPassword ?? data.currentPassword ?? '',
    newPassword: data.newPassword,
    confirmPassword: data.confirmPassword ?? data.newPassword,
  }))

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type EmailLoginStartInput = z.infer<typeof emailLoginStartSchema>
export type EmailLoginVerifyInput = z.infer<typeof emailLoginVerifySchema>
export type PasswordResetStartInput = z.infer<typeof passwordResetStartSchema>
export type PasswordResetCompleteInput = z.infer<typeof passwordResetCompleteSchema>
export type GoogleIdTokenInput = z.infer<typeof googleIdTokenSchema>
export type AppleMobileLoginInput = z.infer<typeof appleMobileLoginSchema>
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
