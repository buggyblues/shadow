import { beforeEach, describe, expect, it } from 'vitest'
import {
  addCardArtifacts,
  commentCard,
  completeCard,
  createBoard,
  createCard,
  createColumn,
  deleteBoard,
  deleteCard,
  deleteColumn,
  deleteComment,
  dispatchCard,
  getBoard,
  linkCards,
  listBoards,
  moveCard,
  rerunCard,
  resetBoardForTests,
  updateBoard,
  updateCard,
} from './data.js'
import { buildCardDispatchInboxTask, enrichDispatchInputFromContext } from './outbox.js'
import type { BoardCard, BoardPerson, BoardScope, IssueStepStatus } from './types.js'

const actor: BoardPerson = {
  kind: 'buddy',
  id: 'buddy:coordinator',
  buddyAgentId: 'coordinator-agent',
  displayName: 'Coordinator',
}

function cardWorkflowStatus(card: Pick<BoardCard, 'columnId' | 'issueStep'>): IssueStepStatus {
  if (card.issueStep?.status) return card.issueStep.status
  if (card.columnId === 'done') return 'done'
  if (card.columnId === 'review') return 'review'
  if (card.columnId === 'doing') return 'running'
  return 'queued'
}

function cardWorkflowProgress(card: Pick<BoardCard, 'issueStep'>) {
  return card.issueStep?.progress
}

