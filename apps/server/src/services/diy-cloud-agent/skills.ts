export type DiyCloudAgentSkill = {
  id: string
  description: string
  outputContract: string
}

export const DIY_CLOUD_AGENT_SKILLS: DiyCloudAgentSkill[] = [
  {
    id: 'requirements_decomposition',
    description:
      'Turn the user request, feedback, previous config, locale, and timezone into an explicit workspace objective, assumptions, and acceptance criteria.',
    outputContract: 'Explain the public decision basis without exposing hidden chain-of-thought.',
  },
  {
    id: 'capability_selection',
    description:
      'Use plugin and template tools to choose only integrations that are directly supported by inspected capabilities and the user request.',
    outputContract:
      'For every selected plugin, provide evidence. For rejected near-matches, state the reason.',
  },
  {
    id: 'template_dsl_authoring',
    description:
      'Author a deployable Template DSL with channels, Buddy role, Buddy skills, plugin integrations, and guidebook content.',
    outputContract:
      'The DSL must be complete enough for server-side compilation without server-authored user-facing copy.',
  },
  {
    id: 'validation_review',
    description:
      'Call validation tools and revise decisions until the generated Cloud config passes policy checks or clearly reports review notes.',
    outputContract:
      'Return validation basis, credential requirements, and deployment notes in the final JSON.',
  },
]

export function formatDiyCloudSkillsForPrompt() {
  return DIY_CLOUD_AGENT_SKILLS.map(
    (skill) => `- ${skill.id}: ${skill.description} Output: ${skill.outputContract}`,
  ).join('\n')
}
