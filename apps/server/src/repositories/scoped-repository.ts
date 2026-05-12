export type ScopedUpdateResult<T> = T | null

export type ScopedWriteInput<ParentKey extends string, ChildKey extends string, Patch> = Record<
  ParentKey,
  string
> &
  Record<ChildKey, string> & {
    patch: Patch
  }

export function assertScopedResult<T>(result: T | null, message = 'Resource not found'): T {
  if (!result) throw Object.assign(new Error(message), { status: 404 })
  return result
}

/**
 * Marker interface for new repositories. New write methods should encode parent scope in the
 * method name and signature, e.g. updateByServerIdAndAppId(serverId, appId, patch).
 */
export interface ScopedRepository {
  readonly __scopedRepository: true
}
