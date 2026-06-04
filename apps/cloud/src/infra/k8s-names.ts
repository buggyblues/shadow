import { stableHash } from './hash.js'

const DNS1035_LABEL_MAX_LENGTH = 63
const DNS1035_LABEL_PATTERN = /^[a-z]([-a-z0-9]*[a-z0-9])?$/

function normalizeDns1035Label(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function truncateDns1035Label(value: string): string {
  if (value.length <= DNS1035_LABEL_MAX_LENGTH) {
    return value
  }

  const hash = stableHash(value).slice(0, 8)
  const prefixLength = DNS1035_LABEL_MAX_LENGTH - hash.length - 1
  const prefix = value.slice(0, prefixLength).replace(/-+$/g, '')
  return `${prefix}-${hash}`
}

export function toDns1035Label(value: string, fallback = 'agent'): string {
  let label = normalizeDns1035Label(value) || fallback

  if (!/^[a-z]/.test(label)) {
    label = `agent-${label}`
  }

  label = truncateDns1035Label(label).replace(/-+$/g, '')

  if (DNS1035_LABEL_PATTERN.test(label)) {
    return label
  }

  return fallback
}

export function serviceNameForAgent(agentName: string): string {
  return toDns1035Label(`${agentName}-svc`, 'agent-svc')
}
