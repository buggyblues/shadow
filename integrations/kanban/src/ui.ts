export function shellPage() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Shadow Kanban</title>
    <style>
      :root {
        color-scheme: light;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #0f64a4;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        color: #172b4d;
        background:
          linear-gradient(180deg, rgba(255,255,255,.18), rgba(255,255,255,0) 220px),
          #0f64a4;
      }
      header {
        min-height: 56px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 0 18px;
        color: #fff;
        background: rgba(9, 30, 66, .28);
        backdrop-filter: blur(18px);
        border-bottom: 1px solid rgba(255,255,255,.18);
      }
      h1 { margin: 0; font-size: 18px; letter-spacing: 0; }
      .subtitle { font-size: 12px; opacity: .82; }
      .toolbar { display: flex; align-items: center; gap: 8px; }
      .status {
        border-radius: 999px;
        background: rgba(255,255,255,.16);
        padding: 6px 10px;
        font-size: 12px;
        color: rgba(255,255,255,.88);
      }
      .status.on { background: rgba(34,197,94,.22); }
      button {
        border: 0;
        border-radius: 6px;
        padding: 8px 10px;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
      }
      .refresh { background: rgba(255,255,255,.18); color: #fff; }
      main {
        height: calc(100vh - 56px);
        overflow-x: auto;
        overflow-y: hidden;
        padding: 16px;
      }
      .board {
        display: grid;
        grid-auto-flow: column;
        grid-auto-columns: minmax(260px, 310px);
        gap: 12px;
        align-items: start;
        min-height: 100%;
      }
      .list {
        max-height: calc(100vh - 88px);
        display: flex;
        flex-direction: column;
        border-radius: 8px;
        background: #ebecf0;
        box-shadow: 0 8px 24px rgba(9, 30, 66, .16);
      }
      .list.over { outline: 3px solid rgba(255,255,255,.7); }
      .list-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 12px 12px 8px;
      }
      .list-title { font-size: 14px; font-weight: 800; }
      .count {
        min-width: 24px;
        border-radius: 999px;
        background: #d8dce5;
        padding: 3px 7px;
        text-align: center;
        font-size: 12px;
        color: #5e6c84;
      }
      .cards {
        min-height: 72px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 0 8px 8px;
      }
      .card {
        width: 100%;
        border: 0;
        border-radius: 8px;
        background: #fff;
        box-shadow: 0 1px 0 rgba(9,30,66,.25);
        padding: 10px;
        color: inherit;
        text-align: left;
        cursor: pointer;
      }
      .card.dragging { cursor: grabbing; }
      .labels { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 6px; }
      .label {
        height: 8px;
        min-width: 42px;
        border-radius: 999px;
        background: #61bd4f;
      }
      .label.Buddy { background: #60a5fa; }
      .label.Design { background: #f97316; }
      .label.Planning { background: #a78bfa; }
      .card-title { font-size: 14px; line-height: 1.35; font-weight: 650; overflow-wrap: anywhere; }
      .card-desc {
        margin-top: 6px;
        color: #5e6c84;
        font-size: 12px;
        line-height: 1.45;
        overflow-wrap: anywhere;
      }
      .card-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-top: 10px;
      }
      .avatars { display: flex; align-items: center; gap: 4px; min-width: 0; }
      .avatar {
        display: grid;
        place-items: center;
        width: 26px;
        height: 26px;
        flex: 0 0 26px;
        overflow: hidden;
        border-radius: 50%;
        background: #172b4d;
        color: #fff;
        font-size: 11px;
        font-weight: 800;
      }
      .avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .meta { color: #5e6c84; font-size: 12px; white-space: nowrap; }
      .quick-add {
        display: grid;
        gap: 6px;
        padding: 0 8px 10px;
      }
      .quick-add input,
      .detail textarea {
        width: 100%;
        min-height: 36px;
        border: 1px solid transparent;
        border-radius: 8px;
        padding: 8px 10px;
        font: inherit;
        outline: none;
      }
      .quick-add input:focus,
      .detail textarea:focus {
        border-color: #0079bf;
        box-shadow: inset 0 0 0 1px #0079bf;
      }
      .quick-add button,
      .primary {
        justify-self: start;
        background: #0079bf;
        color: #fff;
      }
      .secondary { background: #e4e7ee; color: #172b4d; }
      .overlay {
        position: fixed;
        inset: 0;
        display: grid;
        place-items: stretch end;
        background: rgba(9, 30, 66, .38);
        opacity: 1;
        transition: opacity .16s ease;
      }
      .overlay.hidden {
        pointer-events: none;
        opacity: 0;
      }
      .detail {
        width: min(520px, 100vw);
        height: 100vh;
        overflow-y: auto;
        background: #f7f8fb;
        box-shadow: -18px 0 48px rgba(9,30,66,.28);
        transform: translateX(0);
        transition: transform .16s ease;
      }
      .overlay.hidden .detail { transform: translateX(100%); }
      .detail-header {
        position: sticky;
        top: 0;
        z-index: 1;
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        padding: 18px;
        background: rgba(247,248,251,.94);
        backdrop-filter: blur(14px);
        border-bottom: 1px solid #dfe3ec;
      }
      .detail h2 {
        margin: 0;
        font-size: 20px;
        line-height: 1.25;
        letter-spacing: 0;
        overflow-wrap: anywhere;
      }
      .close {
        width: 34px;
        height: 34px;
        padding: 0;
        border-radius: 50%;
        background: #e4e7ee;
        color: #172b4d;
        font-size: 20px;
      }
      .detail-body { display: grid; gap: 18px; padding: 18px; }
      .section { display: grid; gap: 8px; }
      .section-title { font-size: 12px; font-weight: 800; text-transform: uppercase; color: #5e6c84; }
      .people { display: flex; flex-wrap: wrap; gap: 8px; }
      .person {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-height: 34px;
        max-width: 100%;
        padding: 4px 10px 4px 4px;
        border-radius: 999px;
        background: #fff;
        box-shadow: 0 1px 0 rgba(9,30,66,.12);
        font-size: 13px;
      }
      .person-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .description {
        margin: 0;
        border-radius: 8px;
        background: #fff;
        padding: 12px;
        color: #334155;
        font-size: 14px;
        line-height: 1.5;
        overflow-wrap: anywhere;
      }
      .comments { display: grid; gap: 10px; }
      .comment-row {
        display: grid;
        grid-template-columns: 26px 1fr;
        gap: 8px;
        align-items: start;
      }
      .comment-box {
        border-radius: 8px;
        background: #fff;
        padding: 9px 10px;
        box-shadow: 0 1px 0 rgba(9,30,66,.12);
      }
      .comment-head {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        gap: 8px;
        color: #5e6c84;
        font-size: 12px;
      }
      .comment-body { margin-top: 4px; font-size: 13px; line-height: 1.45; overflow-wrap: anywhere; }
      .actions { display: flex; flex-wrap: wrap; gap: 8px; }
      .toast {
        position: fixed;
        right: 16px;
        bottom: 16px;
        max-width: 360px;
        border-radius: 8px;
        background: #172b4d;
        color: #fff;
        padding: 10px 12px;
        font-size: 13px;
        box-shadow: 0 18px 48px rgba(9,30,66,.32);
        transform: translateY(120%);
        transition: transform .18s ease;
      }
      .toast.show { transform: translateY(0); }
      @media (max-width: 720px) {
        header { align-items: flex-start; flex-direction: column; padding: 12px; }
        main { height: calc(100vh - 92px); padding: 12px; }
        .board { grid-auto-columns: minmax(240px, 82vw); }
      }
    </style>
  </head>
  <body>
    <header>
      <div>
        <h1>Shadow Kanban</h1>
        <div class="subtitle">Shared board for people and Buddies</div>
      </div>
      <div class="toolbar">
        <span id="live" class="status">manual</span>
        <button class="refresh" id="refresh" type="button">Refresh</button>
      </div>
    </header>
    <main><section id="board" class="board"></section></main>
    <div id="overlay" class="overlay hidden">
      <aside class="detail" aria-label="Card detail">
        <div id="detail"></div>
      </aside>
    </div>
    <div id="toast" class="toast"></div>
    <script>
      const pending = new Map()
      let board = null
      let selectedCardId = null

      function esc(value) {
        return String(value ?? '').replace(/[&<>"']/g, (char) => ({
          '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[char]))
      }
      function toast(message) {
        const el = document.getElementById('toast')
        el.textContent = message
        el.classList.add('show')
        window.setTimeout(() => el.classList.remove('show'), 2600)
      }
      function initials(person) {
        const value = person?.displayName || person?.username || '?'
        return String(value).split(/\\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
      }
      function avatar(person) {
        const name = person?.displayName || person?.username || 'Unknown'
        const image = person?.avatarUrl
          ? '<img src="' + esc(person.avatarUrl) + '" alt="" referrerpolicy="no-referrer" />'
          : esc(initials(person))
        return '<span class="avatar" title="' + esc(name) + '">' + image + '</span>'
      }
      function personChip(person) {
        const name = person?.displayName || 'Unknown'
        return '<span class="person">' + avatar(person) + '<span class="person-name">' + esc(name) + '</span></span>'
      }
      function canUseBridge() {
        return new URLSearchParams(location.search).has('shadow_launch') &&
          (window.parent !== window || window.ReactNativeWebView)
      }
      function postBridge(message) {
        if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(message))
        else window.parent.postMessage(message, '*')
      }
      async function command(commandName, input) {
        if (canUseBridge()) {
          const requestId = 'req_' + Math.random().toString(36).slice(2)
          postBridge({
            type: 'shadow.app.command.request',
            requestId,
            appKey: 'shadow-kanban',
            commandName,
            input
          })
          return new Promise((resolve, reject) => {
            pending.set(requestId, { resolve, reject })
            window.setTimeout(() => {
              if (!pending.has(requestId)) return
              pending.delete(requestId)
              reject(new Error('Command timed out'))
            }, 60000)
          })
        }
        const res = await fetch('/api/local/commands/' + encodeURIComponent(commandName), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input })
        })
        const payload = await res.json()
        if (!res.ok || payload.ok === false) throw new Error(payload.error || 'Command failed')
        return payload
      }
      window.addEventListener('message', (event) => {
        let data = event.data
        if (typeof data === 'string') {
          try {
            data = JSON.parse(data || '{}')
          } catch {
            return
          }
        }
        if (!data || data.type !== 'shadow.app.command.response') return
        const entry = pending.get(data.requestId)
        if (!entry) return
        pending.delete(data.requestId)
        if (data.ok) entry.resolve(data.result)
        else entry.reject(new Error(data.error || 'Command failed'))
      })
      async function load() {
        const result = await command('boards.get', {})
        board = result.result?.board || result.board || result.result || result
        render()
        if (selectedCardId) renderDetail(selectedCardId)
      }
      function cardById(cardId) {
        return board?.cards?.find((card) => card.id === cardId) || null
      }
      function render() {
        const root = document.getElementById('board')
        root.innerHTML = board.columns.map((column) => {
          const cards = board.cards.filter((card) => card.columnId === column.id)
          return '<div class="list" data-column="' + esc(column.id) + '">' +
            '<div class="list-header"><div class="list-title">' + esc(column.title) + '</div><div class="count">' + cards.length + '</div></div>' +
            '<div class="cards">' +
              cards.map((card) => {
                const assignees = card.assignees || []
                return '<button class="card" draggable="true" data-card="' + esc(card.id) + '" data-open="' + esc(card.id) + '" type="button">' +
                  '<div class="labels">' + (card.labels || []).map((label) => '<span title="' + esc(label) + '" class="label ' + esc(label) + '"></span>').join('') + '</div>' +
                  '<div class="card-title">' + esc(card.title) + '</div>' +
                  (card.description ? '<div class="card-desc">' + esc(card.description) + '</div>' : '') +
                  '<div class="card-footer"><div class="avatars">' + assignees.slice(0, 4).map(avatar).join('') + '</div>' +
                  '<span class="meta">' + (card.comments || []).length + ' comments</span></div>' +
                '</button>'
              }).join('') +
            '</div>' +
            '<form class="quick-add" data-add="' + esc(column.id) + '">' +
              '<input maxlength="180" placeholder="Add a card..." />' +
              '<button type="submit">Add card</button>' +
            '</form>' +
          '</div>'
        }).join('')
        wireBoard()
      }
      function renderDetail(cardId) {
        const overlay = document.getElementById('overlay')
        const root = document.getElementById('detail')
        const card = cardById(cardId)
        if (!card) {
          closeDetail()
          return
        }
        selectedCardId = cardId
        overlay.classList.remove('hidden')
        root.innerHTML =
          '<div class="detail-header">' +
            '<div><h2>' + esc(card.title) + '</h2><div class="meta">Updated ' + esc(new Date(card.updatedAt).toLocaleString()) + '</div></div>' +
            '<button class="close" type="button" data-close>&times;</button>' +
          '</div>' +
          '<div class="detail-body">' +
            '<section class="section"><div class="section-title">Assignees</div>' +
              '<div class="people">' + ((card.assignees || []).length ? card.assignees.map(personChip).join('') : '<span class="meta">Unassigned</span>') + '</div>' +
              '<div class="actions"><button class="secondary" type="button" data-assign-self="' + esc(card.id) + '">Assign me</button></div>' +
            '</section>' +
            '<section class="section"><div class="section-title">Description</div><p class="description">' + esc(card.description || 'No description') + '</p></section>' +
            '<section class="section"><div class="section-title">Created by</div><div class="people">' + personChip(card.createdBy) + '</div></section>' +
            '<section class="section"><div class="section-title">Comments</div><div class="comments">' +
              (card.comments || []).map((comment) =>
                '<div class="comment-row">' + avatar(comment.author) +
                  '<div class="comment-box"><div class="comment-head"><strong>' + esc(comment.author?.displayName || 'Unknown') + '</strong><span>' + esc(new Date(comment.createdAt).toLocaleString()) + '</span></div>' +
                  '<div class="comment-body">' + esc(comment.body) + '</div></div></div>'
              ).join('') +
              (!card.comments?.length ? '<span class="meta">No comments</span>' : '') +
            '</div></section>' +
            '<form class="section" data-detail-comment="' + esc(card.id) + '"><div class="section-title">Add comment</div><textarea maxlength="1000" rows="4"></textarea><button class="primary" type="submit">Comment</button></form>' +
          '</div>'
        wireDetail()
      }
      function closeDetail() {
        selectedCardId = null
        document.getElementById('overlay').classList.add('hidden')
      }
      function wireBoard() {
        document.querySelectorAll('.card').forEach((card) => {
          card.addEventListener('click', () => renderDetail(card.dataset.open))
          card.addEventListener('dragstart', (event) => {
            card.classList.add('dragging')
            event.dataTransfer.setData('text/plain', card.dataset.card)
          })
          card.addEventListener('dragend', () => card.classList.remove('dragging'))
        })
        document.querySelectorAll('.list').forEach((list) => {
          list.addEventListener('dragover', (event) => {
            event.preventDefault()
            list.classList.add('over')
          })
          list.addEventListener('dragleave', () => list.classList.remove('over'))
          list.addEventListener('drop', async (event) => {
            event.preventDefault()
            list.classList.remove('over')
            const cardId = event.dataTransfer.getData('text/plain')
            const columnId = list.dataset.column
            if (!cardId || !columnId) return
            try {
              await command('cards.move', { cardId, columnId })
              await load()
            } catch (error) {
              toast(error.message)
            }
          })
        })
        document.querySelectorAll('[data-add]').forEach((form) => {
          form.addEventListener('submit', async (event) => {
            event.preventDefault()
            const input = form.querySelector('input')
            const title = input.value.trim()
            if (!title) return
            try {
              await command('cards.create', { title, columnId: form.dataset.add })
              input.value = ''
              await load()
            } catch (error) {
              toast(error.message)
            }
          })
        })
      }
      function wireDetail() {
        document.querySelector('[data-close]')?.addEventListener('click', closeDetail)
        document.querySelector('[data-assign-self]')?.addEventListener('click', async (event) => {
          try {
            await command('cards.assign', { cardId: event.currentTarget.dataset.assignSelf })
            await load()
          } catch (error) {
            toast(error.message)
          }
        })
        document.querySelector('[data-detail-comment]')?.addEventListener('submit', async (event) => {
          event.preventDefault()
          const form = event.currentTarget
          const textarea = form.querySelector('textarea')
          const body = textarea.value.trim()
          if (!body) return
          try {
            await command('cards.comment', { cardId: form.dataset.detailComment, body })
            textarea.value = ''
            await load()
          } catch (error) {
            toast(error.message)
          }
        })
      }
      document.getElementById('overlay').addEventListener('click', (event) => {
        if (event.target.id === 'overlay') closeDetail()
      })
      document.getElementById('refresh').addEventListener('click', () => load().catch((error) => toast(error.message)))
      const params = new URLSearchParams(window.location.search)
      const eventStream = params.get('shadow_event_stream')
      if (eventStream) {
        const live = document.getElementById('live')
        const source = new EventSource(eventStream)
        source.addEventListener('ready', () => {
          live.textContent = 'live'
          live.classList.add('on')
        })
        source.addEventListener('server_app.command.completed', (event) => {
          try {
            const payload = JSON.parse(event.data || '{}')
            if (payload.command === 'boards.get') return
          } catch {
            // Older Shadow servers may omit event details.
          }
          load().catch(() => {})
        })
        source.onerror = () => {
          live.textContent = 'reconnecting'
          live.classList.remove('on')
        }
      }
      load().catch((error) => toast(error.message))
    </script>
  </body>
</html>`
}
