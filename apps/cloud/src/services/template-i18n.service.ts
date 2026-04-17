/**
 * TemplateI18nService — locale-aware presentation metadata for built-in templates.
 *
 * The raw TemplateService owns template discovery and config loading.
 * This service owns all console-facing copy (overview, highlights, requirements,
 * categories, deploy-time labels, etc.) so the dashboard can pass locale in
 * requests and keep presentation logic on the backend.
 */

import { stat } from 'node:fs/promises'
import { type TemplateMeta, TemplateService } from './template.service.js'

export type TemplateCategoryId =
  | 'devops'
  | 'security'
  | 'support'
  | 'research'
  | 'monitoring'
  | 'business'
  | 'demo'

export type TemplateDifficulty = 'beginner' | 'intermediate' | 'advanced'

export interface TemplateCategoryInfo {
  id: TemplateCategoryId | 'all'
  label: string
  emoji: string
  description: string
}

export interface TemplateCatalogSummary {
  name: string
  description: string
  teamName: string
  agentCount: number
  namespace: string
  category: TemplateCategoryId
  emoji: string
  featured: boolean
  popularity: number
  difficulty: TemplateDifficulty
  estimatedDeployTime: string
  overview: string[]
  features: string[]
  highlights: string[]
}

export interface TemplateCatalogDetail extends TemplateCatalogSummary {
  file: string
  lastUpdated: string | null
  useCases: string[]
  requirements: string[]
  requiredEnvVars: string[]
}

export interface TemplateCatalogResponse {
  templates: TemplateCatalogSummary[]
  categories: TemplateCategoryInfo[]
}

interface TemplateCopy {
  overview: string[]
  features: string[]
  highlights: string[]
  requirements: string[]
  useCases: string[]
  estimatedDeployTime: string
}

interface TemplateRegistryEntry {
  category: TemplateCategoryId
  emoji: string
  featured: boolean
  popularity: number
  difficulty: TemplateDifficulty
  translations: {
    en: TemplateCopy
    'zh-CN': TemplateCopy
  }
}

const CATEGORY_TRANSLATIONS = {
  en: {
    all: {
      id: 'all',
      label: 'All Templates',
      emoji: '📦',
      description: 'Browse every agent team template available in Shadow Cloud.',
    },
    devops: {
      id: 'devops',
      label: 'DevOps & Engineering',
      emoji: '⚙️',
      description: 'Deploy review, release, CI/CD, and infrastructure automation teams.',
    },
    security: {
      id: 'security',
      label: 'Security',
      emoji: '🛡️',
      description: 'Continuous scanning, compliance checks, and security response agents.',
    },
    support: {
      id: 'support',
      label: 'Customer Support',
      emoji: '🎧',
      description: 'Ticket routing, knowledge retrieval, and customer response workflows.',
    },
    research: {
      id: 'research',
      label: 'Research & Analysis',
      emoji: '🔬',
      description: 'Multi-agent research, synthesis, and reporting pipelines.',
    },
    monitoring: {
      id: 'monitoring',
      label: 'Monitoring & Metrics',
      emoji: '📊',
      description: 'Telemetry, anomaly detection, and performance visibility teams.',
    },
    business: {
      id: 'business',
      label: 'Business & Productivity',
      emoji: '💼',
      description: 'Growth, operations, content, and solo-founder productivity packs.',
    },
    demo: {
      id: 'demo',
      label: 'Demo & Learning',
      emoji: '🎓',
      description: 'Starter templates for evaluation, onboarding, and experimentation.',
    },
  },
  'zh-CN': {
    all: {
      id: 'all',
      label: '全部模板',
      emoji: '📦',
      description: '浏览 Shadow Cloud 中所有可用的智能体团队模板。',
    },
    devops: {
      id: 'devops',
      label: 'DevOps 与工程',
      emoji: '⚙️',
      description: '覆盖代码评审、发布、CI/CD 与基础设施自动化的团队模板。',
    },
    security: {
      id: 'security',
      label: '安全',
      emoji: '🛡️',
      description: '用于持续扫描、合规校验与安全响应的智能体模板。',
    },
    support: {
      id: 'support',
      label: '客户支持',
      emoji: '🎧',
      description: '处理工单分发、知识库检索与客户回复流程。',
    },
    research: {
      id: 'research',
      label: '研究与分析',
      emoji: '🔬',
      description: '适合研究、洞察整理与报告生成的多智能体流水线。',
    },
    monitoring: {
      id: 'monitoring',
      label: '监控与指标',
      emoji: '📊',
      description: '提供遥测、异常检测与性能可视化的团队模板。',
    },
    business: {
      id: 'business',
      label: '商业与效率',
      emoji: '💼',
      description: '适用于增长、运营、内容与独立创业者效率场景。',
    },
    demo: {
      id: 'demo',
      label: '演示与学习',
      emoji: '🎓',
      description: '适合试用、培训与实验的入门模板。',
    },
  },
} satisfies Record<string, Record<string, TemplateCategoryInfo>>

