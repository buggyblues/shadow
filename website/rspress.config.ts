import path from 'node:path'
import { defineConfig } from 'rspress/config'
import { getRspressHeaderNav } from './nav'
import remarkCodeGroup from './plugins/remarkCodeGroup'
import remarkMermaid from './plugins/remarkMermaid'

const BASE = process.env.DOCS_BASE ?? '/'
const EXPLICIT_APP_BASE_URL = process.env.PUBLIC_APP_BASE_URL ?? process.env.WEBSITE_APP_BASE_URL
const APP_BASE_URL =
  EXPLICIT_APP_BASE_URL ?? (process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : '')
const API_BASE_URL =
  process.env.PUBLIC_API_BASE_URL ??
  process.env.WEBSITE_API_BASE_URL ??
  (process.env.NODE_ENV === 'development' ? 'http://localhost:3002' : (EXPLICIT_APP_BASE_URL ?? ''))
const SITE_DESCRIPTION =
  'Shadow OwnBuddy is an AI interactive community platform for community desktops, channels, workspaces, community apps, and Buddy services.'
const SITE_IMAGE = '/home-assets/plays/gstack-buddy.webp'
const SITE_URL = (
  process.env.PUBLIC_SITE_URL ??
  process.env.WEBSITE_SITE_URL ??
  'https://shadowob.com'
).replace(/\/$/, '')
const withSiteUrl = (pathName: string) => (SITE_URL ? `${SITE_URL}${pathName}` : pathName)
const ABSOLUTE_SITE_IMAGE = withSiteUrl(SITE_IMAGE)
const SITE_KEYWORDS =
  'Shadow OwnBuddy, AI community, community desktop, AI Buddy, Cloud, Cloud templates, developer platform, community workspace'
const THEME_BOOT_SCRIPT = `<script>(function(){try{window.RSPRESS_THEME='dark';window.MODERN_THEME='dark';localStorage.setItem('rspress-theme-appearance','dark');document.documentElement.classList.add('dark');document.documentElement.classList.remove('light');document.documentElement.style.colorScheme='dark';}catch(e){document.documentElement.classList.add('dark');document.documentElement.classList.remove('light');document.documentElement.style.colorScheme='dark';}})();</script>`
const LANGUAGE_BOOT_SCRIPT = `<script>(function(){try{var base=${JSON.stringify(BASE)}.replace(/\\/$/,'');var root=base||'/';var path=window.location.pathname;var atRoot=path===root||path===(root==='/'?'/index.html':root+'/index.html');if(!atRoot)return;var stored=localStorage.getItem('shadow-lang');var preferred=stored||navigator.language||'';if(/^zh\\b|^zh-/i.test(preferred)){window.location.replace((base||'')+'/zh/');}}catch(e){}})();</script>`

function getDevClientConfig():
  | { host?: string; path?: string; port?: string; protocol?: 'ws' | 'wss' }
  | undefined {
  const host = process.env.SHADOWOB_DEV_HMR_HOST?.trim()
  const path = process.env.SHADOWOB_DEV_HMR_PATH?.trim()
  const port = process.env.SHADOWOB_DEV_HMR_PORT?.trim()
  const protocolValue = process.env.SHADOWOB_DEV_HMR_PROTOCOL?.trim()
  const protocol = protocolValue === 'ws' || protocolValue === 'wss' ? protocolValue : undefined

  if (!host && !path && !port && !protocol) return undefined

  return {
    ...(host ? { host } : {}),
    ...(path ? { path } : {}),
    ...(port ? { port } : {}),
    ...(protocol ? { protocol } : {}),
  }
}

const devClientConfig = getDevClientConfig()

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
    title: 'Shadow OwnBuddy - AI Interactive Space Platform',
    description:
      'Use space desktops, channels, workspaces, space apps, and Buddies to run AI interactive spaces.',
  },
  zh: {
    title: '虾豆 OwnBuddy - AI 互动空间平台',
    description: '用空间桌面、频道、工作区、空间应用和 Buddy 组织 AI 互动空间。',
  },
}

