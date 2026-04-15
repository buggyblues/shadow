import path from 'node:path'
import { defineConfig } from 'rspress/config'
import remarkCodeGroup from './plugins/remarkCodeGroup'
import remarkMermaid from './plugins/remarkMermaid'

const BASE = process.env.DOCS_BASE ?? '/'

export default defineConfig({
  root: 'docs',
  base: BASE,
  title: 'Shadow',
  // Inject dark-mode default script (runs before paint to avoid flash)
  head: [
    [
      'script',
      {},
      `(function(){try{var s=localStorage.getItem('rspress-theme-appearance');if(s==='light'){document.documentElement.classList.remove('dark');document.documentElement.style.colorScheme='light';}else{document.documentElement.classList.add('dark');document.documentElement.style.colorScheme='dark';if(!s)localStorage.setItem('rspress-theme-appearance','dark');}}catch(e){document.documentElement.classList.add('dark');}})();`,
    ],
  ],
  description:
    'Shadow — AI-native community platform with Buddy collaboration, P2P rental, and shared workspace',
  icon: '/Logo.svg',
  // logo intentionally omitted — CustomNavTitle slot renders the logo to avoid duplication
  lang: 'en',
  markdown: {
    mdxRs: false,
    remarkPlugins: [remarkCodeGroup, remarkMermaid],
    globalComponents: [
      path.join(__dirname, 'components/CodeGroup.tsx'),
      path.join(__dirname, 'components/MermaidDiagram.tsx'),
    ],
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
    // socialLinks removed from nav — GitHub link lives in footer only
    locales: [
      {
        lang: 'en',
        label: 'English',
        nav: [
          { text: 'Product', link: '/product/' },
          { text: 'Platform', link: '/platform/introduction' },
        ],
        sidebar: {
          '/product/': [
            {
              text: 'Getting Started',
              items: [
                { text: 'Overview', link: '/product/' },
                { text: 'Quick Start', link: '/product/quick-start' },
                { text: 'FAQ', link: '/product/faq' },
              ],
            },
            {
              text: 'Community',
              items: [
                { text: 'Servers & Communities', link: '/product/communities' },
                { text: 'Channels & Messages', link: '/product/channels' },
                { text: 'Community Features', link: '/product/community-features' },
              ],
            },
            {
              text: 'AI Buddies',
              items: [
                { text: 'AI Assistants', link: '/product/ai-assistants' },
                { text: 'Buddy System', link: '/product/buddy-system' },
                { text: 'Advanced Tips', link: '/product/advanced-tips' },
              ],
            },
            {
              text: 'Economy',
              items: [
                { text: 'Shrimp Coins', link: '/product/shrimp-coins' },
                { text: 'Buddy Rental', link: '/product/buddy-rental' },
                { text: 'Community Shop', link: '/product/shop' },
              ],
            },
            {
              text: 'Workspace & Tools',
              items: [
                { text: 'Shared Workspace', link: '/product/workspace' },
                { text: 'Shadow Desktop', link: '/product/download' },
                { text: 'OpenClaw Plugin', link: '/product/openclaw' },
                { text: 'Apps', link: '/product/apps' },
              ],
            },
          ],
          '/platform/': [
            {
              text: 'Getting Started',
              items: [
                { text: 'Introduction', link: '/platform/introduction' },
                { text: 'Authentication', link: '/platform/authentication' },
                { text: 'SDKs', link: '/platform/sdks' },
                { text: 'CLI', link: '/platform/cli' },
                { text: 'Errors', link: '/platform/errors' },
              ],
            },
            {
              text: 'Core',
              items: [
                { text: 'Authentication', link: '/platform/auth' },
                { text: 'Servers', link: '/platform/servers' },
                { text: 'Channels', link: '/platform/channels' },
                { text: 'Messages', link: '/platform/messages' },
                { text: 'Threads', link: '/platform/threads' },
                { text: 'DMs', link: '/platform/dms' },
              ],
            },
            {
              text: 'Social',
              items: [
                { text: 'Friendships', link: '/platform/friendships' },
                { text: 'Invites', link: '/platform/invites' },
                { text: 'Notifications', link: '/platform/notifications' },
              ],
            },
            {
              text: 'Agents',
              items: [
                { text: 'Agents', link: '/platform/agents' },
                { text: 'Marketplace', link: '/platform/marketplace' },
              ],
            },
            {
              text: 'Commerce',
              items: [{ text: 'Shop', link: '/platform/shop' }],
            },
            {
              text: 'Platform',
              items: [
                { text: 'OAuth', link: '/platform/oauth' },
                { text: 'Platform Apps', link: '/platform/platform-apps' },
                { text: 'Apps', link: '/platform/apps' },
                { text: 'Workspace', link: '/platform/workspace' },
                { text: 'Search', link: '/platform/search' },
                { text: 'Media', link: '/platform/media' },
                { text: 'Task Center', link: '/platform/tasks' },
              ],
            },
            {
              text: 'Real-time',
              items: [{ text: 'WebSocket Events', link: '/platform/websocket' }],
            },
          ],
        },
      },
      {
        lang: 'zh',
        label: '中文',
        nav: [
          { text: '产品', link: '/zh/product/' },
          { text: '开放平台', link: '/zh/platform/introduction' },
        ],
        sidebar: {
          '/zh/product/': [
            {
              text: '快速开始',
              items: [
                { text: '产品概览', link: '/zh/product/' },
                { text: '新手入门', link: '/zh/product/quick-start' },
                { text: '常见问题', link: '/zh/product/faq' },
              ],
            },
            {
              text: '社区',
              items: [
                { text: '社区与服务器', link: '/zh/product/communities' },
                { text: '频道与消息', link: '/zh/product/channels' },
                { text: '社区玩法', link: '/zh/product/community-features' },
              ],
            },
            {
              text: 'AI Buddy',
              items: [
                { text: 'AI 搭子', link: '/zh/product/ai-assistants' },
                { text: 'Buddy 系统', link: '/zh/product/buddy-system' },
                { text: '进阶技巧', link: '/zh/product/advanced-tips' },
              ],
            },
            {
              text: '经济系统',
              items: [
                { text: '虾币', link: '/zh/product/shrimp-coins' },
                { text: 'Buddy 租赁', link: '/zh/product/buddy-rental' },
                { text: '社区店铺', link: '/zh/product/shop' },
              ],
            },
            {
              text: '工作区与工具',
              items: [
                { text: '共享工作区', link: '/zh/product/workspace' },
                { text: 'Shadow 桌面端', link: '/zh/product/download' },
                { text: 'OpenClaw 插件', link: '/zh/product/openclaw' },
                { text: '应用生态', link: '/zh/product/apps' },
              ],
            },
          ],
          '/zh/platform/': [
            {
              text: '快速开始',
              items: [
                { text: '简介', link: '/zh/platform/introduction' },
                { text: '认证', link: '/zh/platform/authentication' },
                { text: 'SDK', link: '/zh/platform/sdks' },
                { text: 'CLI', link: '/zh/platform/cli' },
                { text: '错误处理', link: '/zh/platform/errors' },
              ],
            },
            {
              text: '核心',
              items: [
                { text: '认证', link: '/zh/platform/auth' },
                { text: '服务器', link: '/zh/platform/servers' },
                { text: '频道', link: '/zh/platform/channels' },
                { text: '消息', link: '/zh/platform/messages' },
                { text: '线程', link: '/zh/platform/threads' },
                { text: '私信', link: '/zh/platform/dms' },
              ],
            },
            {
              text: '社交',
              items: [
                { text: '好友', link: '/zh/platform/friendships' },
                { text: '邀请码', link: '/zh/platform/invites' },
                { text: '通知', link: '/zh/platform/notifications' },
              ],
            },
            {
              text: 'AI 代理',
              items: [
                { text: '代理', link: '/zh/platform/agents' },
                { text: '市场', link: '/zh/platform/marketplace' },
              ],
            },
            {
              text: '商业',
              items: [{ text: '商店', link: '/zh/platform/shop' }],
            },
            {
              text: '平台',
              items: [
                { text: 'OAuth', link: '/zh/platform/oauth' },
                { text: '平台应用', link: '/zh/platform/platform-apps' },
                { text: '应用', link: '/zh/platform/apps' },
                { text: '工作区', link: '/zh/platform/workspace' },
                { text: '搜索', link: '/zh/platform/search' },
                { text: '媒体', link: '/zh/platform/media' },
                { text: '任务中心', link: '/zh/platform/tasks' },
              ],
            },
            {
              text: '实时通信',
              items: [{ text: 'WebSocket 事件', link: '/zh/platform/websocket' }],
            },
          ],
        },
      },
    ],
  },
})
