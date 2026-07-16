import { describe, expect, it } from 'vitest'
import { mergePluginFragments } from './config-merger.js'

describe('mergePluginFragments', () => {
  it('unions skill discovery directories contributed by multiple plugins', () => {
    const base = {
      skills: {
        load: { extraDirs: ['/agent-packs/example/skills'] },
      },
    }

    const result = mergePluginFragments(base, [
      {
        skills: {
          load: { extraDirs: ['/workspace/.agents/plugin-skills/opencli'] },
          entries: { opencli: { enabled: true } },
        },
      },
      {
        skills: {
          load: { extraDirs: ['/agent-packs/example/skills'] },
        },
      },
    ])

    expect(result.skills?.load?.extraDirs).toEqual([
      '/agent-packs/example/skills',
      '/workspace/.agents/plugin-skills/opencli',
    ])
    expect(result.skills?.entries?.opencli).toEqual({ enabled: true })
  })
})
