/**
 * Tests for provision state persistence (utils/state.ts).
 *
 * Covers: save/load round-trip, merge semantics, missing file handling,
 * state ↔ result conversion, path resolution.
 */

import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ProvisionResult } from '../../src/plugins/shadowob/provisioning.js'
import {
  provisionResultToState,
  stateToProvisionResult,
} from '../../src/plugins/shadowob/provisioning.js'
import {
  getStateDir,
  getStatePath,
  loadProvisionState,
  mergeProvisionState,
  type ProvisionState,
  saveProvisionState,
} from '../../src/utils/state.js'

describe('State Utilities', () => {
  let tempDir: string
  let configPath: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'shadowob-cloud-state-'))
    configPath = join(tempDir, 'shadowob-cloud.json')
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  // ─── Path Resolution ─────────────────────────────────────────────────────

  describe('getStateDir / getStatePath', () => {
    it('resolves state dir next to config file', () => {
      const dir = getStateDir(configPath)
      expect(dir).toBe(join(tempDir, '.shadowob'))
    })

    it('resolves state file path', () => {
      const path = getStatePath(configPath)
      expect(path).toBe(join(tempDir, '.shadowob', 'provision-state.json'))
    })

    it('supports custom subdir', () => {
      const dir = getStateDir(configPath, '.custom')
      expect(dir).toBe(join(tempDir, '.custom'))
    })
  })

  // ─── Load / Save ─────────────────────────────────────────────────────────

  describe('loadProvisionState', () => {
    it('returns null when state file does not exist', () => {
      const state = loadProvisionState(configPath)
      expect(state).toBeNull()
    })

    it('round-trips save → load', () => {
      const state: ProvisionState = {
        provisionedAt: '2026-07-15T10:00:00.000Z',
        stackName: 'dev',
        namespace: 'shadowob-cloud',
        plugins: {
          shadowob: {
            shadowServerUrl: 'https://shadow.example.com',
            servers: { 'my-server': 'srv_123' },
            channels: { 'my-channel': 'ch_456' },
            buddies: {
              'my-buddy': { agentId: 'ag_789', userId: 'usr_abc', token: 'tok_xyz' },
            },
          },
        },
      }

      saveProvisionState(configPath, state)
      const loaded = loadProvisionState(configPath)

      expect(loaded).toEqual(state)
    })

    it('creates .shadowob directory if it does not exist', () => {
      const state: ProvisionState = {
        provisionedAt: new Date().toISOString(),
        plugins: {
          shadowob: {
            shadowServerUrl: 'https://example.com',
            servers: {},
            channels: {},
            buddies: {},
          },
        },
      }

      saveProvisionState(configPath, state)
      expect(existsSync(join(tempDir, '.shadowob'))).toBe(true)
    })
  })

  // ─── Merge ────────────────────────────────────────────────────────────────

  describe('mergeProvisionState', () => {
    it('returns newState when existing is null', () => {
      const newState: ProvisionState = {
        provisionedAt: '2026-07-15T10:00:00.000Z',
        plugins: {
          shadowob: {
            shadowServerUrl: 'https://example.com',
            servers: { a: '1' },
            channels: {},
            buddies: {},
          },
        },
      }

      expect(mergeProvisionState(null, newState)).toEqual(newState)
    })

    it('merges servers, channels, buddies — new values overwrite', () => {
      const existing: ProvisionState = {
        provisionedAt: '2026-07-15T09:00:00.000Z',
        plugins: {
          shadowob: {
            shadowServerUrl: 'https://old.example.com',
            servers: { a: 'old-a', b: 'keep-b' },
            channels: { ch1: 'old-ch1' },
            buddies: {},
          },
        },
      }

      const newState: ProvisionState = {
        provisionedAt: '2026-07-15T10:00:00.000Z',
        plugins: {
          shadowob: {
            shadowServerUrl: 'https://new.example.com',
            servers: { a: 'new-a', c: 'new-c' },
            channels: { ch2: 'new-ch2' },
            buddies: {
              buddy1: { agentId: 'ag1', userId: 'u1', token: 't1' },
            },
          },
        },
      }

      const merged = mergeProvisionState(existing, newState)
      const shadowob = merged.plugins.shadowob as {
        shadowServerUrl?: string
        servers?: Record<string, string>
        channels?: Record<string, string>
      }

      // New values overwrite
      expect(shadowob.servers?.a).toBe('new-a')
      expect(shadowob.servers?.c).toBe('new-c')
      // Old values preserved
      expect(shadowob.servers?.b).toBe('keep-b')
      expect(shadowob.channels?.ch1).toBe('old-ch1')
      expect(shadowob.channels?.ch2).toBe('new-ch2')
      // New metadata wins
      expect(shadowob.shadowServerUrl).toBe('https://new.example.com')
      expect(merged.provisionedAt).toBe('2026-07-15T10:00:00.000Z')
    })
  })

  // ─── Conversion ───────────────────────────────────────────────────────────

  describe('provisionResultToState / stateToProvisionResult', () => {
    it('converts ProvisionResult (Maps) to ProvisionState (plain objects)', () => {
      const result: ProvisionResult = {
        servers: new Map([['srv-config', 'srv_real']]),
        channels: new Map([['ch-config', 'ch_real']]),
        buddies: new Map([['buddy-config', { agentId: 'ag1', userId: 'u1', token: 't1' }]]),
      }

      const state = provisionResultToState(result, 'https://shadow.example.com', {
        stackName: 'prod',
        namespace: 'shadowob-cloud',
      })

      const shadowob = state.plugins.shadowob as {
        shadowServerUrl?: string
        servers?: Record<string, string>
        channels?: Record<string, string>
        buddies?: Record<string, { agentId: string; userId: string; token: string }>
      }
      expect(shadowob.servers).toEqual({ 'srv-config': 'srv_real' })
      expect(shadowob.channels).toEqual({ 'ch-config': 'ch_real' })
      expect(shadowob.buddies?.['buddy-config']).toEqual({
        agentId: 'ag1',
        userId: 'u1',
        token: 't1',
      })
      expect(shadowob.shadowServerUrl).toBe('https://shadow.example.com')
      expect(state.stackName).toBe('prod')
      expect(state.namespace).toBe('shadowob-cloud')
      expect(state.provisionedAt).toBeDefined()
    })

    it('round-trips result → state → result', () => {
      const original: ProvisionResult = {
        servers: new Map([['s1', 'real_s1']]),
        channels: new Map([['c1', 'real_c1']]),
        buddies: new Map([['b1', { agentId: 'a', userId: 'u', token: 't' }]]),
      }

      const state = provisionResultToState(original, 'https://example.com')
      const back = stateToProvisionResult(state)

      expect(back.servers.get('s1')).toBe('real_s1')
      expect(back.channels.get('c1')).toBe('real_c1')
      expect(back.buddies.get('b1')).toEqual({
        agentId: 'a',
        userId: 'u',
        token: 't',
      })
    })
  })
})
