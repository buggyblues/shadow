import { DatabaseSync } from 'node:sqlite'
import { resolve } from 'node:path'

const databasePath =
  process.env.TRAVEL_SQLITE_FILE ??
  resolve(import.meta.dirname, '../../../integrations/travel/data/travel.sqlite')
const demoTripId = 'trip_c9faf9c18d8248e388293196f42ef95f'
const demoOwnerUserId = '75d47c71-a97c-4621-9326-b7b9d76506a9'
const demoOwnerAvatarUrl =
  'http://localhost:3000/api/media/avatar/shadow/avatars/354d7dca-30b8-4456-8c57-9a21e4701d76.png'
const demoMemberIds = [
  'member_4910d3f7f3664c67b26ffa2ef34e2ed2',
  'member_58ed931b9ab04500a6d54d2fe5de967c',
  'member_a7770dcba6b44ae58e668acf8f931a8e',
]
const demoMemberProfiles = new Map([
  [
    demoOwnerUserId,
    {
      displayName: '陈诺',
      avatarUrl: demoOwnerAvatarUrl,
    },
  ],
  [
    '729b92f9-69a8-4dbb-8fee-b88f00decefe',
    {
      displayName: '林夏',
      avatarUrl:
        'http://localhost:3000/api/media/avatar/shadow/avatars/1689552d-2535-47cd-ae9f-db25a40a03fa.png',
    },
  ],
  [
    '4ba4a4c8-80ec-43fe-be41-29ba54af24ae',
    {
      displayName: '周屿',
      avatarUrl:
        'http://localhost:3000/api/media/avatar/shadow/avatars/27e8f790-5f43-4d7d-bd35-21fc5b397f92.png',
    },
  ],
])
const demoPlaceIds = {
  hotel: 'place_demo_left_bank_hotel',
  louvre: 'place_demo_louvre',
  orsay: 'place_demo_orsay',
  cruise: 'place_demo_seine_cruise',
}

const database = new DatabaseSync(databasePath)
const row = database.prepare('select state_json, revision from travel_state where id = 1').get()

if (!row?.state_json) {
  throw new Error('Travel demo state was not found')
}

const state = JSON.parse(row.state_json)
const demoNow = new Date().toISOString()

