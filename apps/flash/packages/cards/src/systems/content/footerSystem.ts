// ECS Decorator System — Card Footer (bitECS, eid-based)

import { canvasStore } from '../../components/canvasComponent'
import { cardDataStore } from '../../components/cardDataComponent'
import { layoutStore } from '../../components/layoutComponent'
import { styleStore } from '../../components/styleComponent'
import { fontStr } from '../../utils/canvasUtils'

export function footerSystem(eid: number): void {
  const { ctx, width, height } = canvasStore[eid]!
  const { accentColor } = styleStore[eid]!
  const { padX } = layoutStore[eid]!
  const { card } = cardDataStore[eid]!

  if (card.linkedCardIds && card.linkedCardIds.length > 0) {
    ctx.font = fontStr(8, 500, '', '"Cinzel", Georgia, serif')
    ctx.fillStyle = '#8a7a5a'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    ctx.fillText(`+${card.linkedCardIds.length}`, width - padX, height - 8)
  }

  if (card.isStreaming) {
    ctx.fillStyle = accentColor
    ctx.globalAlpha = 0.7
    ctx.beginPath()
    ctx.arc(width - padX, 10, 3, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1.0
  }
}
