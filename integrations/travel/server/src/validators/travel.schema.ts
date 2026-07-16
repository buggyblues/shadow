import { z } from 'zod'

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const textSchema = z.string().trim().min(1).max(240)
const optionalTextSchema = z.string().trim().max(4000).optional()
const currencySchema = z
  .string()
  .trim()
  .min(3)
  .max(8)
  .transform((value) => value.toUpperCase())
const idSchema = z.string().trim().min(1).max(120)
const optionalIdSchema = z.string().trim().max(120).optional()
const hexColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/)

export const moneySchema = z.object({
  amount: z.number().finite().nonnegative(),
  currency: currencySchema,
})

export const coordinatesSchema = z.object({
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
})

const createTripBaseSchema = z.object({
  title: textSchema,
  summary: optionalTextSchema,
  coverImageRef: optionalIdSchema,
  coverPhotoUrl: z.string().url().optional(),
  timezone: z.string().trim().min(1).max(80).default('UTC'),
  currency: currencySchema.default('USD'),
  startDate: dateSchema.optional(),
  endDate: dateSchema.optional(),
  homeLocation: z.string().trim().max(240).optional(),
  destinationLabels: z.array(z.string().trim().min(1).max(120)).max(24).default([]),
})

export const createTripSchema = createTripBaseSchema.refine(
  (value) => !value.startDate || !value.endDate || value.startDate <= value.endDate,
  {
    message: 'startDate must be before or equal to endDate',
    path: ['endDate'],
  },
)

export const updateTripSchema = createTripBaseSchema
  .partial()
  .extend({
    status: z.enum(['draft', 'planning', 'active', 'completed', 'archived']).optional(),
  })
  .refine((value) => !value.startDate || !value.endDate || value.startDate <= value.endDate, {
    message: 'startDate must be before or equal to endDate',
    path: ['endDate'],
  })

export const upsertTripRecruitmentSchema = z.object({
  status: z.enum(['draft', 'open', 'paused', 'filled', 'closed']).optional(),
  maxMembers: z.number().int().min(2).max(100).optional(),
  departureCity: z.string().trim().max(160).optional(),
  flexibleDates: z.boolean().optional(),
  budgetMin: z.number().finite().nonnegative().optional(),
  budgetMax: z.number().finite().nonnegative().optional(),
  currency: currencySchema.optional(),
  styles: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
  note: z.string().trim().max(1200).optional(),
  questions: z.array(z.string().trim().min(1).max(160)).max(6).optional(),
  requiresApproval: z.boolean().optional(),
  closesAt: z.string().datetime().optional(),
  recruitmentChannelId: optionalIdSchema,
  memberChannelId: optionalIdSchema,
})

export const applyToTripSchema = z.object({
  message: z.string().trim().max(800).optional(),
  answers: z
    .array(
      z.object({
        question: z.string().trim().min(1).max(160),
        answer: z.string().trim().min(1).max(800),
      }),
    )
    .max(6)
    .default([]),
})

export const reviewTripApplicationSchema = z.object({
  status: z.enum(['needs_info', 'waitlisted', 'approved', 'rejected']),
  reviewNote: z.string().trim().max(800).optional(),
})

export const upsertTravelIntentSchema = z
  .object({
    destinationLabels: z.array(z.string().trim().min(1).max(120)).min(1).max(8),
    earliestDate: dateSchema.optional(),
    latestDate: dateSchema.optional(),
    flexibleDates: z.boolean().default(false),
    budgetMax: z.number().finite().nonnegative().optional(),
    currency: currencySchema.default('USD'),
    styles: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
    note: z.string().trim().max(800).optional(),
    status: z.enum(['open', 'matched', 'closed']).default('open'),
  })
  .refine(
    (value) => !value.earliestDate || !value.latestDate || value.earliestDate <= value.latestDate,
    { message: 'earliestDate must be before or equal to latestDate', path: ['latestDate'] },
  )

export const upsertClientStateSchema = z.object({
  expectedRevision: z.number().int().nonnegative().optional(),
  scope: z.enum(['global', 'trip', 'user']),
  tripId: optionalIdSchema,
  value: z.unknown(),
})

export const createEmergencyReportSchema = z.object({
  title: textSchema,
  category: z.enum(['weather', 'transport', 'safety', 'crowd', 'facility']),
  severity: z.enum(['urgent', 'high', 'medium']),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  expiresAt: z.string().datetime(),
})