const TEMPLATE_REGISTRY: Record<string, TemplateRegistryEntry> = {
  'shadowob-cloud': {
    category: 'devops',
    emoji: '☁️',
    featured: false,
    popularity: 72,
    difficulty: 'beginner',
    translations: {
      en: {
        overview: [
          'The base Shadow Cloud template is the fastest path from zero to a live AI agent on Kubernetes.',
          'It keeps the footprint intentionally small: one agent, sensible defaults, and the minimum amount of configuration required to validate your cluster and provider setup.',
        ],
        features: [
          'Single-agent deployment with sensible defaults',
          'Auto-generated Kubernetes manifests',
          'Built-in health checks and readiness probes',
          'Minimal configuration surface for first-time users',
        ],
        highlights: [
          'Deploy in under 2 minutes',
          'Ideal for first-time Shadow Cloud users',
          'Great baseline for cloning into your own template',
        ],
        requirements: [
          'A reachable Kubernetes cluster with kubectl access',
          'At least one configured LLM provider',
        ],
        useCases: [
          'Platform evaluation',
          'Smoke-testing a new cluster',
          'Launching a single-purpose agent quickly',
        ],
        estimatedDeployTime: '~2 min',
      },
      'zh-CN': {
        overview: [
          '这是 Shadow Cloud 的基础模板，也是把 AI 智能体部署到 Kubernetes 上最快的方式。',
          '它刻意保持轻量：只包含一个智能体、合理默认值，以及验证集群与模型服务商配置所需的最少参数。',
        ],
        features: [
          '内置单智能体部署默认配置',
          '自动生成 Kubernetes 清单',
          '自带健康检查与就绪探针',
          '为首次上手控制台而优化的最小配置面',
        ],
        highlights: [
          '2 分钟内即可完成部署',
          '非常适合第一次使用 Shadow Cloud',
          '适合作为自定义模板的起点',
        ],
        requirements: [
          '一个可访问的 Kubernetes 集群，并可使用 kubectl',
          '至少配置一个可用的 LLM Provider',
        ],
        useCases: ['平台试用', '新集群冒烟验证', '快速上线单一用途智能体'],
        estimatedDeployTime: '~2 分钟',
      },
    },
  },
  'code-review-team': {
    category: 'devops',
    emoji: '🔍',
    featured: true,
    popularity: 95,
    difficulty: 'intermediate',
    translations: {
      en: {
        overview: [
          'Code Review Team deploys a specialist review squad that watches pull requests and produces structured, role-aware feedback.',
          'It is built for engineering teams that want security, quality, and maintainability checks to happen continuously instead of relying on a single reviewer to catch everything.',
        ],
        features: [
          'Automated pull request review workflows',
          'Security and vulnerability detection in changed code',
          'Style, performance, and maintainability analysis',
          'Diff-aware contextual review comments',
          'Support for multi-language repositories',
        ],
        highlights: [
          '3-agent specialist team',
          'Shortens review cycles while improving consistency',
          'Helps catch bugs before merge',
        ],
        requirements: [
          'Repository access via GitHub or GitLab',
          'Webhook or polling integration for PR events',
          'A strong LLM provider such as Claude or GPT-4 class models',
        ],
        useCases: ['PR automation', 'Engineering quality gates', 'Security-first review pipelines'],
        estimatedDeployTime: '~5 min',
      },
      'zh-CN': {
        overview: [
          'Code Review Team 会部署一支分工明确的代码评审小队，持续监听 Pull Request 并输出结构化反馈。',
          '它适合希望把安全、质量和可维护性检查自动化的工程团队，而不是把所有责任压给单个 reviewer。',
        ],
        features: [
          '自动化 Pull Request 评审流程',
          '对变更代码进行安全与漏洞检测',
          '风格、性能与可维护性分析',
          '基于 diff 上下文生成评论',
          '支持多语言仓库',
        ],
        highlights: [
          '由 3 个专职智能体协同完成评审',
          '缩短评审周期并提升一致性',
          '在合并前尽早暴露缺陷',
        ],
        requirements: [
          '可访问的 GitHub 或 GitLab 仓库',
          '用于 PR 事件的 webhook 或轮询集成',
          '推荐使用 Claude / GPT-4 等较强模型',
        ],
        useCases: ['PR 自动化', '工程质量门禁', '安全优先的评审流水线'],
        estimatedDeployTime: '~5 分钟',
      },
    },
  },
  'customer-support-team': {
    category: 'support',
    emoji: '🎧',
    featured: true,
    popularity: 88,
    difficulty: 'intermediate',
    translations: {
      en: {
        overview: [
          'Customer Support Team combines routing and resolution into a single support workflow that can classify, answer, and escalate tickets.',
          'It is especially useful for teams that want faster first-response times without giving up guardrails for complex or high-risk cases.',
        ],
        features: [
          'Automatic ticket classification and routing',
          'Knowledge-base lookup for accurate responses',
          'Sentiment-aware escalation paths',
          'Support for multi-channel intake',
          'Response quality scoring and handoff signals',
        ],
        highlights: [
          'Router + resolver architecture',
          'Handles a large share of L1 support automatically',
          'Escalates edge cases to humans cleanly',
        ],
        requirements: [
          'A help desk or ticket system integration',
          'Optional knowledge base or internal docs',
          'At least one configured LLM provider',
        ],
        useCases: [
          'Help desk automation',
          'FAQ resolution at scale',
          'After-hours support coverage',
        ],
        estimatedDeployTime: '~5 min',
      },
      'zh-CN': {
        overview: [
          'Customer Support Team 把工单分流与问题解答整合成一条自动化支持流程，可对工单进行分类、回复与升级。',
          '它适合希望提升首响速度、同时又不放弃复杂问题人工兜底能力的支持团队。',
        ],
        features: [
          '自动分类并分发工单',
          '接入知识库以生成更准确回复',
          '基于情绪判断升级路径',
          '支持多渠道入口',
          '支持回复质量评分与交接信号',
        ],
        highlights: [
          '采用 Router + Resolver 双智能体架构',
          '可自动处理大量一线支持请求',
          '对复杂问题可平滑升级给人工',
        ],
        requirements: ['接入客服或工单系统', '可选的知识库或内部文档', '至少配置一个 LLM Provider'],
        useCases: ['帮助台自动化', 'FAQ 批量处理', '非工作时间支持覆盖'],
        estimatedDeployTime: '~5 分钟',
      },
    },
  },
  'devops-team': {
    category: 'devops',
    emoji: '🔧',
    featured: true,
    popularity: 91,
    difficulty: 'advanced',
    translations: {
      en: {
        overview: [
          'DevOps Team turns Shadow Cloud into an operational co-pilot for monitoring, incidents, and deployment workflows.',
          'The template is designed for teams that want faster incident response and repeatable production operations backed by multi-agent coordination.',
        ],
        features: [
          'Infrastructure monitoring workflows',
          'Incident triage and runbook execution',
          'Deployment pipeline coordination',
          'Alert routing and summarization',
          'Post-incident summaries for follow-up work',
        ],
        highlights: [
          '3-agent operational team',
          'Reduces manual incident coordination',
          'Supports safe release and rollback patterns',
        ],
        requirements: [
          'Cluster access and operational observability sources',
          'Alerting integration such as Prometheus, Datadog, or webhooks',
          'One configured LLM provider',
        ],
        useCases: [
          'Incident response automation',
          'Release orchestration',
          'Infrastructure operations',
        ],
        estimatedDeployTime: '~8 min',
      },
      'zh-CN': {
        overview: [
          'DevOps Team 会把 Shadow Cloud 变成面向监控、事故处理与发布流程的运维副驾驶。',
          '它适合希望用多智能体协作来缩短故障响应时间、并让生产操作更可重复的团队。',
        ],
        features: [
          '基础设施监控工作流',
          '事故分诊与 Runbook 执行',
          '发布流水线协调',
          '告警路由与摘要整理',
          '事故后总结与后续行动整理',
        ],
        highlights: [
          '由 3 个运维智能体协同工作',
          '减少人工事故协调成本',
          '支持更安全的发布与回滚流程',
        ],
        requirements: [
          '具备集群访问能力与观测数据源',
          'Prometheus、Datadog 或 webhook 等告警集成',
          '至少一个已配置的 LLM Provider',
        ],
        useCases: ['事故响应自动化', '发布编排', '基础设施运营'],
        estimatedDeployTime: '~8 分钟',
      },
    },
  },
  'gitagent-from-repo': {
    category: 'devops',
    emoji: '🐙',
    featured: true,
    popularity: 84,
    difficulty: 'advanced',
    translations: {
      en: {
        overview: [
          'GitAgent From Repo bootstraps a larger specialist team by inspecting your repository and tailoring roles around the codebase.',
          'It is a strong fit when you want more than one narrow automation bot and instead need a repo-aware team that can review, document, test, and release together.',
        ],
        features: [
          'Repository-aware role generation',
          'Issue, PR, documentation, and release workflows',
          'Agent specialization based on repository structure',
          'Support for multi-repo or branch-based operations',
          'Built-in test and documentation support',
        ],
        highlights: [
          '6-agent repository operations team',
          'Learns project structure before acting',
          'Well suited for larger or fast-moving codebases',
        ],
        requirements: [
          'Repository access with enough metadata to inspect structure',
          'A repository with recognizable project conventions',
          'A capable LLM provider for deep reasoning and long context',
        ],
        useCases: ['Repository automation', 'Open source maintenance', 'Large codebase operations'],
        estimatedDeployTime: '~10 min',
      },
      'zh-CN': {
        overview: [
          'GitAgent From Repo 会先分析你的代码仓库，再按仓库结构与职责自动组装一支更完整的智能体团队。',
          '如果你需要的不是单点自动化机器人，而是一支能一起评审、写文档、补测试、管发布的 repo-aware 团队，这个模板会更合适。',
        ],
        features: [
          '基于仓库上下文生成角色分工',
          '覆盖 Issue、PR、文档与发布流程',
          '根据项目结构自动分配智能体专长',
          '支持多仓库或分支化操作',
          '内置测试与文档协作能力',
        ],
        highlights: [
          '6 个智能体组成的仓库运营团队',
          '先理解项目结构再执行动作',
          '适合大型或高频变更代码库',
        ],
        requirements: [
          '可访问仓库及其结构元数据',
          '仓库具备较清晰的项目约定',
          '推荐使用长上下文与强推理能力模型',
        ],
        useCases: ['仓库自动化', '开源项目维护', '大型代码库运营'],
        estimatedDeployTime: '~10 分钟',
      },
    },
  },
  'managed-agents-demo': {
    category: 'demo',
    emoji: '🎮',
    featured: false,
    popularity: 65,
    difficulty: 'beginner',
    translations: {
      en: {
        overview: [
          'Managed Agents Demo is a guided playground that helps you see what a multi-agent deployment feels like without heavy upfront setup.',
          'It is meant for demos, onboarding, and safe experimentation before you commit to a production template.',
        ],
        features: [
          'Pre-configured demo agents',
          'Guided exploration of common workflows',
          'Minimal setup for evaluation environments',
          'Great for team walkthroughs and platform onboarding',
        ],
        highlights: [
          '3-agent demo environment',
          'Low setup friction',
          'Useful before committing to production deployment',
        ],
        requirements: ['A Kubernetes cluster', 'Any configured LLM provider'],
        useCases: ['Platform demos', 'Team onboarding', 'Infrastructure dry runs'],
        estimatedDeployTime: '~3 min',
      },
      'zh-CN': {
        overview: [
          'Managed Agents Demo 是一个带引导的体验模板，让你无需复杂前置配置就能感受多智能体部署的实际效果。',
          '它特别适合演示、培训以及在选定正式模板之前先做安全实验。',
        ],
        features: [
          '预配置演示智能体',
          '引导式体验常见工作流',
          '适合评估环境的极简初始化',
          '方便用于团队讲解与培训',
        ],
        highlights: ['内置 3 个演示智能体', '配置门槛低', '适合正式上线前预演'],
        requirements: ['一个 Kubernetes 集群', '任意一个已配置的 LLM Provider'],
        useCases: ['平台演示', '团队上手培训', '基础设施试跑'],
        estimatedDeployTime: '~3 分钟',
      },
    },
  },
  'metrics-team': {
    category: 'monitoring',
    emoji: '📈',
    featured: false,
    popularity: 78,
    difficulty: 'intermediate',
    translations: {
      en: {
        overview: [
          'Metrics Team focuses on telemetry, anomaly detection, and helping operators understand what changed before an alert becomes an outage.',
          'It is a strong match for teams drowning in dashboards but still missing clear, actionable summaries.',
        ],
        features: [
          'Metrics aggregation from multiple sources',
          'Anomaly and baseline detection',
          'Natural-language summaries for trend changes',
          'Alert threshold tuning support',
          'Custom dashboard suggestions',
        ],
        highlights: [
          'Collector + analyzer pairing',
          'Great for noisy observability stacks',
          'Helps operators move from raw charts to decisions',
        ],
        requirements: [
          'At least one metrics source such as Prometheus or CloudWatch',
          'One configured LLM provider',
        ],
        useCases: ['Anomaly detection', 'Capacity planning', 'Metrics triage and summary'],
        estimatedDeployTime: '~5 min',
      },
      'zh-CN': {
        overview: [
          'Metrics Team 专注于遥测、异常检测，以及在告警演变成事故前帮助运维人员理解系统发生了什么变化。',
          '它很适合已经有很多 dashboard、却仍然缺少明确行动建议的团队。',
        ],
        features: [
          '聚合多个指标来源',
          '自动识别基线与异常',
          '用自然语言总结趋势变化',
          '辅助调优告警阈值',
          '给出自定义看板建议',
        ],
        highlights: [
          'Collector + Analyzer 双智能体协作',
          '适合处理高噪音观测系统',
          '帮助团队从图表走向决策',
        ],
        requirements: ['至少一个指标源，如 Prometheus 或 CloudWatch', '一个已配置的 LLM Provider'],
        useCases: ['异常检测', '容量规划', '指标告警分诊与摘要'],
        estimatedDeployTime: '~5 分钟',
      },
    },
  },
  'research-team': {
    category: 'research',
    emoji: '🔬',
    featured: false,
    popularity: 76,
    difficulty: 'intermediate',
    translations: {
      en: {
        overview: [
          'Research Team automates collection, analysis, and synthesis so recurring research work does not depend on one person manually stitching sources together.',
          'It works well for product research, market intelligence, and any workflow where insight quality matters as much as speed.',
        ],
        features: [
          'Multi-source research collection',
          'Automated synthesis and report generation',
          'Citation-friendly workflow structure',
          'Knowledge-base updates from findings',
          'Recurring digest support',
        ],
        highlights: [
          '3-agent research workflow',
          'Turns scattered inputs into a structured brief',
          'Good balance between speed and rigor',
        ],
        requirements: [
          'Research data sources or APIs',
          'A configured LLM provider, ideally one good with long context',
        ],
        useCases: ['Market research', 'Competitive intelligence', 'Internal knowledge synthesis'],
        estimatedDeployTime: '~5 min',
      },
      'zh-CN': {
        overview: [
          'Research Team 会自动完成资料收集、分析与综合整理，让周期性研究工作不再依赖单个人手工拼接信息。',
          '它适合产品研究、市场情报，以及任何对洞察质量与响应速度都同样敏感的场景。',
        ],
        features: [
          '支持多来源研究资料采集',
          '自动生成综合结论与报告',
          '更适合引用追踪的工作结构',
          '可将结果写回知识库',
          '支持定期 Digest 输出',
        ],
        highlights: [
          '3 个智能体组成的研究工作流',
          '把分散输入整理成结构化结论',
          '在速度与严谨之间取得平衡',
        ],
        requirements: ['研究数据源或相关 API', '一个已配置的 LLM Provider，最好擅长长上下文'],
        useCases: ['市场研究', '竞品情报', '内部知识综合整理'],
        estimatedDeployTime: '~5 分钟',
      },
    },
  },
  'security-team': {
    category: 'security',
    emoji: '🛡️',
    featured: true,
    popularity: 89,
    difficulty: 'advanced',
    translations: {
      en: {
        overview: [
          'Security Team provides a standing multi-agent layer for vulnerability scanning, compliance checks, and suspicious change detection.',
          'It is meant for teams that want security review to run continuously inside delivery workflows instead of arriving late as a one-off audit.',
        ],
        features: [
          'Code, dependency, and secret scanning',
          'Configuration and compliance checks',
          'Suspicious-pattern detection',
          'Remediation-oriented reporting',
          'Support for continuous security posture review',
        ],
        highlights: [
          '3-agent security squad',
          'Combines vulnerability, compliance, and threat perspectives',
          'Designed for ongoing DevSecOps workflows',
        ],
        requirements: [
          'Repository access for code analysis',
          'Optional container registry access',
          'A configured LLM provider',
        ],
        useCases: [
          'DevSecOps automation',
          'Compliance review',
          'Continuous vulnerability management',
        ],
        estimatedDeployTime: '~8 min',
      },
      'zh-CN': {
        overview: [
          'Security Team 提供一层常驻的多智能体安全能力，用于漏洞扫描、合规校验与可疑变更检测。',
          '它适合希望把安全审查持续嵌入交付流程，而不是等到最后才临时补一次审计的团队。',
        ],
        features: [
          '代码、依赖与密钥扫描',
          '配置与合规检查',
          '可疑模式识别',
          '面向修复的报告输出',
          '支持持续安全姿态审查',
        ],
        highlights: [
          '3 个安全智能体协同工作',
          '结合漏洞、合规与威胁视角',
          '适合持续化 DevSecOps 流程',
        ],
        requirements: [
          '用于代码分析的仓库访问权限',
          '可选的镜像仓库访问权限',
          '一个已配置的 LLM Provider',
        ],
        useCases: ['DevSecOps 自动化', '合规审查', '持续漏洞治理'],
        estimatedDeployTime: '~8 分钟',
      },
    },
  },
  'solopreneur-pack': {
    category: 'business',
    emoji: '🚀',
    featured: true,
    popularity: 86,
    difficulty: 'beginner',
    translations: {
      en: {
        overview: [
          'Solopreneur Pack is a productivity-oriented multi-agent setup for founders and small teams who need leverage across content, research, support, and operations.',
          'It is intentionally broad and pragmatic: less about one workflow, more about covering the repetitive work that slows down tiny teams.',
        ],
        features: [
          'Content generation and social workflow support',
          'Market research and prioritization support',
          'Email and customer communication drafting',
          'Operations and scheduling assistance',
          'Lightweight business reporting and analysis',
        ],
        highlights: [
          '5-agent virtual team',
          'Built for solo founders and lean teams',
          'Covers day-to-day business execution tasks',
        ],
        requirements: [
          'Any relevant external platform APIs are optional',
          'At least one configured LLM provider',
        ],
        useCases: ['Founder productivity', 'Small-team augmentation', 'Business task automation'],
        estimatedDeployTime: '~5 min',
      },
      'zh-CN': {
        overview: [
          'Solopreneur Pack 是一套面向独立创业者与小团队的效率型多智能体组合，覆盖内容、研究、支持与运营等场景。',
          '它的设计目标不是只服务一个工作流，而是尽量覆盖拖慢小团队日常执行的重复性工作。',
        ],
        features: [
          '内容生成与社媒工作流支持',
          '市场研究与优先级辅助',
          '邮件与客户沟通草拟',
          '运营与排期协助',
          '轻量级业务分析与报告',
        ],
        highlights: [
          '等同于一个 5 人虚拟小团队',
          '面向独立创业者与精简团队设计',
          '覆盖大量日常业务执行任务',
        ],
        requirements: ['外部平台 API 可按需选配', '至少一个已配置的 LLM Provider'],
        useCases: ['创业者效率提升', '小团队能力增强', '业务任务自动化'],
        estimatedDeployTime: '~5 分钟',
      },
    },
  },
}

