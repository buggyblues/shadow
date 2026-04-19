/**
 * Shared deep merge — arrays are replaced, objects are recursively merged.
 * Single source of truth for the entire codebase.
 */

export function deepMerge<T extends Record<string, unknown>>(base: T, override: Partial<T>): T {
  const result = { ...base }
  for (const key of Object.keys(override) as Array<keyof T>) {
    const baseVal = result[key]
    const overVal = override[key]
    if (
      overVal !== undefined &&
      typeof baseVal === 'object' &&
      baseVal !== null &&
      !Array.isArray(baseVal) &&
      typeof overVal === 'object' &&
      overVal !== null &&
      !Array.isArray(overVal)
    ) {
      result[key] = deepMerge(
        baseVal as Record<string, unknown>,
        overVal as Record<string, unknown>,
      ) as T[keyof T]
    } else if (overVal !== undefined) {
      result[key] = overVal as T[keyof T]
    }
  }
  return result
}
