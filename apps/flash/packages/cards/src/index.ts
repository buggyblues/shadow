// ══════════════════════════════════════════════════════════════
// @shadowob/flash-cards — Public API
//
// Independent card rendering library with plugin architecture.
//
// Usage:
//   import { DeskLoop, registry, bootstrapCards } from '@shadowob/flash-cards'
//
//   // Bootstrap built-in card plugins
//   bootstrapCards()
//
//   // Register custom plugin
//   registry.register({
//     kind: 'my-custom-card',
//     priority: 50,
//     contentSystem: (eid) => { ... },
//   })
//
//   // Create and mount the desk
//   const desk = new DeskLoop()
//   desk.mount(canvas, container, cards, callbacks)
// ══════════════════════════════════════════════════════════════

// ── Commands ──
export {
  type ActivateParams,
  type ActParams,
  type AddParams,
  type ArenaParams,
  type CardCommand,
  type CommandContext,
  type CommandName,
  type CommandParams,
  type CommandResult,
  cancelAllAnimations,
  clearHighlight,
  dispatchCommand,
  type FlipParams,
  type FocusParams,
  getHighlight,
  type HighlightParams,
  type HighlightState,
  hasActiveAnimations,
  isHiddenByCommand,
  isLocked,
  type LinkParams,
  type LockParams,
  type MoveParams,
  type MoveToParams,
  type PauseParams,
  type PlayParams,
  parseCommand,
  type RotateParams,
  type ScanParams,
  type ToggleParams,
  type TrashParams,
  tickCommands,
} from './commands'
// ── All Components ──
export * from './components'
// ── Constants ──
export {
  CARD_H,
  CARD_PADDING,
  CARD_RADIUS,
  CARD_SPACING_X,
  CARD_SPACING_Y,
  CARD_W,
  TILT_STRENGTH,
} from './constants'

// ── Bootstrap ──
export { bootstrapCards, getBuiltinPlugins } from './core/bootstrap'

// ── Core ECS ──
export {
  allSceneEids,
  CONTENT_EID,
  contentWorld,
  createSceneEntity,
  destroySceneEntity,
  getCardEid,
  getEidCardId,
  sceneWorld,
} from './core/entity'

// ── World (pipeline + SceneWorld) ──
export { runPipeline, SceneWorld } from './core/world'
export type { CardPluginRegistry } from './registry'
// ── Registry (singleton) ──
export { registry } from './registry'
// ── Renderer Facades ──
export { CardRenderer } from './renderer/CardRenderer'
export { DeskLoop } from './renderer/DeskLoop'
export { animationManager } from './resources/animationManager'
export { type CanvasSetupResult, setupCanvas } from './resources/canvasManager'
export { type DeskInputCallbacks, DeskInputHandler } from './resources/deskInputHandler'
export {
  createGLContext,
  destroyGLContext,
  type GLContext,
  glOrtho,
  resizeGLContext,
} from './resources/glContext'
export {
  createGPUContext,
  destroyGPUContext,
  type GPUContext,
  releaseTextureLayer,
  resizeGPUContext,
} from './resources/gpuContext'
export {
  createPhysicsWorld,
  destroyPhysicsWorld,
  type PhysicsWorld,
} from './resources/physicsWorld'
// ── Resources ──
export {
  type CardTextureInfo,
  cardHash,
  clearAllTextures,
  getCachedTexture,
  removeCachedTexture,
  setCachedTexture,
} from './resources/textureCache'
export {
  clearTextureCache,
  removeCardTexture,
  renderCardTexture,
} from './resources/textureRenderer'
export {
  centerViewportOnCards,
  createViewport,
  panViewport,
  setViewportZoom,
  viewportScreenToWorld,
  zoomViewport,
} from './resources/viewport'
export {
  arenaEdgeHitTest,
  containsWorldPoint,
  drawArenas,
} from './systems/render/arenaRenderSystem'
export {
  type ConstraintRenderConfig,
  drawConstraints,
  drawHighlight,
} from './systems/render/constraintRenderSystem'
export { type GLDrawContext, glDrawSystem } from './systems/render/glDrawSystem'
export { glRenderSystem, type RenderConfig } from './systems/render/glRenderSystem'
// ── Render Systems ──
export { glTextureSystem } from './systems/render/glTextureSystem'
export { type GPURenderConfig, gpuRenderSystem } from './systems/render/gpuRenderSystem'
export { hitTestPoint, hitTestRect as hitTestRectSystem } from './systems/render/hitTestSystem'
// ── Arena System (ECS) ──
export {
  type Arena,
  type ArenaGridOptions,
  type ArenaKind,
  type ArenaMagicOptions,
  type ArenaScriptAPI,
  type ArenaShape,
  activateArena,
  arenaStore,
  clearArenas,
  createArena,
  getAllArenas,
  getArena,
  hitTestArena,
  hitTestArenas,
  moveCardToArena,
  removeArena,
  syncArenaMembership,
} from './systems/scene/arenaSystem'
export { physicsStep, seedBodies, syncBodies } from './systems/scene/bodyLifecycleSystem'
// ── Scene Systems ──
export { flipAnimationSystem } from './systems/scene/flipAnimationSystem'
export { frustumCullSystem } from './systems/scene/frustumCullSystem'
export { type InputState, inputSystem } from './systems/scene/inputSystem'
export { sceneUpdateSystem } from './systems/scene/sceneUpdateSystem'
// ── Types ──
export type {
  CardDecorator,
  CardPlugin,
  ContentSystem,
  DecoratorSystem,
  IconDrawFn,
  PluginChangeCallback,
  PluginRenderDef,
  PluginShaderDef,
  PluginStyleDef,
} from './types'

// ── Utils ──
export * from './utils/canvasUtils'
export * from './utils/glUtils'
