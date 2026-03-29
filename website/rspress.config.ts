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
          { text: 'Product', link: '/product/' },
          { text: 'Desktop', link: '/desktop' },
          { text: 'Buddy Market', link: '/buddies' },
          { text: 'Guide', link: '/guide' },
          { text: 'Pricing', link: '/pricing' },
          { text: 'Shrimp Coins', link: '/tokens' },
          { text: 'API', link: '/api-doc/introduction' },
        ],
        sidebar: {
          '/product/': [
            {
              text: 'Product Docs',
              items: [
                { text: 'Getting Started', link: '/product/' },
                { text: 'Communities & Servers', link: '/product/communities' },
                { text: 'Channels & Messages', link: '/product/channels' },
                { text: 'AI Assistants', link: '/product/ai-assistants' },
                { text: 'Community Shop', link: '/product/shop' },
                { text: 'Buddy Rental', link: '/product/buddy-rental' },
                { text: 'Shared Workspace', link: '/product/workspace' },
                { text: 'Shadow Desktop', link: '/product/openclaw' },
                { text: 'Desktop App', link: '/desktop' },
                { text: 'FAQ', link: '/product/faq' },
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
          { text: '产品', link: '/zh/product/' },
          { text: '桌面端', link: '/zh/desktop' },
          { text: 'Buddy 集市', link: '/zh/buddies' },
          { text: '玩法指南', link: '/zh/guide' },
          { text: '定价', link: '/zh/pricing' },
          { text: '虾币', link: '/zh/tokens' },
          { text: 'API', link: '/zh/api-doc/introduction' },
        ],
        sidebar: {
          '/zh/product/': [
            {
              text: '产品文档',
              items: [
                { text: '使用指南', link: '/zh/product/' },
                { text: '社区与服务器', link: '/zh/product/communities' },
                { text: '频道与消息', link: '/zh/product/channels' },
                { text: 'AI 搭子', link: '/zh/product/ai-assistants' },
                { text: '社区店铺', link: '/zh/product/shop' },
                { text: 'Buddy 租赁', link: '/zh/product/buddy-rental' },
                { text: '共享工作区', link: '/zh/product/workspace' },
                { text: 'Shadow 桌面端', link: '/zh/product/openclaw' },
                { text: '桌面端应用', link: '/zh/desktop' },
                { text: '常见问题', link: '/zh/product/faq' },
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
