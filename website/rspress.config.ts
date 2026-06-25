import path from 'node:path'
import { defineConfig } from 'rspress/config'
import remarkCodeGroup from './plugins/remarkCodeGroup'
import remarkMermaid from './plugins/remarkMermaid'

const BASE = process.env.DOCS_BASE ?? '/'
const APP_BASE_URL =
  process.env.PUBLIC_APP_BASE_URL ??
  process.env.WEBSITE_APP_BASE_URL ??
  (process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : '')
const SITE_DESCRIPTION =
  'Shadow OwnBuddy is an AI-native community platform for channels, Buddy collaboration, Cloud templates, and creator communities.'
const SITE_IMAGE = '/home-assets/plays/gstack-buddy.webp'
const SITE_URL = (
  process.env.PUBLIC_SITE_URL ??
  process.env.WEBSITE_SITE_URL ??
  'https://shadowob.com'
).replace(/\/$/, '')
const withSiteUrl = (pathName: string) => (SITE_URL ? `${SITE_URL}${pathName}` : pathName)
const ABSOLUTE_SITE_IMAGE = withSiteUrl(SITE_IMAGE)
const SITE_KEYWORDS =
  'Shadow OwnBuddy, AI community, AI Buddy, Shadow Cloud, Cloud templates, DIY Cloud, developer platform, community workspace'
const THEME_BOOT_SCRIPT = `<script>(function(){try{var shadowKey='shadow-theme';var rspressKey='rspress-theme-appearance';var raw=localStorage.getItem(shadowKey)||localStorage.getItem(rspressKey);var theme=raw==='auto'?'system':raw;if(theme!=='light'&&theme!=='dark'&&theme!=='system')theme='dark';var effective=theme==='system'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):theme;document.documentElement.classList.toggle('dark',effective==='dark');document.documentElement.classList.toggle('light',effective==='light');document.documentElement.style.colorScheme=effective;localStorage.setItem(shadowKey,theme);localStorage.setItem(rspressKey,theme==='system'?'auto':theme);}catch(e){document.documentElement.classList.add('dark');document.documentElement.style.colorScheme='dark';}})();</script>`
const LANGUAGE_BOOT_SCRIPT = `<script>(function(){try{var base=${JSON.stringify(BASE)}.replace(/\\/$/,'');var root=base||'/';var path=window.location.pathname;var atRoot=path===root||path===(root==='/'?'/index.html':root+'/index.html');if(!atRoot)return;var stored=localStorage.getItem('shadow-lang');var preferred=stored||navigator.language||'';if(/^zh\\b|^zh-/i.test(preferred)){window.location.replace((base||'')+'/zh/');}}catch(e){}})();</script>`

type SeoRoute = {
  routePath?: string
  lang?: string
}

type SeoMeta = {
  title: string
  description: string
}

const DEFAULT_SEO: Record<'en' | 'zh', SeoMeta> = {
  en: {
    title: 'Shadow OwnBuddy - Playable AI Communities',
    description:
      'Start from homepage plays, land in channels with AI Buddies, and deploy reusable Shadow Cloud templates when you need a dedicated workspace.',
  },
  zh: {
    title: '虾豆 OwnBuddy - 可玩的 AI 社区',
    description: '从首页玩法开始，进入有 Buddy 的频道；需要专属空间时，用虾豆 Cloud 模版一键部署。',
  },
}

