// ══════════════════════════════════════════════════════════════
// ECS Bootstrap — Register all Systems into the World
//
// This file is the ONLY place that knows about all Systems.
// Adding a new CardKind? Just import & register here.
// ══════════════════════════════════════════════════════════════

import { argumentSystem } from './systems/argumentSystem'
import { chartSystem } from './systems/chartSystem'
import { codeSystem } from './systems/codeSystem'
import { colorSystem } from './systems/colorSystem'
import { commentSystem } from './systems/commentSystem'
import { comparisonSystem } from './systems/comparisonSystem'
import { countdownSystem } from './systems/countdownSystem'
// ── Content Systems (order = priority) ──
import { dataSystem } from './systems/dataSystem'
import { definitionSystem } from './systems/definitionSystem'
import { eventSystem } from './systems/eventSystem'
import { exampleSystem } from './systems/exampleSystem'
import { fallbackSystem } from './systems/fallbackSystem'
import { fileSystem } from './systems/fileSystem'
import { footerSystem } from './systems/footerSystem'
import { gifSystem } from './systems/gifSystem'
// ── Decorator Systems ──
import { headerSystem } from './systems/headerSystem'
import { imageSystem } from './systems/imageSystem'
import { inspirationSystem } from './systems/inspirationSystem'
import { keypointSystem } from './systems/keypointSystem'
import { linkSystem } from './systems/linkSystem'
import { live2dSystem } from './systems/live2dSystem'
import { lottieSystem } from './systems/lottieSystem'
import { mathSystem } from './systems/mathSystem'
import { personSystem } from './systems/personSystem'
import { pokerSystem } from './systems/pokerSystem'
import { positionSystem } from './systems/positionSystem'
import { processSystem } from './systems/processSystem'
import { qrcodeSystem } from './systems/qrcodeSystem'
import { quoteSystem } from './systems/quoteSystem'
import { referenceSystem } from './systems/referenceSystem'
import { socialSystem } from './systems/socialSystem'
import { storySystem } from './systems/storySystem'
import { tableSystem } from './systems/tableSystem'
import { tarotSystem } from './systems/tarotSystem'
import { terminalSystem } from './systems/terminalSystem'
import { threeSystem } from './systems/threeSystem'
import { timelineSystem } from './systems/timelineSystem'
import { timestampSystem } from './systems/timestampSystem'
import { todoSystem } from './systems/todoSystem'
import { voiceSystem } from './systems/voiceSystem'
import { webpageSystem } from './systems/webpageSystem'
import { registerContentSystem, registerPostDecorator, registerPreDecorator } from './world'

let booted = false

/**
 * Register all Systems. Idempotent — safe to call multiple times.
 */
export function bootstrapECS() {
  if (booted) return
  booted = true

  // Phase 1: Pre-decorators (header)
  registerPreDecorator(headerSystem)

  // Phase 2: Content systems — first match wins
  registerContentSystem(dataSystem)
  registerContentSystem(chartSystem)
  registerContentSystem(quoteSystem)
  registerContentSystem(argumentSystem)
  registerContentSystem(timelineSystem)
  registerContentSystem(comparisonSystem)
  registerContentSystem(processSystem)
  registerContentSystem(tableSystem)
  registerContentSystem(keypointSystem)
  registerContentSystem(definitionSystem)
  registerContentSystem(exampleSystem)
  registerContentSystem(codeSystem)
  registerContentSystem(inspirationSystem)
  registerContentSystem(referenceSystem)
  registerContentSystem(gifSystem)
  registerContentSystem(imageSystem)
  registerContentSystem(qrcodeSystem)
  registerContentSystem(personSystem)
  registerContentSystem(terminalSystem)
  registerContentSystem(lottieSystem)
  registerContentSystem(webpageSystem)
  registerContentSystem(countdownSystem)
  registerContentSystem(threeSystem)
  registerContentSystem(live2dSystem)
  registerContentSystem(linkSystem)
  registerContentSystem(fileSystem)
  registerContentSystem(mathSystem)
  registerContentSystem(todoSystem)
  registerContentSystem(positionSystem)
  registerContentSystem(timestampSystem)
  registerContentSystem(colorSystem)
  registerContentSystem(eventSystem)
  registerContentSystem(voiceSystem)
  registerContentSystem(commentSystem)
  registerContentSystem(storySystem)
  registerContentSystem(socialSystem)
  registerContentSystem(pokerSystem)
  registerContentSystem(tarotSystem)
  // Fallback is the last content system — always returns true
  registerContentSystem(fallbackSystem)

  // Phase 3: Post-decorators (footer)
  registerPostDecorator(footerSystem)
}
