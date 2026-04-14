/**
 * Agent Store — template metadata enrichment.
 *
 * The API returns basic template info (name, description, agentCount, namespace).
 * This module maps template names → rich metadata for the marketplace experience.
 */

export type StoreCategory =
  | 'devops'
  | 'security'
  | 'support'
  | 'research'
  | 'monitoring'
  | 'business'
  | 'demo'

export interface StoreCategoryDef {
  id: StoreCategory | 'all'
  label: string
  emoji: string
  description: string
  color: string
}

export interface StoreTemplateMeta {
  category: StoreCategory
  emoji: string
  features: string[]
  requirements: string[]
  highlights: string[]
  popularity: number
  featured: boolean
  readme: string
  useCases: string[]
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  estimatedDeployTime: string
}

// ── Categories ────────────────────────────────────────────────────────────────

export const CATEGORIES: StoreCategoryDef[] = [
  {
    id: 'all',
    label: 'All Templates',
    emoji: '📦',
    description: 'Browse all available agent team templates',
    color: 'gray',
  },
  {
    id: 'devops',
    label: 'DevOps & Engineering',
    emoji: '⚙️',
    description: 'CI/CD, code review, Git automation, and infrastructure',
    color: 'blue',
  },
  {
    id: 'security',
    label: 'Security',
    emoji: '🛡️',
    description: 'Vulnerability scanning, compliance, and threat detection',
    color: 'red',
  },
  {
    id: 'support',
    label: 'Customer Support',
    emoji: '🎧',
    description: 'Help desk automation and customer interaction',
    color: 'green',
  },
  {
    id: 'research',
    label: 'Research & Analysis',
    emoji: '🔬',
    description: 'Data analysis, knowledge management, and research automation',
    color: 'purple',
  },
  {
    id: 'monitoring',
    label: 'Monitoring & Metrics',
    emoji: '📊',
    description: 'System metrics, alerting, and performance tracking',
    color: 'yellow',
  },
  {
    id: 'business',
    label: 'Business & Productivity',
    emoji: '💼',
    description: 'Business automation and all-in-one productivity tools',
    color: 'orange',
  },
  {
    id: 'demo',
    label: 'Demo & Learning',
    emoji: '🎓',
    description: 'Example templates for learning and experimentation',
    color: 'cyan',
  },
]

// ── Template Metadata ─────────────────────────────────────────────────────────

