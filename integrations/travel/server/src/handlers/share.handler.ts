import { Hono } from 'hono'
import type { AppContainer } from '../container.js'
import { notFound } from '../lib/errors.js'
import { hashToken } from '../lib/id.js'
import { ok } from '../lib/json.js'
import type { TravelHonoEnv } from '../types.js'

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function renderShareHtml(data: {
  trip: {
    title: string
    summary?: string
    destinationLabels: string[]
    startDate?: string
    endDate?: string
  }
  sections: Record<string, unknown>
}) {
  const places = Array.isArray(data.sections.places) ? data.sections.places : []
  const bookings = Array.isArray(data.sections.bookings) ? data.sections.bookings : []
  const days = Array.isArray((data.sections.itinerary as { days?: unknown[] } | undefined)?.days)
    ? (data.sections.itinerary as { days: unknown[] }).days
    : []
  const list = (items: unknown[], label: string) =>
    items.length
      ? `<section><h2>${label}</h2><ul>${items
          .slice(0, 80)
          .map((item) => {
            const record = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
            return `<li><strong>${escapeHtml(record.title ?? record.date ?? 'Item')}</strong>${record.address ? `<span>${escapeHtml(record.address)}</span>` : ''}</li>`
          })
          .join('')}</ul></section>`
      : ''
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(data.trip.title)}</title>
  <style>
    body{font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0;background:#f7f7f4;color:#161616}
    main{max-width:880px;margin:0 auto;padding:40px 20px 64px}
    header{padding:28px 0 24px;border-bottom:1px solid #deded8}
    h1{font-size:clamp(32px,6vw,64px);line-height:1;margin:0 0 12px}
    p{font-size:17px;line-height:1.6;color:#4a4a44}
    .meta{display:flex;gap:12px;flex-wrap:wrap;color:#666;font-size:14px}
    section{padding:28px 0;border-bottom:1px solid #e4e4dd}
    h2{font-size:20px;margin:0 0 14px}
    ul{display:grid;gap:10px;list-style:none;padding:0;margin:0}
    li{background:white;border:1px solid #e6e6e0;border-radius:8px;padding:14px 16px}
    li span{display:block;color:#666;margin-top:4px;font-size:14px}
  </style>
</head>
<body>
  <main>
    <header>
      <h1>${escapeHtml(data.trip.title)}</h1>
      ${data.trip.summary ? `<p>${escapeHtml(data.trip.summary)}</p>` : ''}
      <div class="meta">
        ${data.trip.startDate || data.trip.endDate ? `<span>${escapeHtml(data.trip.startDate)}${data.trip.endDate ? ` - ${escapeHtml(data.trip.endDate)}` : ''}</span>` : ''}
        ${data.trip.destinationLabels.map((label) => `<span>${escapeHtml(label)}</span>`).join('')}
      </div>
    </header>
    ${list(days, 'Itinerary')}
    ${list(places, 'Places')}
    ${list(bookings, 'Bookings')}
  </main>
</body>
</html>`
}

export function createShareHandler(container: AppContainer) {
  const app = new Hono<TravelHonoEnv>()

  app.get('/share/:token', async (c) => {
    const tokenHash = hashToken(c.req.param('token'))
    const state = await container.db.read((snapshot) => snapshot)
    const link = state.shareLinks.find((item) => item.tokenHash === tokenHash)
    if (!link || link.revokedAt || (link.expiresAt && link.expiresAt < new Date().toISOString())) {
      throw notFound('Share link')
    }

    const trip = state.trips.find((item) => item.id === link.tripId)
    if (!trip) throw notFound('Trip')

    const allowed = new Set(link.allowedSections)
    const payload = {
      trip,
      sections: {
        itinerary: allowed.has('itinerary')
          ? {
              days: state.days.filter((item) => item.tripId === trip.id),
              assignments: state.assignments.filter((item) => item.tripId === trip.id),
            }
          : undefined,
        places: allowed.has('places')
          ? state.places.filter((item) => item.tripId === trip.id)
          : undefined,
        bookings: allowed.has('bookings')
          ? state.reservations.filter((item) => item.tripId === trip.id)
          : undefined,
        budget: allowed.has('budget')
          ? state.expenses.filter((item) => item.tripId === trip.id)
          : undefined,
        packing: allowed.has('packing')
          ? state.packingItems.filter((item) => item.tripId === trip.id)
          : undefined,
      },
    }

    if (c.req.header('accept')?.includes('text/html')) {
      return c.html(renderShareHtml(payload))
    }

    return c.json(ok(payload))
  })

  return app
}