export const createPlaceSchema = z.object({
  title: textSchema,
  kind: z
    .enum(['sight', 'restaurant', 'hotel', 'transport', 'activity', 'shopping', 'custom'])
    .default('custom'),
  address: z.string().trim().max(500).optional(),
  coordinates: coordinatesSchema.optional(),
  externalRefs: z.record(z.unknown()).optional(),
  costEstimate: moneySchema.optional(),
  durationMinutes: z.number().int().positive().max(1440).optional(),
  links: z.array(z.string().url()).max(24).default([]),
  tags: z.array(z.string().trim().min(1).max(64)).max(32).default([]),
  categoryId: optionalIdSchema,
  photoRefs: z.array(z.string().trim().min(1).max(240)).max(100).default([]),
  notes: optionalTextSchema,
})

export const updatePlaceSchema = createPlaceSchema.partial()

export const bulkCreatePlacesSchema = z.object({
  places: z.array(createPlaceSchema).min(1).max(100),
})

export const importPlacesSchema = z
  .object({
    source: z.enum(['geojson', 'gpx', 'kml', 'kmz', 'json']).default('geojson'),
    text: z.string().trim().min(1).max(500000).optional(),
    fileBase64: z.string().trim().min(1).max(20_000_000).optional(),
    payload: z.record(z.unknown()).optional(),
    defaultKind: createPlaceSchema.shape.kind.default('custom'),
    tags: z.array(z.string().trim().min(1).max(64)).max(32).default([]),
    categoryId: optionalIdSchema,
  })
  .refine((value) => value.text || value.fileBase64 || value.payload, {
    message: 'text, fileBase64, or payload is required',
    path: ['text'],
  })

export const saveProviderPlaceSchema = z.object({
  providerResult: z.record(z.unknown()),
  kind: createPlaceSchema.shape.kind.default('custom'),
  categoryId: optionalIdSchema,
  tags: z.array(z.string().trim().min(1).max(64)).max(32).default([]),
  notes: optionalTextSchema,
  photoRefs: z.array(z.string().trim().min(1).max(240)).max(100).default([]),
})

export const createAssignmentSchema = z.object({
  dayId: idSchema.optional(),
  placeId: idSchema.optional(),
  reservationId: idSchema.optional(),
  expenseId: idSchema.optional(),
  title: textSchema,
  kind: z.enum(['place', 'reservation', 'transport', 'note', 'free_time']).default('note'),
  startAt: z.string().trim().max(80).optional(),
  endAt: z.string().trim().max(80).optional(),
  timezone: z.string().trim().max(80).optional(),
  sequence: z.number().int().min(0).max(100000).optional(),
  status: z.enum(['idea', 'scheduled', 'done', 'skipped']).default('scheduled'),
  participantMemberIds: z.array(idSchema).max(100).default([]),
  notes: optionalTextSchema,
})

export const updateAssignmentSchema = createAssignmentSchema.partial()

export const reorderAssignmentsSchema = z.object({
  dayId: optionalIdSchema,
  orderedIds: z.array(idSchema).min(1).max(500),
})

export const optimizeRouteSchema = z.object({
  dayId: idSchema,
  mode: z.enum(['driving', 'walking', 'cycling']).default('driving'),
  lockedAssignmentIds: z.array(idSchema).max(200).default([]),
  startPlaceId: optionalIdSchema,
  endPlaceId: optionalIdSchema,
  apply: z.boolean().default(false),
})

export const exportRouteSchema = z
  .object({
    routeSegmentId: optionalIdSchema,
    dayId: optionalIdSchema,
    assignmentIds: z.array(idSchema).max(50).default([]),
    mode: z.enum(['driving', 'walking', 'cycling']).default('driving'),
    format: z.enum(['google_maps', 'geojson', 'both']).default('both'),
  })
  .refine((value) => value.routeSegmentId || value.dayId || value.assignmentIds.length >= 2, {
    message: 'routeSegmentId, dayId, or at least two assignmentIds are required',
    path: ['dayId'],
  })

