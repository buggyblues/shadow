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
        height: 56px;
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
        grid-auto-columns: minmax(260px, 300px);
        gap: 12px;
        align-items: start;
        min-height: 100%;
      }
      .list {
        max-height: calc(100vh - 88px);
        display: flex;
        flex-direction: column;
        border-radius: 12px;
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
        border-radius: 8px;
        background: #fff;
        box-shadow: 0 1px 0 rgba(9,30,66,.25);
        padding: 10px;
        cursor: grab;
      }
      .card:active { cursor: grabbing; }
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
      .card-title { font-size: 14px; line-height: 1.35; font-weight: 650; }
      .card-desc { margin-top: 6px; color: #5e6c84; font-size: 12px; line-height: 1.45; }
      .card-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-top: 10px;
      }
      .avatars { display: flex; align-items: center; gap: 4px; }
      .avatar {
        display: grid;
        place-items: center;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background: #172b4d;
        color: #fff;
        font-size: 11px;
        font-weight: 800;
      }
      .comment { color: #5e6c84; font-size: 12px; }
      .quick-add {
        display: grid;
        gap: 6px;
        padding: 0 8px 10px;
      }
      .quick-add input {
        width: 100%;
        min-height: 36px;
        border: 1px solid transparent;
        border-radius: 8px;
        padding: 8px 10px;
        font: inherit;
        outline: none;
      }
      .quick-add input:focus { border-color: #0079bf; box-shadow: inset 0 0 0 1px #0079bf; }
      .quick-add button {
        justify-self: start;
        background: #0079bf;
        color: #fff;
      }
      .toast {
        position: fixed;
        right: 16px;
        bottom: 16px;
        max-width: 360px;
        border-radius: 10px;
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
        header { height: auto; min-height: 56px; align-items: flex-start; flex-direction: column; padding: 12px; }
        main { height: calc(100vh - 92px); padding: 12px; }
        .board { grid-auto-columns: minmax(240px, 82vw); }
      }
    </style>
  </head>
  <body>
    <header>
      <div>
        <h1>Shadow Kanban</h1>
        <div class="subtitle">Trello-style board shared by people and Buddies</div>
      </div>
      <div class="toolbar">
        <span id="live" class="status">manual</span>
        <button class="refresh" id="refresh">Refresh</button>
      </div>
    </header>
    <main><section id="board" class="board"></section></main>
    <div id="toast" class="toast"></div>
    <script>
      const pending = new Map()
      let board = null
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
      function initials(value) {
        return String(value || '?').split(/\\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
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
      }
      function render() {
        const root = document.getElementById('board')
        root.innerHTML = board.columns.map((column) => {
          const cards = board.cards.filter((card) => card.columnId === column.id)
          return \`
            <div class="list" data-column="\${esc(column.id)}">
              <div class="list-header">
                <div class="list-title">\${esc(column.title)}</div>
                <div class="count">\${cards.length}</div>
              </div>
              <div class="cards">
                \${cards.map((card) => \`
                  <article class="card" draggable="true" data-card="\${esc(card.id)}">
                    <div class="labels">\${(card.labels || []).map((label) => \`<span title="\${esc(label)}" class="label \${esc(label)}"></span>\`).join('')}</div>
                    <div class="card-title">\${esc(card.title)}</div>
                    \${card.description ? \`<div class="card-desc">\${esc(card.description)}</div>\` : ''}
                    <div class="card-footer">
                      <div class="avatars">\${(card.assignees || []).map((name) => \`<span class="avatar" title="\${esc(name)}">\${esc(initials(name))}</span>\`).join('')}</div>
                      <button type="button" data-comment="\${esc(card.id)}" class="comment">\${(card.comments || []).length} comments</button>
                    </div>
                  </article>
                \`).join('')}
              </div>
              <form class="quick-add" data-add="\${esc(column.id)}">
                <input maxlength="180" placeholder="Add a card..." />
                <button type="submit">Add card</button>
              </form>
            </div>\`
        }).join('')
        wireBoard()
      }
      function wireBoard() {
        document.querySelectorAll('.card').forEach((card) => {
          card.addEventListener('dragstart', (event) => {
            event.dataTransfer.setData('text/plain', card.dataset.card)
          })
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
        document.querySelectorAll('[data-comment]').forEach((button) => {
          button.addEventListener('click', async () => {
            const body = window.prompt('Comment')
            if (!body) return
            try {
              await command('cards.comment', { cardId: button.dataset.comment, body })
              await load()
            } catch (error) {
              toast(error.message)
            }
          })
        })
      }
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
            // Keep the board responsive even if an older Shadow server omits event data.
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