describe('generic Kanban card data model', () => {
  beforeEach(() => {
    resetBoardForTests()
  })

  it('partitions boards by Shadow server project and board scope', () => {
    const serverA: BoardScope = { serverId: 'server-a', projectId: 'default', boardId: 'kanban' }
    const serverB: BoardScope = { serverId: 'server-b', projectId: 'default', boardId: 'kanban' }

    createCard({ title: 'Server A card', createdBy: actor }, serverA)
    createCard({ title: 'Server B card', createdBy: actor }, serverB)

    expect(getBoard(serverA).cards.map((card) => card.title)).toEqual(['Server A card'])
    expect(getBoard(serverB).cards.map((card) => card.title)).toEqual(['Server B card'])
    expect(getBoard(serverA).serverId).toBe('server-a')
    expect(getBoard(serverB).serverId).toBe('server-b')
  })

  it('creates and lists boards within the current server project', () => {
    const scope: BoardScope = { serverId: 'server-a', projectId: 'default', boardId: 'kanban' }

    const first = createBoard({ title: 'Launch Planning' }, scope, actor)
    const second = createBoard({ title: 'Launch Planning' }, scope, actor)
    const boards = listBoards(scope)

    expect(first.title).toBe('Launch Planning')
    expect(first.boardId).toBe('launch-planning')
    expect(second.boardId).toBe('launch-planning-2')
    expect(boards.map((board) => board.boardId)).toEqual(
      expect.arrayContaining(['kanban', 'launch-planning', 'launch-planning-2']),
    )
  })

  it('renames the scoped board', () => {
    const scope: BoardScope = { serverId: 'server-a', projectId: 'default', boardId: 'kanban' }

    const renamed = updateBoard({ title: 'Roadmap' }, scope)
    const board = getBoard(scope)
    const summary = listBoards(scope).find((item) => item.boardId === 'kanban')

    expect(renamed?.title).toBe('Roadmap')
    expect(board.title).toBe('Roadmap')
    expect(summary?.title).toBe('Roadmap')
    expect(updateBoard({ title: '   ' }, scope)).toBeNull()
  })

  it('creates custom columns and allows cards to target them', () => {
    const scope: BoardScope = { serverId: 'server-a', projectId: 'default', boardId: 'kanban' }

    const column = createColumn({ title: 'Blocked' }, scope)
    const card = createCard(
      { title: 'Waiting on review', columnId: column.id, createdBy: actor },
      scope,
    )
    const board = getBoard(scope)

    expect(column).toMatchObject({ id: 'blocked', title: 'Blocked' })
    expect(board.columns.map((item) => item.id)).toContain('blocked')
    expect(card.columnId).toBe('blocked')
  })

  it('persists Trello-style labels, dates, and checklists on cards', () => {
    const card = createCard({
      title: 'Prepare launch checklist',
      labels: ['Launch', 'QA'],
      dueDate: '2026-02-03T23:59:00.000Z',
      checklists: [
        {
          id: 'checklist-1',
          title: 'Release checks',
          createdAt: '2026-01-01T00:00:00.000Z',
          items: [
            {
              id: 'check-1',
              text: 'Verify smoke tests',
              done: false,
              createdAt: '2026-01-01T00:00:00.000Z',
            },
          ],
        },
      ],
      createdBy: actor,
    })
    const board = getBoard()

    expect(card.labels).toEqual(['Launch', 'QA'])
    expect(card.labelIds).toEqual(['launch', 'qa'])
    expect(card.dates?.due).toBe('2026-02-03T23:59:00.000Z')
    expect(card.checklists?.[0]?.items[0]?.text).toBe('Verify smoke tests')
    expect(board.labels.map((label) => label.id)).toEqual(expect.arrayContaining(['launch', 'qa']))
  })

  it('updates card dates and checklist completion without using card status as UI state', () => {
    const card = createCard({ title: 'Prepare launch checklist', createdBy: actor })
    const updated = updateCard({
      cardId: card.id,
      dueDate: '2026-02-03T23:59:00.000Z',
      dueComplete: true,
      checklists: [
        {
          id: 'checklist-1',
          title: 'Release checks',
          createdAt: '2026-01-01T00:00:00.000Z',
          items: [
            {
              id: 'check-1',
              text: 'Verify smoke tests',
              done: true,
              createdAt: '2026-01-01T00:00:00.000Z',
              completedAt: '2026-01-02T00:00:00.000Z',
            },
          ],
        },
      ],
    })

    expect(updated?.dates?.dueComplete).toBe(true)
    expect(updated?.checklists?.[0]?.items[0]?.done).toBe(true)
    expect(updated?.columnId).toBe('todo')
  })

  it('moves cards into empty custom columns without rewriting the target list', () => {
    const blocked = createColumn({ title: 'Blocked' })
    const card = createCard({ title: 'Waiting on dependency', createdBy: actor })

    const moved = moveCard(card.id, blocked.id)
    const board = getBoard()

    expect(moved?.columnId).toBe(blocked.id)
    expect(board.cards.find((item) => item.id === card.id)?.columnId).toBe(blocked.id)
  })

  it('keeps backlog moves in the backlog list', () => {
    const card = createCard({ title: 'Needs triage', createdBy: actor })

    const moved = moveCard(card.id, 'backlog')

    expect(moved?.columnId).toBe('backlog')
    expect(moved ? cardWorkflowStatus(moved) : undefined).toBe('queued')
  })

  it('deletes cards and removes related links and artifacts', () => {
    const source = createCard({ title: 'Source', createdBy: actor })
    const target = createCard({ title: 'Target', createdBy: actor })
    linkCards({ sourceCardId: source.id, targetCardId: target.id, kind: 'depends_on' }, actor)
    addCardArtifacts(
      {
        cardId: source.id,
        artifacts: [{ kind: 'workspace.file', title: 'Source artifact' }],
      },
      actor,
    )

    const deleted = deleteCard({ cardId: source.id })
    const board = getBoard()

    expect(deleted?.card.id).toBe(source.id)
    expect(board.cards.map((card) => card.id)).not.toContain(source.id)
    expect(board.links).toHaveLength(0)
    expect(board.artifacts).toHaveLength(0)
  })

  it('deletes columns with their cards and keeps remaining lists intact', () => {
    const blocked = createColumn({ title: 'Blocked' })
    const card = createCard({
      title: 'Waiting on dependency',
      columnId: blocked.id,
      createdBy: actor,
    })

    const deleted = deleteColumn({ columnId: blocked.id })
    const board = getBoard()

    expect(deleted?.column.id).toBe(blocked.id)
    expect(deleted?.deletedCards.map((item) => item.id)).toEqual([card.id])
    expect(board.columns.map((column) => column.id)).not.toContain(blocked.id)
    expect(board.cards.map((item) => item.id)).not.toContain(card.id)
    expect(board.columns.map((column) => column.id)).toContain('todo')
  })

  it('deletes boards and returns the next board in the same project', () => {
    const scope: BoardScope = { serverId: 'server-a', projectId: 'default', boardId: 'kanban' }
    const created = createBoard({ title: 'Review Board' }, scope, actor)

    const result = deleteBoard({ boardId: created.boardId }, scope)
    const boards = listBoards(scope)

    expect(result?.deleted.boardId).toBe(created.boardId)
    expect(result?.nextBoard.boardId).toBe('kanban')
    expect(boards.map((board) => board.boardId)).not.toContain(created.boardId)
  })

  it('stores Buddy actor identity with inherited owner metadata for audit', () => {
    const buddyActor: BoardPerson = {
      kind: 'agent',
      id: 'buddy:agent-1',
      userId: 'agent-user-1',
      buddyAgentId: 'agent-1',
      ownerId: 'owner-user-1',
      displayName: 'Planner Buddy',
    }

    const card = createCard(
      {
        title: 'Plan server rollout',
        createdBy: buddyActor,
      },
      { serverId: 'server-a' },
    )

    expect(card.createdBy.kind).toBe('agent')
    expect(card.createdBy.buddyAgentId).toBe('agent-1')
    expect(card.createdBy.ownerId).toBe('owner-user-1')
    expect(card.assignees[0]).toMatchObject({
      kind: 'agent',
      buddyAgentId: 'agent-1',
      ownerId: 'owner-user-1',
      displayName: 'Planner Buddy',
    })
  })

  it('creates coordinator-provided cards without Inbox outbox or business execution', () => {
    const research = createCard({
      title: 'Research source material',
      label: 'Research',
      prompt: 'Review private source material and summarize reusable facts.',
      createdBy: actor,
    })
    const draft = createCard({
      title: 'Draft structured output',
      labels: ['Draft'],
      prompt: 'Use the research output and draft the structured deliverable.',
      createdBy: actor,
    })
    const board = getBoard()

    expect(board.cards.map((card) => card.title)).toEqual(
      expect.arrayContaining(['Research source material', 'Draft structured output']),
    )
    expect(board.cards).toHaveLength(2)
    expect([research.title, draft.title]).toEqual([
      'Research source material',
      'Draft structured output',
    ])
    expect(JSON.stringify(board)).not.toContain('inboxTasks')
    expect(JSON.stringify(board)).not.toContain('PRIVATE_REVIEW_TEXT')
  })

  it('links cards so the coordinator can maintain relationships atomically', () => {
    const research = createCard({ title: 'Research source material', createdBy: actor })
    const draft = createCard({ title: 'Draft structured output', createdBy: actor })

    const result = linkCards(
      {
        sourceCardId: draft.id,
        targetCardId: research.id,
        kind: 'depends_on',
        label: 'Needs research output',
      },
      actor,
    )

    const board = getBoard()
    expect(result?.link.kind).toBe('depends_on')
    expect(board.links).toHaveLength(1)
    expect(board.links[0]?.sourceCardId).toBe(draft.id)
    expect(board.links[0]?.targetCardId).toBe(research.id)
  })

  it('updates list workflow and records workspace artifacts without domain-specific output logic', () => {
    const card = createCard({ title: 'Prepare deliverable', createdBy: actor })
    const updated = updateCard({ cardId: card.id, status: 'running', progress: 45 })
    const result = addCardArtifacts(
      {
        cardId: card.id,
        artifacts: [
          {
            kind: 'workspace.file',
            title: 'Delivery notes',
            path: '/workspace/artifacts/delivery-notes.md',
            mimeType: 'text/markdown',
          },
        ],
      },
      actor,
    )

    expect(updated ? cardWorkflowStatus(updated) : undefined).toBe('running')
    expect(result?.artifacts).toHaveLength(1)
    expect(result?.artifacts[0]?.path).toBe('/workspace/artifacts/delivery-notes.md')
    expect(getBoard().artifacts).toHaveLength(1)
    expect(JSON.stringify(result)).not.toContain('inboxTasks')
  })

  it('keeps list workflow consistent when cards move across columns', () => {
    const card = createCard({ title: 'Prepare deliverable', progress: 15, createdBy: actor })

    dispatchCard(
      {
        cardId: card.id,
        agentId: 'agent-reviewer',
        assigneeLabel: 'Reviewer',
        outputContract: null,
      },
      actor,
    )
    const reviewing = updateCard({ cardId: card.id, column: 'review' })
    const done = moveCard(card.id, 'done')

    expect(reviewing ? cardWorkflowStatus(reviewing) : undefined).toBe('review')
    expect(cardWorkflowProgress(reviewing!)).toBeUndefined()
    expect(reviewing?.buddyStatus).toBe('completed')
    expect(done ? cardWorkflowStatus(done) : undefined).toBe('done')
    expect(cardWorkflowProgress(done!)).toBeUndefined()
    expect(done?.buddyStatus).toBe('completed')
  })

  it('uses the list as generic card workflow state', () => {
    const card = createCard({ title: 'Prepare deliverable', createdBy: actor })

    const running = updateCard({ cardId: card.id, status: 'running', progress: 100 })
    const completed = updateCard({ cardId: card.id, progress: 100 })

    expect(running ? cardWorkflowStatus(running) : undefined).toBe('running')
    expect(cardWorkflowProgress(running!)).toBeUndefined()
    expect(completed ? cardWorkflowStatus(completed) : undefined).toBe('done')
    expect(completed?.columnId).toBe('done')
    expect(cardWorkflowProgress(completed!)).toBeUndefined()
  })

  it('keeps completed dispatched cards from being downgraded by stale workflow updates', () => {
    const card = createCard({ title: 'Prepare deliverable', createdBy: actor })
    dispatchCard(
      {
        cardId: card.id,
        agentId: 'agent-producer',
        assigneeLabel: 'Producer',
        outputContract: null,
      },
      actor,
    )
    updateCard({ cardId: card.id, status: 'done', progress: 100 })

    const staleUpdate = updateCard({
      cardId: card.id,
      column: 'doing',
      status: 'running',
      progress: 48,
    })

    expect(staleUpdate ? cardWorkflowStatus(staleUpdate) : undefined).toBe('done')
    expect(staleUpdate?.columnId).toBe('done')
    expect(cardWorkflowProgress(staleUpdate!)).toBeUndefined()
    expect(staleUpdate?.buddyStatus).toBe('completed')
  })

  it('completes cards atomically with a final summary', () => {
    const card = createCard({ title: 'Prepare delivery package', createdBy: actor })
    dispatchCard({ cardId: card.id, agentId: 'agent-producer', assigneeLabel: 'Producer' }, actor)
    addCardArtifacts(
      {
        cardId: card.id,
        artifacts: [
          {
            workspaceFileId: 'workspace-package-1',
            workspaceNodeId: 'workspace-package-1',
            kind: 'workspace.file',
            title: 'Delivery package',
            mimeType: 'text/markdown',
          },
        ],
      },
      actor,
    )

    const result = completeCard(
      { cardId: card.id, summary: 'Delivery package verified and ready.' },
      actor,
    )

    expect(result).not.toHaveProperty('blocked')
    expect(result?.card ? cardWorkflowStatus(result.card) : undefined).toBe('done')
    expect(result?.card.columnId).toBe('done')
    expect(result?.card ? cardWorkflowProgress(result.card) : undefined).toBeUndefined()
    expect(result?.card.buddyStatus).toBe('completed')
    expect(result?.card.comments.at(-1)?.body).toBe('Delivery package verified and ready.')
  })

  it('blocks completion while dependencies are unresolved', () => {
    const research = createCard({ title: 'Research source material', createdBy: actor })
    const delivery = createCard({ title: 'Prepare delivery package', createdBy: actor })
    linkCards(
      {
        sourceCardId: research.id,
        targetCardId: delivery.id,
        kind: 'dependency',
      },
      actor,
    )

    const result = completeCard({ cardId: delivery.id, summary: 'Ready to ship.' }, actor)

    expect(result?.card ? cardWorkflowStatus(result.card) : undefined).not.toBe('done')
    expect(result && 'blocked' in result && result.blocked ? result.blocked.reason : null).toBe(
      'unresolved_dependencies',
    )
  })

  it('blocks completion until required artifact contract is satisfied', () => {
    const card = createCard({
      title: 'Produce video artifact',
      prompt: 'Output video/mp4 workspace artifact.',
      createdBy: actor,
    })
    dispatchCard(
      {
        cardId: card.id,
        agentId: 'agent-producer',
        assigneeLabel: 'Producer',
        outputContract: { kind: 'video/mp4' },
      },
      actor,
    )
    addCardArtifacts(
      {
        cardId: card.id,
        artifacts: [
          {
            workspaceFileId: 'workspace-script-1',
            workspaceNodeId: 'workspace-script-1',
            kind: 'workspace.file',
            title: 'Script',
            mimeType: 'text/markdown',
          },
        ],
      },
      actor,
    )

    const blocked = completeCard({ cardId: card.id, summary: 'Ready.' }, actor)
    expect(blocked && 'blocked' in blocked && blocked.blocked ? blocked.blocked.reason : null).toBe(
      'missing_required_artifact',
    )

    addCardArtifacts(
      {
        cardId: card.id,
        artifacts: [
          {
            workspaceFileId: 'workspace-video-1',
            workspaceNodeId: 'workspace-video-1',
            kind: 'workspace.file',
            title: 'Video',
            mimeType: 'video/mp4',
          },
        ],
      },
      actor,
    )
    const completed = completeCard({ cardId: card.id, summary: 'Video verified.' }, actor)

    expect(completed).not.toHaveProperty('blocked')
    expect(completed?.card ? cardWorkflowStatus(completed.card) : undefined).toBe('done')
  })

  it('promotes dispatched Workspace artifact cards to review and blocks stale downgrades', () => {
    const card = createCard({ title: 'Prepare shared deliverable', createdBy: actor })
    dispatchCard({ cardId: card.id, agentId: 'agent-producer', assigneeLabel: 'Producer' }, actor)

    const artifactResult = addCardArtifacts(
      {
        cardId: card.id,
        artifacts: [
          {
            workspaceFileId: 'workspace-file-1',
            workspaceNodeId: 'workspace-node-1',
            kind: 'workspace.file',
            title: 'Shared output',
            mimeType: 'text/markdown',
          },
        ],
      },
      actor,
    )
    const staleUpdate = updateCard({
      cardId: card.id,
      column: 'doing',
      status: 'running',
      progress: 48,
    })

    expect(artifactResult?.card ? cardWorkflowStatus(artifactResult.card) : undefined).toBe(
      'review',
    )
    expect(artifactResult?.card.columnId).toBe('review')
    expect(artifactResult?.card.buddyStatus).toBe('completed')
    expect(staleUpdate ? cardWorkflowStatus(staleUpdate) : undefined).toBe('review')
    expect(staleUpdate?.columnId).toBe('review')
    expect(staleUpdate?.buddyStatus).toBe('completed')
  })

  it('normalizes persisted done cards that still carry queued Buddy status', () => {
    const card = createCard({ title: 'Prepare deliverable', createdBy: actor })
    updateCard({ cardId: card.id, status: 'done' })
    const board = getBoard()

    resetBoardForTests({
      ...board,
      cards: board.cards.map((item) =>
        item.id === card.id ? { ...item, buddyStatus: 'queued' as const } : item,
      ),
    })

    const normalized = getBoard().cards.find((item) => item.id === card.id)
    expect(normalized ? cardWorkflowStatus(normalized) : undefined).toBe('done')
    expect(normalized?.buddyStatus).toBe('completed')
  })

  it('normalizes persisted running cards with Workspace artifacts back to review', () => {
    const card = createCard({ title: 'Prepare shared deliverable', createdBy: actor })
    dispatchCard({ cardId: card.id, agentId: 'agent-producer', assigneeLabel: 'Producer' }, actor)
    addCardArtifacts(
      {
        cardId: card.id,
        artifacts: [
          {
            workspaceFileId: 'workspace-file-1',
            workspaceNodeId: 'workspace-node-1',
            kind: 'workspace.file',
            title: 'Shared output',
          },
        ],
      },
      actor,
    )
    const board = getBoard()

    resetBoardForTests({
      ...board,
      cards: board.cards.map((item) =>
        item.id === card.id
          ? {
              ...item,
              status: 'running' as const,
              columnId: 'doing',
              buddyStatus: 'running' as const,
              progress: 48,
            }
          : item,
      ),
    })

    const normalized = getBoard().cards.find((item) => item.id === card.id)
    expect(normalized ? cardWorkflowStatus(normalized) : undefined).toBe('review')
    expect(normalized?.columnId).toBe('review')
    expect(normalized?.buddyStatus).toBe('completed')
    expect(normalized ? cardWorkflowProgress(normalized) : undefined).toBeUndefined()
  })

  it('stores long coordinator audit comments without truncating content', () => {
    const card = createCard({ title: 'Prepare deliverable', createdBy: actor })
    const body = `Final acceptance note: ${'artifact verified. '.repeat(160)}`.trim()

    const result = commentCard(card.id, body, actor)

    expect(body.length).toBeGreaterThan(1000)
    expect(result?.comments.at(-1)?.body).toBe(body)
  })

  it('deletes a card comment and removes the matching activity item', () => {
    const card = createCard({ title: 'Prepare deliverable', createdBy: actor })
    const commented = commentCard(card.id, 'Needs one more pass.', actor)
    const commentId = commented?.comments.at(-1)?.id
    expect(commentId).toBeTruthy()

    const result = deleteComment({ cardId: card.id, commentId: commentId! })

    expect(result?.comment.id).toBe(commentId)
    expect(result?.card.comments).toHaveLength(0)
    expect(result?.card.activity?.some((item) => item.body === 'Needs one more pass.')).toBe(false)
  })

  it('accepts natural command aliases and preserves external workspace artifact ids as metadata', () => {
    const card = createCard({ title: 'Prepare deliverable', column: 'backlog', createdBy: actor })

    const updated = updateCard({ cardId: card.id, column: 'review', status: 'review' })
    const result = addCardArtifacts(
      {
        cardId: card.id,
        kind: 'workspace.file',
        mimeType: 'video/mp4',
        artifacts: [
          {
            id: 'workspace-file-1',
            workspaceNodeId: 'workspace-node-1',
            title: 'Rendered output',
            path: '/workspace/renders/output.mp4',
          },
        ],
      },
      actor,
    )

    expect(card.columnId).toBe('backlog')
    expect(updated?.columnId).toBe('review')
    expect(result?.artifacts[0]?.kind).toBe('workspace.file')
    expect(result?.artifacts[0]?.metadata).toMatchObject({
      externalArtifactId: 'workspace-file-1',
      workspaceNodeId: 'workspace-node-1',
    })
  })

  it('accepts common artifact aliases from Buddy tool output', () => {
    const card = createCard({ title: 'Prepare deliverable', createdBy: actor })

    const result = addCardArtifacts(
      {
        cardId: card.id,
        artifacts: [
          {
            id: 'workspace-file-2',
            name: 'Rendered clip',
            description: 'Workspace video file produced by the assigned Buddy.',
            path: '/workspace/renders/rendered-clip.mp4',
          },
        ],
      },
      actor,
    )

    expect(result?.artifacts[0]?.title).toBe('Rendered clip')
    expect(result?.artifacts[0]?.summary).toBe(
      'Workspace video file produced by the assigned Buddy.',
    )
    expect(result?.artifacts[0]?.metadata).toMatchObject({
      externalArtifactId: 'workspace-file-2',
    })
  })

  it('reopens a generic card without emitting Inbox tasks', () => {
    const card = createCard({ title: 'Research source material', createdBy: actor })
    updateCard({ cardId: card.id, status: 'done', progress: 100 })

    const rerun = rerunCard(card.id, {
      prompt: 'Try a tighter research brief.',
      reason: 'Coordinator requested revision.',
    })

    expect(rerun?.card ? cardWorkflowStatus(rerun.card) : undefined).toBe('queued')
    expect(rerun?.card.prompt).toContain('tighter research')
    expect(JSON.stringify(rerun)).not.toContain('inboxTasks')
  })

  it('marks a generic card dispatched without embedding domain workflow logic', () => {
    const card = createCard({
      title: 'Prepare deliverable',
      prompt: 'Prepare reusable output and attach workspace references.',
      createdBy: actor,
    })

    const result = dispatchCard(
      {
        cardId: card.id,
        agentId: 'agent-reviewer',
        assigneeLabel: 'Reviewer',
        requirements: null,
        outputContract: null,
        privacy: null,
        kanbanCardRef: { taskId: 'task-external' },
      },
      actor,
    )

    expect(result?.card ? cardWorkflowStatus(result.card) : undefined).toBe('running')
    expect(result?.card.columnId).toBe('doing')
    expect(result?.card.assignees.map((item) => item.displayName)).toContain('Reviewer')
    expect(result?.card.comments.at(-1)?.body).toContain('Dispatched to Reviewer')
    expect(JSON.stringify(getBoard())).not.toContain('HyperFrames')
    expect(JSON.stringify(getBoard())).not.toContain('inboxTasks')
  })

  it('defers dispatch when upstream dependency cards are not done', () => {
    const upstream = createCard({ title: 'Research source material', createdBy: actor })
    const downstream = createCard({ title: 'Produce reusable output', createdBy: actor })
    linkCards(
      {
        sourceCardId: upstream.id,
        targetCardId: downstream.id,
        kind: 'dependency',
      },
      actor,
    )

    const result = dispatchCard(
      {
        cardId: downstream.id,
        agentId: 'agent-producer',
        assigneeLabel: 'Producer',
      },
      actor,
    )

    expect(result?.card ? cardWorkflowStatus(result.card) : undefined).toBe('queued')
    expect(result?.card.columnId).toBe('todo')
    expect(result?.card.buddyStatus).toBe('queued')
    expect(result?.card ? cardWorkflowProgress(result.card) : undefined).toBeUndefined()
    expect(result?.deferred).toMatchObject({
      reason: 'unresolved_dependencies',
      dependencies: [{ cardId: upstream.id, title: 'Research source material' }],
    })
    expect(result?.card.comments.at(-1)?.body).toContain('Dispatch deferred for Producer')
  })

  it('treats depends_on links as source depends on target', () => {
    const upstream = createCard({ title: 'Research source material', createdBy: actor })
    const downstream = createCard({ title: 'Produce reusable output', createdBy: actor })
    linkCards(
      {
        sourceCardId: downstream.id,
        targetCardId: upstream.id,
        kind: 'depends_on',
      },
      actor,
    )

    const result = dispatchCard(
      {
        cardId: downstream.id,
        agentId: 'agent-producer',
        assigneeLabel: 'Producer',
      },
      actor,
    )

    expect(result?.card ? cardWorkflowStatus(result.card) : undefined).toBe('queued')
    expect(result?.deferred).toMatchObject({
      reason: 'unresolved_dependencies',
      dependencies: [{ cardId: upstream.id, title: 'Research source material' }],
    })
  })

  it('blocks downstream completion while dependency cards are unresolved', () => {
    const upstream = createCard({ title: 'Research source material', createdBy: actor })
    const downstream = createCard({ title: 'Produce reusable output', createdBy: actor })
    linkCards(
      {
        sourceCardId: downstream.id,
        targetCardId: upstream.id,
        kind: 'depends_on',
      },
      actor,
    )

    const blockedStatus = updateCard({ cardId: downstream.id, status: 'done', progress: 100 })
    const blockedMove = moveCard(downstream.id, 'done')
    const blockedProgress = updateCard({ cardId: downstream.id, progress: 100 })

    expect(blockedStatus ? cardWorkflowStatus(blockedStatus) : undefined).not.toBe('done')
    expect(blockedStatus?.columnId).toBe('todo')
    expect(blockedMove ? cardWorkflowStatus(blockedMove) : undefined).not.toBe('done')
    expect(blockedMove?.columnId).toBe('todo')
    expect(blockedProgress ? cardWorkflowStatus(blockedProgress) : undefined).not.toBe('done')
    expect(blockedProgress?.columnId).toBe('todo')
    expect(blockedProgress ? cardWorkflowProgress(blockedProgress) : undefined).toBeUndefined()

    updateCard({ cardId: upstream.id, status: 'done', progress: 100 })
    const completed = updateCard({ cardId: downstream.id, status: 'done', progress: 100 })

    expect(completed ? cardWorkflowStatus(completed) : undefined).toBe('done')
    expect(completed?.columnId).toBe('done')
    expect(completed ? cardWorkflowProgress(completed) : undefined).toBeUndefined()
  })

  it('normalizes persisted completed downstream cards with unresolved dependencies back to queued', () => {
    const upstream = createCard({ title: 'Research source material', createdBy: actor })
    const downstream = createCard({ title: 'Prepare final package', createdBy: actor })
    linkCards(
      {
        sourceCardId: downstream.id,
        targetCardId: upstream.id,
        kind: 'depends_on',
      },
      actor,
    )
    const board = getBoard()

    resetBoardForTests({
      ...board,
      cards: board.cards.map((item) =>
        item.id === downstream.id
          ? {
              ...item,
              status: 'done' as const,
              columnId: 'done',
              buddyStatus: 'completed' as const,
              progress: 100,
            }
          : item,
      ),
    })

    const normalized = getBoard().cards.find((item) => item.id === downstream.id)
    const unresolved = getBoard().cards.find((item) => item.id === upstream.id)
    expect(unresolved ? cardWorkflowStatus(unresolved) : undefined).not.toBe('done')
    expect(normalized ? cardWorkflowStatus(normalized) : undefined).toBe('queued')
    expect(normalized?.columnId).toBe('todo')
    expect(normalized?.buddyStatus).toBe('queued')
    expect(normalized ? cardWorkflowProgress(normalized) : undefined).toBeUndefined()
  })

  it('unblocks downstream dispatch when upstream has a Workspace artifact ready for review', () => {
    const upstream = createCard({ title: 'Produce shared input', createdBy: actor })
    const downstream = createCard({ title: 'Review shared input', createdBy: actor })
    linkCards(
      {
        sourceCardId: upstream.id,
        targetCardId: downstream.id,
        kind: 'dependency',
      },
      actor,
    )
    dispatchCard(
      { cardId: upstream.id, agentId: 'agent-producer', assigneeLabel: 'Producer' },
      actor,
    )
    addCardArtifacts(
      {
        cardId: upstream.id,
        artifacts: [
          {
            workspaceFileId: 'workspace-file-1',
            workspaceNodeId: 'workspace-node-1',
            kind: 'workspace.file',
            title: 'Shared input',
            mimeType: 'text/markdown',
          },
        ],
      },
      actor,
    )

    const result = dispatchCard(
      {
        cardId: downstream.id,
        agentId: 'agent-reviewer',
        assigneeLabel: 'Reviewer',
      },
      actor,
    )

    expect(result?.card ? cardWorkflowStatus(result.card) : undefined).toBe('running')
    expect(result?.card.columnId).toBe('doing')
    expect(result).not.toHaveProperty('deferred')
  })

  it('requires dispatched artifact mime contracts before review and dependency readiness', () => {
    const video = createCard({
      title: 'Produce media deliverable',
      prompt: 'Output video/mp4 workspace artifact.',
      createdBy: actor,
    })
    const review = createCard({ title: 'Review media deliverable', createdBy: actor })
    linkCards(
      {
        sourceCardId: video.id,
        targetCardId: review.id,
        kind: 'dependency',
      },
      actor,
    )
    dispatchCard(
      {
        cardId: video.id,
        agentId: 'agent-producer',
        assigneeLabel: 'Producer',
        outputContract: { kind: 'video/mp4', description: 'Required media output' },
      },
      actor,
    )

    const scriptArtifact = addCardArtifacts(
      {
        cardId: video.id,
        artifacts: [
          {
            workspaceFileId: 'workspace-script-1',
            workspaceNodeId: 'workspace-script-1',
            kind: 'workspace.file',
            title: 'Input script',
            mimeType: 'text/markdown',
          },
        ],
      },
      actor,
    )
    const staleReview = updateCard({ cardId: video.id, status: 'review', progress: 72 })
    const deferredReview = dispatchCard(
      {
        cardId: review.id,
        agentId: 'agent-reviewer',
        assigneeLabel: 'Reviewer',
      },
      actor,
    )

    expect(scriptArtifact?.card ? cardWorkflowStatus(scriptArtifact.card) : undefined).toBe(
      'running',
    )
    expect(staleReview ? cardWorkflowStatus(staleReview) : undefined).toBe('running')
    expect(deferredReview?.deferred).toMatchObject({
      reason: 'unresolved_dependencies',
      dependencies: [{ cardId: video.id }],
    })

    const videoArtifact = addCardArtifacts(
      {
        cardId: video.id,
        artifacts: [
          {
            workspaceFileId: 'workspace-video-1',
            workspaceNodeId: 'workspace-video-1',
            kind: 'workspace.file',
            title: 'Rendered video',
            mimeType: 'video/mp4',
          },
        ],
      },
      actor,
    )
    const readyReview = dispatchCard(
      {
        cardId: review.id,
        agentId: 'agent-reviewer',
        assigneeLabel: 'Reviewer',
      },
      actor,
    )

    expect(videoArtifact?.card ? cardWorkflowStatus(videoArtifact.card) : undefined).toBe('review')
    expect(videoArtifact?.card.columnId).toBe('review')
    expect(readyReview?.card ? cardWorkflowStatus(readyReview.card) : undefined).toBe('running')
    expect(readyReview).not.toHaveProperty('deferred')
  })

  it('normalizes persisted review cards without matching artifact mime back to running', () => {
    const card = createCard({
      title: 'Produce media deliverable',
      prompt: 'Output video/mp4 workspace artifact.',
      createdBy: actor,
    })
    dispatchCard(
      {
        cardId: card.id,
        agentId: 'agent-producer',
        assigneeLabel: 'Producer',
        outputContract: { kind: 'video/mp4' },
      },
      actor,
    )
    addCardArtifacts(
      {
        cardId: card.id,
        artifacts: [
          {
            workspaceFileId: 'workspace-script-1',
            workspaceNodeId: 'workspace-script-1',
            kind: 'workspace.file',
            title: 'Input script',
            mimeType: 'text/markdown',
          },
        ],
      },
      actor,
    )
    const board = getBoard()

    resetBoardForTests({
      ...board,
      cards: board.cards.map((item) =>
        item.id === card.id
          ? {
              ...item,
              status: 'review' as const,
              columnId: 'review',
              buddyStatus: 'completed' as const,
              progress: 72,
            }
          : item,
      ),
    })

    const normalized = getBoard().cards.find((item) => item.id === card.id)
    expect(normalized ? cardWorkflowStatus(normalized) : undefined).toBe('running')
    expect(normalized?.columnId).toBe('doing')
    expect(normalized?.buddyStatus).toBe('running')
  })

  it('normalizes Buddy assignee ids before deduping', () => {
    const card = createCard({ title: 'Prepare reusable output', createdBy: actor })

    dispatchCard(
      {
        cardId: card.id,
        agentId: 'agent-reviewer',
        assigneeLabel: 'Reviewer',
      },
      actor,
    )
    const result = dispatchCard(
      {
        cardId: card.id,
        agentId: 'buddy:agent-reviewer',
        assigneeLabel: 'Reviewer',
      },
      actor,
    )

    const buddyAssignees = result?.card.assignees.filter(
      (item) => item.id === 'buddy:agent-reviewer',
    )
    expect(buddyAssignees).toHaveLength(1)
    expect(result?.card.assignees.some((item) => item.id === 'buddy:buddy:agent-reviewer')).toBe(
      false,
    )
  })

  it('uses role binding profile data when dispatch input omits assignee details', () => {
    const seeded = getBoard()
    resetBoardForTests({
      ...seeded,
      issues: {
        ...seeded.issues,
        roles: [
          {
            id: 'research',
            label: 'Research',
            specialty: 'Source research',
            status: 'online',
            color: '#5b5df7',
            binding: {
              agentId: 'agent-reviewer',
              agentUserId: 'agent-user-1',
              displayName: 'Reviewer Buddy',
              avatarUrl: 'https://example.test/reviewer.png',
              status: 'online',
              source: 'bridge',
              boundAt: '2026-01-01T00:00:00.000Z',
            },
          },
        ],
      },
    })
    const card = createCard({ title: 'Prepare reusable output', createdBy: actor })

    const result = dispatchCard({ cardId: card.id, agentId: 'buddy:agent-reviewer' }, actor)

    expect(result?.assignee).toMatchObject({
      id: 'buddy:agent-reviewer',
      buddyAgentId: 'agent-reviewer',
      userId: 'agent-user-1',
      displayName: 'Reviewer Buddy',
      avatarUrl: 'https://example.test/reviewer.png',
    })
    expect(result?.card.comments.at(-1)?.body).toContain('Dispatched to Reviewer Buddy')
  })

  it('rejects local-only artifacts for dispatched cards that require Workspace files', () => {
    const card = createCard({ title: 'Prepare shared deliverable', createdBy: actor })
    dispatchCard({ cardId: card.id, agentId: 'agent-producer', assigneeLabel: 'Producer' }, actor)

    expect(() =>
      addCardArtifacts(
        {
          cardId: card.id,
          artifacts: [
            {
              kind: 'document',
              title: 'Local report',
              path: 'local-report.md',
              mimeType: 'text/markdown',
            },
          ],
        },
        actor,
      ),
    ).toThrow(/workspace_file_reference_required/)
  })

  it('accepts Workspace file ids for dispatched card artifacts', () => {
    const card = createCard({ title: 'Prepare shared deliverable', createdBy: actor })
    dispatchCard({ cardId: card.id, agentId: 'agent-producer', assigneeLabel: 'Producer' }, actor)

    const result = addCardArtifacts(
      {
        cardId: card.id,
        artifacts: [
          {
            workspaceFileId: 'workspace-file-1',
            workspaceNodeId: 'workspace-node-1',
            kind: 'workspace.file',
            title: 'Shared report',
            mimeType: 'text/markdown',
          },
        ],
      },
      actor,
    )

    expect(result?.artifacts[0]?.metadata).toMatchObject({
      workspaceFileId: 'workspace-file-1',
      workspaceNodeId: 'workspace-node-1',
    })
  })

  it('accepts workspace URI artifacts as shareable Workspace references', () => {
    const card = createCard({ title: 'Prepare shared deliverable', createdBy: actor })
    dispatchCard({ cardId: card.id, agentId: 'agent-producer', assigneeLabel: 'Producer' }, actor)

    const result = addCardArtifacts(
      {
        cardId: card.id,
        artifacts: [
          {
            uri: 'workspace://briefs/research.md',
            kind: 'workspace.file',
            title: 'Research brief',
            mimeType: 'text/markdown',
          },
        ],
      },
      actor,
    )

    expect(result?.artifacts[0]?.uri).toBe('workspace://briefs/research.md')
    expect(result?.artifacts[0]?.metadata).toMatchObject({
      workspaceUri: 'workspace://briefs/research.md',
    })
    expect(result?.card ? cardWorkflowStatus(result.card) : undefined).toBe('review')
  })

  it('builds required Inbox outbox tasks for card dispatch without business-specific logic', () => {
    const card = createCard({
      title: 'Prepare deliverable',
      prompt: 'Prepare reusable output and attach workspace references.',
      priority: 'high',
      createdBy: actor,
    })

    const task = buildCardDispatchInboxTask({
      dispatch: {
        cardId: card.id,
        agentId: 'agent-reviewer',
        assigneeLabel: 'Reviewer',
        tags: ['review'],
        requirements: { capabilities: ['workspace.write'], tools: [{ name: 'cards.update' }] },
        outputContract: {
          expectedArtifacts: [{ kind: 'workspace.reference', required: false }],
          submitCommand: { appKey: 'kanban', command: 'cards.artifacts.add' },
        },
        privacy: { dataClass: 'server-private', redactionRequired: true },
        data: { requestId: 'request-1' },
      },
      card,
      assignee: { ...actor, displayName: 'Reviewer' },
      now: 123,
    })

    expect(task).toMatchObject({
      agentId: 'agent-reviewer',
      assigneeLabel: 'Reviewer',
      title: 'Prepare deliverable',
      priority: 'high',
      tags: ['review'],
      idempotencyKey: `kanban:card:${card.id}:dispatch:agent-reviewer:123`,
      required: true,
      requirements: { capabilities: ['workspace.write'] },
      outputContract: {
        submitCommand: { appKey: 'kanban', command: 'cards.artifacts.add' },
      },
      privacy: { dataClass: 'server-private', redactionRequired: true },
      resource: { kind: 'kanban.card', id: card.id },
      data: {
        requestId: 'request-1',
        boardId: 'kanban',
        appKey: 'kanban',
        cardId: card.id,
        assigneeLabel: 'Reviewer',
      },
    })
    expect(JSON.stringify(task)).not.toContain('HyperFrames')
  })

  it('omits default artifact requirements when dispatch outputContract is explicitly null', () => {
    const card = createCard({
      title: 'Coordinate downstream work',
      prompt: 'Create linked cards and update this card with comments.',
      createdBy: actor,
    })

    const task = buildCardDispatchInboxTask({
      dispatch: {
        cardId: card.id,
        agentId: 'agent-coordinator',
        assigneeLabel: 'Coordinator',
        requirements: null,
        outputContract: null,
      },
      card,
      assignee: { ...actor, displayName: 'Coordinator' },
      now: 123,
    })

    expect(task.requirements).toBeUndefined()
    expect(task.outputContract).toBeUndefined()
    expect(task.data?.workspaceArtifactRequired).toBe(false)
    expect(task.body).toContain('Maintain this Kanban card through cards.update/cards.comment')
  })

  it('enriches dispatch input from server app Buddy context', () => {
    const enriched = enrichDispatchInputFromContext(
      {
        cardId: 'card-1',
        agentId: 'buddy:agent-producer',
        assigneeLabel: '',
      },
      {
        protocol: 'shadow.app/1',
        serverId: 'server-1',
        serverAppId: 'app-1',
        appKey: 'kanban',
        command: 'cards.dispatch',
        actor: { kind: 'agent', userId: 'coordinator-user' },
        resources: {
          buddies: [
            {
              agentId: 'agent-producer',
              userId: 'producer-user',
              username: 'producer-buddy',
              displayName: 'Producer Buddy',
              description: 'Use built-in renderer before heavier tools.',
              avatarUrl: 'https://example.test/producer.png',
            },
          ],
        },
        permission: 'server_app:write',
        action: 'write',
        dataClass: 'server-private',
      },
    )

    expect(enriched).toMatchObject({
      agentId: 'buddy:agent-producer',
      agentUserId: 'producer-user',
      assigneeLabel: 'Producer Buddy',
      assigneeAvatarUrl: 'https://example.test/producer.png',
      data: {
        targetBuddy: {
          agentId: 'agent-producer',
          userId: 'producer-user',
          displayName: 'Producer Buddy',
          description: 'Use built-in renderer before heavier tools.',
        },
      },
    })
  })

  it('does not override explicit dispatch assignee details with server app context', () => {
    const enriched = enrichDispatchInputFromContext(
      {
        cardId: 'card-1',
        agentId: 'agent-producer',
        agentUserId: 'explicit-user',
        assigneeLabel: 'Explicit Buddy',
        assigneeAvatarUrl: 'https://example.test/explicit.png',
      },
      {
        protocol: 'shadow.app/1',
        serverId: 'server-1',
        serverAppId: 'app-1',
        appKey: 'kanban',
        command: 'cards.dispatch',
        actor: { kind: 'agent', userId: 'coordinator-user' },
        resources: {
          buddies: [
            {
              agentId: 'agent-producer',
              userId: 'producer-user',
              username: 'producer-buddy',
              displayName: 'Producer Buddy',
              description: 'Use built-in renderer before heavier tools.',
              avatarUrl: 'https://example.test/producer.png',
            },
          ],
        },
        permission: 'server_app:write',
        action: 'write',
        dataClass: 'server-private',
      },
    )

    expect(enriched).toMatchObject({
      agentUserId: 'explicit-user',
      assigneeLabel: 'Explicit Buddy',
      assigneeAvatarUrl: 'https://example.test/explicit.png',
      data: {
        targetBuddy: {
          agentId: 'agent-producer',
          userId: 'producer-user',
          displayName: 'Explicit Buddy',
          description: 'Use built-in renderer before heavier tools.',
        },
      },
    })
  })

  it('includes target Buddy capability hints in dispatched Inbox task body', () => {
    const card = createCard({ title: 'Produce reusable media artifact', createdBy: actor })

    const task = buildCardDispatchInboxTask({
      dispatch: {
        cardId: card.id,
        agentId: 'agent-producer',
        assigneeLabel: 'Producer Buddy',
        data: {
          targetBuddy: {
            agentId: 'agent-producer',
            displayName: 'Producer Buddy',
            description:
              'Use `shadow-video-render --script <downloaded-script.md> --output /tmp/deliverable.mp4` before heavier tools.',
          },
        },
      },
      card,
      assignee: { ...actor, displayName: 'Producer Buddy' },
      now: 789,
    })

    expect(task.body).toContain('Target Buddy capability hints (Producer Buddy):')
    expect(task.body).toContain('shadow-video-render --script')
  })

  it('requires server Workspace file references for default dispatched task artifacts', () => {
    const card = createCard({
      title: 'Prepare shared deliverable',
      prompt: 'Produce a reusable deliverable for downstream Buddies.',
      createdBy: actor,
    })

    const task = buildCardDispatchInboxTask({
      dispatch: {
        cardId: card.id,
        agentId: 'agent-producer',
        assigneeLabel: 'Producer',
      },
      card,
      assignee: { ...actor, displayName: 'Producer' },
      now: 456,
    })

    expect(task.body).toContain('shadowob workspace files upload')
    expect(task.body).toContain('shadowob workspace files download')
    expect(task.body).toContain('Do not submit runtime-local paths')
    expect(task.requirements).toMatchObject({
      capabilities: ['workspace.read', 'workspace.write'],
      tools: expect.arrayContaining([
        expect.objectContaining({ name: 'shadowob workspace files upload', required: true }),
        expect.objectContaining({ name: 'cards.artifacts.add', required: true }),
      ]),
    })
    expect(task.outputContract).toMatchObject({
      expectedArtifacts: [
        expect.objectContaining({
          kind: 'workspace.file',
          required: true,
          fields: expect.arrayContaining(['workspaceFileId', 'workspaceNodeId']),
        }),
      ],
      submitCommand: { appKey: 'kanban', command: 'cards.artifacts.add' },
    })
    expect(task.data).toMatchObject({
      workspaceArtifactRequired: true,
      workspaceReferenceFields: ['workspaceFileId', 'workspaceNodeId'],
      workspaceCli: expect.objectContaining({
        upload: expect.stringContaining('workspace files upload'),
        download: expect.stringContaining('workspace files download'),
      }),
    })
    expect(JSON.stringify(task)).not.toContain('HyperFrames')
  })
})
