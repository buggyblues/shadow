const messages = {
  en: {
    'bridge.createBuddyDescription':
      'Create or connect a Buddy Inbox so Skills can send installation tasks.',
    'bridge.createBuddyTitle': 'Create a Buddy for Skills',
    'detail.audits': 'SECURITY AUDITS',
    'detail.commands': 'Commands',
    'detail.files': 'Files',
    'detail.githubStars': 'GITHUB STARS',
    'detail.openDirectory': 'Open on skills.sh',
    'detail.openRepository': 'Open repository',
    'detail.repository': 'Repository',
    'detail.source': 'Source',
    'install.buddyLabel': 'Buddy',
    'install.cancel': 'Cancel',
    'install.chooseBuddyFirst': 'Choose a Buddy first',
    'install.createBuddy': 'New Buddy',
    'install.creatingBuddy': 'Creating',
    'install.loadingBuddies': 'Loading Buddy Inboxes.',
    'install.methodNpxBody':
      'The Inbox task asks the Buddy to install the upstream package with npx skills.',
    'install.methodNpxLabel': 'npx skills',
    'install.methodZipBody':
      'The Inbox task asks the Buddy to download this server package as a zip.',
    'install.methodZipLabel': 'Skills zip',
    'install.noBuddyInbox': 'No Buddy Inbox',
    'install.noDelivery': '{skill} did not create an Inbox task card',
    'install.refreshBuddies': 'Refresh',
    'install.requestSent': '{skill} install request sent to {buddy}',
    'install.sendTask': 'Send install task',
    'install.sending': 'Sending',
    'install.sent': '{skill} sent to {buddy}',
    'install.title': 'Install skill',
    'install.waitingApproval': '{skill} is waiting for Inbox approval',
    'nav.browse': 'Browse',
    'nav.share': 'Share',
    'search.loading': 'Loading skills',
    'search.loadingWithQuery': 'Searching for "{query}"',
    'summary.npx.noZip': 'Does not download the Skills App zip for upstream skills.sh packages.',
    'summary.npx.reply': 'Asks the Buddy to reply with the installed path and any warnings.',
    'summary.npx.runtime': 'Installs through npx skills in the Buddy runtime workspace.',
    'summary.zip.dispatch': 'Installs by dispatching an Inbox task to the selected Buddy.',
    'summary.zip.download': 'Downloads through the Skills App as a complete zip package.',
    'summary.zip.preserve':
      'Preserves SKILL.md and supporting files for multi-file skill packages.',
  },
  'zh-CN': {
    'bridge.createBuddyDescription': '创建或连接 Buddy Inbox，以便 Skills 发送安装任务。',
    'bridge.createBuddyTitle': '为 Skills 创建 Buddy',
    'detail.audits': '安全审计',
    'detail.commands': '命令',
    'detail.files': '文件',
    'detail.githubStars': 'GitHub Stars',
    'detail.openDirectory': '打开 skills.sh',
    'detail.openRepository': '打开仓库',
    'detail.repository': '仓库',
    'detail.source': '来源',
    'install.buddyLabel': 'Buddy',
    'install.cancel': '取消',
    'install.chooseBuddyFirst': '先选择一个 Buddy',
    'install.createBuddy': '新建 Buddy',
    'install.creatingBuddy': '创建中',
    'install.loadingBuddies': '正在加载 Buddy Inbox。',
    'install.methodNpxBody': 'Inbox 任务会要求 Buddy 使用 npx skills 安装上游包。',
    'install.methodNpxLabel': 'npx skills',
    'install.methodZipBody': 'Inbox 任务会要求 Buddy 下载这个服务器技能 zip 包。',
    'install.methodZipLabel': 'Skills zip',
    'install.noBuddyInbox': '没有 Buddy Inbox',
    'install.noDelivery': '{skill} 没有创建 Inbox 任务卡片',
    'install.refreshBuddies': '刷新',
    'install.requestSent': '{skill} 安装请求已发送给 {buddy}',
    'install.sendTask': '发送安装任务',
    'install.sending': '发送中',
    'install.sent': '{skill} 已发送给 {buddy}',
    'install.title': '安装技能',
    'install.waitingApproval': '{skill} 正在等待 Inbox 授权',
    'nav.browse': '浏览',
    'nav.share': '分享',
    'search.loading': '正在加载技能',
    'search.loadingWithQuery': '正在搜索 "{query}"',
    'summary.npx.noZip': 'skills.sh 上游包不会下载 Skills App zip。',
    'summary.npx.reply': '要求 Buddy 回复安装路径和任何警告。',
    'summary.npx.runtime': '在 Buddy 运行时工作区通过 npx skills 安装。',
    'summary.zip.dispatch': '通过向选中的 Buddy 发送 Inbox 任务来安装。',
    'summary.zip.download': '通过 Skills App 下载完整 zip 包。',
    'summary.zip.preserve': '保留 SKILL.md 和多文件技能包的支持文件。',
  },
} as const

type MessageKey = keyof (typeof messages)['en']

function locale() {
  if (typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('zh')) {
    return 'zh-CN'
  }
  return 'en'
}

export function t(key: MessageKey, values: Record<string, string | number> = {}) {
  const template = messages[locale()][key] ?? messages.en[key]
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, name: string) =>
    values[name] === undefined ? `{${name}}` : String(values[name]),
  )
}
