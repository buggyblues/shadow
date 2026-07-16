import { z } from 'zod'
import type { AppContainer } from '../container.js'
import { badRequest } from '../lib/errors.js'
import type { RequestContext } from '../types.js'
import {
  bindTripBuddySchema,
  bulkImportPackingSchema,
  createAttachmentSchema,
  createAutomationTaskSchema,
  createBackupSchema,
  createDaySchema,
  createDecisionRefSchema,
  createDiscussionRefSchema,
  createGuestSchema,
  createInviteSchema,
  createMemberSchema,
  createPackingBagSchema,
  createPackingItemSchema,
  reorderAssignmentsSchema,
  reorderIdsSchema,
  reorderPackingItemsSchema,
  reorderTodosSchema,
  reservationStatusSchema,
  reviewBuddyPlanSchema,
  setExpenseMembersSchema,
  shareTripToCommunitySchema,
  toggleExpensePaidSchema,
  toggleTodoSchema,
  updateAssignmentSchema,
  updateDaySchema,
  updateExpenseSchema,
  updateGuestSchema,
  updateMemberSchema,
  updatePackingBagSchema,
  updatePackingItemSchema,
  updatePlaceSchema,
  updateReservationSchema,
  updateTodoSchema,
  updateTripSchema,
  updateTripSettingsSchema,
} from '../validators/travel.schema.js'

export const tripActionNames = [
  'trip.update',
  'trip.archive',
  'trip.copy',
  'trip.delete',
  'member.add',
  'member.update',
  'member.remove',
  'member.transferOwner',
  'guest.add',
  'guest.update',
  'guest.remove',
  'invite.create',
  'invite.revoke',
  'day.add',
  'day.update',
  'day.remove',
  'place.update',
  'place.remove',
  'assignment.update',
  'assignment.remove',
  'assignment.reorder',
  'reservation.update',
  'reservation.remove',
  'reservation.setStatus',
  'reservation.reorder',
  'expense.update',
  'expense.remove',
  'expense.setMembers',
  'expense.setPaid',
  'expense.reorder',
  'packingBag.add',
  'packingBag.update',
  'packingBag.remove',
  'packingItem.add',
  'packingItem.update',
  'packingItem.remove',
  'packingItem.reorder',
  'packingItem.bulkImport',
  'todo.update',
  'todo.toggle',
  'todo.remove',
  'todo.reorder',
  'attachment.add',
  'attachment.remove',
  'discussion.add',
  'decision.add',
  'shareLink.revoke',
  'settings.update',
  'backup.create',
  'backup.restore',
  'automation.create',
  'buddy.bind',
  'buddy.revoke',
  'buddy.reviewPlan',
  'community.share',
] as const

export const tripActionCommandSchema = z.object({
  tripId: z.string().trim().min(1).max(120),
  action: z.enum(tripActionNames),
  targetId: z.string().trim().min(1).max(160).optional(),
  input: z.record(z.unknown()).default({}),
})

export type TripActionCommand = z.infer<typeof tripActionCommandSchema>

function targetId(command: TripActionCommand) {
  if (!command.targetId) throw badRequest(`targetId is required for ${command.action}`)
  return command.targetId
}

function input<T extends z.ZodTypeAny>(schema: T, command: TripActionCommand): z.output<T> {
  const parsed = schema.safeParse(command.input)
  if (!parsed.success) {
    throw badRequest(`Invalid input for ${command.action}`, parsed.error.flatten())
  }
  return parsed.data
}

