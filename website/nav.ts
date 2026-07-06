export type WebsiteNavLocale = 'en' | 'zh'

type LocalizedText = Record<WebsiteNavLocale, string>

type HeaderNavItem = {
  key: string
  label: LocalizedText
  href: string
  external?: boolean
}

type HeaderNavGroup = {
  key: string
  label: LocalizedText
  items: HeaderNavItem[]
}

export const SHADOW_REPOSITORY_URL = 'https://github.com/buggyblues/shadow'
export const SHADOW_CLI_SKILL_RAW_URL =
  'https://raw.githubusercontent.com/buggyblues/shadow/main/skills/shadowob-cli/SKILL.md'

const HEADER_NAV_GROUPS: HeaderNavGroup[] = [
  {
    key: 'resources',
    label: {
      en: 'Discover',
      zh: '发现',
    },
    items: [
      {
        key: 'servers',
        label: {
          en: 'Discover Spaces',
          zh: '发现空间',
        },
        href: '/servers.html',
      },
      {
        key: 'download',
        label: {
          en: 'Download',
          zh: '下载',
        },
        href: '/download',
      },
      {
        key: 'github',
        label: {
          en: 'GitHub',
          zh: 'GitHub',
        },
        href: SHADOW_REPOSITORY_URL,
        external: true,
      },
      {
        key: 'skills',
        label: {
          en: 'Skills',
          zh: '技能',
        },
        href: SHADOW_CLI_SKILL_RAW_URL,
        external: true,
      },
    ],
  },
  {
    key: 'platform',
    label: {
      en: 'PLATFORM',
      zh: '平台',
    },
    items: [
      {
        key: 'api',
        label: {
          en: 'API',
          zh: 'API',
        },
        href: '/platform/api',
      },
      {
        key: 'sdks',
        label: {
          en: 'SDKs',
          zh: 'SDKs',
        },
        href: '/platform/sdks',
      },
      {
        key: 'cli',
        label: {
          en: 'CLI',
          zh: 'CLI',
        },
        href: '/platform/cli',
      },
      {
        key: 'cloud',
        label: {
          en: 'Cloud',
          zh: '云',
        },
        href: '/platform/cloud',
      },
    ],
  },
]

const isExternalHref = (href: string) => /^https?:\/\//.test(href)

const localizedHref = (href: string, lang: WebsiteNavLocale, base = '') => {
  if (isExternalHref(href)) return href
  const normalizedBase = base.replace(/\/$/, '')
  const localizedPath = lang === 'zh' ? `/zh${href === '/' ? '/' : href}` : href
  return `${normalizedBase}${localizedPath}`.replace(/\/{2,}/g, '/')
}

export function getHeaderNavGroups(lang: WebsiteNavLocale, base = '') {
  return HEADER_NAV_GROUPS.map((group) => ({
    key: group.key,
    label: group.label[lang],
    items: group.items.map((item) => ({
      key: item.key,
      label: item.label[lang],
      href: localizedHref(item.href, lang, base),
      external: item.external,
    })),
  }))
}

export function getRspressHeaderNav(lang: WebsiteNavLocale) {
  return getHeaderNavGroups(lang).map((group) => ({
    text: group.label,
    items: group.items.map((item) => ({
      text: item.label,
      link: item.href,
    })),
  }))
}
