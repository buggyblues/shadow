import type { MessageMention } from '@shadowob/shared'
import { segmentTextByMentions } from '@shadowob/shared'
import type { QueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useCallback, useMemo } from 'react'
import { EntityMentionSpan, MentionSpan } from './mentions'
import type { LegacyChannelEntry, LegacyServerEntry, MemberEntry, Message } from './types'

function lowerText(value: unknown) {
  return typeof value === 'string' ? value.toLocaleLowerCase() : ''
}

interface UseMessageMentionsArgs {
  membersList: MemberEntry[]
  messageMetadata: Message['metadata']
  queryClient: QueryClient
  serverId?: string
}

export function useMessageMentionRenderer({
  membersList,
  messageMetadata,
  queryClient,
  serverId,
}: UseMessageMentionsArgs) {
  const structuredMentions = useMemo(() => {
    return Array.isArray(messageMetadata?.mentions)
      ? (messageMetadata.mentions as MessageMention[]).filter((mention) => mention.token)
      : []
  }, [messageMetadata])

  const resolveMentionLabel = useCallback(
    (mention: string) => {
      if (!mention.startsWith('@')) return mention
      const username = mention.slice(1)
      const member = membersList.find(
        (item) => item.user?.username === username || item.user?.displayName === username,
      )
      const display = member?.user?.displayName ?? member?.user?.username
      return display ? `@${display}` : mention
    },
    [membersList],
  )

  const resolveLegacyEntityMention = useCallback(
    (token: string): MessageMention | null => {
      const key = token.slice(1).toLocaleLowerCase()
      if (!key) return null

      if (token.startsWith('@')) {
        const hasUserMatch = membersList.some((member) => {
          const username = member.user?.username?.toLocaleLowerCase()
          const displayName = member.user?.displayName?.toLocaleLowerCase()
          return username === key || displayName === key
        })
        if (hasUserMatch) return null

        const serverRows = queryClient.getQueriesData<LegacyServerEntry[]>({
          queryKey: ['servers'],
        })
        const servers = serverRows.flatMap(([, data]) => (Array.isArray(data) ? data : []))
        const server = servers.find((candidate) => {
          const slug = lowerText(candidate.slug)
          const name = lowerText(candidate.name)
          return slug === key || name === key
        })
        if (!server) return null
        const serverName = typeof server.name === 'string' && server.name.trim() ? server.name : key
        return {
          kind: 'server',
          targetId: server.id,
          token,
          sourceToken: token,
          label: `@${serverName}`,
          serverId: server.id,
          serverSlug: server.slug,
          serverName,
        }
      }

      if (!token.startsWith('#')) return null
      const channelRows = queryClient.getQueriesData<LegacyChannelEntry[]>({
        queryKey: ['channels'],
      })
      const channels = channelRows.flatMap(([, data]) => (Array.isArray(data) ? data : []))
      const channel = channels.find((candidate) => lowerText(candidate.name) === key)
      if (!channel || !serverId) return null
      const channelName =
        typeof channel.name === 'string' && channel.name.trim() ? channel.name : key

      return {
        kind: 'channel',
        targetId: channel.id,
        token,
        sourceToken: token,
        label: `#${channelName}`,
        channelId: channel.id,
        channelName,
        serverId,
        isPrivate: channel.isPrivate,
      }
    },
    [membersList, queryClient, serverId],
  )

  return useCallback(
    (children: ReactNode): ReactNode => {
      if (!children) return children
      const childArray = Array.isArray(children) ? children : [children]
      return childArray.map((child, childIndex) => {
        if (typeof child !== 'string') return child
        const structuredSegments = segmentTextByMentions(child, structuredMentions)
        const hasStructuredMention = structuredSegments.some(
          (segment) => segment.type === 'mention',
        )
        const parts = hasStructuredMention
          ? structuredSegments
          : [{ type: 'text' as const, text: child }]

        return parts.flatMap((part, partIndex) => {
          if (part.type === 'mention') {
            const structuredMention = part.mention
            if (structuredMention.kind === 'user' || structuredMention.kind === 'buddy') {
              return [
                <MentionSpan
                  key={`${childIndex}-${partIndex}`}
                  mention={part.text}
                  label={structuredMention.label}
                  structuredMention={structuredMention}
                />,
              ]
            }
            return [
              <EntityMentionSpan key={`${childIndex}-${partIndex}`} mention={structuredMention} />,
            ]
          }

          const legacyParts = part.text.split(/([@#][\p{L}\p{N}_-]+)/gu).filter(Boolean)
          if (legacyParts.length === 1) return [part.text]
          return legacyParts.map((legacyPart, legacyIndex) => {
            const legacyEntity = resolveLegacyEntityMention(legacyPart)
            if (legacyEntity) {
              return (
                <EntityMentionSpan
                  key={`${childIndex}-${partIndex}-${legacyIndex}`}
                  mention={legacyEntity}
                />
              )
            }
            if (/^@[\p{L}\p{N}_-]+$/u.test(legacyPart)) {
              return (
                <MentionSpan
                  key={`${childIndex}-${partIndex}-${legacyIndex}`}
                  mention={legacyPart}
                  label={resolveMentionLabel(legacyPart)}
                />
              )
            }
            return legacyPart
          })
        })
      })
    },
    [resolveLegacyEntityMention, resolveMentionLabel, structuredMentions],
  )
}