const ROUTE_SEO: Record<'en' | 'zh', Record<string, SeoMeta>> = {
  en: {
    '/': DEFAULT_SEO.en,
    '/product/': {
      title: 'Shadow Help Center - Channels, Buddies, Cloud, and Coins',
      description:
        'Simple guides for joining plays, using channels, chatting with Buddies, spending Shrimp Coins, and deploying Shadow Cloud templates.',
    },
    '/product/play-launch': {
      title: 'Play Launch - Click a Play and Land in the Right Channel',
      description:
        'How Shadow turns homepage plays into public channels, private rooms, Cloud deployments, and OAuth-powered partner experiences.',
    },
    '/platform/cloud': {
      title: 'Shadow Cloud Docs - Templates, Plugins, CLI, and Deployments',
      description:
        'Build deployable Buddy spaces with Shadow Cloud templates, official plugins, standalone CLI workflows, and Kubernetes-backed deployments.',
    },
    '/platform/cloud-saas': {
      title: 'Shadow Cloud SaaS Deployment Runtime - Pause, Resume, Backup, and Restore',
      description:
        'Manage running Cloud deployments: pause idle agent-sandboxes, resume on demand, create VolumeSnapshot and object backups, and restore state from backup.',
    },
    '/platform/cloud-cli': {
      title: 'Shadow Cloud CLI - Validate and Deploy Templates',
      description:
        'Use the standalone Shadow Cloud CLI to validate templates, manage secrets, deploy to Kubernetes, and inspect runtime health.',
    },
    '/platform/cloud-templates': {
      title: 'Official Shadow Cloud Templates',
      description:
        'Browse the official Shadow Cloud template catalog and learn how each template maps servers, channels, Buddies, skills, and plugins.',
    },
    '/platform/cloud-plugins': {
      title: 'Official Shadow Cloud Plugins',
      description:
        'Configure official Shadow Cloud plugins for model providers, Shadow provisioning, Git agent packs, Google Workspace, SEO, browser automation, and more.',
    },
    '/platform/server-apps': {
      title: 'Build Shadow Server Apps',
      description:
        'Create third-party server-scoped web apps with iframe UI, Buddy-callable commands, file uploads, realtime events, OAuth binding, and commerce support.',
    },
  },
  zh: {
    '/': DEFAULT_SEO.zh,
    '/product/': {
      title: '虾豆帮助中心 - 频道、Buddy、Cloud 与虾币',
      description: '用简单指南了解首页玩法、频道、AI Buddy、虾币钱包和虾豆 Cloud 模版部署。',
    },
    '/product/play-launch': {
      title: '首页玩法 - 点击玩法并进入正确频道',
      description:
        '了解虾豆如何把首页玩法落地到公开频道、私人房间、Cloud 部署和第三方 OAuth 体验。',
    },
    '/platform/cloud': {
      title: '虾豆 Cloud 文档 - 模版、插件、CLI 与部署',
      description:
        '使用虾豆 Cloud 模版、官方插件、独立 CLI 和 Kubernetes 部署能力，构建可运行的 Buddy 空间。',
    },
    '/platform/cloud-saas': {
      title: '虾豆 Cloud SaaS 部署运行时 - 暂停、恢复、备份和还原',
      description:
        '管理运行中的 Cloud 部署：暂停空闲 agent-sandbox、按需恢复、创建 VolumeSnapshot 和对象备份、从备份还原状态。',
    },
    '/platform/cloud-cli': {
      title: '虾豆 Cloud CLI - 校验和部署模版',
      description: '使用独立 Cloud CLI 校验模版、管理密钥、部署到 Kubernetes，并查看运行状态。',
    },
    '/platform/cloud-templates': {
      title: '虾豆 Cloud 官方模版',
      description:
        '浏览虾豆 Cloud 官方模版目录，了解每个模版对应的服务器、频道、Buddy、技能和插件。',
    },
    '/platform/cloud-plugins': {
      title: '虾豆 Cloud 官方插件',
      description:
        '配置模型供应商、Shadow 资源编排、Git agent packs、Google Workspace、SEO、浏览器自动化等官方插件。',
    },
    '/platform/server-apps': {
      title: '开发虾豆 Server Apps',
      description:
        '创建第三方服务器级 Web 应用，支持 iframe UI、Buddy 命令、文件上传、实时事件、OAuth 绑定和商业化。',
    },
  },
}

