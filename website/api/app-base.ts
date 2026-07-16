declare const __SHADOW_API_BASE_URL__: string | undefined
declare const __SHADOW_SPACE_APP_BASE_URL__: string | undefined

export function configuredApiBase() {
  return (typeof __SHADOW_API_BASE_URL__ !== 'undefined' ? __SHADOW_API_BASE_URL__ : '').replace(
    /\/$/,
    '',
  )
}

export function configuredAppBase() {
  return (
    typeof __SHADOW_SPACE_APP_BASE_URL__ !== 'undefined' ? __SHADOW_SPACE_APP_BASE_URL__ : ''
  ).replace(/\/$/, '')
}

export function apiUrl(path: string) {
  return `${configuredAppBase()}${path}`
}