export const saveTransitPlanSchema = z.object({
  dayId: optionalIdSchema,
  title: textSchema.default('Transit'),
  itinerary: z.record(z.unknown()),
  saveAs: z.enum(['reservation', 'assignment', 'both']).default('both'),
  participantMemberIds: z.array(idSchema).max(100).default([]),
})

export const reorderIdsSchema = z.object({
  orderedIds: z.array(idSchema).min(1).max(500),
})

export const createDaySchema = z.object({
  date: dateSchema,
  title: z.string().trim().max(160).optional(),
  timezone: z.string().trim().min(1).max(80).optional(),
  notes: optionalTextSchema,
})

export const updateDaySchema = createDaySchema.partial()

export const createReservationSchema = z.object({
  kind: z
    .enum([
      'accommodation',
      'flight',
      'train',
      'bus',
      'car',
      'ferry',
      'activity',
      'restaurant',
      'insurance',
      'other',
    ])
    .default('other'),
  title: textSchema,
  status: z.enum(['pending', 'confirmed', 'cancelled']).default('confirmed'),
  provider: z.string().trim().max(160).optional(),
  vendorUrl: z.string().url().optional(),
  confirmationCode: z.string().trim().max(160).optional(),
  startAt: z.string().trim().max(80).optional(),
  endAt: z.string().trim().max(80).optional(),
  locationPlaceId: optionalIdSchema,
  checkInDayId: optionalIdSchema,
  checkOutDayId: optionalIdSchema,
  sequence: z.number().int().min(0).max(100000).optional(),
  guestIds: z.array(idSchema).max(100).default([]),
  participantMemberIds: z.array(idSchema).max(100).default([]),
  passengerNames: z.array(z.string().trim().min(1).max(160)).max(100).default([]),
  attachmentIds: z.array(idSchema).max(100).default([]),
  cost: moneySchema.optional(),
  transportDetails: z
    .object({
      carrier: z.string().trim().max(160).optional(),
      serviceNumber: z.string().trim().max(80).optional(),
      departurePlace: z.string().trim().max(240).optional(),
      arrivalPlace: z.string().trim().max(240).optional(),
      departureTerminal: z.string().trim().max(80).optional(),
      arrivalTerminal: z.string().trim().max(80).optional(),
      seat: z.string().trim().max(80).optional(),
      cabin: z.string().trim().max(120).optional(),
    })
    .optional(),
  accommodationDetails: z
    .object({
      address: z.string().trim().max(500).optional(),
      roomType: z.string().trim().max(160).optional(),
      checkInTime: z.string().trim().max(80).optional(),
      checkOutTime: z.string().trim().max(80).optional(),
      nights: z.number().int().nonnegative().max(366).optional(),
    })
    .optional(),
  contact: z
    .object({
      name: z.string().trim().max(160).optional(),
      phone: z.string().trim().max(80).optional(),
      email: z.string().email().optional(),
    })
    .optional(),
  cancellationPolicy: optionalTextSchema,
  rawImport: z.record(z.unknown()).optional(),
  externalSource: z.string().trim().max(120).optional(),
  externalId: z.string().trim().max(240).optional(),
  externalOwnerUserId: z.string().trim().max(120).optional(),
  externalHash: z.string().trim().max(160).optional(),
  externalSyncedAt: z.string().trim().max(80).optional(),
  syncEnabled: z.boolean().optional(),
  createExpense: z.boolean().default(false),
})

export const updateReservationSchema = createReservationSchema.partial()

export const reservationStatusSchema = z.object({
  status: z.enum(['pending', 'confirmed', 'cancelled']),
})

export const createExpenseSchema = z.object({
  title: textSchema,
  category: z
    .enum(['accommodation', 'transport', 'food', 'activity', 'shopping', 'insurance', 'other'])
    .default('other'),
  amount: z.number().finite().nonnegative(),
  currency: currencySchema,
  paidByMemberId: optionalIdSchema,
  participantMemberIds: z.array(idSchema).max(100).default([]),
  splitMode: z.enum(['equal', 'custom', 'paid_by_one']).default('equal'),
  shares: z
    .array(
      z.object({
        memberId: idSchema,
        amount: z.number().finite().nonnegative(),
      }),
    )
    .max(100)
    .default([]),
  paidMemberIds: z.array(idSchema).max(100).default([]),
  reservationId: optionalIdSchema,
  placeId: optionalIdSchema,
  date: dateSchema.optional(),
  notes: optionalTextSchema,
  originalAmount: z.number().finite().nonnegative().optional(),
  originalCurrency: currencySchema.optional(),
  exchangeRate: z.number().finite().positive().optional(),
  exchangeRateDate: dateSchema.optional(),
  status: z.enum(['pending', 'settled', 'waived']).default('pending'),
  sequence: z.number().int().min(0).max(100000).optional(),
})