function normalizeLocale(locale?: string): 'en' | 'zh-CN' {
  if (!locale) return 'en'
  if (locale === 'zh-CN' || locale.startsWith('zh')) return 'zh-CN'
  return 'en'
}

function extractEnvRefs(obj: unknown): string[] {
  const refs = new Set<string>()
  const pattern = /\$\{env:([A-Za-z_][A-Za-z0-9_]*)\}/g

  function walk(value: unknown) {
    if (typeof value === 'string') {
      for (const match of value.matchAll(pattern)) {
        const envKey = match[1]
        if (envKey) refs.add(envKey)
      }
      return
    }

    if (Array.isArray(value)) {
      for (const item of value) walk(item)
      return
    }

    if (value && typeof value === 'object') {
      for (const child of Object.values(value)) walk(child)
    }
  }

  walk(obj)
  return [...refs].sort()
}

function buildFallbackCopy(locale: 'en' | 'zh-CN'): TemplateCopy {
  if (locale === 'zh-CN') {
    return {
      overview: ['该模板尚未补充完整的展示信息，但你仍然可以查看配置并直接部署。'],
      features: ['基础模板信息可用'],
      highlights: ['可直接从控制台部署'],
      requirements: ['请查看模板配置中的环境变量与依赖项'],
      useCases: ['自定义场景'],
      estimatedDeployTime: '~5 分钟',
    }
  }

  return {
    overview: [
      'Detailed marketplace copy is not available for this template yet, but the config remains deployable from the console.',
    ],
    features: ['Basic template metadata available'],
    highlights: ['Ready to deploy from the console'],
    requirements: ['Review template configuration for environment requirements'],
    useCases: ['Custom workflows'],
    estimatedDeployTime: '~5 min',
  }
}

