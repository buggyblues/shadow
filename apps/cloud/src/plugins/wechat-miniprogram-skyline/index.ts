import {
  attachConnectorRuntimeAssets,
  connectorField,
  connectorManifest,
} from '../connector-kit.js'
import { defineConnectorPlugin } from '../helpers.js'

const manifest = connectorManifest({
  id: 'wechat-miniprogram-skyline',
  name: 'WeChat Mini Program Skyline',
  description:
    'WeChat Mini Program Skyline development skills for page structure, Skyline rendering, scroll APIs, worklets, WXSS, components, routes, and performance optimization.',
  category: 'code',
  icon: 'smartphone',
  website:
    'https://developers.weixin.qq.com/miniprogram/dev/framework/runtime/skyline/introduction.html',
  docs: 'https://github.com/wechat-miniprogram/skyline-skills',
  fields: [
    connectorField('WECHAT_MINIPROGRAM_APPID', 'Mini Program AppID', {
      description: 'Optional WeChat Mini Program AppID for project-specific guidance.',
      required: false,
      sensitive: false,
      placeholder: 'wx...',
    }),
    connectorField('WECHAT_MINIPROGRAM_PRIVATE_KEY', 'CI private key', {
      description: 'Optional Mini Program CI private key.',
      required: false,
      placeholder: '-----BEGIN PRIVATE KEY-----...',
    }),
  ],
  capabilities: ['tool', 'data-source'],
  tags: ['wechat', 'mini-program', 'skyline', 'skills', 'wxss', 'performance'],
  popularity: 86,
})

const skillSources = [
  {
    id: 'wechat-skyline-skills',
    kind: 'git' as const,
    url: 'https://github.com/wechat-miniprogram/skyline-skills.git',
    ref: 'main',
    from: 'skills',
    targetPath: '/workspace/.agents/plugin-skills/wechat-miniprogram-skyline',
    includePattern: 'skyline-*',
    description: 'WeChat Mini Program Skyline skills',
  },
]

const plugin = defineConnectorPlugin(manifest, {
  skillSources,
  verificationChecks: [
    {
      id: 'wechat-skyline-skills-mounted',
      label: 'WeChat Skyline skills mounted',
      kind: 'command',
      command: [
        'test',
        '-f',
        '/workspace/.agents/plugin-skills/wechat-miniprogram-skyline/skyline-overview/SKILL.md',
      ],
      timeoutMs: 5_000,
      risk: 'safe',
    },
  ],
  prompt:
    'Use WeChat Mini Program Skyline skills for page architecture, Skyline rendering, WXSS, components, scroll APIs, worklets, routes, migration, and performance optimization.',
})

export default attachConnectorRuntimeAssets(plugin, {
  skillSources,
  skillsMountPath: '/workspace/.agents/plugin-skills/wechat-miniprogram-skyline',
})
