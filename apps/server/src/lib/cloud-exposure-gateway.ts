const DEFAULT_EXPOSURE_DOMAIN = 'shadowob.com'
const DEFAULT_LOCAL_GATEWAY_SUFFIX = 'localhost'

function exposureDomain() {
  return (process.env.SHADOW_CLOUD_EXPOSURE_DOMAIN ?? DEFAULT_EXPOSURE_DOMAIN)
    .trim()
    .toLowerCase()
    .replace(/^\.+|\.+$/g, '')
}

export function isCloudExposureHost(hostname: string) {
  const normalizedHost = hostname.toLowerCase().replace(/\.$/, '')
  const domain = exposureDomain()
  if (!domain) return false
  if (!normalizedHost.endsWith(`.${domain}`)) return false
  return normalizedHost.startsWith('app-') || normalizedHost.startsWith('exp-')
}

function hasLocalControlPlaneUrl() {
  return [process.env.OAUTH_BASE_URL, process.env.CORS_ORIGIN]
    .filter((value): value is string => Boolean(value))
    .some((value) => /(^|[,/])http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?/i.test(value))
}

export function localCloudExposureGatewayEnabled() {
  if (process.env.SHADOW_CLOUD_EXPOSURE_LOCAL_GATEWAY === 'false') return false
  if (process.env.SHADOW_CLOUD_EXPOSURE_LOCAL_GATEWAY === 'true') return true
  return process.env.NODE_ENV !== 'production' || hasLocalControlPlaneUrl()
}

function localGatewaySuffix() {
  return (process.env.SHADOW_CLOUD_EXPOSURE_LOCAL_GATEWAY_SUFFIX ?? DEFAULT_LOCAL_GATEWAY_SUFFIX)
    .trim()
    .toLowerCase()
    .replace(/^\.+|\.+$/g, '')
}

function localGatewayUrl(url: URL) {
  if (!localCloudExposureGatewayEnabled()) return null
  const suffix = localGatewaySuffix()
  if (!suffix) return null
  const protocol = process.env.SHADOW_CLOUD_EXPOSURE_LOCAL_GATEWAY_PROTOCOL ?? 'http'
  const port = process.env.SHADOW_CLOUD_EXPOSURE_LOCAL_GATEWAY_PORT ?? process.env.PORT ?? '3002'
  const host = `${url.hostname}.${suffix}`
  return `${protocol}://${host}${port ? `:${port}` : ''}${url.pathname}${url.search}${url.hash}`
}

export function rewriteCloudExposureUrlToGateway(value: string | null | undefined) {
  if (!value) return value
  try {
    const url = new URL(value)
    if (!isCloudExposureHost(url.hostname)) return value
    return localGatewayUrl(url) ?? value
  } catch {
    return value
  }
}

export function cloudExposureHostFromLocalGatewayHost(hostHeader: string | null | undefined) {
  if (!hostHeader) return null
  const hostname = hostHeader.split(':')[0]?.toLowerCase().replace(/\.$/, '') ?? ''
  const suffix = localGatewaySuffix()
  if (!suffix || !hostname.endsWith(`.${suffix}`)) return null
  const exposureHost = hostname.slice(0, -(suffix.length + 1))
  return isCloudExposureHost(exposureHost) ? exposureHost : null
}
