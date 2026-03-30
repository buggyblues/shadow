import path from 'node:path'
import { defineConfig } from 'rspress/config'
import remarkCodeGroup from './plugins/remarkCodeGroup'

const BASE = process.env.DOCS_BASE ?? '/'

export default defineConfig({
  root: 'docs',
  base: BASE,
  title: 'Shadow',
  description:
    'Shadow — AI-native community platform with Buddy collaboration, P2P rental, and shared workspace',
  icon: '/Logo.svg',
  logo: '/Logo.svg',
  lang: 'en',
  markdown: {
    mdxRs: false,
    remarkPlugins: [remarkCodeGroup],
    globalComponents: [path.join(__dirname, 'components/CodeGroup.tsx')],
  },
  locales: [
    {
      lang: 'en',
      label: 'English',
    },
    {
      lang: 'zh',
      label: '中文',
    },
  ],
  themeConfig: {
    socialLinks: [
      { icon: 'github', mode: 'link', content: 'https://github.com/buggyblues/shadow' },
    ],
    locales: [
      {
        lang: 'en',
        label: 'English',
        nav: [
          { text: 'Buddy', link: '/buddy' },
          { text: 'Play', link: '/play/' },
          { text: 'Guide', link: '/guide/' },
          { text: 'API', link: '/api-doc/introduction' },
          { text: 'Download', link: '/download' },
        ],
        sidebar: {
          '/play/': [
            {
              text: 'Play',
              items: [
                { text: 'Getting Started', link: '/play/' },
                { text: 'Shrimp Coins', link: '/play/shrimp-coins' },
                { text: 'Buddy System', link: '/play/buddy-system' },
                { text: 'Community Features', link: '/play/community-features' },
                { text: 'Advanced Tips', link: '/play/advanced-tips' },
              ],
            },
          ],
          '/guide/': [
            {
              text: 'Guide',
              items: [
                { text: 'Getting Started', link: '/guide/' },
                { text: 'Communities & Servers', link: '/guide/communities' },
                { text: 'Channels & Messages', link: '/guide/channels' },
                { text: 'AI Assistants', link: '/guide/ai-assistants' },
                { text: 'Buddy Rental', link: '/guide/buddy-rental' },
                { text: 'Community Shop', link: '/guide/shop' },
                { text: 'Shared Workspace', link: '/guide/workspace' },
                { text: 'OpenClaw Plugin', link: '/guide/openclaw' },
                { text: 'FAQ', link: '/guide/faq' },
              ],
            },
          ],
          '/api-doc/': [
            {
              text: 'Getting Started',
              items: [
                { text: 'Introduction', link: '/api-doc/introduction' },
                { text: 'Authentication', link: '/api-doc/authentication' },
                { text: 'SDKs', link: '/api-doc/sdks' },
                { text: 'CLI', link: '/api-doc/cli' },
                { text: 'Errors', link: '/api-doc/errors' },
              ],
            },
            {
              text: 'Core',
              items: [
                { text: 'Authentication', link: '/api-doc/auth' },
                { text: 'Servers', link: '/api-doc/servers' },
                { text: 'Channels', link: '/api-doc/channels' },
                { text: 'Messages', link: '/api-doc/messages' },
                { text: 'Threads', link: '/api-doc/threads' },
                { text: 'DMs', link: '/api-doc/dms' },
              ],
            },
            {
              text: 'Social',
              items: [
                { text: 'Friendships', link: '/api-doc/friendships' },
                { text: 'Invites', link: '/api-doc/invites' },
                { text: 'Notifications', link: '/api-doc/notifications' },
              ],
            },
            {
              text: 'Agents',
              items: [
                { text: 'Agents', link: '/api-doc/agents' },
                { text: 'Marketplace', link: '/api-doc/marketplace' },
              ],
            },
            {
              text: 'Commerce',
              items: [{ text: 'Shop', link: '/api-doc/shop' }],
            },
            {
              text: 'Platform',
              items: [
                { text: 'OAuth', link: '/api-doc/oauth' },
                { text: 'Platform Apps', link: '/api-doc/platform-apps' },
                { text: 'Apps', link: '/api-doc/apps' },
                { text: 'Workspace', link: '/api-doc/workspace' },
                { text: 'Search', link: '/api-doc/search' },
                { text: 'Media', link: '/api-doc/media' },
                { text: 'Task Center', link: '/api-doc/tasks' },
              ],
            },
            {
              text: 'Real-time',
              items: [{ text: 'WebSocket Events', link: '/api-doc/websocket' }],
            },
          ],
        },
      },
      {
        lang: 'zh',
        label: '中文',
        nav: [
          { text: 'Buddy', link: '/zh/buddy' },
          { text: '玩法', link: '/zh/play/' },
          { text: '指南', link: '/zh/guide/' },
          { text: 'API', link: '/zh/api-doc/introduction' },
          { text: '下载', link: '/zh/download' },
        ],
        sidebar: {
          '/zh/play/': [
            {
              text: '玩法',
              items: [
                { text: '新手入门', link: '/zh/play/' },
                { text: '虾币', link: '/zh/play/shrimp-coins' },
                { text: 'Buddy 系统', link: '/zh/play/buddy-system' },
                { text: '社区玩法', link: '/zh/play/community-features' },
                { text: '进阶技巧', link: '/zh/play/advanced-tips' },
              ],
            },
          ],
          '/zh/guide/': [
            {
              text: '指南',
              items: [
                { text: '使用指南', link: '/zh/guide/' },
                { text: '社区与服务器', link: '/zh/guide/communities' },
                { text: '频道与消息', link: '/zh/guide/channels' },
                { text: 'AI 搭子', link: '/zh/guide/ai-assistants' },
                { text: 'Buddy 租赁', link: '/zh/guide/buddy-rental' },
                { text: '社区店铺', link: '/zh/guide/shop' },
                { text: '共享工作区', link: '/zh/guide/workspace' },
                { text: 'OpenClaw 插件', link: '/zh/guide/openclaw' },
                { text: '常见问题', link: '/zh/guide/faq' },
              ],
            },
          ],
          '/zh/api-doc/': [
            {
              text: '快速开始',
              items: [
                { text: '简介', link: '/zh/api-doc/introduction' },
                { text: '认证', link: '/zh/api-doc/authentication' },
                { text: 'SDK', link: '/zh/api-doc/sdks' },
                { text: 'CLI', link: '/zh/api-doc/cli' },
                { text: '错误处理', link: '/zh/api-doc/errors' },
              ],
            },
            {
              text: '核心',
              items: [
                { text: '认证', link: '/zh/api-doc/auth' },
                { text: '服务器', link: '/zh/api-doc/servers' },
                { text: '频道', link: '/zh/api-doc/channels' },
                { text: '消息', link: '/zh/api-doc/messages' },
                { text: '线程', link: '/zh/api-doc/threads' },
                { text: '私信', link: '/zh/api-doc/dms' },
              ],
            },
            {
              text: '社交',
              items: [
                { text: '好友', link: '/zh/api-doc/friendships' },
                { text: '邀请码', link: '/zh/api-doc/invites' },
                { text: '通知', link: '/zh/api-doc/notifications' },
              ],
            },
            {
              text: 'AI 代理',
              items: [
                { text: '代理', link: '/zh/api-doc/agents' },
                { text: '市场', link: '/zh/api-doc/marketplace' },
              ],
            },
            {
              text: '商业',
              items: [{ text: '商店', link: '/zh/api-doc/shop' }],
            },
            {
              text: '平台',
              items: [
                { text: 'OAuth', link: '/zh/api-doc/oauth' },
                { text: '平台应用', link: '/zh/api-doc/platform-apps' },
                { text: '应用', link: '/zh/api-doc/apps' },
                { text: '工作区', link: '/zh/api-doc/workspace' },
                { text: '搜索', link: '/zh/api-doc/search' },
                { text: '媒体', link: '/zh/api-doc/media' },
                { text: '任务中心', link: '/zh/api-doc/tasks' },
              ],
            },
            {
              text: '实时通信',
              items: [{ text: 'WebSocket 事件', link: '/zh/api-doc/websocket' }],
            },
          ],
        },
      },
    ],
  },
})
