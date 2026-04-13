function pad(value: number): string {
  return String(value).padStart(2, '0')
}

export function formatDeploymentLogTimestamp(value?: string | null): string | null {
  if (!value) {
    return null
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export function formatDeploymentLogLine(message: string, createdAt?: string | null): string {
  const timestamp = formatDeploymentLogTimestamp(createdAt)
  return timestamp ? `[${timestamp}] ${message}` : message
}
