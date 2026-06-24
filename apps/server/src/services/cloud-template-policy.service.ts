import { isIP } from 'node:net'
import { listPluginLibrary, validateCloudSaasConfigSnapshot } from '@shadowob/cloud'
import { isBlockedAddress } from '../lib/ssrf'

const FORBIDDEN_TEMPLATE_KEYS = new Set(['hostPath', 'hostNetwork', 'hostPID', 'hostIPC'])
const TOKEN_LIKE_PATTERN =
  /(?:SHADOWOB_USER_TOKEN|Authorization:\s*Bearer\s+[A-Za-z0-9._-]{16,}|sk-[A-Za-z0-9_-]{16,}|eyJ[A-Za-z0-9_-]{20,})/i
const DNS_HOST_PATTERN =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])\.?$/i

export type CloudTemplatePolicyResult =
  | { ok: true; pluginIds: string[] }
  | { ok: false; error: string; path: string }

function pathWith(path: string[], key: string | number) {
  return [...path, String(key)]
}

function formatPath(path: string[]) {
  return path.length > 0 ? path.join('.') : 'root'
}

function fail(path: string[], error: string): CloudTemplatePolicyResult {
  return { ok: false, error, path: formatPath(path) }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function validateAllowedHost(host: unknown, path: string[]): CloudTemplatePolicyResult | null {
  if (typeof host !== 'string' || host.length > 253 || host.includes('/') || host.includes(':')) {
    return fail(path, 'Invalid network allowed host')
  }
  const normalized = host.trim().toLowerCase().replace(/\.$/, '')
  if (!normalized || normalized === 'localhost' || normalized.endsWith('.localhost')) {
    return fail(path, 'Local network allowed hosts are not permitted')
  }
  if (isIP(normalized)) {
    return isBlockedAddress(normalized)
      ? fail(path, 'Private or local network allowed hosts are not permitted')
      : null
  }
  if (!DNS_HOST_PATTERN.test(normalized)) {
    return fail(path, 'Network allowed host must be a DNS hostname or public IP')
  }
  return null
}

function collectLegacyPluginIds(value: unknown, pluginIds: Set<string>) {
  if (!isPlainObject(value)) return
  for (const key of Object.keys(value)) {
    pluginIds.add(key)
  }
}

function walkTemplate(
  value: unknown,
  path: string[],
  pluginIds: Set<string>,
): CloudTemplatePolicyResult | null {
  if (typeof value === 'string') {
    return TOKEN_LIKE_PATTERN.test(value)
      ? fail(path, 'Template contains token-like secret data')
      : null
  }

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const result = walkTemplate(item, pathWith(path, index), pluginIds)
      if (result) return result
    }
    return null
  }

  if (!isPlainObject(value)) return null

  const networking = value.networking
  if (isPlainObject(networking)) {
    if (networking.type === 'unrestricted') {
      return fail(pathWith(path, 'networking.type'), 'Unrestricted network policy is not permitted')
    }
    const allowedHosts = networking.allowedHosts
    if (allowedHosts !== undefined) {
      if (!Array.isArray(allowedHosts) || allowedHosts.length > 32) {
        return fail(pathWith(path, 'networking.allowedHosts'), 'Invalid network allowed hosts')
      }
      for (const [index, host] of allowedHosts.entries()) {
        const result = validateAllowedHost(
          host,
          pathWith(path, `networking.allowedHosts[${index}]`),
        )
        if (result) return result
      }
    }
  }

  for (const [key, child] of Object.entries(value)) {
    const childPath = pathWith(path, key)
    if (FORBIDDEN_TEMPLATE_KEYS.has(key)) {
      return fail(childPath, `Forbidden template key: ${key}`)
    }
    if (key === 'securityContext') {
      return fail(childPath, 'Template-level securityContext overrides are not permitted')
    }
    if (key === 'privileged' && child === true) {
      return fail(childPath, 'Privileged containers are not permitted')
    }
    if (key === 'allowPrivilegeEscalation' && child === true) {
      return fail(childPath, 'Privilege escalation is not permitted')
    }
    if (key === 'plugin') {
      if (typeof child !== 'string') {
        return fail(childPath, 'Plugin references must be string IDs')
      }
      pluginIds.add(child)
    }
    if (path.length === 0 && key === 'plugins') {
      collectLegacyPluginIds(child, pluginIds)
    }
    const result = walkTemplate(child, childPath, pluginIds)
    if (result) return result
  }

  return null
}

export function validateCloudTemplatePolicy(template: unknown): CloudTemplatePolicyResult {
  validateCloudSaasConfigSnapshot(template)
  const pluginIds = new Set<string>()
  const violation = walkTemplate(template, [], pluginIds)
  if (violation) return violation

  const officialPluginIds = new Set(listPluginLibrary().map((plugin) => plugin.id))
  for (const pluginId of pluginIds) {
    if (!officialPluginIds.has(pluginId)) {
      return fail(['plugin', pluginId], `Unknown or unsupported Cloud plugin: ${pluginId}`)
    }
  }

  return { ok: true, pluginIds: [...pluginIds].sort() }
}

export function assertCloudTemplatePolicy(template: unknown): string[] {
  const result = validateCloudTemplatePolicy(template)
  if (!result.ok) {
    throw Object.assign(new Error(`${result.error} at ${result.path}`), {
      status: 422,
      code: 'CLOUD_TEMPLATE_POLICY_VIOLATION',
    })
  }
  return result.pluginIds
}
