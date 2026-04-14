import { describe, expect, it } from 'vitest'

import { validateCloudConfig } from '../../src/config/schema.js'

describe('schema', () => {
  describe('validateCloudConfig', () => {
    it('should validate minimal config', () => {
      const result = validateCloudConfig({
        version: '1',
      })
      expect(result.success).toBe(true)
    })

    it('should validate full config', () => {
      const result = validateCloudConfig({
        version: '1',
        environment: 'production',
        use: [
          {
            plugin: 'shadowob',
            options: {
              servers: [
                {
                  id: 'srv-1',
                  name: 'Production Server',
                  slug: 'prod-server',
                  isPublic: false,
                  channels: [
                    {
                      id: 'ch-general',
                      title: 'General',
                      type: 'text',
                    },
                  ],
                },
              ],
              buddies: [
                {
                  id: 'bot-1',
                  name: 'Assistant',
                  description: 'AI Assistant',
                },
              ],
              bindings: [
                {
                  targetId: 'bot-1',
                  targetType: 'buddy',
                  servers: ['srv-1'],
                  channels: ['ch-general'],
                  agentId: 'agent-1',
                },
              ],
            },
          },
        ],
        registry: {
          providers: [
            {
              id: 'openai',
              api: 'openai',
              baseUrl: 'https://api.openai.com/v1',
              // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
              apiKey: '${env:OPENAI_API_KEY}',
              models: [{ id: 'gpt-4o' }],
            },
          ],
          configurations: [
            {
              id: 'base',
              openclaw: {
                agents: {
                  defaults: { workspace: '/workspace' },
                },
                tools: { allow: ['search'] },
              },
            },
          ],
        },
        deployments: {
          namespace: 'shadowob-cloud',
          agents: [
            {
              id: 'agent-1',
              runtime: 'openclaw',
              replicas: 2,
              configuration: {
                extends: 'base',
                openclaw: {
                  agents: {
                    list: [{ id: 'agent-1', systemPrompt: 'Override' }],
                  },
                },
              },
              resources: {
                requests: { cpu: '100m', memory: '256Mi' },
                limits: { cpu: '500m', memory: '512Mi' },
              },
              env: {
                LOG_LEVEL: 'info',
              },
            },
          ],
        },
      })
      expect(result.success).toBe(true)
    })

    it('should reject invalid runtime', () => {
      const result = validateCloudConfig({
        version: '1',
        deployments: {
          agents: [
            {
              id: 'agent-1',
              runtime: 'invalid-runtime',
              configuration: {},
            },
          ],
        },
      })
      expect(result.success).toBe(false)
    })

    it('should accept opaque plugin options in use entries', () => {
      // With the use-pattern, plugin options are Record<string, unknown>
      // and not validated at the schema level
      const result = validateCloudConfig({
        version: '1',
        use: [
          {
            plugin: 'shadowob',
            options: {
              bindings: [
                {
                  targetId: 'bot-1',
                  targetType: 'invalid',
                  servers: [],
                  channels: [],
                  agentId: 'a1',
                },
              ],
            },
          },
        ],
      })
      expect(result.success).toBe(true)
    })

    it('should reject invalid environment', () => {
      const result = validateCloudConfig({
        version: '1',
        environment: 'invalid-env',
      })
      expect(result.success).toBe(false)
    })

    it('should accept config without deployments', () => {
      const result = validateCloudConfig({
        version: '1',
        use: [
          {
            plugin: 'shadowob',
            options: {
              servers: [{ id: 's1', name: 'Server' }],
            },
          },
        ],
      })
      expect(result.success).toBe(true)
    })

    it('should accept config with shared workspace', () => {
      const result = validateCloudConfig({
        version: '1',
        workspace: {
          enabled: true,
          storageSize: '10Gi',
          storageClassName: 'standard',
          mountPath: '/workspace/shared',
          accessMode: 'ReadWriteMany',
        },
      })
      expect(result.success).toBe(true)
    })

    it('should accept config with cloud skills registry', () => {
      const result = validateCloudConfig({
        version: '1',
        skills: {
          installDir: '/app/skills',
          entries: [
            { name: 'web-search', source: 'bundled', enabled: true },
            {
              name: 'image-lab',
              source: 'npm',
              version: '1.0.0',
              apiKey: 'sk-key',
              env: { KEY: 'value' },
            },
            { name: 'custom-skill', source: 'path', path: '/opt/skills/custom' },
          ],
        },
      })
      expect(result.success).toBe(true)
    })

    it('should accept config with skills install preferences', () => {
      const result = validateCloudConfig({
        version: '1',
        deployments: {
          agents: [
            {
              id: 'a1',
              runtime: 'openclaw',
              configuration: {
                openclaw: {
                  skills: {
                    allowBundled: ['gemini'],
                    install: { preferBrew: true, nodeManager: 'pnpm' },
                    entries: { peekaboo: { enabled: true } },
                  },
                },
              },
            },
          ],
        },
      })
      expect(result.success).toBe(true)
    })

    it('should reject invalid access mode', () => {
      const result = validateCloudConfig({
        version: '1',
        workspace: {
          enabled: true,
          accessMode: 'InvalidMode',
        },
      })
      expect(result.success).toBe(false)
    })
  })
})
