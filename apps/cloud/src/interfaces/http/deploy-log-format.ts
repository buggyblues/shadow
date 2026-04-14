export function formatDeploymentLogTimestamp(value?: string | null): string | null {
  if (!value) {
    return null
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

export function formatDeploymentLogLine(message: string, createdAt?: string | null): string {
  const timestamp = formatDeploymentLogTimestamp(createdAt)
  return timestamp ? `[${timestamp}] ${message}` : message
}