export class TemplateI18nService {
  constructor(private templateService: TemplateService) {}

  getCategories(locale?: string): TemplateCategoryInfo[] {
    const resolvedLocale = normalizeLocale(locale)
    const dict = CATEGORY_TRANSLATIONS[resolvedLocale]
    return [
      dict.all,
      dict.devops,
      dict.security,
      dict.support,
      dict.research,
      dict.monitoring,
      dict.business,
      dict.demo,
    ]
  }

  async listCatalog(locale?: string): Promise<TemplateCatalogResponse> {
    const resolvedLocale = normalizeLocale(locale)
    const templates = await this.templateService.discover(locale)
    return {
      templates: templates.map((template) => this.buildSummary(template, resolvedLocale)),
      categories: this.getCategories(resolvedLocale),
    }
  }

  async getTemplateDetail(name: string, locale?: string): Promise<TemplateCatalogDetail | null> {
    const resolvedLocale = normalizeLocale(locale)
    const templates = await this.templateService.discover(locale)
    const template = templates.find((entry) => entry.name === name)
    if (!template) return null

    const summary = this.buildSummary(template, resolvedLocale)
    const rawTemplate = await this.templateService.getTemplate(name)
    const configPath = await this.templateService.getTemplatePath(name)
    const lastUpdated = await this.safeStat(configPath)

    return {
      ...summary,
      file: template.file,
      lastUpdated,
      useCases: this.resolveCopy(name, resolvedLocale).useCases,
      requirements: this.resolveCopy(name, resolvedLocale).requirements,
      requiredEnvVars: extractEnvRefs(rawTemplate),
    }
  }

  private buildSummary(template: TemplateMeta, locale: 'en' | 'zh-CN'): TemplateCatalogSummary {
    const registry = TEMPLATE_REGISTRY[template.name]
    const copy = this.resolveCopy(template.name, locale)

    return {
      name: template.name,
      description: template.description,
      teamName: template.teamName,
      agentCount: template.agentCount,
      namespace: template.namespace,
      category: registry?.category ?? 'demo',
      emoji: registry?.emoji ?? '📦',
      featured: registry?.featured ?? false,
      popularity: registry?.popularity ?? 50,
      difficulty: registry?.difficulty ?? 'beginner',
      estimatedDeployTime: copy.estimatedDeployTime,
      overview: copy.overview,
      features: copy.features,
      highlights: copy.highlights,
    }
  }

  private resolveCopy(name: string, locale: 'en' | 'zh-CN'): TemplateCopy {
    const entry = TEMPLATE_REGISTRY[name]
    if (!entry) return buildFallbackCopy(locale)
    return entry.translations[locale] ?? entry.translations.en
  }

  private async safeStat(filePath: string | null): Promise<string | null> {
    if (!filePath) return null
    try {
      return (await stat(filePath)).mtime.toISOString()
    } catch {
      return null
    }
  }
}