const normalizeRoutePath = (route?: SeoRoute) => {
  const raw = route?.routePath || '/'
  const withSlash = raw.startsWith('/') ? raw : `/${raw}`
  const normalized = withSlash.replace(/\/index$/, '/')
  return normalized === '/zh' ? '/zh/' : normalized
}

const seoLang = (route?: SeoRoute): 'en' | 'zh' =>
  route?.lang === 'zh' || normalizeRoutePath(route).startsWith('/zh/') ? 'zh' : 'en'

const seoKey = (route?: SeoRoute) => {
  const path = normalizeRoutePath(route)
  return path.replace(/^\/zh(?=\/|$)/, '') || '/'
}

const routeSeo = (route?: SeoRoute) => {
  const lang = seoLang(route)
  return ROUTE_SEO[lang][seoKey(route)] ?? DEFAULT_SEO[lang]
}

const routeUrlPath = (route?: SeoRoute) => {
  const normalizedBase = BASE === '/' ? '' : BASE.replace(/\/$/, '')
  const pathName = normalizeRoutePath(route)
  return `${normalizedBase}${pathName === '/' ? '/' : pathName}` || '/'
}

const canonicalUrl = (route?: SeoRoute) => withSiteUrl(routeUrlPath(route))

const alternateUrl = (route: SeoRoute | undefined, lang: 'en' | 'zh') => {
  const normalizedBase = BASE === '/' ? '' : BASE.replace(/\/$/, '')
  const key = seoKey(route)
  const localizedPath = lang === 'zh' ? `/zh${key === '/' ? '/' : key}` : key
  return withSiteUrl(`${normalizedBase}${localizedPath}` || '/')
}

