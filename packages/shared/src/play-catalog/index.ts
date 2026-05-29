export type ShadowPlayAvailability = 'available' | 'gated' | 'coming_soon' | 'misconfigured'

type PlayActionBase = {
  buddyUserIds?: string[]
  buddyTemplateSlug?: string
}

export type ShadowPlayAction =
  | (PlayActionBase & {
      kind: 'public_channel'
      serverId?: string
      serverSlug?: string
      channelId?: string
      channelName?: string
      inviteCode?: string
    })
  | (PlayActionBase & {
      kind: 'private_room'
      serverId?: string
      serverSlug?: string
      namePrefix?: string
    })
  | (PlayActionBase & {
      kind: 'cloud_deploy'
      templateSlug: string
      resourceTier?: 'lightweight' | 'standard' | 'pro'
    })
  | {
      kind: 'external_oauth_app'
      clientId: string
      redirectUri: string
      scopes?: string[]
      state?: string
    }
  | {
      kind: 'landing_page'
      url: string
    }

export interface ShadowHomePlayCatalogItem {
  id: string
  image: string
  title: string
  titleEn: string
  desc: string
  descEn: string
  category: string
  categoryEn: string
  starts: string
  accentColor: string
  hot?: boolean
  status: ShadowPlayAvailability
  action?: ShadowPlayAction
  gates?: {
    auth?: 'optional' | 'required'
    membership?: 'none' | 'required'
    profile?: 'optional' | 'required'
  }
  template?: {
    kind: 'cloud'
    slug: string
    path: string
  }
  materials?: {
    cover: string
  }
}

export interface ShadowPlayServerTemplate {
  slug: string
  name: string
  description: string
  channels: Array<{
    name: string
    topic: string
  }>
}

const playCover = (id: string) => `/home-assets/plays/${id}.jpg`
const playTemplate = (id: string) => ({
  template: {
    kind: 'cloud' as const,
    slug: id,
    path: `apps/cloud/templates/${id}.template.json`,
  },
  materials: { cover: playCover(id) },
})

const communityAction = (channelName: string): ShadowPlayAction => ({
  kind: 'public_channel',
  channelName,
  buddyTemplateSlug: channelName,
})

const roomAction = (namePrefix: string): ShadowPlayAction => ({
  kind: 'private_room',
  namePrefix,
  buddyTemplateSlug: namePrefix,
})

const cloudAction = (
  templateSlug: string,
  resourceTier: 'lightweight' | 'standard' | 'pro' = 'lightweight',
): ShadowPlayAction => ({
  kind: 'cloud_deploy',
  templateSlug,
  buddyTemplateSlug: templateSlug,
  resourceTier,
})

export function getPlayBuddyUsername(templateSlug: string) {
  const normalized =
    templateSlug
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 27) || 'play'
  return `play_${normalized}`.slice(0, 32)
}

export function getPlayBuddyEmail(templateSlug: string) {
  return `${getPlayBuddyUsername(templateSlug)}@shadowob.bot`
}

export const SHADOW_PLAY_SERVER_TEMPLATE: ShadowPlayServerTemplate = {
  slug: 'shadow-plays',
  name: 'Shadow Plays',
  description: 'Default public community space for launchable homepage plays.',
  channels: [
    {
      name: 'general',
      topic: 'General discussion for new players and Shadow community members.',
    },
    {
      name: 'world-pulse',
      topic: 'A public room for real-time global events and daily signal.',
    },
    {
      name: 'financial-freedom',
      topic: 'A public room for lightweight financial freedom simulations and planning prompts.',
    },
    {
      name: 'ai-werewolf',
      topic: 'A public room for AI-hosted social deduction sessions.',
    },
    {
      name: 'code-arena',
      topic: 'A public room for coding challenges and real-time battles.',
    },
    {
      name: 'brain-fix',
      topic: 'A calm public room for one-minute focus resets and reflection.',
    },
    {
      name: 'gitstory',
      topic: 'A public room for turning software history into stories and retrospectives.',
    },
    {
      name: 'gstack',
      topic: 'A public room for founder strategy, product stress tests, and launch planning.',
    },
  ],
}

