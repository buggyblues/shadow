/**
 * Demo GIF Engine — Public API
 *
 * Re-exports the engine primitives so consumers can do:
 *
 *   import { renderGif, effects, assembleGif } from './engine/index.mjs'
 */

export { renderGif } from './renderer.mjs'
export { assembleGif, checkFfmpeg } from './assembler.mjs'
export {
  easeInOutCubic,
  lerp,
  esc,
  crossfade,
  zoomRect,
  zoomCrop,
  zoomAtT,
  highlightSvg,
  labelBadgeSvg,
} from './effects.mjs'
