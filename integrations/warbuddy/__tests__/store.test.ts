import { rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type StoreModule = typeof import('../src/store')
type ActorRef = Parameters<StoreModule['createTeam']>[0]

let testIndex = 0

async function loadStore() {
  vi.resetModules()
  const file = resolve('.tmp', `warbuddy-store-test-${process.pid}-${testIndex++}.json`)
  rmSync(file, { force: true })
  process.env.WARBUDDY_DATA_FILE = file
  return import('../src/store')
}

function actor(id: string, displayName: string): ActorRef {
  return {
    kind: 'user',
    id,
    userId: id,
    buddyAgentId: null,
    ownerId: null,
    displayName,
    avatarUrl: null,
  } as ActorRef
}

function buddyActor(agentId: string, ownerId: string, displayName: string): ActorRef {
  return {
    kind: 'agent',
    id: `bot-${agentId}`,
    userId: `bot-${agentId}`,
    buddyAgentId: agentId,
    ownerId,
    displayName,
    avatarUrl: null,
  } as ActorRef
}

beforeEach(() => {
  process.env.WARBUDDY_DATA_FILE = resolve('.tmp', `warbuddy-store-test-${process.pid}.json`)
})

describe('warbuddy community store', () => {
  it('creates one squad per actor and binds the squad tank to the team color', async () => {
    const store = await loadStore()
    const pilot = actor('user-a', 'Pilot A')

    const first = store.createTeam(pilot, {
      name: 'Redstone Raiders',
      description: 'Flag rush and bomb control.',
      color: '#dd3333',
    })
    expect(first.team.name).toBe('Redstone Raiders')
    expect(first.team.color).toBe('#dd3333')
    expect(first.tank?.teamId).toBe(first.team.id)
    expect(first.tank?.appearance).toContain('#dd3333')

    const updated = store.createTeam(pilot, {
      name: 'Emerald Guard',
      description: 'Defend mid grass.',
      color: '#33aa55',
    })
    const listed = store.listTeams(pilot)

    expect(updated.team.id).toBe(first.team.id)
    expect(listed.teams).toHaveLength(1)
    expect(listed.mine?.name).toBe('Emerald Guard')
    expect(store.getTank(first.team.tankId)?.teamId).toBe(first.team.id)
    expect(store.getTank(first.team.tankId)?.appearance).toContain('#33aa55')
  })

  it('uses globally unique object ids instead of matching squads by name', async () => {
    const store = await loadStore()
    const pilotA = actor('user-same-a', 'Pilot Same A')
    const pilotB = actor('user-same-b', 'Pilot Same B')

    const first = store.createTeam(pilotA, { name: 'Same Name', color: '#dd3333' }).team
    const second = store.createTeam(pilotB, { name: 'Same Name', color: '#3366ff' }).team
    const room = store.createRoom(pilotA, { teamId: first.id, mode: 'manual' }).room

    expect(first.name).toBe(second.name)
    expect(first.id).not.toBe(second.id)
    expect(first.id).toMatch(/^team_[0-9a-f-]{36}$/)
    expect(second.id).toMatch(/^team_[0-9a-f-]{36}$/)
    expect(room.id).toMatch(/^room_[0-9a-f-]{36}$/)
    expect(store.listTeams(pilotA).mine?.id).toBe(first.id)
    expect(store.listTeams(pilotB).mine?.id).toBe(second.id)
  })

  it('requires a squad for live rooms and moves rooms live after another squad joins', async () => {
    const store = await loadStore()
    const host = actor('user-host', 'Host Pilot')
    const guest = actor('user-guest', 'Guest Pilot')

    expect(() => store.createRoom(host, { mode: 'manual' })).toThrow('team_required')

    const hostTeam = store.createTeam(host, { name: 'Host Squad', color: '#3366ff' }).team
    const guestTeam = store.createTeam(guest, { name: 'Guest Squad', color: '#ffcc33' }).team
    const created = store.createRoom(host, {
      name: 'Arena Alpha',
      mode: 'manual',
      teamId: hostTeam.id,
    })
    const joined = store.joinRoom(guest, {
      code: created.room.code.toLowerCase(),
      mode: 'coop',
      teamId: guestTeam.id,
    })

    expect(created.room.participants[0]?.mode).toBe('manual')
    expect(joined.room.status).toBe('live')
    expect(joined.room.guestTeamId).toBe(guestTeam.id)
    expect(joined.room.participants.map((participant) => participant.teamId)).toContain(hostTeam.id)
    expect(store.listRooms().rooms[0]?.code).toBe(created.room.code)
  })

  it('tracks unread replays and summarizes frame comments for Buddy coaching', async () => {
    const store = await loadStore()
    const reviewer = actor('user-reviewer', 'Replay Reviewer')
    const match = store.recordChallenge({
      challengerTankId: 'nova-scout',
      defenderTankId: 'azure-hunter',
      seed: 2026,
      mapId: 'classic',
    })

    expect(store.listMatches({ limit: 1 }, reviewer)[0]?.unread).toBe(true)

    const marked = store.markMatchRead(reviewer, { matchId: match.id })
    expect(marked.match.unread).toBe(false)
    expect(marked.match.readAt).toEqual(expect.any(String))

    const comment = store.addReplayComment(reviewer, {
      matchId: match.id,
      frame: 12,
      body: 'Tank ignored the flag lane after the shell clash.',
      rect: { x: 0.2, y: 0.3, width: 0.25, height: 0.2 },
    })
    const brief = store.replayReviewBrief({ matchId: match.id })

    expect(comment.comment.frame).toBe(12)
    expect(store.listMatches({ limit: 1 }, reviewer)[0]?.commentsCount).toBe(1)
    expect(brief.summary).toContain('Tank ignored the flag lane')
  })

  it('creates fresh required Buddy inbox tasks for each tactical brief', async () => {
    const store = await loadStore()
    const pilot = actor('user-brief', 'Brief Pilot')
    const team = store.createTeam(pilot, {
      name: 'Brief Squad',
      description: 'Hold mid grass.',
      color: '#dd3333',
    }).team

    const first = store.buildBattleBrief({
      actor: pilot,
      teamId: team.id,
      targets: [{ agentId: 'agent-one' }],
      mapId: 'classic',
      notes: 'First review note.',
    }) as {
      shadow: {
        outbox: {
          inboxTasks: Array<{
            body: string
            idempotencyKey: string
            required: boolean
          }>
        }
      }
    }
    const second = store.buildBattleBrief({
      actor: pilot,
      teamId: team.id,
      targets: [{ agentId: 'agent-one' }],
      mapId: 'classic',
      notes: 'Second review note.',
    }) as typeof first

    const firstTask = first.shadow.outbox.inboxTasks[0]
    const secondTask = second.shadow.outbox.inboxTasks[0]

    expect(firstTask?.required).toBe(true)
    expect(secondTask?.required).toBe(true)
    expect(firstTask?.idempotencyKey).not.toBe(secondTask?.idempotencyKey)
    expect(firstTask?.body).toContain(`Assigned squad id: ${team.id}`)
    expect(firstTask?.body).toContain(`Assigned tank id: ${team.tankId}`)
    expect(firstTask?.body).toContain('me.tank.speak(text)')
    expect(firstTask?.body).toContain('me.engineer.speak(text)')
    expect(firstTask?.body).not.toContain('me.speak()')
  })

  it('lets owner-owned or delegated Buddies update a squad strategy', async () => {
    const store = await loadStore()
    const pilot = actor('user-delegate', 'Delegate Pilot')
    const team = store.createTeam(pilot, {
      name: 'Delegate Squad',
      description: 'Ask a Buddy to tune the plan.',
      color: '#2f80ed',
    }).team

    const ownerBuddyUpdate = store.saveTankCode(
      buddyActor('owner-agent', pilot.userId!, 'Owner Buddy'),
      {
        tankId: team.tankId,
        code: 'function onIdle(me) { me.tank.aim("right"); }',
        notes: 'Owner Buddy can tune this squad.',
      },
    )
    expect(ownerBuddyUpdate.submittedBy).toBe('Owner Buddy')

    expect(() =>
      store.saveTankCode(buddyActor('agent-one', 'other-user', 'Strategy Buddy'), {
        tankId: team.tankId,
        code: 'function onIdle(me) { me.tank.fire(); }',
      }),
    ).toThrow('tank_not_owned_by_actor')

    store.buildBattleBrief({
      actor: pilot,
      teamId: team.id,
      targets: [{ agentId: 'agent-one' }],
      notes: 'Tune this squad.',
    })

    const updated = store.saveTankCode(buddyActor('agent-one', 'other-user', 'Strategy Buddy'), {
      tankId: team.tankId,
      code: 'function onIdle(me) { me.tank.fire(); }',
      notes: 'Face-to-face fire first.',
    })

    expect(updated.owner.userId).toBe(pilot.userId)
    expect(updated.submittedBy).toBe('Strategy Buddy')
    expect(updated.notes).toBe('Face-to-face fire first.')
    expect(store.getTank(team.tankId)?.code).toContain('me.tank.fire')
    expect(() =>
      store.saveTankCode(buddyActor('agent-two', 'other-user', 'Other Buddy'), {
        tankId: team.tankId,
        code: 'function onIdle(me) { me.tank.aim("left"); }',
      }),
    ).toThrow('tank_not_owned_by_actor')
  })
})
