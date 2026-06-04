import { describe, expect, it } from 'vitest'
import { extractSlashCommandActions } from '../src/utils/message-commands'

describe('extractSlashCommandActions', () => {
  it('extracts approval-style slash commands without Hermes-specific rules', () => {
    expect(
      extractSlashCommandActions(
        'Reply `/approve` to execute, `/approve session` to approve this pattern, `/approve always` to approve permanently, or `/deny` to cancel.',
      ).map((action) => action.command),
    ).toEqual(['/approve', '/approve session', '/approve always', '/deny'])
  })

  it('extracts escaped approval commands from markdown text', () => {
    expect(
      extractSlashCommandActions(
        'Reply `\\/approve` to execute, `\\/approve session` to approve this pattern, `\\/approve always` to approve permanently, or `\\/deny` to cancel.',
      ).map((action) => action.command),
    ).toEqual(['/approve', '/approve session', '/approve always', '/deny'])

    expect(
      extractSlashCommandActions(
        'Reply \\/approve to execute, \\/approve session to approve this pattern, \\/approve always to approve permanently, or \\/deny to cancel.',
      ).map((action) => action.command),
    ).toEqual(['/approve', '/approve session', '/approve always', '/deny'])
  })

  it('requires command-like context for a single slash token', () => {
    expect(extractSlashCommandActions('Open /settings when ready')).toEqual([
      {
        id: '/settings',
        command: '/settings',
        name: 'settings',
      },
    ])
    expect(extractSlashCommandActions('The file lives in /usr/local/bin')).toEqual([])
  })

  it('deduplicates commands and ignores fenced code blocks', () => {
    expect(
      extractSlashCommandActions('Reply /approve or /approve.\n```sh\n/deny\n```').map(
        (action) => action.command,
      ),
    ).toEqual(['/approve'])
  })
})
