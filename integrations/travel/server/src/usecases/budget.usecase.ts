import type { AccessPolicy } from '../security/access-policy.js'
import type { BudgetService } from '../services/budget.service.js'
import type { RequestContext } from '../types.js'
import type {
  BudgetAnalyticsInput,
  ConvertExpensesInput,
  CreateExpenseInput,
  CreateSettlementRecordInput,
  SetExpenseMembersInput,
  SettlementRecordStatusInput,
  SettlementTransferPaidInput,
  ToggleExpensePaidInput,
  UpdateExpenseInput,
} from '../validators/travel.schema.js'
import type { TravelEventBus } from '../ws/travel-events.js'

export class BudgetUseCase {
  constructor(
    private readonly budgetService: BudgetService,
    private readonly accessPolicy: AccessPolicy,
    private readonly eventBus: TravelEventBus,
  ) {}

  async listExpenses(ctx: RequestContext, tripId: string) {
    await this.accessPolicy.requireTripRead(ctx, tripId)
    return this.budgetService.listExpenses(tripId)
  }

  async settlement(ctx: RequestContext, tripId: string) {
    await this.accessPolicy.requireTripRead(ctx, tripId)
    const expenses = await this.budgetService.listExpenses(tripId)
    return this.budgetService.settle(expenses)
  }

  async exportCsv(ctx: RequestContext, tripId: string) {
    await this.accessPolicy.requireTripRead(ctx, tripId)
    const expenses = await this.budgetService.listExpenses(tripId)
    return this.budgetService.exportCsv(expenses)
  }

  async convertTotals(ctx: RequestContext, tripId: string, input: ConvertExpensesInput) {
    await this.accessPolicy.requireTripRead(ctx, tripId)
    const expenses = await this.budgetService.listExpenses(tripId)
    return this.budgetService.convertTotalsWithProvider(expenses, input)
  }

  async analytics(ctx: RequestContext, tripId: string, input: BudgetAnalyticsInput) {
    await this.accessPolicy.requireTripRead(ctx, tripId)
    const expenses = await this.budgetService.listExpenses(tripId)
    return this.budgetService.analytics(expenses, input)
  }

  async listSettlementRecords(ctx: RequestContext, tripId: string) {
    await this.accessPolicy.requireTripRead(ctx, tripId)
    return this.budgetService.listSettlementRecords(tripId)
  }

  async createSettlementRecords(
    ctx: RequestContext,
    tripId: string,
    input: CreateSettlementRecordInput,
  ) {
    const access = await this.accessPolicy.requireTripWrite(ctx, tripId)
    const records = await this.budgetService.createSettlementRecords(
      tripId,
      input,
      access.member?.id,
    )
    this.eventBus.emit({ type: 'expense.settlement_records.created', tripId, payload: { records } })
    return records
  }

  async confirmSettlementRecord(
    ctx: RequestContext,
    tripId: string,
    recordId: string,
    input: SettlementRecordStatusInput,
  ) {
    await this.accessPolicy.requireTripWrite(ctx, tripId)
    const record = await this.budgetService.confirmSettlementRecord(tripId, recordId, input)
    this.eventBus.emit({ type: 'expense.settlement_record.confirmed', tripId, payload: { record } })
    return record
  }

  async cancelSettlementRecord(
    ctx: RequestContext,
    tripId: string,
    recordId: string,
    input: SettlementRecordStatusInput,
  ) {
    await this.accessPolicy.requireTripWrite(ctx, tripId)
    const record = await this.budgetService.cancelSettlementRecord(tripId, recordId, input)
    this.eventBus.emit({ type: 'expense.settlement_record.cancelled', tripId, payload: { record } })
    return record
  }

  async setSettlementTransferPaid(
    ctx: RequestContext,
    tripId: string,
    recordId: string,
    input: SettlementTransferPaidInput,
  ) {
    await this.accessPolicy.requireTripWrite(ctx, tripId)
    const record = await this.budgetService.setSettlementTransferPaid(tripId, recordId, input)
    this.eventBus.emit({ type: 'expense.settlement_transfer.updated', tripId, payload: { record } })
    return record
  }

  async createExpense(ctx: RequestContext, tripId: string, input: CreateExpenseInput) {
    await this.accessPolicy.requireTripWrite(ctx, tripId)
    const expense = await this.budgetService.createExpense(tripId, input)
    this.eventBus.emit({ type: 'expense.created', tripId, payload: { expense } })
    return expense
  }

  async updateExpense(
    ctx: RequestContext,
    tripId: string,
    expenseId: string,
    input: UpdateExpenseInput,
  ) {
    await this.accessPolicy.requireTripWrite(ctx, tripId)
    const expense = await this.budgetService.updateExpense(tripId, expenseId, input)
    this.eventBus.emit({ type: 'expense.updated', tripId, payload: { expense } })
    return expense
  }

  async setExpenseMembers(
    ctx: RequestContext,
    tripId: string,
    expenseId: string,
    input: SetExpenseMembersInput,
  ) {
    await this.accessPolicy.requireTripWrite(ctx, tripId)
    const expense = await this.budgetService.setExpenseMembers(tripId, expenseId, input)
    this.eventBus.emit({ type: 'expense.members_updated', tripId, payload: { expense } })
    return expense
  }

  async toggleExpensePaid(
    ctx: RequestContext,
    tripId: string,
    expenseId: string,
    input: ToggleExpensePaidInput,
  ) {
    await this.accessPolicy.requireTripWrite(ctx, tripId)
    const expense = await this.budgetService.toggleExpensePaid(tripId, expenseId, input)
    this.eventBus.emit({ type: 'expense.paid_updated', tripId, payload: { expense } })
    return expense
  }

  async deleteExpense(ctx: RequestContext, tripId: string, expenseId: string) {
    await this.accessPolicy.requireTripWrite(ctx, tripId)
    const expense = await this.budgetService.deleteExpense(tripId, expenseId)
    this.eventBus.emit({ type: 'expense.deleted', tripId, payload: { expense } })
    return expense
  }

  async reorderExpenses(ctx: RequestContext, tripId: string, orderedIds: string[]) {
    await this.accessPolicy.requireTripWrite(ctx, tripId)
    const expenses = await this.budgetService.reorderExpenses(tripId, orderedIds)
    this.eventBus.emit({ type: 'expense.reordered', tripId, payload: { expenses } })
    return expenses
  }
}