export const createSettlementRecordSchema = z.object({
  currency: currencySchema.optional(),
  notes: optionalTextSchema,
})

export const settlementRecordStatusSchema = z.object({
  notes: optionalTextSchema,
})

export const settlementTransferPaidSchema = z.object({
  transferId: idSchema,
  paid: z.boolean(),
})

export const convertExpensesSchema = z.object({
  targetCurrency: currencySchema,
  rates: z.record(z.number().finite().positive()).default({}),
  date: dateSchema.optional(),
})

export const budgetAnalyticsSchema = z.object({
  targetCurrency: currencySchema.optional(),
  date: dateSchema.optional(),
  includeWaived: z.boolean().default(false),
})

export const updateExpenseSchema = createExpenseSchema.partial()

export const setExpenseMembersSchema = z.object({
  participantMemberIds: z.array(idSchema).max(100),
  splitMode: z.enum(['equal', 'custom', 'paid_by_one']).default('equal'),
  shares: createExpenseSchema.shape.shares.default([]),
})

export const toggleExpensePaidSchema = z.object({
  memberId: idSchema,
  paid: z.boolean().optional(),
})

export const createPackingBagSchema = z.object({
  title: textSchema,
  ownerMemberId: optionalIdSchema,
  memberIds: z.array(idSchema).max(100).default([]),
  color: hexColorSchema.optional(),
  capacityNote: z.string().trim().max(500).optional(),
})

export const updatePackingBagSchema = createPackingBagSchema.partial()

export const createPackingItemSchema = z.object({
  title: textSchema,
  category: z.string().trim().max(120).optional(),
  assignedToMemberId: optionalIdSchema,
  bagId: optionalIdSchema,
  quantity: z.number().int().positive().max(999).default(1),
  packedByMemberIds: z.array(idSchema).max(100).default([]),
  contributorMemberIds: z.array(idSchema).max(100).default([]),
  status: z.enum(['needed', 'packed', 'skipped']).default('needed'),
  sequence: z.number().int().min(0).max(100000).optional(),
  notes: optionalTextSchema,
})

export const updatePackingItemSchema = createPackingItemSchema.partial()

export const reorderPackingItemsSchema = z.object({
  orderedIds: z.array(idSchema).min(1).max(500),
})

export const bulkImportPackingSchema = z.object({
  items: z
    .array(
      z.object({
        title: textSchema,
        category: z.string().trim().max(120).optional(),
        quantity: z.number().int().positive().max(999).default(1),
        assignedToMemberId: optionalIdSchema,
        bagId: optionalIdSchema,
        notes: optionalTextSchema,
      }),
    )
    .min(1)
    .max(200),
})

export const packingSuggestionsSchema = z.object({
  destination: z.string().trim().max(160).optional(),
  season: z.string().trim().max(80).optional(),
  activities: z.array(z.string().trim().min(1).max(80)).max(24).default([]),
  travelerProfile: z.enum(['solo', 'couple', 'family', 'business', 'group']).optional(),
  includeExisting: z.boolean().default(false),
  limit: z.number().int().positive().max(100).default(40),
})

const packingTemplateItemSchema = z.object({
  title: textSchema,
  category: z.string().trim().max(120).optional(),
  quantity: z.number().int().positive().max(999).default(1),
  notes: optionalTextSchema,
})

export const createPackingTemplateSchema = z.object({
  title: textSchema,
  description: optionalTextSchema,
  destinationTags: z.array(z.string().trim().min(1).max(80)).max(32).default([]),
  season: z.string().trim().max(80).optional(),
  visibility: z.enum(['private', 'server']).default('private'),
  items: z.array(packingTemplateItemSchema).min(1).max(300),
})

export const savePackingTemplateSchema = createPackingTemplateSchema.omit({ items: true }).extend({
  category: z.string().trim().max(120).optional(),
})

