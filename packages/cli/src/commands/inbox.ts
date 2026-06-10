import type { ShadowInboxTaskInput } from '@shadowob/sdk'
import { Command } from 'commander'
import { getClient, parsePositiveInt, resolveServerFlag } from '../utils/client.js'
import { output, outputError } from '../utils/output.js'

const TASK_STATUSES = new Set([
  'queued',
  'claimed',
  'running',
  'completed',
  'failed',
  'canceled',
  'transferred',
])

function parseTaskStatus(value: string) {
  if (!TASK_STATUSES.has(value)) {
    throw new Error(`Invalid task status: ${value}`)
  }
  return value as
    | 'queued'
    | 'claimed'
    | 'running'
    | 'completed'
    | 'failed'
    | 'canceled'
    | 'transferred'
}

function parseJsonOption(value: string | undefined, label: string) {
  if (!value) return undefined
  try {
    return JSON.parse(value) as Record<string, unknown>
  } catch {
    throw new Error(`Invalid JSON for ${label}`)
  }
}

function parseTaskSourceOption(value: string | undefined) {
  const source = parseJsonOption(value, 'source-json')
  if (!source) return undefined
  if (typeof source.kind !== 'string' || !source.kind.trim()) {
    throw new Error('Invalid source-json: kind is required')
  }
  return source as ShadowInboxTaskInput['source']
}

