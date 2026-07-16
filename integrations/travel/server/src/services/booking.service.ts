import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, readdirSync } from 'node:fs'
import { unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { extname, join } from 'node:path'
import { promisify } from 'node:util'
import type { BookingDao } from '../dao/booking.dao.js'
import { badRequest, notFound } from '../lib/errors.js'
import { createId } from '../lib/id.js'
import { nowIso } from '../lib/time.js'
import type { ImportJob, Reservation } from '../types.js'
import type {
  ConfirmImportJobBatchInput,
  ConfirmImportJobInput,
  CreateReservationInput,
  ImportBookingInput,
  UpdateReservationInput,
} from '../validators/travel.schema.js'
import { createReservationSchema } from '../validators/travel.schema.js'
import type { BudgetService } from './budget.service.js'

const execFileAsync = promisify(execFile)

export interface BookingImportOptions {
  llmProvider?: string
  llmBaseUrl?: string
  llmModel?: string
  llmApiKey?: string
}

function stringField(payload: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = payload[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

function numberField(payload: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = payload[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
      return Number(value)
    }
  }
  return undefined
}

function parseRawBookingText(rawText?: string): Record<string, unknown> {
  if (!rawText) return {}
  const confirmation = rawText.match(
    /(?:confirmation|booking|reservation)\s*(?:code|#|number)?\s*[:#-]?\s*([A-Z0-9-]{4,})/i,
  )
  const date = rawText.match(/\b(20\d{2}-\d{2}-\d{2})\b/)
  const provider = rawText.match(/(?:provider|airline|hotel|operator)\s*[:#-]?\s*([^\n\r]+)/i)
  const title = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 2 && line.length <= 120)
  return {
    title,
    provider: provider?.[1]?.trim(),
    confirmationCode: confirmation?.[1]?.trim(),
    startAt: date?.[1],
  }
}

function schemaOrgReservationToPayload(record: Record<string, unknown>) {
  const type = stringField(record, ['@type', 'type'])
  const reservationFor = asRecord(record.reservationFor)
  const underName = asRecord(record.underName)
  const provider = asRecord(reservationFor.provider) ?? asRecord(record.provider)
  const departure =
    asRecord(reservationFor.departureAirport) ?? asRecord(reservationFor.departureStation)
  const arrival = asRecord(reservationFor.arrivalAirport) ?? asRecord(reservationFor.arrivalStation)
  const lodging = asRecord(reservationFor.lodgingBusiness) ?? reservationFor
  const priceSpecification = asRecord(record.totalPrice) ?? asRecord(record.priceSpecification)
  const kind =
    type?.includes('Flight') || stringField(reservationFor, ['flightNumber'])
      ? 'flight'
      : type?.includes('Lodging') || type?.includes('Hotel')
        ? 'accommodation'
        : type?.includes('Train')
          ? 'train'
          : type?.includes('Bus')
            ? 'bus'
            : undefined
  return {
    kind,
    title:
      stringField(reservationFor, ['name']) ??
      stringField(record, ['name']) ??
      stringField(lodging, ['name']),
    provider:
      stringField(provider, ['name']) ??
      stringField(record, ['provider']) ??
      stringField(reservationFor, ['airline']),
    confirmationCode: stringField(record, [
      'reservationNumber',
      'confirmationNumber',
      'bookingCode',
    ]),
    startAt:
      stringField(reservationFor, ['departureTime', 'checkinTime', 'startTime']) ??
      stringField(record, ['checkinTime']),
    endAt:
      stringField(reservationFor, ['arrivalTime', 'checkoutTime', 'endTime']) ??
      stringField(record, ['checkoutTime']),
    passengerNames: [stringField(underName, ['name'])].filter(Boolean),
    carrier: stringField(provider, ['name']),
    serviceNumber: stringField(reservationFor, ['flightNumber', 'trainNumber', 'busNumber']),
    departurePlace: stringField(departure, ['iataCode', 'name']),
    arrivalPlace: stringField(arrival, ['iataCode', 'name']),
    address: stringField(lodging, ['address']),
    amount:
      numberField(priceSpecification, ['price']) ?? numberField(record, ['totalPrice', 'price']),
    currency:
      stringField(priceSpecification, ['priceCurrency']) ?? stringField(record, ['priceCurrency']),
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function parseSuggestedReservation(
  input: ImportBookingInput,
  overridePayload?: Record<string, unknown>,
) {
  const payload: Record<string, unknown> = {
    ...input.payload,
    ...overridePayload,
    ...parseRawBookingText(input.rawText),
  }
  const amount = numberField(payload, ['amount', 'price', 'total', 'cost'])
  const currency = stringField(payload, ['currency'])
  const kind =
    (stringField(payload, ['kind']) as ImportBookingInput['kind'] | undefined) ?? input.kind
  const transportDetails =
    kind === 'flight' || kind === 'train' || kind === 'bus' || kind === 'ferry'
      ? {
          carrier: stringField(payload, ['carrier', 'airline', 'operator', 'provider']),
          serviceNumber: stringField(payload, [
            'serviceNumber',
            'flightNumber',
            'trainNumber',
            'number',
          ]),
          departurePlace: stringField(payload, ['departurePlace', 'from', 'origin']),
          arrivalPlace: stringField(payload, ['arrivalPlace', 'to', 'destination']),
          departureTerminal: stringField(payload, ['departureTerminal', 'terminal']),
          arrivalTerminal: stringField(payload, ['arrivalTerminal']),
          seat: stringField(payload, ['seat']),
          cabin: stringField(payload, ['cabin', 'class']),
        }
      : undefined
  const accommodationDetails =
    kind === 'accommodation'
      ? {
          address: stringField(payload, ['address', 'hotelAddress']),
          roomType: stringField(payload, ['roomType', 'room']),
          checkInTime: stringField(payload, ['checkInTime']),
          checkOutTime: stringField(payload, ['checkOutTime']),
          nights: numberField(payload, ['nights']),
        }
      : undefined
  const candidate = {
    kind,
    title: stringField(payload, ['title', 'name', 'summary', 'subject']) ?? 'Imported booking',
    status: stringField(payload, ['status']) ?? 'pending',
    provider: stringField(payload, ['provider', 'vendor', 'airline', 'hotel']),
    vendorUrl: stringField(payload, ['vendorUrl', 'url', 'bookingUrl']),
    confirmationCode: stringField(payload, [
      'confirmationCode',
      'confirmation',
      'bookingCode',
      'reservationCode',
      'code',
    ]),
    startAt: stringField(payload, ['startAt', 'startsAt', 'start', 'date', 'checkIn']),
    endAt: stringField(payload, ['endAt', 'endsAt', 'end', 'checkOut']),
    passengerNames: Array.isArray(payload.passengerNames)
      ? payload.passengerNames.filter((value): value is string => typeof value === 'string')
      : [],
    transportDetails,
    accommodationDetails,
    cost: amount !== undefined && currency ? { amount, currency } : undefined,
    rawImport: {
      ...input.payload,
      rawText: input.rawText,
    },
  }
  const parsed = createReservationSchema.safeParse(candidate)
  return parsed.success ? parsed.data : null
}

function findKitineraryBinary() {
  const envPath =
    process.env.KITINERARY_EXTRACTOR_PATH ?? process.env.TRAVEL_KITINERARY_EXTRACTOR_PATH
  if (envPath && existsSync(envPath)) return envPath
  try {
    for (const dir of readdirSync('/usr/lib')) {
      const candidate = join('/usr/lib', dir, 'libexec', 'kf6', 'kitinerary-extractor')
      if (existsSync(candidate)) return candidate
    }
  } catch {
    // Non-Linux installs normally use PATH or env.
  }
  return 'kitinerary-extractor'
}

async function extractWithKitinerary(input: ImportBookingInput) {
  if (!input.fileBase64 || !input.fileName) return []
  const binary = findKitineraryBinary()
  const ext = extname(input.fileName).toLowerCase()
  const filePath = join(tmpdir(), `shadow-travel-ki-${randomUUID()}${ext}`)
  try {
    await writeFile(filePath, Buffer.from(input.fileBase64, 'base64'))
    const { stdout } = await execFileAsync(binary, [filePath], {
      timeout: 30_000,
      maxBuffer: 5 * 1024 * 1024,
    })
    const parsed = JSON.parse(stdout.trim() || '[]') as unknown
    const records = Array.isArray(parsed) ? parsed : [parsed]
    return records.flatMap((record) =>
      record && typeof record === 'object'
        ? [schemaOrgReservationToPayload(record as Record<string, unknown>)]
        : [],
    )
  } catch {
    return []
  } finally {
    await unlink(filePath).catch(() => undefined)
  }
}

function fallbackTextFromFile(input: ImportBookingInput) {
  if (!input.fileBase64) return undefined
  const bytes = Buffer.from(input.fileBase64, 'base64')
  const text = bytes.toString('utf8')
  return /[\w\s]{40,}/.test(text) ? text.slice(0, 60_000) : undefined
}

const reservationExtractionSchema = {
  type: 'object',
  properties: {
    reservations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string' },
          title: { type: 'string' },
          provider: { type: 'string' },
          confirmationCode: { type: 'string' },
          startAt: { type: 'string' },
          endAt: { type: 'string' },
          carrier: { type: 'string' },
          serviceNumber: { type: 'string' },
          departurePlace: { type: 'string' },
          arrivalPlace: { type: 'string' },
          address: { type: 'string' },
          amount: { type: 'number' },
          currency: { type: 'string' },
          passengerNames: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: true,
      },
    },
  },
  required: ['reservations'],
  additionalProperties: false,
}

async function extractWithLlm(input: ImportBookingInput, options?: BookingImportOptions) {
  const provider = options?.llmProvider ?? process.env.TRAVEL_LLM_PROVIDER
  const model = options?.llmModel ?? process.env.TRAVEL_LLM_MODEL
  if (!provider || !model) return []
  const rawText = input.rawText ?? fallbackTextFromFile(input)
  const prompt =
    'Extract every travel reservation from the document. Return JSON with a reservations array. Use ISO strings for dates when possible.'
  const apiKey = options?.llmApiKey ?? process.env.TRAVEL_LLM_API_KEY
  const records =
    provider === 'anthropic'
      ? await extractWithAnthropic({
          input,
          rawText,
          prompt,
          model,
          apiKey,
          baseUrl: options?.llmBaseUrl,
        })
      : await extractWithOpenAiCompatible({
          rawText,
          prompt,
          model,
          apiKey,
          baseUrl: options?.llmBaseUrl,
        })
  return records.flatMap((record) =>
    record && typeof record === 'object' ? [record as Record<string, unknown>] : [],
  )
}

async function extractWithAnthropic(input: {
  input: ImportBookingInput
  rawText?: string
  prompt: string
  model: string
  apiKey?: string
  baseUrl?: string
}) {
  if (!input.apiKey) return []
  const content: unknown[] = []
  if (input.input.fileBase64 && input.input.mimeType) {
    content.push({
      type: 'document',
      source: {
        type: 'base64',
        media_type: input.input.mimeType,
        data: input.input.fileBase64,
      },
    })
  }
  content.push({
    type: 'text',
    text: input.rawText ?? 'Extract reservations from the attached file.',
  })
  const response = await fetch(
    `${(input.baseUrl ?? 'https://api.anthropic.com').replace(/\/+$/, '')}/v1/messages`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': input.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: input.model,
        max_tokens: 8192,
        system: input.prompt,
        tools: [
          {
            name: 'emit_reservations',
            description: 'Return extracted travel reservations.',
            input_schema: reservationExtractionSchema,
          },
        ],
        tool_choice: { type: 'tool', name: 'emit_reservations' },
        messages: [{ role: 'user', content }],
      }),
      signal: AbortSignal.timeout(120_000),
    },
  ).catch(() => null)
  if (!response?.ok) return []
  const data = (await response.json().catch(() => null)) as {
    content?: Array<{ type?: string; name?: string; input?: { reservations?: unknown } }>
  } | null
  const reservations = data?.content?.find((item) => item.type === 'tool_use')?.input?.reservations
  return Array.isArray(reservations) ? (reservations as Record<string, unknown>[]) : []
}

async function extractWithOpenAiCompatible(input: {
  rawText?: string
  prompt: string
  model: string
  apiKey?: string
  baseUrl?: string
}) {
  if (!input.rawText) return []
  const response = await fetch(
    `${(input.baseUrl ?? 'https://api.openai.com/v1').replace(/\/+$/, '')}/chat/completions`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(input.apiKey ? { authorization: `Bearer ${input.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: input.model,
        temperature: 0,
        max_tokens: 4096,
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'reservations', schema: reservationExtractionSchema, strict: false },
        },
        messages: [
          { role: 'system', content: input.prompt },
          { role: 'user', content: input.rawText },
        ],
      }),
      signal: AbortSignal.timeout(300_000),
    },
  ).catch(() => null)
  if (!response?.ok) return []
  const data = (await response.json().catch(() => null)) as {
    choices?: Array<{ message?: { content?: string } }>
  } | null
  const content = data?.choices?.[0]?.message?.content
  if (!content) return []
  try {
    const parsed = JSON.parse(
      content
        .replace(/^```(?:json)?/i, '')
        .replace(/```$/, '')
        .trim(),
    ) as {
      reservations?: unknown
    }
    return Array.isArray(parsed.reservations)
      ? (parsed.reservations as Record<string, unknown>[])
      : []
  } catch {
    return []
  }
}

export class BookingService {
  constructor(
    private readonly bookingDao: BookingDao,
    private readonly budgetService: BudgetService,
  ) {}

  listReservations(tripId: string) {
    return this.bookingDao.listReservations(tripId)
  }

  async createReservation(tripId: string, input: CreateReservationInput) {
    const timestamp = nowIso()
    const sequence =
      input.sequence ?? ((await this.bookingDao.listReservations(tripId)).length + 1) * 100
    const reservation: Reservation = {
      id: createId('resv'),
      tripId,
      kind: input.kind,
      title: input.title,
      status: input.status,
      provider: input.provider,
      vendorUrl: input.vendorUrl,
      confirmationCode: input.confirmationCode,
      startAt: input.startAt,
      endAt: input.endAt,
      locationPlaceId: input.locationPlaceId,
      checkInDayId: input.checkInDayId,
      checkOutDayId: input.checkOutDayId,
      sequence,
      guestIds: input.guestIds,
      participantMemberIds: input.participantMemberIds,
      passengerNames: input.passengerNames,
      attachmentIds: input.attachmentIds,
      cost: input.cost,
      transportDetails: input.transportDetails,
      accommodationDetails: input.accommodationDetails,
      contact: input.contact,
      cancellationPolicy: input.cancellationPolicy,
      rawImport: input.rawImport,
      externalSource: input.externalSource,
      externalId: input.externalId,
      externalOwnerUserId: input.externalOwnerUserId,
      externalHash: input.externalHash,
      externalSyncedAt: input.externalSyncedAt,
      syncEnabled: input.syncEnabled,
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    const saved = await this.bookingDao.createReservation(reservation)
    if (!input.createExpense || !input.cost) return saved

    const expense = await this.budgetService.createExpense(tripId, {
      title: input.title,
      category: input.kind === 'accommodation' ? 'accommodation' : 'transport',
      amount: input.cost.amount,
      currency: input.cost.currency,
      participantMemberIds: [],
      splitMode: 'equal',
      shares: [],
      paidMemberIds: [],
      reservationId: saved.id,
      status: 'pending',
    })
    const linked = await this.bookingDao.updateReservation(saved.id, (item) => ({
      ...item,
      expenseId: expense.id,
      updatedAt: nowIso(),
    }))
    return linked ?? saved
  }

  async updateReservation(tripId: string, reservationId: string, input: UpdateReservationInput) {
    const current = await this.bookingDao.findReservation(reservationId)
    if (!current || current.tripId !== tripId) throw notFound('Reservation')
    const { createExpense: _createExpense, ...reservationInput } = input
    const updated = await this.bookingDao.updateReservation(reservationId, (reservation) => ({
      ...reservation,
      ...reservationInput,
      updatedAt: nowIso(),
    }))
    if (!updated) throw notFound('Reservation')
    return updated
  }

  async deleteReservation(tripId: string, reservationId: string) {
    const current = await this.bookingDao.findReservation(reservationId)
    if (!current || current.tripId !== tripId) throw notFound('Reservation')
    const deleted = await this.bookingDao.deleteReservation(reservationId)
    if (!deleted) throw notFound('Reservation')
    return deleted
  }

  async setReservationStatus(tripId: string, reservationId: string, status: Reservation['status']) {
    return this.updateReservation(tripId, reservationId, { status })
  }

  async reorderReservations(tripId: string, orderedIds: string[]) {
    const reordered = await this.bookingDao.reorderReservations(tripId, orderedIds)
    if (!reordered) throw notFound('Reservation')
    return this.bookingDao.listReservations(tripId)
  }

  listImportJobs(tripId: string) {
    return this.bookingDao.listImportJobs(tripId)
  }

  async importBooking(tripId: string, input: ImportBookingInput, options?: BookingImportOptions) {
    const timestamp = nowIso()
    let extractedPayloads: Record<string, unknown>[] = []
    if (!input.reservation && input.parseMode !== 'force-ai') {
      extractedPayloads = await extractWithKitinerary(input)
    }
    if (
      !input.reservation &&
      input.parseMode !== 'no-ai' &&
      (input.parseMode === 'force-ai' || extractedPayloads.length === 0)
    ) {
      extractedPayloads = await extractWithLlm(input, options)
    }
    const suggestedReservations = extractedPayloads
      .map((payload) => parseSuggestedReservation(input, payload))
      .filter((reservation): reservation is CreateReservationInput => Boolean(reservation))
    const suggestedReservation =
      input.reservation ?? suggestedReservations[0] ?? parseSuggestedReservation(input)
    const job: ImportJob = {
      id: createId('import'),
      tripId,
      kind: input.kind,
      source: input.source,
      status: suggestedReservation ? 'completed' : 'failed',
      parsedPayload: {
        ...input.payload,
        rawText: input.rawText,
        suggestedReservation,
        suggestedReservations,
        extraction: {
          kitineraryAttempted: Boolean(input.fileBase64 && input.parseMode !== 'force-ai'),
          aiAttempted:
            Boolean(input.parseMode !== 'no-ai') &&
            (input.parseMode === 'force-ai' || extractedPayloads.length > 0),
        },
        requiresConfirmation: !input.reservation,
      },
      error: suggestedReservation ? undefined : 'Could not parse booking details',
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    const created = await this.bookingDao.createImportJob(job)
    if (!input.reservation) return created

    const reservation = await this.createReservation(tripId, {
      ...input.reservation,
      rawImport: input.payload,
    })
    const completed = await this.bookingDao.updateImportJob(created.id, (item) => ({
      ...item,
      status: 'completed',
      parsedPayload: { ...input.payload, reservationId: reservation.id },
      updatedAt: nowIso(),
    }))
    return completed ?? created
  }

  async confirmImportJob(tripId: string, jobId: string, input: ConfirmImportJobInput) {
    const job = await this.bookingDao.findImportJob(jobId)
    if (!job || job.tripId !== tripId) throw notFound('Import job')
    const suggested =
      input.reservation ??
      (job.parsedPayload?.suggestedReservation as CreateReservationInput | undefined)
    const parsed = createReservationSchema.safeParse({
      ...suggested,
      createExpense: input.createExpense ?? suggested?.createExpense ?? true,
    })
    if (!parsed.success) throw badRequest('Import job does not contain a valid reservation')
    const reservation = await this.createReservation(tripId, parsed.data)
    const updated = await this.bookingDao.updateImportJob(job.id, (item) => ({
      ...item,
      status: 'completed',
      parsedPayload: {
        ...item.parsedPayload,
        reservationId: reservation.id,
        confirmedAt: nowIso(),
      },
      error: undefined,
      updatedAt: nowIso(),
    }))
    return { job: updated ?? job, reservation }
  }

  async confirmImportJobBatch(tripId: string, jobId: string, input: ConfirmImportJobBatchInput) {
    const job = await this.bookingDao.findImportJob(jobId)
    if (!job || job.tripId !== tripId) throw notFound('Import job')
    const suggested = Array.isArray(job.parsedPayload?.suggestedReservations)
      ? (job.parsedPayload.suggestedReservations as CreateReservationInput[])
      : []
    const candidates =
      input.reservations.length > 0
        ? input.reservations
        : input.indexes.length > 0
          ? input.indexes.flatMap((index) => (suggested[index] ? [suggested[index]] : []))
          : suggested
    const reservations: Reservation[] = []
    const errors: Array<{ index: number; error: unknown }> = []
    for (const [index, candidate] of candidates.entries()) {
      const parsed = createReservationSchema.safeParse({
        ...candidate,
        createExpense: input.createExpense ?? candidate.createExpense ?? true,
      })
      if (!parsed.success) {
        errors.push({ index, error: parsed.error.flatten() })
        continue
      }
      reservations.push(await this.createReservation(tripId, parsed.data))
    }
    const updated = await this.bookingDao.updateImportJob(job.id, (item) => ({
      ...item,
      status: errors.length && reservations.length === 0 ? 'failed' : 'completed',
      parsedPayload: {
        ...item.parsedPayload,
        reservationIds: reservations.map((reservation) => reservation.id),
        batchConfirmedAt: nowIso(),
        batchErrors: errors,
      },
      error:
        errors.length && reservations.length === 0 ? 'No valid reservations confirmed' : undefined,
      updatedAt: nowIso(),
    }))
    return { job: updated ?? job, reservations, errors }
  }

  async syncAirtrailFlights(
    tripId: string,
    flights: Array<Record<string, unknown>>,
    ownerUserId?: string,
  ) {
    const existing = await this.bookingDao.listReservations(tripId)
    const linked = existing.filter(
      (reservation) =>
        reservation.externalSource === 'airtrail' && reservation.syncEnabled !== false,
    )
    const byExternalId = new Map(
      flights
        .map((flight) => [String(flight.id ?? ''), flight] as const)
        .filter(([id]) => Boolean(id)),
    )
    const changed = []
    const detached = []
    for (const reservation of linked) {
      if (!reservation.externalId) continue
      const flight = byExternalId.get(reservation.externalId)
      if (!flight) {
        const updated = await this.bookingDao.updateReservation(reservation.id, (item) => ({
          ...item,
          syncEnabled: false,
          externalSyncedAt: nowIso(),
          updatedAt: nowIso(),
        }))
        if (updated) detached.push(updated)
        continue
      }
      const mapped = parseSuggestedReservation(
        { kind: 'flight', source: 'provider', payload: flight, parseMode: 'fallback-on-empty' },
        flight,
      )
      if (!mapped) continue
      const hash = createExternalHash(flight)
      if (hash === reservation.externalHash) continue
      const updated = await this.bookingDao.updateReservation(reservation.id, (item) => ({
        ...item,
        ...mapped,
        id: item.id,
        tripId: item.tripId,
        externalSource: 'airtrail',
        externalId: String(flight.id),
        externalOwnerUserId: item.externalOwnerUserId ?? ownerUserId,
        externalHash: hash,
        externalSyncedAt: nowIso(),
        syncEnabled: item.syncEnabled ?? true,
        updatedAt: nowIso(),
      }))
      if (updated) changed.push(updated)
    }
    return { changed, detached }
  }
}

function createExternalHash(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString('base64url').slice(0, 120)
}