function pdfBase64(lines) {
  const escapedLines = lines.map((line) =>
    line.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)'),
  )
  const stream = [
    'BT',
    '/F1 13 Tf',
    '72 760 Td',
    ...escapedLines.flatMap((line, index) =>
      index === 0 ? [`(${line}) Tj`] : ['0 -24 Td', `(${line}) Tj`],
    ),
    'ET',
  ].join('\n')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let body = '%PDF-1.4\n'
  const offsets = [0]
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(body))
    body += `${index + 1} 0 obj\n${object}\nendobj\n`
  }
  const xrefOffset = Buffer.byteLength(body)
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  body += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('')
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  return Buffer.from(body).toString('base64')
}
state.automationTasks = (state.automationTasks ?? []).filter((task) => task.tripId !== demoTripId)
state.buddyPlanDrafts = (state.buddyPlanDrafts ?? []).filter((draft) => draft.tripId !== demoTripId)
state.members = (state.members ?? []).map((member) => {
  const profile = member.tripId === demoTripId ? demoMemberProfiles.get(member.userId) : undefined
  return profile
    ? {
        ...member,
        ...profile,
        updatedAt: new Date().toISOString(),
      }
    : member
})
state.places = [
  ...(state.places ?? []).filter(
    (place) => place.tripId !== demoTripId || !Object.values(demoPlaceIds).includes(place.id),
  ),
  {
    id: demoPlaceIds.hotel,
    tripId: demoTripId,
    title: '圣日耳曼左岸酒店',
    kind: 'accommodation',
    address: '巴黎第六区 · 圣日耳曼',
    coordinates: { lat: 48.853, lng: 2.333 },
    externalRefs: { provider: 'demo', category: 'Stay', status: 'saved', statusLabel: '已收藏' },
    links: [],
    tags: ['左岸', '步行友好'],
    photoRefs: [],
    createdAt: demoNow,
    updatedAt: demoNow,
  },
  {
    id: demoPlaceIds.louvre,
    tripId: demoTripId,
    title: '卢浮宫',
    kind: 'museum',
    address: 'Rue de Rivoli, Paris',
    coordinates: { lat: 48.8606, lng: 2.3376 },
    externalRefs: { provider: 'demo', category: 'Museums', status: 'saved', statusLabel: '已收藏' },
    links: [],
    tags: ['博物馆'],
    photoRefs: [],
    createdAt: demoNow,
    updatedAt: demoNow,
  },
  {
    id: demoPlaceIds.orsay,
    tripId: demoTripId,
    title: '奥赛博物馆',
    kind: 'museum',
    address: "1 Rue de la Légion d'Honneur, Paris",
    coordinates: { lat: 48.86, lng: 2.3266 },
    externalRefs: { provider: 'demo', category: 'Museums', status: 'saved', statusLabel: '已收藏' },
    links: [],
    tags: ['雨天'],
    photoRefs: [],
    createdAt: demoNow,
    updatedAt: demoNow,
  },
  {
    id: demoPlaceIds.cruise,
    tripId: demoTripId,
    title: '塞纳河新桥码头',
    kind: 'custom',
    address: 'Square du Vert-Galant, Paris',
    coordinates: { lat: 48.8565, lng: 2.3401 },
    externalRefs: { provider: 'demo', category: 'Sights', status: 'saved', statusLabel: '已收藏' },
    links: [],
    tags: ['日落'],
    photoRefs: [],
    createdAt: demoNow,
    updatedAt: demoNow,
  },
]
state.reservations = [
  ...(state.reservations ?? []).filter(
    (reservation) =>
      reservation.tripId !== demoTripId || !String(reservation.id).startsWith('resv_demo_'),
  ),
  {
    id: 'resv_demo_hotel',
    tripId: demoTripId,
    kind: 'accommodation',
    title: '圣日耳曼左岸酒店 · 两晚',
    status: 'confirmed',
    provider: '旅途收藏',
    confirmationCode: 'PARIS-0918',
    startAt: '2026-09-18T15:00:00+02:00',
    endAt: '2026-09-20T11:00:00+02:00',
    locationPlaceId: demoPlaceIds.hotel,
    checkInDayId: 'day_99363b25b8af4a7cb69619390003fff4',
    checkOutDayId: 'day_0e89b4bdd7324425b0476a24e9c7c1e6',
    sequence: 100,
    guestIds: [],
    participantMemberIds: demoMemberIds,
    passengerNames: ['陈诺', '林夏', '周屿'],
    attachmentIds: ['ticket_demo_hotel'],
    cost: { amount: 360, currency: 'EUR' },
    accommodationDetails: { address: '巴黎第六区 · 圣日耳曼', nights: 2 },
    cancellationPolicy: '入住前 48 小时可免费取消',
    createdAt: demoNow,
    updatedAt: demoNow,
  },
  {
    id: 'resv_demo_cruise',
    tripId: demoTripId,
    kind: 'activity',
    title: '塞纳河日落游船',
    status: 'confirmed',
    provider: '新桥游船',
    confirmationCode: 'SEINE-1830',
    startAt: '2026-09-18T18:30:00+02:00',
    endAt: '2026-09-18T20:00:00+02:00',
    locationPlaceId: demoPlaceIds.cruise,
    sequence: 200,
    guestIds: [],
    participantMemberIds: demoMemberIds,
    passengerNames: ['陈诺', '林夏', '周屿'],
    attachmentIds: ['ticket_demo_cruise'],
    cost: { amount: 126, currency: 'EUR' },
    cancellationPolicy: '电子票已同步到三位同行人的行程',
    createdAt: demoNow,
    updatedAt: demoNow,
  },
  {
    id: 'resv_demo_orsay',
    tripId: demoTripId,
    kind: 'activity',
    title: '奥赛博物馆 · 三人票',
    status: 'confirmed',
    provider: '奥赛博物馆',
    confirmationCode: 'ORSAY-1000',
    startAt: '2026-09-19T10:00:00+02:00',
    endAt: '2026-09-19T12:30:00+02:00',
    locationPlaceId: demoPlaceIds.orsay,
    sequence: 300,
    guestIds: [],
    participantMemberIds: demoMemberIds,
    passengerNames: ['陈诺', '林夏', '周屿'],
    attachmentIds: ['ticket_demo_orsay'],
    cost: { amount: 48, currency: 'EUR' },
    cancellationPolicy: '预约凭证已归到第 2 天',
    createdAt: demoNow,
    updatedAt: demoNow,
  },
]
state.expenses = (state.expenses ?? []).map((expense) => {
  if (expense.tripId !== demoTripId) return expense
  const isTransportExpense = expense.category === 'transport' || expense.title.includes('地铁')
  const category = expense.title.includes('酒店')
    ? 'accommodation'
    : isTransportExpense
      ? 'transport'
      : 'activity'
  return {
    ...expense,
    category,
    title: isTransportExpense ? '巴黎市内交通预留' : expense.title,
    participantMemberIds: demoMemberIds,
    shares: demoMemberIds.map((memberId) => ({
      memberId,
      amount: expense.amount / demoMemberProfiles.size,
    })),
    updatedAt: demoNow,
  }
})
const demoExpenses = state.expenses.filter((expense) => expense.tripId === demoTripId)
const hotelExpense = demoExpenses.find((expense) => expense.title.includes('酒店'))
const cruiseExpense = demoExpenses.find((expense) => expense.title.includes('游船'))
const metroExpense = demoExpenses.find((expense) => expense.category === 'transport')
const seededAttachments = [
  hotelExpense
    ? {
        id: 'file_demo_hotel_invoice',
        tripId: demoTripId,
        subjectType: 'expense',
        subjectId: hotelExpense.id,
        fileName: '巴黎左岸酒店住宿发票.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 742,
        label: 'kind:invoice',
        createdByMemberId: demoMemberIds[0],
        createdAt: demoNow,
        contentBase64: pdfBase64([
          'PARIS LEFT BANK HOTEL',
          'INVOICE PARIS-0918',
          'Two nights / 3 guests',
          'Total EUR 360.00',
        ]),
      }
    : null,
  cruiseExpense
    ? {
        id: 'file_demo_cruise_receipt',
        tripId: demoTripId,
        subjectType: 'expense',
        subjectId: cruiseExpense.id,
        fileName: '塞纳河日落游船电子收据.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 730,
        label: 'kind:receipt',
        createdByMemberId: demoMemberIds[0],
        createdAt: demoNow,
        contentBase64: pdfBase64([
          'SEINE SUNSET CRUISE',
          'RECEIPT SEINE-1830',
          'Three passengers',
          'Total EUR 126.00',
        ]),
      }
    : null,
  metroExpense
    ? {
        id: 'file_demo_ratp_receipt',
        tripId: demoTripId,
        subjectType: 'expense',
        subjectId: metroExpense.id,
        fileName: '巴黎公共交通票据.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 711,
        label: 'kind:receipt',
        createdByMemberId: demoMemberIds[0],
        createdAt: demoNow,
        contentBase64: pdfBase64([
          'PARIS PUBLIC TRANSPORT',
          'TRAVEL RECEIPT',
          'Three travelers',
          'Total EUR 45.00',
        ]),
      }
    : null,
].filter(Boolean)
state.attachments = [
  ...(state.attachments ?? []).filter(
    (attachment) =>
      attachment.tripId !== demoTripId || !String(attachment.id).startsWith('file_demo_'),
  ),
  ...seededAttachments,
]
state.settlementRecords = (state.settlementRecords ?? []).filter(
  (record) => record.tripId !== demoTripId,
)
state.updatedAt = demoNow

database.exec('begin immediate')
try {
  database
    .prepare(
      `update travel_state
       set state_json = @stateJson,
           updated_at = @updatedAt,
           revision = revision + 1
       where id = 1`,
    )
    .run({
      stateJson: JSON.stringify(state),
      updatedAt: state.updatedAt,
    })
  database.exec('commit')
} catch (error) {
  database.exec('rollback')
  throw error
}

console.log(
  JSON.stringify({
    tripId: demoTripId,
    automationTasks: state.automationTasks.length,
    buddyPlanDrafts: state.buddyPlanDrafts.length,
  }),
)
