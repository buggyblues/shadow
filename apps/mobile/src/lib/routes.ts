export function serverChannelHref(
  serverSlug: string,
  channelId: string,
  options: { messageId?: string | null } = {},
) {
  const params: Record<string, string> = {
    serverSlug,
    channelId,
  }
  if (options.messageId) {
    params.msg = options.messageId
  }

  return {
    pathname: '/servers/[serverSlug]/channels/[channelId]',
    params,
  } as const
}