export default defineConfig({
  root: 'docs',
  base: BASE,
  title: 'Shadow OwnBuddy',
  head: [
    [
      'meta',
      {
        name: 'keywords',
        content: SITE_KEYWORDS,
      },
    ],
    (route: SeoRoute | undefined) => [
      'meta',
      { name: 'description', content: routeSeo(route).description },
    ],
    ['meta', { name: 'robots', content: 'index,follow' }],
    ['meta', { name: 'theme-color', content: '#00c6d1' }],
    (route: SeoRoute | undefined) => [
      'meta',
      { property: 'og:title', content: routeSeo(route).title },
    ],
    (route: SeoRoute | undefined) => [
      'meta',
      { property: 'og:description', content: routeSeo(route).description },
    ],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:site_name', content: 'Shadow OwnBuddy' }],
    ['meta', { property: 'og:image', content: ABSOLUTE_SITE_IMAGE }],
    (route: SeoRoute | undefined) => ['meta', { property: 'og:url', content: canonicalUrl(route) }],
    (route: SeoRoute | undefined) => ['link', { rel: 'canonical', href: canonicalUrl(route) }],
    (route: SeoRoute | undefined) => [
      'link',
      { rel: 'alternate', hreflang: 'en', href: alternateUrl(route, 'en') },
    ],
    (route: SeoRoute | undefined) => [
      'link',
      { rel: 'alternate', hreflang: 'zh-CN', href: alternateUrl(route, 'zh') },
    ],
    (route: SeoRoute | undefined) => [
      'link',
      { rel: 'alternate', hreflang: 'x-default', href: alternateUrl(route, 'en') },
    ],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    (route: SeoRoute | undefined) => [
      'meta',
      { name: 'twitter:title', content: routeSeo(route).title },
    ],
    (route: SeoRoute | undefined) => [
      'meta',
      { name: 'twitter:description', content: routeSeo(route).description },
    ],
    ['meta', { name: 'twitter:image', content: ABSOLUTE_SITE_IMAGE }],
    LANGUAGE_BOOT_SCRIPT,
    THEME_BOOT_SCRIPT,
  ] as never,
  builderConfig: {
    source: {
      define: {
        __SHADOW_APP_BASE_URL__: JSON.stringify(APP_BASE_URL.replace(/\/$/, '')),
      },
    },
  },
  description: SITE_DESCRIPTION,
  icon: '/Logo.svg',
  logo: '/Logo.svg',
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
          {
            text: 'Product',
            items: [
              { text: 'Help Center', link: '/product/' },
              { text: 'Quick Start', link: '/product/quick-start' },
              { text: 'Play Launch', link: '/product/play-launch' },
              { text: 'Download', link: '/product/download' },
            ],
          },
          {
            text: 'Platform',
            items: [
              { text: 'Developer Platform', link: '/platform/introduction' },
              { text: 'Cloud API Reference', link: '/platform/cloud-api' },
              { text: 'SDKs & CLI', link: '/platform/sdks' },
              { text: 'Templates', link: '/platform/cloud-templates' },
              { text: 'Plugins', link: '/platform/cloud-plugins' },
              { text: 'Model Proxy', link: '/platform/model-proxy' },
            ],
          },
          {
            text: 'Resources',
            items: [
              { text: 'Pricing', link: '/pricing' },
              { text: 'Blog', link: '/blog/' },
              { text: 'GitHub', link: 'https://github.com/buggyblues/shadow' },
            ],
          },
        ],
        sidebar: {
          '/product/': [
            {
              text: 'Help Center',
              items: [
                { text: 'Help Center Home', link: '/product/' },
                { text: 'Quick Start', link: '/product/quick-start' },
                { text: 'Play Launch', link: '/product/play-launch' },
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
                { text: 'Hermes Agent', link: '/product/hermes-agent' },
              ],
            },
          ],
          '/platform/': [
            {
              text: 'Getting Started',
              items: [
                { text: 'Introduction', link: '/platform/introduction' },
                { text: 'Authentication', link: '/platform/authentication' },
                { text: 'Official Model Proxy', link: '/platform/model-proxy' },
                { text: 'SDKs', link: '/platform/sdks' },
                { text: 'App CLI', link: '/platform/cli' },
                { text: 'Errors', link: '/platform/errors' },
              ],
            },
            {
              text: 'Shadow Cloud',
              items: [
                { text: 'Cloud Overview', link: '/platform/cloud' },
                { text: 'Cloud API Reference', link: '/platform/cloud-api' },
                { text: 'Cloud SaaS Runtime', link: '/platform/cloud-saas' },
                { text: 'Cloud CLI', link: '/platform/cloud-cli' },
                { text: 'Templates', link: '/platform/cloud-templates' },
                { text: 'Plugins', link: '/platform/cloud-plugins' },
              ],
            },
            {
              text: 'Core API',
              items: [
                { text: 'Auth', link: '/platform/auth' },
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
              text: 'AI Agents',
              items: [
                { text: 'Agents', link: '/platform/agents' },
                { text: 'Marketplace', link: '/platform/marketplace' },
              ],
            },
            {
              text: 'Commerce',
              items: [
                { text: 'Shop', link: '/platform/shop' },
                { text: 'Economy', link: '/platform/economy' },
                { text: 'Recharge', link: '/platform/recharge' },
              ],
            },
            {
              text: 'Platform',
              items: [
                { text: 'OAuth', link: '/platform/oauth' },
                { text: 'API Tokens', link: '/platform/api-tokens' },
                { text: 'Platform Apps', link: '/platform/platform-apps' },
                { text: 'Server Apps', link: '/platform/server-apps' },
                { text: 'Workspace', link: '/platform/workspace' },
                { text: 'Search', link: '/platform/search' },
                { text: 'Media', link: '/platform/media' },
                { text: 'Task Center', link: '/platform/tasks' },
                { text: 'Discover', link: '/platform/discover' },
                { text: 'Voice Enhance', link: '/platform/voice-enhance' },
                { text: 'Profile Comments', link: '/platform/profile-comments' },
                { text: 'WebSocket Events', link: '/platform/websocket' },
              ],
            },
          ],
        },
      },
      {
        lang: 'zh',
        label: '中文',
        nav: [
          {
            text: '产品',
            items: [
              { text: '帮助中心', link: '/zh/product/' },
              { text: '新手入门', link: '/zh/product/quick-start' },
              { text: '首页玩法', link: '/zh/product/play-launch' },
              { text: '下载', link: '/zh/product/download' },
            ],
          },
          {
            text: '开放平台',
            items: [
              { text: '开发者平台', link: '/zh/platform/introduction' },
              { text: 'Cloud API 参考', link: '/zh/platform/cloud-api' },
              { text: 'SDK 与 CLI', link: '/zh/platform/sdks' },
              { text: '模版', link: '/zh/platform/cloud-templates' },
              { text: '插件', link: '/zh/platform/cloud-plugins' },
              { text: '模型代理', link: '/zh/platform/model-proxy' },
            ],
          },
          {
            text: '资源',
            items: [
              { text: '价格', link: '/zh/pricing' },
              { text: '博客', link: '/zh/blog/' },
              { text: 'GitHub', link: 'https://github.com/buggyblues/shadow' },
            ],
          },
        ],
        sidebar: {
          '/zh/product/': [
            {
              text: '帮助中心',
              items: [
                { text: '帮助中心首页', link: '/zh/product/' },
                { text: '新手入门', link: '/zh/product/quick-start' },
                { text: '首页玩法', link: '/zh/product/play-launch' },
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
                { text: 'Hermes Agent', link: '/zh/product/hermes-agent' },
              ],
            },
          ],
          '/zh/platform/': [
            {
              text: '快速开始',
              items: [
                { text: '简介', link: '/zh/platform/introduction' },
                { text: '认证', link: '/zh/platform/authentication' },
                { text: '官方模型代理', link: '/zh/platform/model-proxy' },
                { text: 'SDK', link: '/zh/platform/sdks' },
                { text: '应用 CLI', link: '/zh/platform/cli' },
                { text: '错误处理', link: '/zh/platform/errors' },
              ],
            },
            {
              text: '虾豆 Cloud',
              items: [
                { text: 'Cloud 概览', link: '/zh/platform/cloud' },
                { text: 'Cloud API 参考', link: '/zh/platform/cloud-api' },
                { text: 'Cloud SaaS 运行时', link: '/zh/platform/cloud-saas' },
                { text: 'Cloud CLI', link: '/zh/platform/cloud-cli' },
                { text: '模版', link: '/zh/platform/cloud-templates' },
                { text: '插件', link: '/zh/platform/cloud-plugins' },
              ],
            },
            {
              text: '核心 API',
              items: [
                { text: 'Auth', link: '/zh/platform/auth' },
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
              items: [
                { text: '商店', link: '/zh/platform/shop' },
                { text: '经济', link: '/zh/platform/economy' },
                { text: '充值', link: '/zh/platform/recharge' },
              ],
            },
            {
              text: '平台',
              items: [
                { text: 'OAuth', link: '/zh/platform/oauth' },
                { text: 'API 令牌', link: '/zh/platform/api-tokens' },
                { text: '平台应用', link: '/zh/platform/platform-apps' },
                { text: '服务器应用', link: '/zh/platform/server-apps' },
                { text: '工作区', link: '/zh/platform/workspace' },
                { text: '搜索', link: '/zh/platform/search' },
                { text: '媒体', link: '/zh/platform/media' },
                { text: '任务中心', link: '/zh/platform/tasks' },
                { text: '发现', link: '/zh/platform/discover' },
                { text: '语音增强', link: '/zh/platform/voice-enhance' },
                { text: '主页留言', link: '/zh/platform/profile-comments' },
                { text: 'WebSocket 事件', link: '/zh/platform/websocket' },
              ],
            },
          ],
        },
      },
    ],
  },
})
