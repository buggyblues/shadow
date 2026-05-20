import {
  ArenasActivateInputSchema,
  ArenasCreateInputSchema,
  BoardEventsInputSchema,
  BoardGetInputSchema,
  BoardViewportUpdateInputSchema,
  CardsCommandInputSchema,
  CardsCreateInputSchema,
  CardsDeleteInputSchema,
  CardsGetInputSchema,
  CardsUpdateInputSchema,
  RoomsAttachInputSchema,
} from '@shadowob/flash-types/server-app'
import type { ShadowServerAppCommandContext, ShadowServerAppCommandName } from '@shadowob/sdk'
import { shadowApp } from '../manifest.js'
import type { FlashService } from '../service/flash.service.js'
import { shadowServerAppManifest } from '../shadow-app.generated.js'
import { parseInput } from '../validators/input.js'

export type FlashCommandName = ShadowServerAppCommandName<typeof shadowServerAppManifest>

export function commandName(value: string): FlashCommandName | null {
  return shadowServerAppManifest.commands.some((command) => command.name === value)
    ? (value as FlashCommandName)
    : null
}

export function localContext(command: FlashCommandName): ShadowServerAppCommandContext {
  const manifestCommand = shadowServerAppManifest.commands.find((item) => item.name === command)
  return {
    protocol: 'shadow.app/1',
    serverId: 'local',
    serverAppId: 'local',
    appKey: shadowServerAppManifest.appKey,
    command,
    actor: {
      kind: 'local',
      userId: 'local',
      ownerId: 'local',
      profile: {
        id: 'local',
        displayName: 'Local User',
        avatarUrl: null,
      },
    },
    permission: manifestCommand?.permission ?? 'local',
    action: manifestCommand?.action ?? 'read',
    dataClass: manifestCommand?.dataClass ?? 'server-private',
  }
}

export function defineCommandHandlers(service: FlashService) {
  return shadowApp.defineCommands({
    'boards.get': (input, runtime) =>
      service.getBoard(parseInput(BoardGetInputSchema, input), runtime),
    'boards.events': (input, runtime) =>
      service.listBoardEvents(parseInput(BoardEventsInputSchema, input), runtime),
    'boards.viewport.update': (input, runtime) =>
      service.updateBoardViewport(parseInput(BoardViewportUpdateInputSchema, input), runtime),
    'cards.get': (input, runtime) =>
      service.getCard(parseInput(CardsGetInputSchema, input), runtime),
    'cards.create': (input, runtime) =>
      service.createCard(parseInput(CardsCreateInputSchema, input), runtime),
    'cards.update': (input, runtime) =>
      service.updateCard(parseInput(CardsUpdateInputSchema, input), runtime),
    'cards.delete': (input, runtime) =>
      service.deleteCard(parseInput(CardsDeleteInputSchema, input), runtime),
    'cards.command': (input, runtime) =>
      service.executeCommand(parseInput(CardsCommandInputSchema, input), runtime),
    'rooms.attach': (input, runtime) =>
      service.attachRoom(parseInput(RoomsAttachInputSchema, input), runtime),
    'arenas.create': (input, runtime) =>
      service.createArena(parseInput(ArenasCreateInputSchema, input), runtime),
    'arenas.activate': (input, runtime) =>
      service.activateArena(parseInput(ArenasActivateInputSchema, input), runtime),
  })
}
