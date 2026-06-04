import { chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  diffRuntimeSessionSnapshots,
  type RuntimeSessionSnapshot,
  scanRuntimeSessions,
  sendRuntimeSessionMessage,
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
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'OK' }],
            stop_reason: 'end_turn',
          },
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
    expect(snapshot.sessions[0]?.state).toBe('completed')
    expect(snapshot.sessions[0]?.petReaction).toBe('success')
  })

  it('keeps Claude Code sessions active when the latest assistant turn is still using tools', async () => {
    const home = await mkdtemp(join(tmpdir(), 'shadow-runtime-sessions-running-'))
    const projectDir = join(home, '.claude/projects/test-project')
    await mkdir(projectDir, { recursive: true })
    await writeFile(
      join(projectDir, 'session-1.jsonl'),
      [
        JSON.stringify({
          sessionId: 'session-1',
          timestamp: '2026-06-01T01:00:00.000Z',
          cwd: '/tmp/example',
          type: 'user',
          message: {
            role: 'user',
            content: [{ type: 'text', text: 'Run the tests' }],
          },
        }),
        JSON.stringify({
          sessionId: 'session-1',
          timestamp: '2026-06-01T01:00:05.000Z',
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [{ type: 'tool_use', name: 'Bash', input: { command: 'pnpm test' } }],
            stop_reason: 'tool_use',
          },
        }),
      ].join('\n'),
    )

    const snapshot = await scanRuntimeSessions({
      runtimeId: 'claude-code',
      homeDir: home,
      env: { PATH: '' },
    })

    expect(snapshot.sessions[0]?.state).toBe('running')
    expect(snapshot.sessions[0]?.petReaction).toBe('testing')
    expect(snapshot.sessions[0]?.petActivity).toEqual({ kind: 'testing', label: 'pnpm test' })
  })

  it('classifies Claude Code edit tools for runtime pet reactions', async () => {
    const home = await mkdtemp(join(tmpdir(), 'shadow-runtime-sessions-editing-'))
    const projectDir = join(home, '.claude/projects/test-project')
    await mkdir(projectDir, { recursive: true })
    await writeFile(
      join(projectDir, 'session-1.jsonl'),
      [
        JSON.stringify({
          sessionId: 'session-1',
          timestamp: '2026-06-01T01:00:00.000Z',
          cwd: '/tmp/example',
          type: 'user',
          message: {
            role: 'user',
            content: [{ type: 'text', text: 'Update the file' }],
          },
        }),
        JSON.stringify({
          sessionId: 'session-1',
          timestamp: '2026-06-01T01:00:05.000Z',
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                name: 'Edit',
                input: { file_path: '/tmp/example/app.ts' },
              },
            ],
            stop_reason: 'tool_use',
          },
        }),
      ].join('\n'),
    )

    const snapshot = await scanRuntimeSessions({
      runtimeId: 'claude-code',
      homeDir: home,
      env: { PATH: '' },
    })

    expect(snapshot.sessions[0]?.state).toBe('running')
    expect(snapshot.sessions[0]?.petReaction).toBe('editing')
    expect(snapshot.sessions[0]?.petActivity).toEqual({ kind: 'editing', label: 'app.ts' })
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

  it('indexes Codex transcript sessions without a live process', async () => {
    const home = await mkdtemp(join(tmpdir(), 'shadow-codex-sessions-'))
    const sessionDir = join(home, '.codex/sessions/2026/06/01')
    await mkdir(sessionDir, { recursive: true })
    await writeFile(
      join(sessionDir, 'rollout-2026-06-01T01-00-00-11111111-2222-4333-8444-555555555555.jsonl'),
      [
        JSON.stringify({
          timestamp: '2026-06-01T01:00:00.000Z',
          type: 'session_meta',
          payload: {
            id: '11111111-2222-4333-8444-555555555555',
            timestamp: '2026-06-01T01:00:00.000Z',
            cwd: '/tmp/codex-project',
          },
        }),
        JSON.stringify({
          timestamp: '2026-06-01T01:00:01.000Z',
          type: 'turn_context',
          payload: { model: 'gpt-5.1-codex' },
        }),
        JSON.stringify({
          timestamp: '2026-06-01T01:00:02.000Z',
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_text', text: 'Continue the connector task' }],
          },
        }),
        ...Array.from({ length: 420 }, (_, index) =>
          JSON.stringify({
            timestamp: `2026-06-01T01:${String(index + 1).padStart(2, '0')}:00.000Z`,
            type: 'event_msg',
            payload: { type: 'token_count', info: { total_token_usage: index } },
          }),
        ),
        JSON.stringify({
          timestamp: '2026-06-01T02:00:00.000Z',
          type: 'event_msg',
          payload: {
            type: 'task_complete',
            completed_at: '2026-06-01T02:00:00.000Z',
          },
        }),
      ].join('\n'),
    )

    const snapshot = await scanRuntimeSessions({
      runtimeId: 'codex',
      homeDir: home,
      env: { PATH: '' },
    })

    expect(snapshot.runtimeIds).toEqual(['codex'])
    expect(snapshot.instances[0]).toMatchObject({
      runtimeId: 'codex',
      instanceId: 'transcripts',
    })
    expect(['available', 'stopped']).toContain(snapshot.instances[0]?.status)
    expect(snapshot.sessions).toHaveLength(1)
    expect(snapshot.sessions[0]).toMatchObject({
      runtimeId: 'codex',
      sessionId: '11111111-2222-4333-8444-555555555555',
      title: 'Continue the connector task',
      workDir: '/tmp/codex-project',
      model: 'gpt-5.1-codex',
      source: 'transcript',
      state: 'completed',
      petReaction: 'success',
    })
  })

  it('classifies Codex command transcript events for runtime pet reactions', async () => {
    const home = await mkdtemp(join(tmpdir(), 'shadow-codex-testing-'))
    const sessionDir = join(home, '.codex/sessions/2026/06/01')
    await mkdir(sessionDir, { recursive: true })
    await writeFile(
      join(sessionDir, 'rollout-2026-06-01T01-00-00-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.jsonl'),
      [
        JSON.stringify({
          timestamp: '2026-06-01T01:00:00.000Z',
          type: 'session_meta',
          payload: {
            id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
            cwd: '/tmp/codex-project',
          },
        }),
        JSON.stringify({
          timestamp: '2026-06-01T01:00:01.000Z',
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_text', text: 'Run checks' }],
          },
        }),
        JSON.stringify({
          timestamp: '2026-06-01T01:00:02.000Z',
          type: 'event_msg',
          payload: {
            type: 'exec_command_begin',
            command: 'pnpm test -- --runInBand',
          },
        }),
      ].join('\n'),
    )

    const snapshot = await scanRuntimeSessions({
      runtimeId: 'codex',
      homeDir: home,
      env: { PATH: '' },
    })

    expect(snapshot.sessions[0]).toMatchObject({
      runtimeId: 'codex',
      sessionId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      state: 'running',
      petReaction: 'testing',
      petActivity: {
        kind: 'testing',
        label: 'pnpm test -- --runInBand',
      },
    })
  })

  it('sends a Codex session prompt through codex exec resume', async () => {
    const home = await mkdtemp(join(tmpdir(), 'shadow-codex-send-'))
    const binDir = join(home, 'bin')
    const capturePath = join(home, 'codex-argv.json')
    await mkdir(binDir, { recursive: true })
    const codexBin = join(binDir, 'codex')
    await writeFile(
      codexBin,
      [
        '#!/bin/sh',
        `printf '%s\\n' "$@" > ${JSON.stringify(capturePath)}`,
        'printf \'{"type":"completed","ok":true}\\n\'',
      ].join('\n'),
    )
    await chmod(codexBin, 0o755)

    const result = await sendRuntimeSessionMessage({
      runtimeId: 'codex',
      sessionId: '11111111-2222-4333-8444-555555555555',
      message: 'hello codex',
      env: { PATH: binDir, CODEX_CLI_PATH: codexBin },
    })

    expect(result).toMatchObject({
      runtimeId: 'codex',
      sessionId: '11111111-2222-4333-8444-555555555555',
      accepted: true,
      mode: 'process',
      exitCode: 0,
    })
    const argv = (await readFile(capturePath, 'utf8')).trim().split(/\r?\n/)
    expect(argv).toEqual([
      'exec',
      'resume',
      '--json',
      '11111111-2222-4333-8444-555555555555',
      'hello codex',
    ])
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
        previousPetReaction: 'idle',
        petReaction: 'working',
      },
    ])
  })

  it('emits change events when only the runtime pet reaction changes', () => {
    const previous = snapshotWithState('running')
    const next: RuntimeSessionSnapshot = {
      ...previous,
      scannedAt: '2026-06-01T01:00:02.000Z',
      sessions: previous.sessions.map((session) => ({
        ...session,
        petReaction: 'testing',
      })),
    }

    expect(diffRuntimeSessionSnapshots(previous, next)).toMatchObject([
      {
        type: 'session_changed',
        runtimeId: 'opencode',
        sessionId: 'abc',
        previousState: 'running',
        state: 'running',
        previousPetReaction: 'working',
        petReaction: 'testing',
      },
    ])
  })

  it('emits change events when only the runtime pet activity changes', () => {
    const previous = snapshotWithState('running')
    previous.sessions[0]!.petActivity = { kind: 'editing', label: 'a.ts' }
    const next: RuntimeSessionSnapshot = {
      ...previous,
      scannedAt: '2026-06-01T01:00:02.000Z',
      sessions: previous.sessions.map((session) => ({
        ...session,
        petActivity: { kind: 'editing', label: 'b.ts' },
      })),
    }

    expect(diffRuntimeSessionSnapshots(previous, next)).toMatchObject([
      {
        type: 'session_changed',
        runtimeId: 'opencode',
        sessionId: 'abc',
        previousPetActivity: { kind: 'editing', label: 'a.ts' },
        petActivity: { kind: 'editing', label: 'b.ts' },
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
        petReaction: state === 'idle' ? 'idle' : 'working',
        lastActivityAt: `2026-06-01T01:00:0${state === 'idle' ? '0' : '1'}.000Z`,
        source: 'server',
      },
    ],
  }
}
