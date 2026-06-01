import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  diffRuntimeSessionSnapshots,
  type RuntimeSessionSnapshot,
  scanRuntimeSessions,
} from '../src/runtime-sessions'

describe('runtime session scanning', () => {
  it('indexes Claude Code transcript sessions without a live process', async () => {
    const home = await mkdtemp(join(tmpdir(), 'shadow-runtime-sessions-'))
    const projectDir = join(home, '.claude/projects/test-project')
    await mkdir(projectDir, { recursive: true })
    await writeFile(
      join(projectDir, 'session-1.jsonl'),
      [
        JSON.stringify({
          sessionId: 'session-1',
          timestamp: '2026-06-01T01:00:00.000Z',
          cwd: '/tmp/example',
          message: {
            role: 'user',
            content: [{ type: 'text', text: 'Monitor this runtime session' }],
          },
        }),
        JSON.stringify({
          sessionId: 'session-1',
          timestamp: '2026-06-01T01:00:05.000Z',
          message: { role: 'assistant', content: [{ type: 'text', text: 'OK' }] },
        }),
      ].join('\n'),
    )

    const snapshot = await scanRuntimeSessions({
      runtimeId: 'claude-code',
      homeDir: home,
      env: { PATH: '' },
    })

    expect(snapshot.sessions).toHaveLength(1)
    expect(snapshot.sessions[0]?.runtimeId).toBe('claude-code')
    expect(snapshot.sessions[0]?.sessionId).toBe('session-1')
    expect(snapshot.sessions[0]?.title).toBe('Monitor this runtime session')
    expect(snapshot.sessions[0]?.state).toBe('unknown')
  })

  it('indexes OpenCode local storage without starting the CLI fallback', async () => {
    const home = await mkdtemp(join(tmpdir(), 'shadow-opencode-sessions-'))
    const diffDir = join(home, '.local/share/opencode/storage/session_diff')
    await mkdir(diffDir, { recursive: true })
    await writeFile(join(diffDir, 'ses_local_storage.json'), '[]')

    const snapshot = await scanRuntimeSessions({
      runtimeId: 'opencode',
      homeDir: home,
      env: { PATH: '' },
      opencodeUrl: 'http://127.0.0.1:1',
    })

    expect(snapshot.sessions).toHaveLength(1)
    expect(snapshot.sessions[0]?.runtimeId).toBe('opencode')
    expect(snapshot.sessions[0]?.sessionId).toBe('ses_local_storage')
    expect(snapshot.sessions[0]?.source).toBe('storage')
    expect(['available', 'stopped']).toContain(snapshot.instances[0]?.status)
  })

  it('emits change events between snapshots', () => {
    const previous = snapshotWithState('idle')
    const next = snapshotWithState('running')

    expect(diffRuntimeSessionSnapshots(previous, next)).toMatchObject([
      {
        type: 'session_changed',
        runtimeId: 'opencode',
        sessionId: 'abc',
        previousState: 'idle',
        state: 'running',
      },
    ])
  })
})

function snapshotWithState(state: 'idle' | 'running'): RuntimeSessionSnapshot {
  return {
    scannedAt: `2026-06-01T01:00:0${state === 'idle' ? '0' : '1'}.000Z`,
    runtimeIds: ['opencode'],
    instances: [],
    sessions: [
      {
        runtimeId: 'opencode',
        instanceId: 'server',
        sessionId: 'abc',
        title: 'Test',
        state,
        lastActivityAt: `2026-06-01T01:00:0${state === 'idle' ? '0' : '1'}.000Z`,
        source: 'server',
      },
    ],
  }
}