function parseTagOptions(values: string[] | undefined): ShadowInboxTaskInput['tags'] | undefined {
  const tags = values
    ?.flatMap((value) => value.split(','))
    .map((value) => value.trim().replace(/^#+/u, ''))
    .filter(Boolean)
  return tags && tags.length > 0 ? [...new Set(tags)].slice(0, 12) : undefined
}

export function createInboxCommand(): Command {
  const inbox = new Command('inbox').description('Buddy Inbox task-card commands')

  inbox
    .command('list')
    .description('List Buddy Inbox entries')
    .option('--server <server>', 'Server ID or slug')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (options: { server?: string; profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        const result = options.server
          ? await client.listServerBuddyInboxes(resolveServerFlag(options.server))
          : await client.listBuddyInboxes()
        output(result, { json: options.json })
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), {
          json: options.json,
        })
        process.exit(1)
      }
    })

  inbox
    .command('ensure')
    .description('Create or repair a Buddy Inbox channel')
    .requiredOption('--server <server>', 'Server ID or slug')
    .requiredOption('--agent <agent-id>', 'Buddy agent ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (options: { server: string; agent: string; profile?: string; json?: boolean }) => {
        try {
          const client = await getClient(options.profile)
          const result = await client.ensureBuddyInbox(
            resolveServerFlag(options.server),
            options.agent,
          )
          output(result, { json: options.json })
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  inbox
    .command('enqueue')
    .description('Enqueue a new task card into a Buddy Inbox')
    .requiredOption('--title <title>', 'Task title')
    .option('--body <text>', 'Task body')
    .option('--priority <priority>', 'low|normal|medium|high')
    .option('--tag <tag...>', 'Task tag; can be repeated or comma-separated')
    .option('--idempotency-key <key>', 'Idempotency key')
    .option('--server <server>', 'Server ID or slug; required with --agent')
    .option('--agent <agent-id>', 'Buddy agent ID')
    .option('--channel <channel-id>', 'Buddy Inbox channel ID')
    .option('--source-json <json>', 'Task source JSON')
    .option('--requirements-json <json>', 'Task runtime capability/skill/tool requirements JSON')
    .option('--output-contract-json <json>', 'Task output contract JSON')
    .option('--privacy-json <json>', 'Task privacy and data classification JSON')
    .option('--data-json <json>', 'Task data JSON')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (options: {
        title: string
        body?: string
        priority?: 'low' | 'normal' | 'medium' | 'high'
        tag?: string[]
        idempotencyKey?: string
        server?: string
        agent?: string
        channel?: string
        sourceJson?: string
        requirementsJson?: string
        outputContractJson?: string
        privacyJson?: string
        dataJson?: string
        profile?: string
        json?: boolean
      }) => {
        try {
          const client = await getClient(options.profile)
          const task: ShadowInboxTaskInput = {
            title: options.title,
          }
          if (options.body) task.body = options.body
          if (options.priority) task.priority = options.priority
          const tags = parseTagOptions(options.tag)
          if (tags) task.tags = tags
          if (options.idempotencyKey) task.idempotencyKey = options.idempotencyKey
          const source = parseTaskSourceOption(options.sourceJson)
          if (source) task.source = source
          const requirements = parseJsonOption(options.requirementsJson, 'requirements-json')
          if (requirements) task.requirements = requirements as ShadowInboxTaskInput['requirements']
          const outputContract = parseJsonOption(options.outputContractJson, 'output-contract-json')
          if (outputContract) {
            task.outputContract = outputContract as ShadowInboxTaskInput['outputContract']
          }
          const privacy = parseJsonOption(options.privacyJson, 'privacy-json')
          if (privacy) task.privacy = privacy as ShadowInboxTaskInput['privacy']
          const data = parseJsonOption(options.dataJson, 'data-json')
          if (data) task.data = data
          const result = options.channel
            ? await client.enqueueInboxTask(options.channel, task)
            : options.server && options.agent
              ? await client.enqueueInboxTaskForAgent(
                  resolveServerFlag(options.server),
                  options.agent,
                  task,
                )
              : null
          if (!result) throw new Error('Provide either --channel or both --server and --agent')
          output(result, { json: options.json })
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  inbox
    .command('policy')
    .description('Read or update a Buddy Inbox admission policy')
    .requiredOption('--server <server>', 'Server ID or slug')
    .requiredOption('--agent <agent-id>', 'Buddy agent ID')
    .option('--set-json <json>', 'Admission policy JSON to write')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (options: {
        server: string
        agent: string
        setJson?: string
        profile?: string
        json?: boolean
      }) => {
        try {
          const client = await getClient(options.profile)
          const server = resolveServerFlag(options.server)
          const policy = options.setJson
            ? (parseJsonOption(options.setJson, 'set-json') as {
                defaultMode: 'allow' | 'deny' | 'first_time' | 'every_time'
                rules: Array<{
                  subjectKind: 'user' | 'agent' | 'server_app' | 'system'
                  subjectId?: string
                  appKey?: string
                  mode: 'allow' | 'deny' | 'first_time' | 'every_time'
                  approved?: boolean
                  note?: string
                }>
              })
            : null
          const result = options.setJson
            ? await client.updateBuddyInboxAdmissionPolicy(server, options.agent, policy!)
            : await client.getBuddyInboxAdmissionPolicy(server, options.agent)
          output(result, { json: options.json })
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  const pending = new Command('pending').description('Buddy Inbox admission pending commands')

  pending
    .command('list')
    .description('List pending Buddy Inbox deliveries')
    .requiredOption('--server <server>', 'Server ID or slug')
    .requiredOption('--agent <agent-id>', 'Buddy agent ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (options: { server: string; agent: string; profile?: string; json?: boolean }) => {
        try {
          const client = await getClient(options.profile)
          const result = await client.listBuddyInboxAdmissionPending(
            resolveServerFlag(options.server),
            options.agent,
          )
          output(result, { json: options.json })
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  pending
    .command('approve')
    .description('Approve a pending Buddy Inbox delivery')
    .argument('<pending-id>', 'Pending delivery ID')
    .requiredOption('--server <server>', 'Server ID or slug')
    .requiredOption('--agent <agent-id>', 'Buddy agent ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (
        pendingId: string,
        options: { server: string; agent: string; profile?: string; json?: boolean },
      ) => {
        try {
          const client = await getClient(options.profile)
          const result = await client.approveBuddyInboxAdmissionPending(
            resolveServerFlag(options.server),
            options.agent,
            pendingId,
          )
          output(result, { json: options.json })
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  pending
    .command('reject')
    .description('Reject a pending Buddy Inbox delivery')
    .argument('<pending-id>', 'Pending delivery ID')
    .requiredOption('--server <server>', 'Server ID or slug')
    .requiredOption('--agent <agent-id>', 'Buddy agent ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (
        pendingId: string,
        options: { server: string; agent: string; profile?: string; json?: boolean },
      ) => {
        try {
          const client = await getClient(options.profile)
          const result = await client.rejectBuddyInboxAdmissionPending(
            resolveServerFlag(options.server),
            options.agent,
            pendingId,
          )
          output(result, { json: options.json })
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  inbox.addCommand(pending)

  inbox
    .command('claim')
    .description('Claim an Inbox task card by message/card id')
    .argument('<message-id>', 'Message ID containing the task card')
    .argument('<card-id>', 'Task card ID')
    .option('--ttl-seconds <n>', 'Claim TTL in seconds', '3600')
    .option('--note <text>', 'Progress note')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (
        messageId: string,
        cardId: string,
        options: { ttlSeconds?: string; note?: string; profile?: string; json?: boolean },
      ) => {
        try {
          const client = await getClient(options.profile)
          const message = await client.claimTaskCard(messageId, cardId, {
            ttlSeconds: parsePositiveInt(options.ttlSeconds ?? '3600', 'ttl-seconds'),
            note: options.note,
          })
          output(message, { json: options.json })
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  inbox
    .command('update')
    .description('Update an Inbox task card status')
    .argument('<message-id>', 'Message ID containing the task card')
    .argument('<card-id>', 'Task card ID')
    .requiredOption(
      '--status <status>',
      'queued|claimed|running|completed|failed|canceled|transferred',
    )
    .option('--note <text>', 'Progress note')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (
        messageId: string,
        cardId: string,
        options: { status: string; note?: string; profile?: string; json?: boolean },
      ) => {
        try {
          const client = await getClient(options.profile)
          const message = await client.updateTaskCard(messageId, cardId, {
            status: parseTaskStatus(options.status),
            note: options.note,
          })
          output(message, { json: options.json })
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  inbox
    .command('retry')
    .description('Copy a failed task card into a new queued task and mark the original transferred')
    .argument('<message-id>', 'Message ID containing the task card')
    .argument('<card-id>', 'Task card ID')
    .option('--note <text>', 'Transfer note')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (
        messageId: string,
        cardId: string,
        options: { note?: string; profile?: string; json?: boolean },
      ) => {
        try {
          const client = await getClient(options.profile)
          const result = await client.retryTaskCard(messageId, cardId, { note: options.note })
          output(result, { json: options.json })
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  inbox
    .command('claim-next')
    .description('Claim the next available task in a Buddy Inbox')
    .requiredOption('--server <server>', 'Server ID or slug')
    .requiredOption('--agent <agent-id>', 'Buddy agent ID')
    .option('--ttl-seconds <n>', 'Claim TTL in seconds', '3600')
    .option('--note <text>', 'Progress note')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (options: {
        server: string
        agent: string
        ttlSeconds?: string
        note?: string
        profile?: string
        json?: boolean
      }) => {
        try {
          const client = await getClient(options.profile)
          const result = await client.claimNextInboxTask(
            resolveServerFlag(options.server),
            options.agent,
            {
              ttlSeconds: parsePositiveInt(options.ttlSeconds ?? '3600', 'ttl-seconds'),
              note: options.note,
            },
          )
          output(result, { json: options.json })
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  inbox
    .command('promote')
    .description('Promote a chat message into a Buddy Inbox task')
    .argument('<message-id>', 'Source message ID')
    .requiredOption('--server <server>', 'Server ID or slug')
    .requiredOption('--agent <agent-id>', 'Buddy agent ID')
    .option('--title <title>', 'Task title override')
    .option('--priority <priority>', 'low|normal|medium|high')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (
        messageId: string,
        options: {
          server: string
          agent: string
          title?: string
          priority?: 'low' | 'normal' | 'medium' | 'high'
          profile?: string
          json?: boolean
        },
      ) => {
        try {
          const client = await getClient(options.profile)
          const message = await client.promoteMessageToInboxTask(messageId, {
            serverId: resolveServerFlag(options.server),
            agentId: options.agent,
            title: options.title,
            priority: options.priority,
          })
          output(message, { json: options.json })
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  return inbox
}
