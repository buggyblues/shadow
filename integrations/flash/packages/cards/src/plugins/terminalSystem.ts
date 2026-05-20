// ECS Content System — Terminal Card
// Dark terminal window with cmd/output/error/info lines.

import { canvasStore } from '../components/canvasComponent'
import { advance, layoutStore, remainingH } from '../components/layoutComponent'
import { terminalMetaStore } from '../components/metaComponent'
import { styleStore } from '../components/styleComponent'
import { fillRoundRect, fontStr, hexAlpha, safeStr, truncText } from '../utils/canvasUtils'

const LINE_COLORS = {
  cmd: '#4ade80', // green prompt
  out: '#e2e8f0', // light output
  err: '#f87171', // red error
  info: '#60a5fa', // blue info
}

export function terminalSystem(eid: number): boolean {
  const meta = terminalMetaStore[eid]
  if (!meta) return false

  const { ctx } = canvasStore[eid]!
  const layout = layoutStore[eid]!
  const { padX, contentW } = layout
  const { accentColor } = styleStore[eid]!

  const availH = remainingH(layout) - 4
  const winH = Math.max(50, availH)
  const winX = padX - 2
  const winW = contentW + 4
  const winY = layout.cursorY

  // Window frame
  ctx.fillStyle = '#0d1117'
  fillRoundRect(ctx, winX, winY, winW, winH, 5)

  // Title bar
  const tbH = 14
  const tbGrad = ctx.createLinearGradient(winX, winY, winX, winY + tbH)
  tbGrad.addColorStop(0, '#21262d')
  tbGrad.addColorStop(1, '#161b22')
  ctx.fillStyle = tbGrad
  fillRoundRect(ctx, winX, winY, winW, tbH, 5)
  // Flatten bottom corners of title bar
  ctx.fillRect(winX, winY + tbH - 5, winW, 5)

  // Traffic lights
  const tlOffset = 6
  const dots = ['#ff5f56', '#ffbd2e', '#27c93f']
  dots.forEach((c, i) => {
    ctx.fillStyle = c
    ctx.beginPath()
    ctx.arc(winX + tlOffset + i * 9, winY + tbH / 2, 2.5, 0, Math.PI * 2)
    ctx.fill()
  })

  // Shell title
  const shellTitle = safeStr(meta.title || meta.shell || 'bash')
  ctx.font = fontStr(6, '', '', '"Courier New", monospace')
  ctx.fillStyle = 'rgba(255,255,255,0.4)'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(shellTitle, winX + winW / 2, winY + tbH / 2)

  // CWD label
  if (meta.cwd) {
    ctx.font = fontStr(5.5, '', '', '"Courier New", monospace')
    ctx.fillStyle = 'rgba(255,255,255,0.25)'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    ctx.fillText(meta.cwd.slice(-24), winX + winW - 5, winY + tbH / 2)
  }

  // Content area
  const contentTop = winY + tbH + 4
  const lh = 9
  const maxLines = Math.floor((winH - tbH - 8) / lh)
  const lines = (meta.lines || []).slice(-maxLines)

  lines.forEach((line, i) => {
    const ly = contentTop + i * lh
    const color = LINE_COLORS[line.type] || LINE_COLORS.out
    ctx.font = fontStr(6.5, line.type === 'cmd' ? 'bold' : '', '', '"Courier New", monospace')
    ctx.fillStyle = color
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'

    const prefix =
      line.type === 'cmd' ? '$ ' : line.type === 'err' ? '✕ ' : line.type === 'info' ? '→ ' : '  '
    const maxChars = Math.floor((winW - 10) / 4)
    ctx.fillText(prefix + line.text.slice(0, maxChars), winX + 5, ly)
  })

  // Blinking cursor on last line
  const cursorY = contentTop + lines.length * lh
  if (cursorY < winY + winH - 6) {
    ctx.fillStyle = '#4ade80'
    ctx.fillRect(winX + 5 + 7, cursorY + 1, 5, lh - 2)
  }

  advance(layout, winH + 4)
  return true
}