export const applyPackingTemplateSchema = z.object({
  assignedToMemberId: optionalIdSchema,
  bagId: optionalIdSchema,
  category: z.string().trim().max(120).optional(),
})

export const setCategoryAssigneesSchema = z.object({
  category: z.string().trim().min(1).max(120),
  memberIds: z.array(idSchema).max(100),
})

export const createAttachmentSchema = z.object({
  subjectType: z.enum(['trip', 'place', 'reservation', 'expense', 'packing_item', 'day']),
  subjectId: z.string().trim().max(120).optional(),
  workspaceNodeId: z.string().trim().max(240).optional(),
  fileName: textSchema,
  mimeType: z.string().trim().max(160).optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  label: z.string().trim().max(160).optional(),
  fileBase64: z.string().trim().max(20_000_000).optional(),
})

export const createShareLinkSchema = z.object({
  mode: z.enum(['readonly', 'live', 'public_summary']).default('readonly'),
  allowedSections: z
    .array(z.enum(['overview', 'itinerary', 'places', 'bookings', 'budget', 'packing', 'files']))
    .max(12)
    .default(['overview', 'itinerary']),
  expiresAt: z.string().trim().max(80).optional(),
})

export const createDiscussionRefSchema = z.object({
  channelId: z.string().trim().max(120).optional(),
  messageId: z.string().trim().min(1).max(160),
  subjectType: z.string().trim().min(1).max(80),
  subjectId: z.string().trim().max(120).optional(),
  title: z.string().trim().max(240).optional(),
})

export const startDiscussionSchema = z.object({
  channelId: z.string().trim().min(1).max(120).optional(),
  subjectType: z.string().trim().min(1).max(80),
  subjectId: z.string().trim().max(120).optional(),
  title: z.string().trim().min(1).max(240),
  body: z.string().trim().max(2000).optional(),
})

export const ensureCommunityChannelSchema = z.object({
  dedupeKey: z.string().trim().min(1).max(160),
  name: z.string().trim().min(1).max(100),
  topic: z.string().trim().max(800).optional(),
  isPrivate: z.boolean().default(true),
  memberUserIds: z.array(z.string().uuid()).max(100).default([]),
  syncMembers: z.boolean().default(false),
})

export const createCommunityPollSchema = z.object({
  channelId: z.string().uuid(),
  question: z.string().trim().min(1).max(300),
  answers: z.array(z.string().trim().min(1).max(55)).min(2).max(10),
  allowMultiselect: z.boolean().default(false),
  durationHours: z
    .number()
    .int()
    .min(1)
    .max(32 * 24)
    .default(24),
})

export const createDecisionRefSchema = z.object({
  decision: z.string().trim().min(1).max(1000),
  subjectType: z.string().trim().max(80).optional(),
  subjectId: z.string().trim().max(120).optional(),
  messageId: z.string().trim().max(160).optional(),
  status: z.enum(['proposed', 'accepted', 'superseded']).default('accepted'),
  decidedByMemberId: z.string().trim().max(120).optional(),
})

export const createAutomationTaskSchema = z.object({
  title: textSchema,
  source: z.enum(['buddy', 'schedule', 'manual', 'provider']).default('manual'),
  input: z.record(z.unknown()).default({}),
})

export const bindTripBuddySchema = z.object({
  agentId: z.string().trim().min(1).max(160),
  agentUserId: z.string().trim().min(1).max(160).optional(),
  displayName: z.string().trim().min(1).max(160).optional(),
  capabilities: z.array(z.string().trim().min(1).max(120)).max(40).default([]),
})

export const dispatchBuddyPlanSchema = z.object({
  agentId: z.string().trim().min(1).max(160),
  title: z.string().trim().min(1).max(240),
  prompt: z.string().trim().min(1).max(20_000),
  priority: z.enum(['low', 'normal', 'medium', 'high']).optional(),
})

export const buddyPlanOperationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('place.create'), input: z.record(z.unknown()) }),
  z.object({ kind: z.literal('assignment.create'), input: z.record(z.unknown()) }),
  z.object({ kind: z.literal('reservation.create'), input: z.record(z.unknown()) }),
  z.object({ kind: z.literal('todo.create'), input: z.record(z.unknown()) }),
  z.object({ kind: z.literal('note'), input: z.record(z.unknown()) }),
])

