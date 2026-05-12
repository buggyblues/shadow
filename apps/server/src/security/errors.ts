import { apiError } from '../lib/api-error'

export const SECURITY_ERROR_CODES = {
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  PLATFORM_ADMIN_REQUIRED: 'PLATFORM_ADMIN_REQUIRED',
  SCOPE_NOT_FOUND: 'SCOPE_NOT_FOUND',
  SCOPE_MISMATCH: 'SCOPE_MISMATCH',
  FORBIDDEN: 'FORBIDDEN',
  STATE_CONFLICT: 'STATE_CONFLICT',
  IDEMPOTENCY_REQUIRED: 'IDEMPOTENCY_REQUIRED',
  UNSAFE_URL: 'UNSAFE_URL',
  DANGEROUS_OPERATION_REQUIRES_GATEWAY: 'DANGEROUS_OPERATION_REQUIRES_GATEWAY',
} as const

export type SecurityErrorCode = (typeof SECURITY_ERROR_CODES)[keyof typeof SECURITY_ERROR_CODES]

export function notFoundForScope(message = 'Resource not found') {
  return apiError(SECURITY_ERROR_CODES.SCOPE_NOT_FOUND, 404, { message })
}

export function scopeMismatch(message = 'Resource not found') {
  return apiError(SECURITY_ERROR_CODES.SCOPE_MISMATCH, 404, { message })
}

export function forbidden(message = 'Forbidden') {
  return apiError(SECURITY_ERROR_CODES.FORBIDDEN, 403, { message })
}

export function platformAdminRequired() {
  return apiError(SECURITY_ERROR_CODES.PLATFORM_ADMIN_REQUIRED, 403)
}

export function stateConflict(message = 'State conflict') {
  return apiError(SECURITY_ERROR_CODES.STATE_CONFLICT, 409, { message })
}

export function unsafeUrl(message = 'Unsafe URL') {
  return apiError(SECURITY_ERROR_CODES.UNSAFE_URL, 422, { message })
}
