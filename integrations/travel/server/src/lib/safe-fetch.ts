import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0'])

function ipv4Private(host: string) {
  const parts = host.split('.').map((part) => Number(part))
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false
  const [a, b] = parts
  if (a === undefined || b === undefined) return false
  if (a === 10) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 169 && b === 254) return true
  return false
}

function ipv4Loopback(host: string) {
  const first = Number(host.split('.')[0])
  return first === 127 || host === '0.0.0.0'
}

function ipv6Unsafe(host: string) {
  const normalized = host.toLowerCase()
  return (
    normalized === '::1' ||
    normalized === '::' ||
    normalized.startsWith('fe80:') ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd')
  )
}

async function resolveHost(hostname: string) {
  if (isIP(hostname)) return [hostname]
  try {
    const rows = await lookup(hostname, { all: true, verbatim: true })
    return rows.map((row) => row.address)
  } catch {
    return []
  }
}

export async function assertSafeOutboundUrl(url: URL) {
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Only http(s) URLs are allowed')
  }
  const hostname = url.hostname.toLowerCase()
  if (LOOPBACK_HOSTS.has(hostname)) throw new Error('Loopback URLs are blocked')
  const addresses = await resolveHost(hostname)
  const allowInternal = process.env.TRAVEL_ALLOW_INTERNAL_NETWORK === 'true'
  for (const address of addresses.length ? addresses : [hostname]) {
    if (isIP(address) === 4) {
      if (ipv4Loopback(address)) throw new Error('Loopback URLs are blocked')
      if (!allowInternal && ipv4Private(address))
        throw new Error('Private network URLs are blocked')
    }
    if (isIP(address) === 6 && ipv6Unsafe(address)) {
      throw new Error(
        address === '::1' || address === '::'
          ? 'Loopback URLs are blocked'
          : 'Private network URLs are blocked',
      )
    }
  }
}

export async function safeFetch(input: string | URL, init?: RequestInit) {
  const url = typeof input === 'string' ? new URL(input) : input
  await assertSafeOutboundUrl(url)
  return fetch(url, init)
}

export async function safeFetchFollow(input: string | URL, init?: RequestInit, maxRedirects = 5) {
  let url = typeof input === 'string' ? new URL(input) : input
  for (let index = 0; index <= maxRedirects; index += 1) {
    await assertSafeOutboundUrl(url)
    const response = await fetch(url, { ...init, redirect: 'manual' })
    const location = response.headers.get('location')
    if (!location || response.status < 300 || response.status >= 400) return response
    url = new URL(location, url)
  }
  throw new Error('Too many redirects')
}
