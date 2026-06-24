import type { ShadowInboxTaskInput } from '@shadowob/sdk'
import chalk from 'chalk'
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

function parseParentTaskOption(value: string | undefined) {
  const parentTask = parseJsonOption(value, 'parent-task-json')
  return parentTask ? normalizeParentTask(parentTask, 'parent-task-json') : undefined
}

function normalizeParentTask(value: Record<string, unknown>, label: string) {
  const messageId = stringField(value, 'messageId')
  const cardId = stringField(value, 'cardId')
  const channelId = stringField(value, 'channelId')
  const threadId = stringField(value, 'threadId')
  if (!messageId || !cardId || !channelId || !threadId) {
    throw new Error(`Invalid ${label}: messageId, cardId, channelId, and threadId are required`)
  }
  const title = stringField(value, 'title')
  return {
    messageId,
    cardId,
    channelId,
    threadId,
    ...(title ? { title } : {}),
  }
}

function stringField(value: Record<string, unknown>, key: string) {
  const raw = value[key]
  return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined
}

function parentTaskFromEnv() {
  const json = process.env.SHADOWOB_PARENT_TASK_JSON
  if (json?.trim()) {
    return parseParentTaskOption(json)
  }

  const explicitParentTask = {
    messageId: process.env.SHADOWOB_PARENT_TASK_MESSAGE_ID,
    cardId: process.env.SHADOWOB_PARENT_TASK_CARD_ID,
    channelId: process.env.SHADOWOB_PARENT_TASK_CHANNEL_ID,
    threadId: process.env.SHADOWOB_PARENT_TASK_THREAD_ID,
    title: process.env.SHADOWOB_PARENT_TASK_TITLE ?? process.env.SHADOWOB_TASK_TITLE,
  }
  if (
    explicitParentTask.messageId ||
    explicitParentTask.cardId ||
    explicitParentTask.channelId ||
    explicitParentTask.threadId
  ) {
    return normalizeParentTask(explicitParentTask, 'parent task environment')
  }

  const currentTask = {
    messageId: process.env.SHADOWOB_TASK_MESSAGE_ID,
    cardId: process.env.SHADOWOB_TASK_CARD_ID,
    channelId: process.env.SHADOWOB_TASK_CHANNEL_ID,
    threadId: process.env.SHADOWOB_TASK_THREAD_ID,
    title: process.env.SHADOWOB_TASK_TITLE,
  }
  if (
    !currentTask.messageId ||
    !currentTask.cardId ||
    !currentTask.channelId ||
    !currentTask.threadId
  ) {
    return undefined
  }
  return normalizeParentTask(currentTask, 'current task environment')
}

function mergeParentTaskData(
  data: Record<string, unknown> | undefined,
  parentTask: Record<string, unknown> | undefined,
) {
  if (!parentTask) return data
  const base = data ?? {}
  const existingTask =
    base.task && typeof base.task === 'object' && !Array.isArray(base.task)
      ? (base.task as Record<string, unknown>)
      : {}
  return {
    ...base,
    task: {
      ...existingTask,
      parentTask,
    },
  }
}

function parseTagOptions(values: string[] | undefined): ShadowInboxTaskInput['tags'] | undefined {
  const tags = values
    ?.flatMap((value) => value.split(','))
    .map((value) => value.trim().replace(/^#+/u, ''))
    .filter(Boolean)
  return tags && tags.length > 0 ? [...new Set(tags)].slice(0, 12) : undefined
}

function recordValue(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function taskCardFromMessage(message: unknown, cardId: string) {
  const record = recordValue(message)
  const metadata = recordValue(record?.metadata)
  const cards = Array.isArray(metadata?.cards) ? metadata.cards : []
  return (
    cards.find((card) => {
      const item = recordValue(card)
      return item?.kind === 'task' && item.id === cardId
    }) ?? null
  )
}

function taskHookEventsForStatus(message: unknown, cardId: string, status: string) {
  const card = recordValue(taskCardFromMessage(message, cardId))
  const task = recordValue(recordValue(card?.data)?.task)
  const cliPolicy = recordValue(task?.cliPolicy)
  const events = Array.isArray(cliPolicy?.hookEvents)
    ? cliPolicy.hookEvents
    : Array.isArray(task?.hookEvents)
      ? task.hookEvents
      : []
  return events
    .map(recordValue)
    .filter((event): event is Record<string, unknown> => {
      if (!event) return false
      return stringValue(event.status) === status && Boolean(stringValue(event.command))
    })
    .slice(-8)
}

function printTaskHookEvents(message: unknown, cardId: string, status: string) {
  const events = taskHookEventsForStatus(message, cardId, status)
  if (events.length === 0) return
  console.log('')
  console.log(chalk.cyan('Task hooks triggered'))
  for (const event of events) {
    const label = stringValue(event.label) ?? stringValue(event.hookId) ?? 'task hook'
    const instruction = stringValue(event.instruction)
    console.log(`${chalk.gray('-')} ${label}`)
    if (instruction) console.log(`  ${instruction}`)
    console.log(`  ${chalk.green(stringValue(event.command)!)}`)
  }
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
    .option(
      '--parent-task-json <json>',
      'Parent task reference JSON; also read from SHADOWOB_PARENT_TASK_JSON',
    )
    .option('--no-parent-task', 'Do not auto-attach parent task context from environment')
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
        parentTaskJson?: string
        parentTask?: boolean
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
          const parentTask =
            parseParentTaskOption(options.parentTaskJson) ??
            (options.parentTask === false ? undefined : parentTaskFromEnv())
          const taskData = mergeParentTaskData(data, parentTask)
          if (taskData) task.data = taskData
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
          if (!options.json) printTaskHookEvents(message, cardId, options.status)
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
