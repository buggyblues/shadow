function publicBaseUrl() {
  return (process.env.TRAVEL_PUBLIC_BASE_URL ?? 'http://localhost:4224').replace(/\/+$/, '')
}

function publicWebSocketBaseUrl() {
  const baseUrl = publicBaseUrl()
  if (baseUrl.startsWith('https://')) return `wss://${baseUrl.slice('https://'.length)}`
  if (baseUrl.startsWith('http://')) return `ws://${baseUrl.slice('http://'.length)}`
  return baseUrl
}

function command(input: {
  name: string
  title: string
  description: string
  permission: string
  action: 'read' | 'write'
  dataClass: 'server-private'
  inputSchema?: Record<string, unknown>
  approvalMode?: 'none' | 'first_time' | 'every_time' | 'policy'
}) {
  return {
    ...input,
    method: 'POST' as const,
    input: 'json' as const,
    ingress: {
      path: `/.shadow/commands/${input.name}`,
      auth: 'shadow-command-jwt' as const,
    },
    ...(input.action === 'write'
      ? { approvalMode: input.approvalMode ?? ('first_time' as const) }
      : {}),
    inputSchema: input.inputSchema ?? {
      type: 'object' as const,
      additionalProperties: true,
    },
  }
}

export function travelManifest() {
  const baseUrl = publicBaseUrl()
  const wsBaseUrl = publicWebSocketBaseUrl()
  return {
    schemaVersion: 'shadow.space-app/1',
    appKey: 'travel',
    name: 'Travel',
    description:
      'Collaborative trip planning, itinerary operations, reservations, budgets, packing, sharing, and automation.',
    version: '1.1.0',
    updatedAt: '2026-07-13T00:00:00.000Z',
    iconUrl: `${baseUrl}/travel-icon.svg`,
    iframe: {
      entry: `${baseUrl}/shadow/server/`,
      allowedOrigins: [new URL(baseUrl).origin],
    },
    api: {
      baseUrl,
      auth: { type: 'oauth2-bearer' },
    },
    access: {
      defaultPermissions: ['travel.trips:read'],
      defaultApprovalMode: 'none',
    },
    notifications: [
      {
        key: 'recruitment.application_received',
        title: 'New group application',
        description: 'A Space member applied to join one of your trips.',
        defaultChannels: ['in_app', 'mobile_push'],
      },
      {
        key: 'recruitment.application_updated',
        title: 'Group application update',
        description: 'The organizer reviewed or requested changes to your application.',
        defaultChannels: ['in_app', 'mobile_push'],
      },
      {
        key: 'trip.reminder',
        title: 'Trip reminders',
        description: 'Upcoming itinerary, reservation, packing, and payment reminders.',
        defaultChannels: ['in_app', 'mobile_push'],
      },
      {
        key: 'trip.emergency',
        title: 'Trip impact alerts',
        description: 'Active shared incidents that may affect your itinerary.',
        defaultChannels: ['in_app', 'mobile_push', 'email'],
      },
    ],
    i18n: {
      'zh-CN': {
        notifications: {
          'recruitment.application_received': {
            title: '新的组团申请',
            description: '有空间成员申请加入你组织的旅行。',
          },
          'recruitment.application_updated': {
            title: '组团申请进度',
            description: '组织者已审核申请或需要你补充信息。',
          },
          'trip.reminder': {
            title: '旅行提醒',
            description: '接收即将开始的行程、预订、行李和付款提醒。',
          },
          'trip.emergency': {
            title: '行程影响预警',
            description: '共享事件可能影响行程时及时提醒。',
          },
        },
      },
      'zh-TW': {
        notifications: {
          'recruitment.application_received': {
            title: '新的組團申請',
            description: '有空間成員申請加入你組織的旅行。',
          },
          'recruitment.application_updated': {
            title: '組團申請進度',
            description: '組織者已審核申請或需要你補充資訊。',
          },
          'trip.reminder': {
            title: '旅行提醒',
            description: '接收即將開始的行程、預訂、行李和付款提醒。',
          },
          'trip.emergency': {
            title: '行程影響預警',
            description: '共享事件可能影響行程時及時提醒。',
          },
        },
      },
    },
    widgets: [
      {
        key: 'currency',
        title: 'Currency rate',
        description: 'The latest available exchange rate for a selected currency pair.',
        category: 'finance',
        surfaces: ['desktop', 'mobile'],
        strings: {
          rate: 'Latest rate',
        },
        i18n: {
          'zh-CN': {
            $title: '实时汇率',
            $description: '显示所选货币组合的最新可用汇率。',
            '$option.base': '基础货币',
            '$option.quote': '目标货币',
            rate: '最新汇率',
          },
          'zh-TW': {
            $title: '即時匯率',
            $description: '顯示所選貨幣組合的最新可用匯率。',
            '$option.base': '基礎貨幣',
            '$option.quote': '目標貨幣',
            rate: '最新匯率',
          },
          ja: {
            $title: '為替レート',
            $description: '選択した通貨ペアの最新レートを表示します。',
            '$option.base': '基準通貨',
            '$option.quote': '換算先通貨',
            rate: '最新レート',
          },
          ko: {
            $title: '실시간 환율',
            $description: '선택한 통화 쌍의 최신 환율을 표시합니다.',
            '$option.base': '기준 통화',
            '$option.quote': '상대 통화',
            rate: '최신 환율',
          },
        },
        size: {
          default: { widthCells: 6, heightCells: 4 },
          min: { widthCells: 4, heightCells: 3 },
          max: { widthCells: 10, heightCells: 8 },
        },
        options: [
          {
            key: 'base',
            type: 'select',
            label: 'Base currency',
            defaultValue: 'USD',
            choices: ['USD', 'CNY', 'EUR', 'JPY', 'GBP', 'HKD', 'AUD', 'CAD', 'KRW', 'SGD'].map(
              (value) => ({ value, label: value }),
            ),
          },
          {
            key: 'quote',
            type: 'select',
            label: 'Quote currency',
            defaultValue: 'CNY',
            choices: ['USD', 'CNY', 'EUR', 'JPY', 'GBP', 'HKD', 'AUD', 'CAD', 'KRW', 'SGD'].map(
              (value) => ({ value, label: value }),
            ),
          },
        ],
        data: {
          command: 'travel.currencyWidget',
          refreshIntervalSeconds: 300,
        },
        view: {
          type: 'stack',
          gap: 'md',
          children: [
            {
              type: 'row',
              gap: 'sm',
              align: 'center',
              children: [
                { type: 'text', value: { path: 'pair' }, variant: 'title' },
                { type: 'badge', value: { path: 'provider' }, tone: 'accent' },
              ],
            },
            {
              type: 'metric',
              label: { stringKey: 'rate' },
              value: { path: 'rateText' },
              detail: { path: 'summary' },
              tone: 'positive',
            },
          ],
        },
      },
    ],
    capabilities: {
      realtime: {
        protocol: 'websocket',
        transports: ['websocket', 'sse'],
        contentType: 'text/event-stream',
        subscribeUrl: `${baseUrl}/api/trips/{tripId}/events`,
        websocketUrl: `${wsBaseUrl}/api/trips/{tripId}/ws`,
      },
      files: {
        mode: 'workspace-ref',
      },
      ai: {
        mode: 'command-context',
      },
    },
    commands: [
      command({
        name: 'travel.currencyWidget',
        title: 'Get currency widget data',
        description: 'Return the latest available exchange rate for the currency widget.',
        permission: 'travel.trips:read',
        action: 'read',
        dataClass: 'server-private',
        inputSchema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            base: { type: 'string', pattern: '^[A-Z]{3}$' },
            quote: { type: 'string', pattern: '^[A-Z]{3}$' },
          },
          required: ['base', 'quote'],
        },
      }),
      command({
        name: 'travel.listTrips',
        title: 'List trips',
        description: 'List trips visible to the current actor.',
        permission: 'travel.trips:read',
        action: 'read',
        dataClass: 'server-private',
      }),
      command({
        name: 'travel.createTrip',
        title: 'Create trip',
        description: 'Create a trip workspace with dates, currency, timezone, and starter days.',
        permission: 'travel.trips:write',
        action: 'write',
        dataClass: 'server-private',
      }),
      command({
        name: 'travel.listTripMembers',
        title: 'List trip members',
        description: 'List the owner and collaborators for a trip.',
        permission: 'travel.trips:read',
        action: 'read',
        dataClass: 'server-private',
      }),
      command({
        name: 'travel.listRecruitments',
        title: 'List open trip groups',
        description: 'List recruiting trip groups isolated to the current Space.',
        permission: 'travel.trips:read',
        action: 'read',
        dataClass: 'server-private',
      }),
      command({
        name: 'travel.listTravelIntents',
        title: 'List travel intents',
        description: 'List open travel wishes from members of the current Space for matching.',
        permission: 'travel.trips:read',
        action: 'read',
        dataClass: 'server-private',
      }),
      command({
        name: 'travel.manageRecruitment',
        title: 'Manage trip recruitment',
        description: 'Publish, edit, pause, reopen, or close recruitment for a trip.',
        permission: 'travel.members:write',
        action: 'write',
        dataClass: 'server-private',
      }),
      command({
        name: 'travel.reviewJoinApplication',
        title: 'Review join application',
        description: 'Approve, reject, waitlist, or request more information from an applicant.',
        permission: 'travel.members:write',
        action: 'write',
        dataClass: 'server-private',
      }),
      command({
        name: 'travel.deleteTrip',
        title: 'Delete trip',
        description: 'Delete a trip and all of its travel-domain records.',
        permission: 'travel.trips:write',
        action: 'write',
        dataClass: 'server-private',
      }),
      command({
        name: 'travel.exportIcs',
        title: 'Export calendar',
        description: 'Export trip assignments and reservations as iCalendar text.',
        permission: 'travel.trips:read',
        action: 'read',
        dataClass: 'server-private',
      }),
      command({
        name: 'travel.addPlace',
        title: 'Add place',
        description: 'Save a place candidate or scheduled stop for a trip.',
        permission: 'travel.itinerary:write',
        action: 'write',
        dataClass: 'server-private',
      }),
      command({
        name: 'travel.searchPlaces',
        title: 'Search places',
        description: 'Search configured public place providers for matching locations.',
        permission: 'travel.providers:read',
        action: 'read',
        dataClass: 'server-private',
      }),
      command({
        name: 'travel.saveProviderPlace',
        title: 'Save provider place',
        description: 'Normalize and save a provider place result into a trip.',
        permission: 'travel.itinerary:write',
        action: 'write',
        dataClass: 'server-private',
      }),
      command({
        name: 'travel.providerHealth',
        title: 'Provider health',
        description:
          'Check configured provider connectivity for places, weather, exchange, and media.',
        permission: 'travel.providers:read',
        action: 'read',
        dataClass: 'server-private',
      }),
      command({
        name: 'travel.schedulePlace',
        title: 'Schedule place',
        description: 'Place a saved location on a trip day timeline.',
        permission: 'travel.itinerary:write',
        action: 'write',
        dataClass: 'server-private',
      }),
      command({
        name: 'travel.refreshWeather',
        title: 'Refresh weather',
        description: 'Refresh day-level weather snapshots from configured weather providers.',
        permission: 'travel.itinerary:write',
        action: 'write',
        dataClass: 'server-private',
      }),
      command({
        name: 'travel.optimizeRoute',
        title: 'Optimize route',
        description: 'Optimize ordered stops for a trip day and store a route segment.',
        permission: 'travel.itinerary:write',
        action: 'write',
        dataClass: 'server-private',
      }),
      command({
        name: 'travel.listRouteSegments',
        title: 'List route segments',
        description: 'List saved route geometry and provider metadata for a trip or day.',
        permission: 'travel.itinerary:read',
        action: 'read',
        dataClass: 'server-private',
      }),
      command({
        name: 'travel.listReservations',
        title: 'List reservations',
        description: 'List bookings and reservations for a trip.',
        permission: 'travel.bookings:read',
        action: 'read',
        dataClass: 'server-private',
      }),
      command({
        name: 'travel.addReservation',
        title: 'Add reservation',
        description: 'Create a trip reservation for lodging, transport, restaurant, or activity.',
        permission: 'travel.bookings:write',
        action: 'write',
        dataClass: 'server-private',
      }),
      command({
        name: 'travel.confirmImportJob',
        title: 'Confirm import job',
        description: 'Create a reservation from a parsed booking import job.',
        permission: 'travel.bookings:write',
        action: 'write',
        dataClass: 'server-private',
      }),
      command({
        name: 'travel.confirmImportJobBatch',
        title: 'Confirm import batch',
        description: 'Create multiple reservations from a parsed booking import job.',
        permission: 'travel.bookings:write',
        action: 'write',
        dataClass: 'server-private',
      }),
      command({
        name: 'travel.importBooking',
        title: 'Import booking',
        description:
          'Create a reservation from structured booking details or extracted provider data.',
        permission: 'travel.bookings:write',
        action: 'write',
        dataClass: 'server-private',
      }),
      command({
        name: 'travel.saveTransitPlan',
        title: 'Save transit plan',
        description: 'Persist a public transit itinerary as a reservation, assignment, or both.',
        permission: 'travel.bookings:write',
        action: 'write',
        dataClass: 'server-private',
      }),
      command({
        name: 'travel.airtrailSync',
        title: 'Sync external flights',
        description: 'Synchronize linked flight reservations from the configured flight source.',
        permission: 'travel.bookings:write',
        action: 'write',
        dataClass: 'server-private',
      }),
      command({
        name: 'travel.listPackingItems',
        title: 'List packing items',
        description: 'List packing checklist items for a trip.',
        permission: 'travel.packing:read',
        action: 'read',
        dataClass: 'server-private',
      }),
      command({
        name: 'travel.addPackingItem',
        title: 'Add packing item',
        description: 'Add an item to a trip packing checklist.',
        permission: 'travel.packing:write',
        action: 'write',
        dataClass: 'server-private',
      }),
      command({
        name: 'travel.listTodos',
        title: 'List todos',
        description: 'List operational todos for a trip.',
        permission: 'travel.todos:read',
        action: 'read',
        dataClass: 'server-private',
      }),
      command({
        name: 'travel.addTodo',
        title: 'Add todo',
        description: 'Add an operational todo for a trip.',
        permission: 'travel.todos:write',
        action: 'write',
        dataClass: 'server-private',
      }),
      command({
        name: 'travel.exportBudgetCsv',
        title: 'Export budget CSV',
        description: 'Export trip expenses as CSV text.',
        permission: 'travel.budget:read',
        action: 'read',
        dataClass: 'server-private',
      }),
      command({
        name: 'travel.addExpense',
        title: 'Add expense',
        description: 'Add a trip expense with participants and split metadata.',
        permission: 'travel.budget:write',
        action: 'write',
        dataClass: 'server-private',
      }),
      command({
        name: 'travel.createReminders',
        title: 'Create reminders',
        description: 'Create Space App notifications for upcoming assignments and bookings.',
        permission: 'travel.notifications:write',
        action: 'write',
        dataClass: 'server-private',
      }),
      command({
        name: 'travel.budgetSettlement',
        title: 'Budget settlement',
        description: 'Calculate suggested settlement transfers for trip expenses.',
        permission: 'travel.budget:read',
        action: 'read',
        dataClass: 'server-private',
      }),
      command({
        name: 'travel.createShareLink',
        title: 'Create share link',
        description: 'Create a section-scoped public share link for a trip.',
        permission: 'travel.share:write',
        action: 'write',
        dataClass: 'server-private',
      }),
      command({
        name: 'travel.linkPhoto',
        title: 'Link photo',
        description:
          'Attach an external media asset reference to a trip, day, place, reservation, or assignment.',
        permission: 'travel.itinerary:write',
        action: 'write',
        dataClass: 'server-private',
      }),
      command({
        name: 'travel.listPhotos',
        title: 'List photos',
        description: 'List linked external media references for a trip or subject.',
        permission: 'travel.itinerary:read',
        action: 'read',
        dataClass: 'server-private',
      }),
      command({
        name: 'travel.syncManifest',
        title: 'Sync manifest',
        description: 'Return entity versions for offline reconciliation.',
        permission: 'travel.trips:read',
        action: 'read',
        dataClass: 'server-private',
      }),
      command({
        name: 'travel.applySyncMutations',
        title: 'Apply sync mutations',
        description: 'Apply offline mutations with base version conflict detection.',
        permission: 'travel.trips:write',
        action: 'write',
        dataClass: 'server-private',
      }),
      command({
        name: 'travel.performTripAction',
        title: 'Perform trip action',
        description:
          'Perform a validated owner-delegated trip operation across itinerary, people, bookings, expenses, packing, todos, files, settings, backups, Buddy bindings, and community sharing.',
        permission: 'travel.trips:write',
        action: 'write',
        dataClass: 'server-private',
        approvalMode: 'none',
        inputSchema: {
          type: 'object',
          additionalProperties: false,
          required: ['tripId', 'action'],
          properties: {
            tripId: { type: 'string' },
            action: {
              type: 'string',
              enum: [
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
              ],
            },
            targetId: {
              type: 'string',
              description:
                'Required for actions that update, remove, restore, revoke, or review one record.',
            },
            input: {
              type: 'object',
              description: 'Action-specific validated fields. Omit for actions without parameters.',
              additionalProperties: true,
            },
          },
        },
      }),
      command({
        name: 'travel.contextPack',
        title: 'Build context pack',
        description: 'Return a compact trip context for planning, summarization, or automation.',
        permission: 'travel.trips:read',
        action: 'read',
        dataClass: 'server-private',
      }),
      command({
        name: 'travel.proposePlan',
        title: 'Propose trip plan',
        description:
          'Submit a reviewable planning draft. This command never mutates the itinerary directly.',
        permission: 'travel.itinerary:write',
        action: 'write',
        dataClass: 'server-private',
      }),
    ],
    skills: [
      {
        name: 'travel-buddy-planner',
        description:
          'Use when a Buddy needs to inspect a trip, coordinate collaborators, and either execute explicitly delegated work or propose reviewable changes.',
        commandHints: ['travel.contextPack', 'travel.performTripAction', 'travel.proposePlan'],
      },
    ],
    marketplace: {
      tagline: 'A self-hosted travel operations app for groups.',
      categories: ['travel', 'planning', 'collaboration'],
      supportedLanguages: ['en', 'zh-CN'],
    },
  }
}