const ROUTE_SEO: Record<'en' | 'zh', Record<string, SeoMeta>> = {
  en: {
    '/': DEFAULT_SEO.en,
    '/servers': {
      title: 'Public Spaces - Shadow OwnBuddy',
      description:
        'Browse public Shadow spaces, enter their desktops, and explore announcements, apps, shared content, and Buddy services.',
    },
    '/download': {
      title: 'Download Shadow Desktop - Shadow OwnBuddy',
      description:
        'Download the Shadow desktop app to run local Buddies, connect model providers, and link them to your spaces.',
    },
    '/platform/cloud': {
      title: 'Cloud Docs - Templates, Plugins, CLI, and Deployments',
      description:
        'Build deployable Buddy spaces with Cloud templates, official plugins, standalone CLI workflows, and Kubernetes-backed deployments.',
    },
    '/platform/api': {
      title: 'Shadow Platform API',
      description:
        'Start with Shadow API actors, authentication, resource groups, realtime events, and error handling.',
    },
    '/platform/cloud-computers': {
      title: 'Cloud Computer API - AI',
      description:
        'AI APIs for managing cloud computers, files, terminals, browsers, desktops, workspace mounts, Cloud Buddies, backups, and recovery.',
    },
    '/platform/cloud-saas': {
      title: 'Cloud SaaS Deployment Runtime - Pause, Resume, Backup, and Restore',
      description:
        'Manage running Cloud deployments: pause idle agent-sandboxes, resume on demand, create VolumeSnapshot and object backups, and restore state from backup.',
    },
    '/platform/cloud-cli': {
      title: 'Cloud CLI - Validate and Deploy Templates',
      description:
        'Use the standalone Cloud CLI to validate templates, manage secrets, deploy to Kubernetes, and inspect runtime health.',
    },
    '/platform/cloud-templates': {
      title: 'Official Cloud Templates',
      description:
        'Browse the official Cloud template catalog and learn how each template maps spaces, channels, Buddies, skills, and plugins.',
    },
    '/platform/cloud-plugins': {
      title: 'Official Cloud Plugins',
      description:
        'Configure official Cloud plugins for model providers, Shadow provisioning, Git agent packs, Google Workspace, SEO, browser automation, and more.',
    },
    '/platform/server-apps': {
      title: 'Build Shadow Space Apps',
      description:
        'Create third-party space-scoped web apps with iframe UI, Buddy-callable commands, file uploads, realtime events, OAuth binding, and commerce support.',
    },
  },
  zh: {
    '/': DEFAULT_SEO.zh,
    '/servers': {
      title: '公开空间名录 - 虾豆 OwnBuddy',
      description: '浏览公开虾豆空间，进入桌面查看公告、应用、共享内容和 Buddy 服务。',
    },
    '/download': {
      title: '下载虾豆桌面端 - 虾豆 OwnBuddy',
      description: '下载虾豆桌面端，在本机运行 Buddy、连接模型供应商，并关联到你的空间。',
    },
    '/platform/cloud': {
      title: '云文档 - 模版、插件、CLI 与部署',
      description:
        '使用云模版、官方插件、独立 CLI 和 Kubernetes 部署能力，构建可运行的 Buddy 空间。',
    },
    '/platform/api': {
      title: '虾豆开放平台 API',
      description: '从调用身份、认证、资源分组、实时事件和错误处理开始接入虾豆 API。',
    },
    '/platform/cloud-computers': {
      title: '云电脑 API - AI',
      description: 'AI 分类中的云电脑 API：文件、终端、浏览器、桌面、Buddy、挂载、备份和恢复。',
    },
    '/platform/cloud-saas': {
      title: '云 SaaS 部署运行时 - 暂停、恢复、备份和还原',
      description:
        '管理运行中的 Cloud 部署：暂停空闲 agent-sandbox、按需恢复、创建 VolumeSnapshot 和对象备份、从备份还原状态。',
    },
    '/platform/cloud-cli': {
      title: '云 CLI - 校验和部署模版',
      description: '使用独立 Cloud CLI 校验模版、管理密钥、部署到 Kubernetes，并查看运行状态。',
    },
    '/platform/cloud-templates': {
      title: '云官方模版',
      description: '浏览云官方模版目录，了解每个模版对应的空间、频道、Buddy、技能和插件。',
    },
    '/platform/cloud-plugins': {
      title: '云官方插件',
      description:
        '配置模型供应商、Shadow 资源编排、Git agent packs、Google Workspace、SEO、浏览器自动化等官方插件。',
    },
    '/platform/server-apps': {
      title: '开发虾豆空间应用',
      description:
        '创建第三方空间级 Web 应用，支持 iframe UI、Buddy 命令、文件上传、实时事件、OAuth 绑定和商业化。',
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
  return path.replace(/^\/zh(?=\/|$)/, '').replace(/\.html$/, '') || '/'
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
        __SHADOW_API_BASE_URL__: JSON.stringify(API_BASE_URL.replace(/\/$/, '')),
        __SHADOW_APP_BASE_URL__: JSON.stringify(APP_BASE_URL.replace(/\/$/, '')),
      },
    },
    ...(devClientConfig ? { dev: { client: devClientConfig } } : {}),
  },
  description: SITE_DESCRIPTION,
  icon: '/Logo.svg',
  logo: '/Logo.svg',
  lang: 'en',
  markdown: {
    mdxRs: false,
    remarkPlugins: [remarkCodeGroup, remarkMermaid],
    globalComponents: [
      path.join(__dirname, 'components/code/CodeGroup.tsx'),
      path.join(__dirname, 'components/diagrams/MermaidDiagram.tsx'),
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
    localeRedirect: 'never',
    // Header nav data is shared with the custom homepage header.
    locales: [
      {
        lang: 'en',
        label: 'English',
        nav: getRspressHeaderNav('en'),
        sidebar: {
          '/platform/': [
            {
              text: 'Getting Started',
              items: [
                { text: 'Introduction', link: '/platform/introduction' },
                { text: 'API', link: '/platform/api' },
                { text: 'SDKs', link: '/platform/sdks' },
                { text: 'CLI', link: '/platform/cli' },
              ],
            },
            {
              text: 'API Basics',
              items: [
                { text: 'Authentication & Permissions', link: '/platform/authentication' },
                { text: 'Auth API', link: '/platform/auth' },
                { text: 'OAuth', link: '/platform/oauth' },
                { text: 'API Tokens', link: '/platform/api-tokens' },
                { text: 'WebSocket Events', link: '/platform/websocket' },
                { text: 'Errors', link: '/platform/errors' },
              ],
            },
            {
              text: 'Community',
              items: [
                { text: 'Spaces', link: '/platform/servers' },
                { text: 'Channels', link: '/platform/channels' },
                { text: 'Messages', link: '/platform/messages' },
                { text: 'Threads', link: '/platform/threads' },
                { text: 'DMs', link: '/platform/dms' },
                { text: 'Workspace', link: '/platform/workspace' },
                { text: 'Search', link: '/platform/search' },
                { text: 'Media', link: '/platform/media' },
                { text: 'Discover', link: '/platform/discover' },
              ],
            },
            {
              text: 'AI',
              items: [
                { text: 'Agents', link: '/platform/agents' },
                { text: 'Cloud Computers', link: '/platform/cloud-computers' },
                { text: 'Official Model Proxy', link: '/platform/model-proxy' },
              ],
            },
            {
              text: 'Apps',
              items: [
                { text: 'Platform Apps', link: '/platform/platform-apps' },
                { text: 'Space Apps', link: '/platform/server-apps' },
              ],
            },
            {
              text: 'Social',
              items: [
                { text: 'Friendships', link: '/platform/friendships' },
                { text: 'Invites', link: '/platform/invites' },
                { text: 'Notifications', link: '/platform/notifications' },
                { text: 'Profile Comments', link: '/platform/profile-comments' },
              ],
            },
            {
              text: 'Commerce',
              items: [
                { text: 'Shop', link: '/platform/shop' },
                { text: 'Economy', link: '/platform/economy' },
                { text: 'Recharge', link: '/platform/recharge' },
                { text: 'Task Center', link: '/platform/tasks' },
              ],
            },
            {
              text: 'Cloud',
              items: [
                { text: 'Cloud Overview', link: '/platform/cloud' },
                { text: 'Cloud API Reference', link: '/platform/cloud-api' },
                { text: 'Cloud SaaS Runtime', link: '/platform/cloud-saas' },
                { text: 'Cloud CLI', link: '/platform/cloud-cli' },
                { text: 'Templates', link: '/platform/cloud-templates' },
                { text: 'Plugins', link: '/platform/cloud-plugins' },
              ],
            },
          ],
        },
      },
      {
        lang: 'zh',
        label: '中文',
        nav: getRspressHeaderNav('zh'),
        sidebar: {
          '/zh/platform/': [
            {
              text: '快速开始',
              items: [
                { text: '简介', link: '/zh/platform/introduction' },
                { text: 'API', link: '/zh/platform/api' },
                { text: 'SDK', link: '/zh/platform/sdks' },
                { text: 'CLI', link: '/zh/platform/cli' },
              ],
            },
            {
              text: 'API 基础',
              items: [
                { text: '认证与权限', link: '/zh/platform/authentication' },
                { text: 'Auth API', link: '/zh/platform/auth' },
                { text: 'OAuth', link: '/zh/platform/oauth' },
                { text: 'API 令牌', link: '/zh/platform/api-tokens' },
                { text: 'WebSocket 事件', link: '/zh/platform/websocket' },
                { text: '错误处理', link: '/zh/platform/errors' },
              ],
            },
            {
              text: '空间',
              items: [
                { text: '空间', link: '/zh/platform/servers' },
                { text: '频道', link: '/zh/platform/channels' },
                { text: '消息', link: '/zh/platform/messages' },
                { text: '线程', link: '/zh/platform/threads' },
                { text: '私信', link: '/zh/platform/dms' },
                { text: '工作区', link: '/zh/platform/workspace' },
                { text: '搜索', link: '/zh/platform/search' },
                { text: '媒体', link: '/zh/platform/media' },
                { text: '发现', link: '/zh/platform/discover' },
              ],
            },
            {
              text: 'AI',
              items: [
                { text: 'Agent', link: '/zh/platform/agents' },
                { text: '云电脑', link: '/zh/platform/cloud-computers' },
                { text: '官方模型代理', link: '/zh/platform/model-proxy' },
              ],
            },
            {
              text: '应用',
              items: [
                { text: 'Platform Apps', link: '/zh/platform/platform-apps' },
                { text: '空间应用', link: '/zh/platform/server-apps' },
              ],
            },
            {
              text: '社交',
              items: [
                { text: '好友', link: '/zh/platform/friendships' },
                { text: '邀请码', link: '/zh/platform/invites' },
                { text: '通知', link: '/zh/platform/notifications' },
                { text: '主页留言', link: '/zh/platform/profile-comments' },
              ],
            },
            {
              text: '商业',
              items: [
                { text: '商店', link: '/zh/platform/shop' },
                { text: '经济', link: '/zh/platform/economy' },
                { text: '充值', link: '/zh/platform/recharge' },
                { text: '任务中心', link: '/zh/platform/tasks' },
              ],
            },
            {
              text: '云',
              items: [
                { text: '云概览', link: '/zh/platform/cloud' },
                { text: 'Cloud API 参考', link: '/zh/platform/cloud-api' },
                { text: 'Cloud SaaS 运行时', link: '/zh/platform/cloud-saas' },
                { text: 'Cloud CLI', link: '/zh/platform/cloud-cli' },
                { text: '模版', link: '/zh/platform/cloud-templates' },
                { text: '插件', link: '/zh/platform/cloud-plugins' },
              ],
            },
          ],
        },
      },
    ],
  },
})