export const proposeBuddyPlanSchema = z.object({
  automationTaskId: z.string().trim().min(1).max(160).optional(),
  title: z.string().trim().min(1).max(240),
  summary: z.string().trim().max(4000).optional(),
  operations: z.array(buddyPlanOperationSchema).min(1).max(100),
})

export const reviewBuddyPlanSchema = z.object({
  status: z.enum(['accepted', 'rejected']),
})

export const shareTripToCommunitySchema = z.object({
  channelId: z.string().trim().min(1).max(160),
  mode: z.enum(['snapshot', 'live']).default('live'),
  allowedSections: z
    .array(z.enum(['overview', 'itinerary', 'map', 'bookings', 'budget', 'packing']))
    .min(1)
    .max(6)
    .default(['overview', 'itinerary']),
})

export const importBookingSchema = z.object({
  kind: createReservationSchema.shape.kind.default('other'),
  source: z.enum(['email', 'file', 'manual', 'provider']).default('manual'),
  payload: z.record(z.unknown()).default({}),
  rawText: z.string().trim().max(20000).optional(),
  fileName: z.string().trim().max(240).optional(),
  mimeType: z.string().trim().max(160).optional(),
  fileBase64: z.string().trim().max(20_000_000).optional(),
  parseMode: z.enum(['no-ai', 'fallback-on-empty', 'force-ai']).default('fallback-on-empty'),
  reservation: createReservationSchema.optional(),
})

export const confirmImportJobSchema = z.object({
  reservation: createReservationSchema.optional(),
  createExpense: z.boolean().optional(),
})

export const confirmImportJobBatchSchema = z.object({
  reservations: z.array(createReservationSchema).max(50).default([]),
  indexes: z.array(z.number().int().min(0).max(500)).max(50).default([]),
  createExpense: z.boolean().optional(),
})

export const createMemberSchema = z.object({
  userId: optionalIdSchema,
  displayName: textSchema,
  role: z.enum(['planner', 'traveler', 'viewer']).default('traveler'),
  avatarUrl: z.string().url().optional(),
  email: z.string().email().optional(),
})

export const updateMemberSchema = z.object({
  displayName: textSchema.optional(),
  role: z.enum(['owner', 'planner', 'traveler', 'viewer']).optional(),
  avatarUrl: z.string().url().optional(),
  email: z.string().email().optional(),
})

export const createGuestSchema = z.object({
  displayName: textSchema,
  notes: optionalTextSchema,
})

export const updateGuestSchema = createGuestSchema.partial()

export const createInviteSchema = z.object({
  role: z.enum(['planner', 'traveler', 'viewer']).default('traveler'),
  invitedEmail: z.string().email().optional(),
  invitedUserId: optionalIdSchema,
  message: optionalTextSchema,
  expiresAt: z.string().trim().max(80).optional(),
})

export const acceptInviteSchema = z.object({
  token: z.string().trim().min(16).max(512),
  displayName: textSchema.optional(),
})

export const createTodoSchema = z.object({
  title: textSchema,
  category: z.string().trim().max(120).optional(),
  description: optionalTextSchema,
  dueDate: dateSchema.optional(),
  assignedToMemberId: optionalIdSchema,
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  status: z.enum(['open', 'done', 'cancelled']).default('open'),
  sequence: z.number().int().min(0).max(100000).optional(),
})

export const updateTodoSchema = createTodoSchema.partial()

export const reorderTodosSchema = z.object({
  orderedIds: z.array(idSchema).min(1).max(500),
})

export const toggleTodoSchema = z.object({
  done: z.boolean().optional(),
})

export const createTagSchema = z.object({
  name: z.string().trim().min(1).max(64),
  color: hexColorSchema.optional(),
})

export const updateTagSchema = createTagSchema.partial()

export const createCategorySchema = z.object({
  domain: z.enum(['place', 'todo', 'packing', 'expense']),
  name: z.string().trim().min(1).max(80),
  color: hexColorSchema.optional(),
  icon: z.string().trim().max(80).optional(),
})

export const updateCategorySchema = createCategorySchema.partial()

