export type CloudComputerBuddyHandshakeCandidate = {
  id: string
  name: string
  status: string
  botUser?: {
    id?: string | null
    displayName?: string | null
    username?: string | null
    avatarUrl?: string | null
  } | null
}

export function findReadyCloudComputerBuddy<T extends CloudComputerBuddyHandshakeCandidate>(
  buddies: T[],
  expectedId: string,
) {
  const buddy = buddies.find((candidate) => candidate.id === expectedId)
  return buddy?.status === 'running' &&
    typeof buddy.botUser?.id === 'string' &&
    buddy.botUser.id.trim().length > 0
    ? buddy
    : null
}

export async function waitForCloudComputerBuddy<
  T extends CloudComputerBuddyHandshakeCandidate,
>(input: {
  load: () => Promise<T[]>
  expectedId: string
  timeoutMs?: number
  pollIntervalMs?: number
  signal?: AbortSignal
}) {
  const timeoutMs = input.timeoutMs ?? 120_000
  const pollIntervalMs = input.pollIntervalMs ?? 1_500
  const deadline = Date.now() + timeoutMs

  while (!input.signal?.aborted && Date.now() < deadline) {
    try {
      const buddy = findReadyCloudComputerBuddy(await input.load(), input.expectedId)
      if (buddy) return buddy
    } catch {
      // The Buddy endpoint can briefly be unavailable while its Cloud Computer starts.
      // Continue within the bounded handshake window instead of failing a completed create.
    }
    await new Promise<void>((resolve) => {
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        input.signal?.removeEventListener('abort', finish)
        resolve()
      }
      const timer = setTimeout(finish, pollIntervalMs)
      input.signal?.addEventListener('abort', finish, { once: true })
    })
  }

  return null
}
