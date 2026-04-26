import { collectTemplateRefs } from '../config/index.js'

export function extractRequiredEnvVars(config: unknown): string[] {
  return [
    ...new Set(
      collectTemplateRefs(config)
        .filter((ref) => ref.type === 'env')
        .map((ref) => ref.key),
    ),
  ].sort()
}