export const updateTripSettingsSchema = z.object({
  distanceUnit: z.enum(['km', 'mi']).optional(),
  temperatureUnit: z.enum(['c', 'f']).optional(),
  weekStartsOn: z.union([z.literal(0), z.literal(1), z.literal(6)]).optional(),
  defaultShareSections: z
    .array(z.enum(['overview', 'itinerary', 'places', 'bookings', 'budget', 'packing', 'files']))
    .max(12)
    .optional(),
  notificationLeadHours: z.array(z.number().int().min(0).max(720)).max(12).optional(),
})

export const upsertProviderSettingsSchema = z.object({
  settings: z
    .array(
      z.object({
        scope: z.enum(['user', 'server']).default('user'),
        key: z.string().trim().min(1).max(120),
        value: z.string().max(8000).nullable().optional(),
        secret: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(100),
})

export const resolveProviderUrlSchema = z.object({
  url: z.string().url(),
})

export const importAirtrailFlightsSchema = z.object({
  flightIds: z
    .array(z.union([z.string(), z.number()]))
    .max(100)
    .default([]),
  flights: z.array(z.record(z.unknown())).max(100).default([]),
  createExpense: z.boolean().default(false),
})

export const linkTripPhotoSchema = z.object({
  provider: z
    .enum(['immich', 'synologyphotos', 'local', 'place-photo'])
    .or(z.string().trim().min(1).max(80)),
  assetId: z.string().trim().min(1).max(240),
  ownerUserId: z.string().trim().max(120).optional(),
  subjectType: z.enum(['trip', 'day', 'place', 'reservation', 'assignment']).optional(),
  subjectId: optionalIdSchema,
  mediaType: z.enum(['image', 'video']).optional(),
  takenAt: z.string().trim().max(80).optional(),
  coordinates: coordinatesSchema.optional(),
  thumbnailUrl: z.string().url().optional(),
  originalUrl: z.string().url().optional(),
  metadata: z.record(z.unknown()).optional(),
})

export const syncMutationsSchema = z.object({
  mutations: z
    .array(
      z.object({
        entityType: z.enum([
          'place',
          'assignment',
          'reservation',
          'expense',
          'packing_item',
          'todo',
          'day',
        ]),
        entityId: optionalIdSchema,
        action: z.enum(['create', 'update', 'delete']),
        baseUpdatedAt: z.string().trim().max(80).optional(),
        payload: z.record(z.unknown()).default({}),
      }),
    )
    .min(1)
    .max(200),
})

export const createBackupSchema = z.object({
  label: z.string().trim().max(160).optional(),
  kind: z.enum(['trip', 'server']).default('trip'),
})

export const createNotificationSchema = z.object({
  tripId: optionalIdSchema,
  title: textSchema,
  body: optionalTextSchema,
  level: z.enum(['info', 'success', 'warning', 'error']).default('info'),
  subjectType: z.string().trim().max(80).optional(),
  subjectId: optionalIdSchema,
})

export const markNotificationReadSchema = z.object({
  memberId: optionalIdSchema,
  read: z.boolean().default(true),
})

export type CreateTripInput = z.infer<typeof createTripSchema>
export type UpsertTripRecruitmentInput = z.infer<typeof upsertTripRecruitmentSchema>
export type ApplyToTripInput = z.infer<typeof applyToTripSchema>
export type ReviewTripApplicationInput = z.infer<typeof reviewTripApplicationSchema>
export type UpsertTravelIntentInput = z.infer<typeof upsertTravelIntentSchema>
export type CreateEmergencyReportInput = z.infer<typeof createEmergencyReportSchema>
export type UpdateTripInput = z.infer<typeof updateTripSchema>
export type CreatePlaceInput = z.infer<typeof createPlaceSchema>
export type UpdatePlaceInput = z.infer<typeof updatePlaceSchema>
export type BulkCreatePlacesInput = z.infer<typeof bulkCreatePlacesSchema>
export type ImportPlacesInput = z.infer<typeof importPlacesSchema>
export type SaveProviderPlaceInput = z.infer<typeof saveProviderPlaceSchema>
export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>
export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>
export type ReorderAssignmentsInput = z.infer<typeof reorderAssignmentsSchema>
export type OptimizeRouteInput = z.infer<typeof optimizeRouteSchema>
export type ExportRouteInput = z.infer<typeof exportRouteSchema>
export type SaveTransitPlanInput = z.infer<typeof saveTransitPlanSchema>
export type ReorderIdsInput = z.infer<typeof reorderIdsSchema>
export type CreateDayInput = z.infer<typeof createDaySchema>
export type UpdateDayInput = z.infer<typeof updateDaySchema>
export type CreateReservationInput = z.infer<typeof createReservationSchema>
export type UpdateReservationInput = z.infer<typeof updateReservationSchema>
export type ReservationStatusInput = z.infer<typeof reservationStatusSchema>
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>
export type SettlementTransferPaidInput = z.infer<typeof settlementTransferPaidSchema>
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>
export type SetExpenseMembersInput = z.infer<typeof setExpenseMembersSchema>
export type ToggleExpensePaidInput = z.infer<typeof toggleExpensePaidSchema>
export type CreateSettlementRecordInput = z.infer<typeof createSettlementRecordSchema>
export type SettlementRecordStatusInput = z.infer<typeof settlementRecordStatusSchema>
export type ConvertExpensesInput = z.infer<typeof convertExpensesSchema>
export type BudgetAnalyticsInput = z.infer<typeof budgetAnalyticsSchema>
export type CreatePackingBagInput = z.infer<typeof createPackingBagSchema>
export type UpdatePackingBagInput = z.infer<typeof updatePackingBagSchema>
export type CreatePackingItemInput = z.infer<typeof createPackingItemSchema>
export type UpdatePackingItemInput = z.infer<typeof updatePackingItemSchema>
export type ReorderPackingItemsInput = z.infer<typeof reorderPackingItemsSchema>
export type BulkImportPackingInput = z.infer<typeof bulkImportPackingSchema>
export type PackingSuggestionsInput = z.infer<typeof packingSuggestionsSchema>
export type CreatePackingTemplateInput = z.infer<typeof createPackingTemplateSchema>
export type SavePackingTemplateInput = z.infer<typeof savePackingTemplateSchema>
export type ApplyPackingTemplateInput = z.infer<typeof applyPackingTemplateSchema>
export type SetCategoryAssigneesInput = z.infer<typeof setCategoryAssigneesSchema>
export type CreateAttachmentInput = z.infer<typeof createAttachmentSchema>
export type CreateShareLinkInput = z.infer<typeof createShareLinkSchema>
export type CreateDiscussionRefInput = z.infer<typeof createDiscussionRefSchema>
export type StartDiscussionInput = z.infer<typeof startDiscussionSchema>
export type CreateDecisionRefInput = z.infer<typeof createDecisionRefSchema>
export type CreateAutomationTaskInput = z.infer<typeof createAutomationTaskSchema>
export type ImportBookingInput = z.infer<typeof importBookingSchema>
export type ConfirmImportJobInput = z.infer<typeof confirmImportJobSchema>
export type ConfirmImportJobBatchInput = z.infer<typeof confirmImportJobBatchSchema>
export type CreateMemberInput = z.infer<typeof createMemberSchema>
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>
export type CreateGuestInput = z.infer<typeof createGuestSchema>
export type UpdateGuestInput = z.infer<typeof updateGuestSchema>
export type CreateInviteInput = z.infer<typeof createInviteSchema>
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>
export type CreateTodoInput = z.infer<typeof createTodoSchema>
export type UpdateTodoInput = z.infer<typeof updateTodoSchema>
export type ReorderTodosInput = z.infer<typeof reorderTodosSchema>
export type ToggleTodoInput = z.infer<typeof toggleTodoSchema>
export type CreateTagInput = z.infer<typeof createTagSchema>
export type UpdateTagInput = z.infer<typeof updateTagSchema>
export type CreateCategoryInput = z.infer<typeof createCategorySchema>
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>
export type UpdateTripSettingsInput = z.infer<typeof updateTripSettingsSchema>
export type UpsertProviderSettingsInput = z.infer<typeof upsertProviderSettingsSchema>
export type ResolveProviderUrlInput = z.infer<typeof resolveProviderUrlSchema>
export type ImportAirtrailFlightsInput = z.infer<typeof importAirtrailFlightsSchema>
export type LinkTripPhotoInput = z.infer<typeof linkTripPhotoSchema>
export type SyncMutationsInput = z.infer<typeof syncMutationsSchema>
export type CreateBackupInput = z.infer<typeof createBackupSchema>
export type CreateNotificationInput = z.infer<typeof createNotificationSchema>
export type MarkNotificationReadInput = z.infer<typeof markNotificationReadSchema>
