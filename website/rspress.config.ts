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
          { text: 'Features', link: '/#features' },
          { text: 'Product', link: '/product/' },
          { text: 'Desktop', link: '/desktop' },
          { text: 'Buddy Market', link: '/buddies' },
          { text: 'Pricing', link: '/pricing' },
          { text: 'API', link: '/api/introduction' },
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
                { text: 'OpenClaw Plugin', link: '/product/openclaw' },
                { text: 'Desktop App', link: '/desktop' },
                { text: 'FAQ', link: '/product/faq' },
              ],
            },
          ],
          '/api/': [
            {
              text: 'Getting Started',
              items: [
                { text: 'Introduction', link: '/api/introduction' },
                { text: 'Authentication', link: '/api/authentication' },
                { text: 'SDKs', link: '/api/sdks' },
                { text: 'Errors', link: '/api/errors' },
              ],
            },
            {
              text: 'Core',
              items: [
                { text: 'Authentication', link: '/api/auth' },
                { text: 'Servers', link: '/api/servers' },
                { text: 'Channels', link: '/api/channels' },
                { text: 'Messages', link: '/api/messages' },
                { text: 'Threads', link: '/api/threads' },
                { text: 'DMs', link: '/api/dms' },
              ],
            },
            {
              text: 'Social',
              items: [
                { text: 'Friendships', link: '/api/friendships' },
                { text: 'Invites', link: '/api/invites' },
                { text: 'Notifications', link: '/api/notifications' },
              ],
            },
            {
              text: 'Agents',
              items: [
                { text: 'Agents', link: '/api/agents' },
                { text: 'Marketplace', link: '/api/marketplace' },
              ],
            },
            {
              text: 'Commerce',
              items: [{ text: 'Shop', link: '/api/shop' }],
            },
            {
              text: 'Platform',
              items: [
                { text: 'OAuth', link: '/api/oauth' },
                { text: 'Apps', link: '/api/apps' },
                { text: 'Workspace', link: '/api/workspace' },
                { text: 'Search', link: '/api/search' },
                { text: 'Media', link: '/api/media' },
                { text: 'Task Center', link: '/api/tasks' },
              ],
            },
            {
              text: 'Real-time',
              items: [{ text: 'WebSocket Events', link: '/api/websocket' }],
            },
          ],
        },
      },
      {
        lang: 'zh',
        label: '中文',
        nav: [
          { text: '特色功能', link: '/zh/#features' },
          { text: '产品', link: '/zh/product/' },
          { text: '桌面端', link: '/zh/desktop' },
          { text: 'Buddy 集市', link: '/zh/buddies' },
          { text: '定价', link: '/zh/pricing' },
          { text: 'API', link: '/zh/api/introduction' },
        ],
        sidebar: {
          '/zh/product/': [
            {
              text: '产品文档',
              items: [
                { text: '使用指南', link: '/zh/product/' },
                { text: '社区与服务器', link: '/zh/product/communities' },
                { text: '频道与消息', link: '/zh/product/channels' },
                { text: 'AI 助手', link: '/zh/product/ai-assistants' },
                { text: '社区店铺', link: '/zh/product/shop' },
                { text: 'Buddy 租赁', link: '/zh/product/buddy-rental' },
                { text: '共享工作区', link: '/zh/product/workspace' },
                { text: 'OpenClaw 插件', link: '/zh/product/openclaw' },
                { text: '桌面端应用', link: '/zh/desktop' },
                { text: '常见问题', link: '/zh/product/faq' },
              ],
            },
          ],
          '/zh/api/': [
            {
              text: '快速开始',
              items: [
                { text: '简介', link: '/zh/api/introduction' },
                { text: '认证', link: '/zh/api/authentication' },
                { text: 'SDK', link: '/zh/api/sdks' },
                { text: '错误处理', link: '/zh/api/errors' },
              ],
            },
            {
              text: '核心',
              items: [
                { text: '认证', link: '/zh/api/auth' },
                { text: '服务器', link: '/zh/api/servers' },
                { text: '频道', link: '/zh/api/channels' },
                { text: '消息', link: '/zh/api/messages' },
                { text: '线程', link: '/zh/api/threads' },
                { text: '私信', link: '/zh/api/dms' },
              ],
            },
            {
              text: '社交',
              items: [
                { text: '好友', link: '/zh/api/friendships' },
                { text: '邀请码', link: '/zh/api/invites' },
                { text: '通知', link: '/zh/api/notifications' },
              ],
            },
            {
              text: 'AI 代理',
              items: [
                { text: '代理', link: '/zh/api/agents' },
                { text: '市场', link: '/zh/api/marketplace' },
              ],
            },
            {
              text: '商业',
              items: [{ text: '商店', link: '/zh/api/shop' }],
            },
            {
              text: '平台',
              items: [
                { text: 'OAuth', link: '/zh/api/oauth' },
                { text: '应用', link: '/zh/api/apps' },
                { text: '工作区', link: '/zh/api/workspace' },
                { text: '搜索', link: '/zh/api/search' },
                { text: '媒体', link: '/zh/api/media' },
                { text: '任务中心', link: '/zh/api/tasks' },
              ],
            },
            {
              text: '实时通信',
              items: [{ text: 'WebSocket 事件', link: '/zh/api/websocket' }],
            },
          ],
        },
      },
    ],
  },
})