function cloudPlay(
  id: string,
  input: Omit<
    ShadowHomePlayCatalogItem,
    'id' | 'image' | 'status' | 'action' | 'gates' | 'template' | 'materials'
  >,
): ShadowHomePlayCatalogItem {
  return {
    id,
    image: playCover(id),
    status: 'gated',
    action: cloudAction(id, 'lightweight'),
    gates: { auth: 'required', membership: 'required', profile: 'optional' },
    ...playTemplate(id),
    ...input,
  }
}

export const DEFAULT_HOMEPLAY_CATALOG: ShadowHomePlayCatalogItem[] = [
  {
    id: 'retire-buddy',
    image: playCover('retire-buddy'),
    title: '退休助手',
    titleEn: 'RetireBuddy',
    desc: '帮你规划退休生活、财务自由路径，24小时温暖陪伴，让告别职场变成人生新章节。',
    descEn: 'Plan your retirement and path to financial freedom with a warm 24/7 companion.',
    category: '心理疗愈',
    categoryEn: 'Healing',
    starts: '24.5k',
    accentColor: 'var(--shadow-accent)',
    hot: true,
    status: 'available',
    action: roomAction('retire-buddy'),
    gates: { auth: 'required', membership: 'none', profile: 'optional' },
    ...playTemplate('retire-buddy'),
  },
  {
    id: 'financial-freedom',
    image: playCover('financial-freedom'),
    title: '我财富自由了吗？',
    titleEn: 'Am I Free?',
    desc: '输入你的资产与支出，AI 为你计算财务自由距离，给出清晰的达成路线图。',
    descEn: 'Input your assets and expenses — get your financial freedom score and roadmap.',
    category: '心理疗愈',
    categoryEn: 'Healing',
    starts: '18.2k',
    accentColor: '#f8e71c',
    status: 'available',
    action: communityAction('financial-freedom'),
    gates: { auth: 'required', membership: 'none', profile: 'optional' },
    ...playTemplate('financial-freedom'),
  },
  {
    id: 'brain-fix',
    image: playCover('brain-fix'),
    title: '一分钟修复你的大脑！',
    titleEn: '1-Min Brain Fix',
    desc: '科学冥想 + 微呼吸练习，60秒内从焦虑模式切换到专注状态，屡试不爽。',
    descEn: 'Science-backed micro-meditation. Switch from anxious to focused in 60 seconds.',
    category: '心理疗愈',
    categoryEn: 'Healing',
    starts: '15.9k',
    accentColor: '#a78bfa',
    status: 'available',
    action: communityAction('brain-fix'),
    gates: { auth: 'required', membership: 'none', profile: 'optional' },
    ...playTemplate('brain-fix'),
  },
  {
    id: 'world-pulse',
    image: playCover('world-pulse'),
    title: '地球脉搏',
    titleEn: 'World Pulse',
    desc: '实时抓取全球重大事件，用三句话告诉你今天真正发生了什么，无废话。',
    descEn: 'Real-time global events in 3 sentences. No filler, just signal.',
    category: '世界资讯',
    categoryEn: 'World News',
    starts: '14.1k',
    accentColor: '#38bdf8',
    status: 'available',
    action: communityAction('world-pulse'),
    gates: { auth: 'required', membership: 'none', profile: 'optional' },
    ...playTemplate('world-pulse'),
  },
  {
    id: 'daily-brief',
    image: playCover('daily-brief'),
    title: '晨间简报',
    titleEn: 'Morning Brief',
    desc: '每天 7:00 推送一份定制早报：国际、科技、市场三大板块，读完只需 3 分钟。',
    descEn: 'Custom morning digest at 7am — global news, tech, markets. 3-minute read.',
    category: '世界资讯',
    categoryEn: 'World News',
    starts: '11.3k',
    accentColor: '#fb923c',
    status: 'available',
    action: roomAction('daily-brief'),
    gates: { auth: 'required', membership: 'none', profile: 'optional' },
    ...playTemplate('daily-brief'),
  },
  {
    id: 'ai-werewolf',
    image: playCover('ai-werewolf'),
    title: 'AI 狼人杀',
    titleEn: 'AI Werewolf',
    desc: 'AI 担任主持，随机分配身份，在聊天中展开推理与博弈，3 人即可开局。',
    descEn: 'AI-hosted werewolf — roles assigned randomly, deduce, bluff, and vote. 3+ players.',
    category: '互动游戏',
    categoryEn: 'Games',
    starts: '20.8k',
    accentColor: '#f87171',
    hot: true,
    status: 'available',
    action: communityAction('ai-werewolf'),
    gates: { auth: 'required', membership: 'none', profile: 'optional' },
    ...playTemplate('ai-werewolf'),
  },
  {
    id: 'code-arena',
    image: playCover('code-arena'),
    title: '代码擂台',
    titleEn: 'Code Arena',
    desc: '实时编程对战，AI 出题、计时、自动评测，挑战好友或匹配陌生对手。',
    descEn: 'Real-time coding battles — AI generates problems, auto-judges, ranks you live.',
    category: '互动游戏',
    categoryEn: 'Games',
    starts: '8.6k',
    accentColor: '#fbbf24',
    status: 'available',
    action: communityAction('code-arena'),
    gates: { auth: 'required', membership: 'none', profile: 'optional' },
    ...playTemplate('code-arena'),
  },
  {
    id: 'gitstory',
    image: playCover('gitstory'),
    title: 'GitStory',
    titleEn: 'GitStory',
    desc: '把你的 GitHub 提交历史变成一本自传小说——AI 帮你回顾每一段代码背后的故事。',
    descEn: 'Turn your GitHub commits into an autobiography. Every line of code has a story.',
    category: '黑客与画家',
    categoryEn: 'Hacker & Painter',
    starts: '12.1k',
    accentColor: '#34d399',
    hot: true,
    status: 'available',
    action: communityAction('gitstory'),
    gates: { auth: 'required', membership: 'none', profile: 'optional' },
    ...playTemplate('gitstory'),
  },
  {
    id: 'gstack',
    image: playCover('gstack'),
    title: 'gstack',
    titleEn: 'gstack',
    desc: '创业者的 AI 参谋，帮你快速验证商业想法、分析竞争格局、生成融资文件。',
    descEn: 'AI co-founder for founders. Validate ideas, map competitors, generate pitch decks.',
    category: '黑客与画家',
    categoryEn: 'Hacker & Painter',
    starts: '9.3k',
    accentColor: '#f97316',
    status: 'available',
    action: communityAction('gstack'),
    gates: { auth: 'required', membership: 'none', profile: 'optional' },
    ...playTemplate('gstack'),
  },
  {
    id: 'little-match-girl',
    image: '/home-assets/topics/night-radio.jpg',
    title: '卖火柴的小女孩',
    titleEn: 'Little Match Girl',
    desc: '部署一个会推销火柴的童话 Buddy，购买后在聊天右侧打开火柴动画付费文件。',
    descEn:
      'Deploy a fairy-tale Buddy who sells glowing matches and unlocks a paid HTML flame animation.',
    category: 'MVP 实验',
    categoryEn: 'MVP Labs',
    starts: '1.2k',
    accentColor: '#f59e0b',
    hot: true,
    status: 'gated',
    action: cloudAction('little-match-girl', 'lightweight'),
    gates: { auth: 'required', membership: 'required', profile: 'optional' },
    ...playTemplate('little-match-girl'),
    materials: { cover: '/home-assets/topics/night-radio.jpg' },
  },
  cloudPlay('agent-marketplace-buddy', {
    title: 'Agent Marketplace Buddy',
    titleEn: 'Agent Marketplace Buddy',
    desc: '可组合专家 agent 市场，覆盖开发、安全、基础设施、数据、文档、SEO 和 workflow 编排。',
    descEn:
      'A composable specialist-agent marketplace for development, security, infra, data, docs, SEO, and workflow orchestration.',
    category: 'Buddy 团队',
    categoryEn: 'Buddy Teams',
    starts: '16.4k',
    accentColor: '#22d3ee',
    hot: true,
  }),
  cloudPlay('bmad-method-buddy', {
    title: 'BMAD 方法 Buddy',
    titleEn: 'BMAD Method Buddy',
    desc: '完整 BMAD 方法论团队：分析师、PM、架构师、Scrum Master、开发、QA，贯穿规划到交付。',
    descEn:
      'A full BMAD method team: analyst, PM, architect, scrum master, dev, and QA from planning to delivery.',
    category: 'Buddy 团队',
    categoryEn: 'Buddy Teams',
    starts: '13.7k',
    accentColor: '#60a5fa',
  }),
  cloudPlay('claude-ads-buddy', {
    title: 'Claude Ads Buddy',
    titleEn: 'Claude Ads Buddy',
    desc: '付费投放诊断、预算建模、创意审查、追踪问题和落地页瓶颈分析。',
    descEn:
      'Paid ads audits, budget models, creative review, tracking issues, and landing-page bottlenecks.',
    category: '营销技能',
    categoryEn: 'Marketing Skills',
    starts: '10.8k',
    accentColor: '#fb7185',
  }),
  cloudPlay('claude-seo-buddy', {
    title: 'Claude SEO Buddy',
    titleEn: 'Claude SEO Buddy',
    desc: 'SEO 内容和技术审查团队，覆盖关键词、内链、结构化数据、页面质量和增长计划。',
    descEn:
      'SEO content and technical review for keywords, links, schema, quality, and growth plans.',
    category: '营销技能',
    categoryEn: 'Marketing Skills',
    starts: '12.6k',
    accentColor: '#84cc16',
  }),
  cloudPlay('everything-claude-code-buddy', {
    title: 'Everything Claude Code Buddy',
    titleEn: 'Everything Claude Code Buddy',
    desc: 'Claude Code 工作流、命令和工程实践合集，适合研发团队沉淀自动化能力。',
    descEn:
      'Claude Code workflows, commands, and engineering practices for automation-heavy teams.',
    category: '开发技能',
    categoryEn: 'Developer Skills',
    starts: '19.2k',
    accentColor: '#c084fc',
    hot: true,
  }),
  cloudPlay('google-workspace-buddy', {
    title: 'Google Workspace Buddy',
    titleEn: 'Google Workspace Buddy',
    desc: '把 Docs、Sheets、Drive、日历和邮件协作编排到 Buddy 工作流里。',
    descEn:
      'Coordinate Docs, Sheets, Drive, Calendar, and email collaboration through Buddy workflows.',
    category: '效率工具',
    categoryEn: 'Productivity',
    starts: '9.9k',
    accentColor: '#34d399',
  }),
  cloudPlay('gsd-buddy', {
    title: 'GSD Buddy',
    titleEn: 'GSD Buddy',
    desc: '执行力团队：拆解任务、排优先级、推动决策、追踪阻塞，帮团队持续 get stuff done。',
    descEn:
      'Execution team for task breakdown, priority, decisions, blockers, and getting stuff done.',
    category: '效率工具',
    categoryEn: 'Productivity',
    starts: '17.5k',
    accentColor: '#facc15',
    hot: true,
  }),
  cloudPlay('gstack-buddy', {
    title: 'gstack 战略 Buddy',
    titleEn: 'gstack Strategy Buddy',
    desc: 'YC 风格产品压力测试、CEO 视角范围评审、调查纪律、周复盘和 gstack 脚本工具。',
    descEn:
      'YC-style product pressure testing, CEO scope review, investigation discipline, retros, and gstack scripts.',
    category: '黑客与画家',
    categoryEn: 'Hacker & Painter',
    starts: '15.1k',
    accentColor: '#fb923c',
    hot: true,
  }),
  cloudPlay('marketingskills-buddy', {
    title: '营销技能 Buddy',
    titleEn: 'MarketingSkills Buddy',
    desc: '增长团队的营销协作智能体，覆盖 CRO、文案、SEO、付费、邮件和增长决策。',
    descEn: 'Marketing collaboration agents for CRO, copy, SEO, paid, email, and growth decisions.',
    category: '营销技能',
    categoryEn: 'Marketing Skills',
    starts: '11.7k',
    accentColor: '#f472b6',
  }),
  cloudPlay('scientific-skills-buddy', {
    title: '科研技能 Buddy',
    titleEn: 'Scientific Skills Buddy',
    desc: '研究阅读、实验设计、论文结构、数据分析和学术写作协作团队。',
    descEn:
      'Research reading, experiment design, paper structure, data analysis, and academic writing workflows.',
    category: '科研技能',
    categoryEn: 'Research Skills',
    starts: '7.8k',
    accentColor: '#38bdf8',
  }),
  cloudPlay('seomachine-buddy', {
    title: 'SEO Machine Buddy',
    titleEn: 'SEO Machine Buddy',
    desc: '持续运行的 SEO 机器：选题、brief、内容审查、技术检查和排名复盘。',
    descEn:
      'An always-on SEO machine for topics, briefs, review, technical checks, and ranking retros.',
    category: '营销技能',
    categoryEn: 'Marketing Skills',
    starts: '10.2k',
    accentColor: '#a3e635',
  }),
  cloudPlay('slavingia-skills-buddy', {
    title: 'Slavingia Skills Buddy',
    titleEn: 'Slavingia Skills Buddy',
    desc: '创作者和独立开发者的技能库，覆盖写作、产品、增长、社区和发布节奏。',
    descEn:
      'A creator and indie-builder skill stack for writing, product, growth, community, and shipping rhythm.',
    category: '创作者技能',
    categoryEn: 'Creator Skills',
    starts: '8.4k',
    accentColor: '#f97316',
  }),
  cloudPlay('superclaude-buddy', {
    title: 'SuperClaude Buddy',
    titleEn: 'SuperClaude Buddy',
    desc: 'SuperClaude 指令、角色和工作流能力，帮助团队把 Claude 用成结构化工程伙伴。',
    descEn:
      'SuperClaude commands, personas, and workflows for structured engineering collaboration.',
    category: '开发技能',
    categoryEn: 'Developer Skills',
    starts: '18.9k',
    accentColor: '#818cf8',
    hot: true,
  }),
  cloudPlay('superpowers-buddy', {
    title: 'Superpowers Buddy',
    titleEn: 'Superpowers Buddy',
    desc: '个人生产力超能力组合：阅读、写作、任务、研究、自动化和复盘。',
    descEn:
      'Personal productivity superpowers for reading, writing, tasks, research, automation, and retros.',
    category: '效率工具',
    categoryEn: 'Productivity',
    starts: '12.4k',
    accentColor: '#2dd4bf',
  }),
  {
    id: 'e-wife',
    image: playCover('e-wife'),
    title: '电子老婆',
    titleEn: 'E-Wife',
    desc: '一个带有陪伴感的虚拟生活伙伴玩法，后续会接入个性化记忆和私有房间。',
    descEn:
      'A companion-style virtual life partner play, later connected to memory and private rooms.',
    category: '心理疗愈',
    categoryEn: 'Healing',
    starts: '22.0k',
    accentColor: '#f0abfc',
    status: 'available',
    action: roomAction('e-wife'),
    gates: { auth: 'required', membership: 'none', profile: 'optional' },
    ...playTemplate('e-wife'),
  },
]

export function getDefaultHomePlay(playId: string): ShadowHomePlayCatalogItem | null {
  return DEFAULT_HOMEPLAY_CATALOG.find((play) => play.id === playId) ?? null
}
