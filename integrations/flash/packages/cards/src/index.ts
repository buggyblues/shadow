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
export {
  CardRenderer,
  type CardRendererOptions,
  type RenderBackend,
  type RenderBackendPreference,
} from './renderer/CardRenderer'
export { DeskLoop, type DeskLoopOptions, type DeskLoopStats } from './renderer/DeskLoop'
export { animationManager } from './resources/animationManager'
export {
  type AnimationRuntimeKind,
  AnimationScheduler,
  type AnimationSchedulerBudget,
  type AnimationSchedulerFrame,
  type AnimationSchedulerStats,
  type AnimationTickRequest,
  animationScheduler,
} from './resources/animationScheduler'
export {
  type ArtLayerRect,
  artLayerManager,
  type StaticArtLayer,
} from './resources/artLayerManager'
export {
  type AssetFrameInfo,
  type AssetMemoryBudget,
  type AssetPipelinePlugin,
  type AssetPipelineStats,
  CardAssetPipeline,
  type CardFaceBackend,
  type CardFaceBackendId,
  type CompressedTextureCandidate,
  type CompressedTextureFormat,
  cardAssetPipeline,
  type TextureColorSpace,
  type TextureUploadBackend,
  type TextureUploadBudget,
  type TextureUploadRequest,
} from './resources/assetPipeline'
export { type CanvasSetupResult, setupCanvas } from './resources/canvasManager'
export {
  paintCardFaceBase,
  paintCardFacePatch,
} from './resources/cardFaceMaterial'
export {
  type CompressedImageMeta,
  type ImageAssetMeta,
  type ResolvedImageAsset,
  resolveImageAssetSource,
} from './resources/compressedTexturePipeline'
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
  Ktx2Runtime,
  type Ktx2RuntimeStats,
  ktx2Runtime,
  type WebGLCompressedTextureSupport,
} from './resources/ktx2Runtime'
export {
  createPhysicsWorld,
  destroyPhysicsWorld,
  type PhysicsWorld,
} from './resources/physicsWorld'
export {
  getSharedPixiRuntime,
  resetSharedPixiRuntime,
  type SharedPixiRuntime,
} from './resources/pixiRuntime'
export {
  runtimeIsActive,
  runtimeIsPrewarm,
  runtimeShouldPrepare,
} from './resources/runtimeState'
export {
  CardSpatialIndex,
  type CardSpatialItem,
  type SpatialIndexStats,
} from './resources/spatialIndex'
// ── Resources ──
export {
  type CardTextureInfo,
  cardHash,
  clearAllTextures,
  getCachedTexture,
  getTextureCacheStats,
  removeCachedTexture,
  setCachedTexture,
  type TextureCacheStats,
  trimTextureCache,
} from './resources/textureCache'
export {
  clearTextureCache,
  removeCardTexture,
  renderCardTexture,
} from './resources/textureRenderer'
export {
  getSharedThreeRuntime,
  resetSharedThreeRuntime,
  type SharedThreeRuntime,
} from './resources/threeRuntime'
export {
  createThreeSceneRuntime,
  hasThreeScenePreset,
  type SceneSetup,
  THREE_SCENE_FACTORIES,
  type ThreeSceneRuntimeOptions,
} from './resources/threeScenePresets'
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
export {
  clearArtLayerTextures,
  glArtLayerSystem,
  removeArtLayerTexture,
} from './systems/render/glArtLayerSystem'
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
export { runtimeActivationSystem } from './systems/scene/runtimeActivationSystem'
export { runtimePrepareSystem } from './systems/scene/runtimePrepareSystem'
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
