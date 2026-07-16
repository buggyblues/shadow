export class AppError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: unknown

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

export function badRequest(message: string, details?: unknown) {
  return new AppError(400, 'BAD_REQUEST', message, details)
}

export function unauthorized(message = 'Authentication is required') {
  return new AppError(401, 'UNAUTHORIZED', message)
}

export function forbidden(message = 'You do not have access to this resource') {
  return new AppError(403, 'FORBIDDEN', message)
}

export function notFound(resource: string) {
  return new AppError(404, 'NOT_FOUND', `${resource} not found`)
}

export function conflict(message: string, details?: unknown) {
  return new AppError(409, 'CONFLICT', message, details)
}
