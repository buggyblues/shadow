/**
 * OpenClaw Channel Registry
 *
 * Defines the supported OpenClaw channel types with their metadata,
 * configuration fields, and validation rules. This serves as the
 * source of truth for the channel configuration GUI.
 */

import type { ChannelMeta } from './types'

const CHANNEL_REGISTRY: ChannelMeta[] = [
  {
    id: 'shadowob',
    label: 'Shadow',
    icon: '👤',
    description: 'Connect to Shadow servers for AI-powered chat',
    category: 'messaging',
    configFields: [
      {
        key: 'token',
        label: 'Agent Token',
        type: 'password',
        placeholder: 'JWT token from Shadow server',
        required: true,
        description: 'The authentication token for the AI agent bot account',
      },
      {
        key: 'serverUrl',
        label: 'Server URL',
        type: 'url',
        placeholder: 'https://shadowob.com',
        required: false,
        description: 'Shadow server URL (defaults to https://shadowob.com)',
      },
    ],
  },
  {
    id: 'telegram',
    label: 'Telegram',
    icon: '✈️',
    description: 'Telegram Bot API integration for group and private chats',
    category: 'messaging',
    configFields: [
      {
        key: 'botToken',
        label: 'Bot Token',
        type: 'password',
        placeholder: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11',
        required: true,
        description: 'Get from @BotFather on Telegram',
      },
    ],
  },
  {
    id: 'discord',
    label: 'Discord',
    icon: '🎮',
    description: 'Discord bot integration for servers and DMs',
    category: 'messaging',
    configFields: [
      {
        key: 'token',
        label: 'Bot Token',
        type: 'password',
        placeholder: 'Discord bot token',
        required: true,
        description: 'Get from Discord Developer Portal',
      },
    ],
  },
  {
    id: 'wechat',
    label: 'WeChat',
    icon: '💬',
    description: 'WeChat Official Account or Work WeChat integration',
    category: 'messaging',
    configFields: [
      {
        key: 'appId',
        label: 'App ID',
        type: 'text',
        placeholder: 'wx1234567890abcdef',
        required: true,
      },
      {
        key: 'appSecret',
        label: 'App Secret',
        type: 'password',
        placeholder: 'App Secret',
        required: true,
      },
      {
        key: 'token',
        label: 'Verification Token',
        type: 'text',
        placeholder: 'Token for webhook verification',
        required: true,
      },
    ],
  },
  {
    id: 'feishu',
    label: 'Feishu / Lark',
    icon: '🐦',
    description: 'Feishu (Lark) bot for enterprise messaging',
    category: 'enterprise',
    configFields: [
      {
        key: 'appId',
        label: 'App ID',
        type: 'text',
        placeholder: 'cli_xxxxxxxxxxxx',
        required: true,
      },
      {
        key: 'appSecret',
        label: 'App Secret',
        type: 'password',
        placeholder: 'Feishu App Secret',
        required: true,
      },
      {
        key: 'verificationToken',
        label: 'Verification Token',
        type: 'text',
        placeholder: 'Event verification token',
        required: false,
      },
    ],
  },
  {
    id: 'dingtalk',
    label: 'DingTalk',
    icon: '🔔',
    description: 'DingTalk (钉钉) bot integration',
    category: 'enterprise',
    configFields: [
      {
        key: 'appKey',
        label: 'App Key',
        type: 'text',
        placeholder: 'DingTalk App Key',
        required: true,
      },
      {
        key: 'appSecret',
        label: 'App Secret',
        type: 'password',
        placeholder: 'DingTalk App Secret',
        required: true,
      },
      {
        key: 'robotCode',
        label: 'Robot Code',
        type: 'text',
        placeholder: 'Robot Code',
        required: false,
      },
    ],
  },
  {
    id: 'wecom',
    label: 'WeCom',
    icon: '🏢',
    description: 'WeCom (企业微信) bot integration',
    category: 'enterprise',
    configFields: [
      {
        key: 'corpId',
        label: 'Corp ID',
        type: 'text',
        placeholder: 'ww1234567890abcdef',
        required: true,
      },
      {
        key: 'agentId',
        label: 'Agent ID',
        type: 'text',
        placeholder: '1000001',
        required: true,
      },
      {
        key: 'secret',
        label: 'Secret',
        type: 'password',
        placeholder: 'Agent Secret',
        required: true,
      },
    ],
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    icon: '📱',
    description: 'WhatsApp Business API integration',
    category: 'messaging',
    configFields: [
      {
        key: 'phoneNumberId',
        label: 'Phone Number ID',
        type: 'text',
        placeholder: 'WhatsApp Business Phone Number ID',
        required: true,
      },
      {
        key: 'accessToken',
        label: 'Access Token',
        type: 'password',
        placeholder: 'WhatsApp Cloud API access token',
        required: true,
      },
      {
        key: 'verifyToken',
        label: 'Verify Token',
        type: 'text',
        placeholder: 'Webhook verification token',
        required: false,
        description: 'Used for webhook verification setup',
      },
    ],
  },
  {
    id: 'slack',
    label: 'Slack',
    icon: '💼',
    description: 'Slack workspace bot integration',
    category: 'enterprise',
    configFields: [
      {
        key: 'botToken',
        label: 'Bot Token',
        type: 'password',
        placeholder: 'xoxb-xxxxxxxxxxxx',
        required: true,
        description: 'Bot User OAuth Token from Slack App settings',
      },
      {
        key: 'appToken',
        label: 'App Token',
        type: 'password',
        placeholder: 'xapp-xxxxxxxxxxxx',
        required: false,
        description: 'Required for Socket Mode',
      },
      {
        key: 'signingSecret',
        label: 'Signing Secret',
        type: 'password',
        placeholder: 'Slack signing secret',
        required: false,
      },
    ],
  },
  {
    id: 'matrix',
    label: 'Matrix',
    icon: '🔗',
    description: 'Matrix protocol integration for decentralized messaging',
    category: 'messaging',
    configFields: [
      {
        key: 'homeserverUrl',
        label: 'Homeserver URL',
        type: 'url',
        placeholder: 'https://matrix.org',
        required: true,
      },
      {
        key: 'accessToken',
        label: 'Access Token',
        type: 'password',
        placeholder: 'Matrix access token',
        required: true,
      },
      {
        key: 'userId',
        label: 'User ID',
        type: 'text',
        placeholder: '@bot:matrix.org',
        required: true,
      },
    ],
  },
  {
    id: 'qq-bot',
    label: 'QQ Bot',
    icon: '🐧',
    description: 'QQ official bot API integration',
    category: 'messaging',
    configFields: [
      {
        key: 'appId',
        label: 'App ID',
        type: 'text',
        placeholder: 'QQ Bot App ID',
        required: true,
      },
      {
        key: 'token',
        label: 'Token',
        type: 'password',
        placeholder: 'QQ Bot Token',
        required: true,
      },
      {
        key: 'appSecret',
        label: 'App Secret',
        type: 'password',
        placeholder: 'QQ Bot App Secret',
        required: true,
      },
    ],
  },
  {
    id: 'line',
    label: 'LINE',
    icon: '🟢',
    description: 'LINE Messaging API integration',
    category: 'messaging',
    configFields: [
      {
        key: 'channelAccessToken',
        label: 'Channel Access Token',
        type: 'password',
        placeholder: 'LINE channel access token',
        required: true,
      },
      {
        key: 'channelSecret',
        label: 'Channel Secret',
        type: 'password',
        placeholder: 'LINE channel secret',
        required: true,
      },
    ],
  },
  {
    id: 'webhook',
    label: 'Custom Webhook',
    icon: '🔌',
    description: 'Generic webhook integration for custom platforms',
    category: 'custom',
    configFields: [
      {
        key: 'webhookUrl',
        label: 'Webhook URL',
        type: 'url',
        placeholder: 'https://your-platform.com/webhook',
        required: true,
      },
      {
        key: 'secret',
        label: 'Webhook Secret',
        type: 'password',
        placeholder: 'HMAC signing secret',
        required: false,
      },
      {
        key: 'headers',
        label: 'Custom Headers',
        type: 'text',
        placeholder: 'Authorization: Bearer xxx',
        required: false,
        description: 'One header per line',
      },
    ],
  },
]

export function getChannelRegistry(): ChannelMeta[] {
  return CHANNEL_REGISTRY
}

export function getChannelMeta(channelId: string): ChannelMeta | null {
  return CHANNEL_REGISTRY.find((c) => c.id === channelId) ?? null
}

export function getChannelsByCategory(category: ChannelMeta['category']): ChannelMeta[] {
  return CHANNEL_REGISTRY.filter((c) => c.category === category)
}