export const TEMPLATE_META: Record<string, StoreTemplateMeta> = {
  'shadowob-cloud': {
    category: 'devops',
    emoji: '☁️',
    features: [
      'Single agent deployment',
      'Minimal YAML configuration',
      'Auto-generated Kubernetes manifests',
      'Built-in health checks',
    ],
    requirements: ['Kubernetes cluster with kubectl access', 'At least 1 LLM provider configured'],
    highlights: ['Deploy in under 2 minutes', 'Perfect for first-time users'],
    popularity: 72,
    featured: false,
    readme: `## Shadow Cloud Base Agent

The simplest way to deploy an AI agent to Kubernetes. This template creates a single-agent deployment with sensible defaults.

### What's Included
- One general-purpose AI agent
- Pre-configured health checks and readiness probes
- Automatic resource allocation
- Rolling update strategy

### Getting Started
1. Select this template from the store
2. Configure your LLM provider (Anthropic, OpenAI, etc.)
3. Click Deploy — your agent will be live in seconds

### When to Use
- Learning the Shadow Cloud platform
- Quick prototyping and testing
- Running a single specialized agent`,
    useCases: ['Quick prototyping', 'Learning the platform', 'Single-purpose agent deployment'],
    difficulty: 'beginner',
    estimatedDeployTime: '~2 min',
  },

  'code-review-team': {
    category: 'devops',
    emoji: '🔍',
    features: [
      'Automated pull request review',
      'Code quality analysis',
      'Security vulnerability detection',
      'Style and convention checking',
      'Diff-aware contextual comments',
      'Multi-language support',
    ],
    requirements: [
      'GitHub or GitLab repository access',
      'Repository webhook configuration',
      'At least 1 LLM provider (Claude or GPT-4 recommended)',
    ],
    highlights: [
      '3-agent team for comprehensive reviews',
      'Catches bugs before they reach production',
      'Reduces code review cycle time by 50%+',
    ],
    popularity: 95,
    featured: true,
    readme: `## Code Review Team

A team of 3 AI agents that collaborate to provide comprehensive code reviews on every pull request.

### Agent Roles
1. **Review Lead** — Orchestrates the review process, assigns sections to specialists
2. **Security Analyst** — Focuses on potential vulnerabilities, injection risks, and auth issues
3. **Quality Engineer** — Checks code style, performance patterns, and best practices

### How It Works
When a PR is created or updated, the team:
1. Pulls the diff and analyzes changed files
2. Each agent reviews from their specialty perspective
3. Results are merged into a single comprehensive review
4. Comments are posted inline on the PR

### Configuration
- Supports GitHub, GitLab, and Bitbucket
- Configurable review depth (quick/standard/thorough)
- Custom rule sets for your team's conventions
- Language-specific analyzers`,
    useCases: [
      'Pull request automation',
      'Code quality gate enforcement',
      'Security-first development workflow',
    ],
    difficulty: 'intermediate',
    estimatedDeployTime: '~5 min',
  },

  'customer-support-team': {
    category: 'support',
    emoji: '🎧',
    features: [
      'Multi-channel support routing',
      'Automated ticket classification',
      'Knowledge base search',
      'Escalation workflow',
      'Sentiment analysis',
    ],
    requirements: [
      'Support ticket system integration',
      'Knowledge base documents (optional)',
      '1 LLM provider configured',
    ],
    highlights: [
      '2-agent team: router + resolver',
      'Handles 70%+ of L1 support queries',
      'Automatic escalation for complex issues',
    ],
    popularity: 88,
    featured: true,
    readme: `## Customer Support Team

Deploy an AI-powered support team that handles customer inquiries automatically.

### Agent Roles
1. **Support Router** — Classifies incoming tickets, determines priority, routes to resolver or human
2. **Knowledge Resolver** — Searches knowledge base and generates accurate responses

### Features
- Automatic language detection and response
- Sentiment-aware escalation
- Custom knowledge base integration
- Response quality scoring

### Metrics
- Average resolution time: < 30 seconds for L1 issues
- Customer satisfaction: typically 85%+ on automated responses
- Escalation rate: ~30% to human agents`,
    useCases: ['Help desk automation', 'FAQ handling at scale', 'After-hours support coverage'],
    difficulty: 'intermediate',
    estimatedDeployTime: '~5 min',
  },

  'devops-team': {
    category: 'devops',
    emoji: '🔧',
    features: [
      'Infrastructure monitoring',
      'Incident response automation',
      'Deployment pipeline management',
      'Alert triage and routing',
      'Runbook execution',
      'Post-incident summarization',
    ],
    requirements: [
      'Kubernetes cluster access',
      'Monitoring system (Prometheus/Datadog/etc.)',
      'Alerting webhook endpoint',
      '1 LLM provider configured',
    ],
    highlights: [
      '3-agent team for full DevOps automation',
      'MTTR reduction of 60%+',
      'Automatic incident classification',
    ],
    popularity: 91,
    featured: true,
    readme: `## DevOps Automation Team

A 3-agent team that automates your DevOps workflows — from monitoring to incident response.

### Agent Roles
1. **Monitor Agent** — Watches infrastructure metrics, detects anomalies
2. **Incident Commander** — Triages alerts, executes runbooks, coordinates response
3. **Deployment Agent** — Manages CI/CD pipelines, rollbacks, and deployments

### Workflows
- **Alert → Triage → Response**: Automatic alert classification and runbook execution
- **Deploy → Monitor → Rollback**: Safe deployments with automatic rollback on failure
- **Incident → Response → Postmortem**: End-to-end incident management`,
    useCases: [
      'Incident response automation',
      'CI/CD pipeline management',
      'Infrastructure monitoring',
    ],
    difficulty: 'advanced',
    estimatedDeployTime: '~8 min',
  },

  'gitagent-from-repo': {
    category: 'devops',
    emoji: '🐙',
    features: [
      'Repository-aware agent generation',
      'Automatic agent role assignment',
      'Multi-repo support',
      'Branch-specific configurations',
      'Issue and PR automation',
      'Documentation generation',
    ],
    requirements: [
      'Git repository access',
      'Repository with standard structure',
      '1 LLM provider (GPT-4 or Claude recommended)',
    ],
    highlights: [
      '6-agent team for comprehensive repo management',
      'Agents learn your codebase structure',
      'Auto-generates agents from repo analysis',
    ],
    popularity: 84,
    featured: true,
    readme: `## Git Agent From Repo

The most comprehensive agent template — 6 agents that deeply understand your repository.

### Agent Roles
1. **Repo Analyzer** — Scans repository structure, understands architecture
2. **Issue Triager** — Classifies and prioritizes GitHub/GitLab issues
3. **PR Reviewer** — In-depth code review with full context awareness
4. **Doc Generator** — Automated documentation updates
5. **Test Writer** — Generates unit and integration tests
6. **Release Manager** — Manages changelogs, versioning, and releases

### How It Works
Point the template at your repository and the agents will:
1. Analyze the codebase structure and conventions
2. Learn your team's coding patterns
3. Automatically assign themselves relevant specializations
4. Begin monitoring and contributing to the repo`,
    useCases: [
      'Full repository automation',
      'Open source project management',
      'Enterprise codebase management',
    ],
    difficulty: 'advanced',
    estimatedDeployTime: '~10 min',
  },

  'managed-agents-demo': {
    category: 'demo',
    emoji: '🎮',
    features: [
      'Pre-configured demo agents',
      'Interactive playground',
      'Step-by-step tutorial',
      'Example workflows',
    ],
    requirements: ['Kubernetes cluster', '1 LLM provider (any)'],
    highlights: ['3-agent demo environment', 'No configuration required', 'Learn by example'],
    popularity: 65,
    featured: false,
    readme: `## Managed Agents Demo

A demo template that showcases all Shadow Cloud capabilities with pre-configured agents.

### What's Included
- 3 pre-configured demo agents
- Example workflows and interactions
- Tutorial-style deployment with guided steps

### Perfect For
- New users exploring the platform
- Team demos and presentations
- Testing infrastructure before production deployment`,
    useCases: ['Platform evaluation', 'Team onboarding', 'Infrastructure testing'],
    difficulty: 'beginner',
    estimatedDeployTime: '~3 min',
  },

  'metrics-team': {
    category: 'monitoring',
    emoji: '📈',
    features: [
      'Metrics aggregation',
      'Anomaly detection',
      'Custom dashboard generation',
      'Alert threshold tuning',
      'Trend analysis',
    ],
    requirements: ['Metrics data source (Prometheus/CloudWatch/etc.)', '1 LLM provider configured'],
    highlights: [
      '2-agent team: collector + analyzer',
      'Proactive anomaly alerts',
      'Auto-adjusting thresholds',
    ],
    popularity: 78,
    featured: false,
    readme: `## Metrics Team

A 2-agent team focused on metrics analysis and proactive monitoring.

### Agent Roles
1. **Metrics Collector** — Aggregates metrics from multiple sources, normalizes data
2. **Anomaly Analyzer** — Detects anomalies, identifies trends, generates alerts

### Features
- Automatic baseline calculation
- Seasonal pattern recognition
- Alert fatigue reduction through smart grouping
- Natural language metric summaries`,
    useCases: ['Proactive monitoring', 'Alert noise reduction', 'Capacity planning'],
    difficulty: 'intermediate',
    estimatedDeployTime: '~5 min',
  },

  'research-team': {
    category: 'research',
    emoji: '🔬',
    features: [
      'Multi-source data collection',
      'Automated literature review',
      'Insight synthesis',
      'Report generation',
      'Knowledge graph maintenance',
    ],
    requirements: [
      'Data sources / APIs for research domain',
      '1 LLM provider (Claude recommended for long context)',
    ],
    highlights: [
      '3-agent research team',
      'Deep analysis with citation tracking',
      'Automated weekly research digests',
    ],
    popularity: 76,
    featured: false,
    readme: `## Research Team

A 3-agent team that automates research workflows — from data collection to insight synthesis.

### Agent Roles
1. **Data Collector** — Gathers information from configured sources and APIs
2. **Analyst** — Processes and analyzes collected data, identifies patterns
3. **Synthesizer** — Combines findings into coherent reports with citations

### Output Formats
- Weekly research digests
- Ad-hoc analysis reports
- Knowledge base updates
- Trend summaries with visualizations`,
    useCases: [
      'Market research automation',
      'Academic literature review',
      'Competitive intelligence',
    ],
    difficulty: 'intermediate',
    estimatedDeployTime: '~5 min',
  },

  'security-team': {
    category: 'security',
    emoji: '🛡️',
    features: [
      'Automated vulnerability scanning',
      'Dependency audit',
      'Configuration compliance check',
      'Secret detection',
      'OWASP Top 10 analysis',
      'Security report generation',
    ],
    requirements: [
      'Repository access for code scanning',
      'Container registry access (optional)',
      '1 LLM provider configured',
    ],
    highlights: [
      '3-agent security team',
      'Continuous security posture monitoring',
      'Zero-day vulnerability alerting',
    ],
    popularity: 89,
    featured: true,
    readme: `## Security Team

A dedicated 3-agent security team for continuous security monitoring and vulnerability management.

### Agent Roles
1. **Vulnerability Scanner** — Scans code, dependencies, and containers for known vulnerabilities
2. **Compliance Auditor** — Checks configurations against security benchmarks (CIS, SOC2, etc.)
3. **Threat Detector** — Monitors for suspicious patterns, secret leaks, and anomalies

### Coverage
- Source code analysis (SAST)
- Dependency scanning (SCA)
- Container image scanning
- Configuration audit
- Secret detection across repos

### Reporting
- Real-time alerts for critical findings
- Weekly security posture reports
- Remediation guidance with code suggestions`,
    useCases: ['DevSecOps integration', 'Compliance automation', 'Vulnerability management'],
    difficulty: 'advanced',
    estimatedDeployTime: '~8 min',
  },

  'solopreneur-pack': {
    category: 'business',
    emoji: '🚀',
    features: [
      'Content generation',
      'Social media management',
      'Email drafting',
      'Market research',
      'Task prioritization',
      'Calendar management',
      'Customer communication',
    ],
    requirements: ['API access to relevant platforms (optional)', '1 LLM provider configured'],
    highlights: [
      '5-agent all-in-one team',
      'Like having a virtual team of 5',
      'Covers marketing, research, support, content, and ops',
    ],
    popularity: 86,
    featured: true,
    readme: `## Solopreneur Pack

The ultimate productivity pack — 5 AI agents that act as your virtual team.

### Agent Roles
1. **Content Creator** — Blog posts, social media, marketing copy
2. **Market Researcher** — Competitive analysis, trend monitoring, customer insights
3. **Customer Relations** — Email replies, support queries, feedback analysis
4. **Operations Manager** — Task prioritization, scheduling, workflow optimization
5. **Data Analyst** — Business metrics, reporting, financial analysis

### Perfect For
- Solo founders and freelancers
- Small teams that need to punch above their weight
- Automating repetitive business tasks

### Getting Started
Deploy the pack and configure each agent with your business context. The agents learn your voice, brand, and preferences over time.`,
    useCases: [
      'Solo founder productivity',
      'Small team augmentation',
      'Business process automation',
    ],
    difficulty: 'beginner',
    estimatedDeployTime: '~5 min',
  },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function getTemplateMeta(name: string): StoreTemplateMeta {
  return (
    TEMPLATE_META[name] ?? {
      category: 'demo' as StoreCategory,
      emoji: '📦',
      features: [],
      requirements: [],
      highlights: [],
      popularity: 50,
      featured: false,
      readme: 'No detailed information available for this template.',
      useCases: [],
      difficulty: 'beginner' as const,
      estimatedDeployTime: '~5 min',
    }
  )
}

export function getCategoryDef(id: StoreCategory | 'all'): StoreCategoryDef {
  return (
    CATEGORIES.find((c) => c.id === id) ?? {
      id: 'all',
      label: 'All Templates',
      emoji: '📦',
      description: 'Browse all available agent team templates',
      color: 'gray',
    }
  )
}

export function getCategoryColor(category: StoreCategory): string {
  const colors: Record<StoreCategory, string> = {
    devops: 'bg-blue-900/50 text-blue-400 border-blue-800',
    security: 'bg-red-900/50 text-red-400 border-red-800',
    support: 'bg-green-900/50 text-green-400 border-green-800',
    research: 'bg-purple-900/50 text-purple-400 border-purple-800',
    monitoring: 'bg-yellow-900/50 text-yellow-400 border-yellow-800',
    business: 'bg-orange-900/50 text-orange-400 border-orange-800',
    demo: 'bg-cyan-900/50 text-cyan-400 border-cyan-800',
  }
  return colors[category]
}

export function getDifficultyColor(difficulty: StoreTemplateMeta['difficulty']): string {
  const colors = {
    beginner: 'bg-green-900/50 text-green-400',
    intermediate: 'bg-yellow-900/50 text-yellow-400',
    advanced: 'bg-red-900/50 text-red-400',
  }
  return colors[difficulty]
}