export async function executeTripAction(
  container: AppContainer,
  ctx: RequestContext,
  command: TripActionCommand,
) {
  const { tripId, action } = command
  if (action === 'trip.update')
    return container.tripUseCase.updateTrip(ctx, tripId, input(updateTripSchema, command))
  if (action === 'trip.archive') return container.tripUseCase.archiveTrip(ctx, tripId)
  if (action === 'trip.copy') return container.tripUseCase.copyTrip(ctx, tripId)
  if (action === 'trip.delete') return container.tripUseCase.deleteTrip(ctx, tripId)

  if (action === 'member.add')
    return container.tripUseCase.addMember(ctx, tripId, input(createMemberSchema, command))
  if (action === 'member.update')
    return container.tripUseCase.updateMember(
      ctx,
      tripId,
      targetId(command),
      input(updateMemberSchema, command),
    )
  if (action === 'member.remove')
    return container.tripUseCase.removeMember(ctx, tripId, targetId(command))
  if (action === 'member.transferOwner')
    return container.tripUseCase.transferOwner(ctx, tripId, targetId(command))

  if (action === 'guest.add')
    return container.tripUseCase.createGuest(ctx, tripId, input(createGuestSchema, command))
  if (action === 'guest.update')
    return container.tripUseCase.updateGuest(
      ctx,
      tripId,
      targetId(command),
      input(updateGuestSchema, command),
    )
  if (action === 'guest.remove')
    return container.tripUseCase.deleteGuest(ctx, tripId, targetId(command))
  if (action === 'invite.create')
    return container.tripUseCase.createInvite(ctx, tripId, input(createInviteSchema, command))
  if (action === 'invite.revoke')
    return container.tripUseCase.revokeInvite(ctx, tripId, targetId(command))

  if (action === 'day.add')
    return container.planningUseCase.createDay(ctx, tripId, input(createDaySchema, command))
  if (action === 'day.update')
    return container.planningUseCase.updateDay(
      ctx,
      tripId,
      targetId(command),
      input(updateDaySchema, command),
    )
  if (action === 'day.remove')
    return container.planningUseCase.deleteDay(ctx, tripId, targetId(command))
  if (action === 'place.update')
    return container.planningUseCase.updatePlace(
      ctx,
      tripId,
      targetId(command),
      input(updatePlaceSchema, command),
    )
  if (action === 'place.remove')
    return container.planningUseCase.deletePlace(ctx, tripId, targetId(command))
  if (action === 'assignment.update')
    return container.planningUseCase.updateAssignment(
      ctx,
      tripId,
      targetId(command),
      input(updateAssignmentSchema, command),
    )
  if (action === 'assignment.remove')
    return container.planningUseCase.deleteAssignment(ctx, tripId, targetId(command))
  if (action === 'assignment.reorder')
    return container.planningUseCase.reorderAssignments(
      ctx,
      tripId,
      input(reorderAssignmentsSchema, command),
    )

  if (action === 'reservation.update')
    return container.bookingUseCase.updateReservation(
      ctx,
      tripId,
      targetId(command),
      input(updateReservationSchema, command),
    )
  if (action === 'reservation.remove')
    return container.bookingUseCase.deleteReservation(ctx, tripId, targetId(command))
  if (action === 'reservation.setStatus')
    return container.bookingUseCase.setReservationStatus(
      ctx,
      tripId,
      targetId(command),
      input(reservationStatusSchema, command).status,
    )
  if (action === 'reservation.reorder')
    return container.bookingUseCase.reorderReservations(
      ctx,
      tripId,
      input(reorderIdsSchema, command).orderedIds,
    )

  if (action === 'expense.update')
    return container.budgetUseCase.updateExpense(
      ctx,
      tripId,
      targetId(command),
      input(updateExpenseSchema, command),
    )
  if (action === 'expense.remove')
    return container.budgetUseCase.deleteExpense(ctx, tripId, targetId(command))
  if (action === 'expense.setMembers')
    return container.budgetUseCase.setExpenseMembers(
      ctx,
      tripId,
      targetId(command),
      input(setExpenseMembersSchema, command),
    )
  if (action === 'expense.setPaid')
    return container.budgetUseCase.toggleExpensePaid(
      ctx,
      tripId,
      targetId(command),
      input(toggleExpensePaidSchema, command),
    )
  if (action === 'expense.reorder')
    return container.budgetUseCase.reorderExpenses(
      ctx,
      tripId,
      input(reorderIdsSchema, command).orderedIds,
    )

  if (action === 'packingBag.add')
    return container.packingUseCase.createBag(ctx, tripId, input(createPackingBagSchema, command))
  if (action === 'packingBag.update')
    return container.packingUseCase.updateBag(
      ctx,
      tripId,
      targetId(command),
      input(updatePackingBagSchema, command),
    )
  if (action === 'packingBag.remove')
    return container.packingUseCase.deleteBag(ctx, tripId, targetId(command))
  if (action === 'packingItem.add')
    return container.packingUseCase.createItem(ctx, tripId, input(createPackingItemSchema, command))
  if (action === 'packingItem.update')
    return container.packingUseCase.updateItem(
      ctx,
      tripId,
      targetId(command),
      input(updatePackingItemSchema, command),
    )
  if (action === 'packingItem.remove')
    return container.packingUseCase.deleteItem(ctx, tripId, targetId(command))
  if (action === 'packingItem.reorder')
    return container.packingUseCase.reorderItems(
      ctx,
      tripId,
      input(reorderPackingItemsSchema, command),
    )
  if (action === 'packingItem.bulkImport')
    return container.packingUseCase.bulkImport(ctx, tripId, input(bulkImportPackingSchema, command))

  if (action === 'todo.update')
    return container.todoUseCase.updateTodo(
      ctx,
      tripId,
      targetId(command),
      input(updateTodoSchema, command),
    )
  if (action === 'todo.toggle')
    return container.todoUseCase.toggleTodo(
      ctx,
      tripId,
      targetId(command),
      input(toggleTodoSchema, command).done,
    )
  if (action === 'todo.remove')
    return container.todoUseCase.deleteTodo(ctx, tripId, targetId(command))
  if (action === 'todo.reorder')
    return container.todoUseCase.reorderTodos(ctx, tripId, input(reorderTodosSchema, command))

  if (action === 'attachment.add')
    return container.collaborationUseCase.createAttachment(
      ctx,
      tripId,
      input(createAttachmentSchema, command),
    )
  if (action === 'attachment.remove')
    return container.collaborationUseCase.deleteAttachment(ctx, tripId, targetId(command))
  if (action === 'discussion.add')
    return container.collaborationUseCase.createDiscussionRef(
      ctx,
      tripId,
      input(createDiscussionRefSchema, command),
    )
  if (action === 'decision.add')
    return container.collaborationUseCase.createDecisionRef(
      ctx,
      tripId,
      input(createDecisionRefSchema, command),
    )
  if (action === 'shareLink.revoke')
    return container.collaborationUseCase.revokeShareLink(ctx, tripId, targetId(command))
  if (action === 'settings.update')
    return container.settingsUseCase.updateTripSettings(
      ctx,
      tripId,
      input(updateTripSettingsSchema, command),
    )
  if (action === 'backup.create')
    return container.backupUseCase.createTripBackup(ctx, tripId, input(createBackupSchema, command))
  if (action === 'backup.restore')
    return container.backupUseCase.restoreTripBackup(ctx, tripId, targetId(command))
  if (action === 'automation.create')
    return container.automationUseCase.createTask(
      ctx,
      tripId,
      input(createAutomationTaskSchema, command),
    )
  if (action === 'buddy.bind')
    return container.communityUseCase.bindBuddy(ctx, tripId, input(bindTripBuddySchema, command))
  if (action === 'buddy.revoke')
    return container.communityUseCase.revokeBuddy(ctx, tripId, targetId(command))
  if (action === 'buddy.reviewPlan')
    return container.communityUseCase.reviewPlan(
      ctx,
      tripId,
      targetId(command),
      input(reviewBuddyPlanSchema, command).status,
    )
  if (action === 'community.share')
    return container.communityUseCase.shareTrip(
      ctx,
      tripId,
      input(shareTripToCommunitySchema, command),
    )

  throw badRequest(`Unsupported trip action: ${action}`)
}
