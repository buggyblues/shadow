export function ok<T>(data: T) {
  return { ok: true, data }
}

export function created<T>(data: T) {
  return { ok: true, data }
}
