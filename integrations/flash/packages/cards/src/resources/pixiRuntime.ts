// ══════════════════════════════════════════════════════════════
// Resource — Shared PixiJS Runtime
//
// One PixiJS application/context for dynamic card sources. Live2D uses it
// today; future Pixi/Rive/dotLottie adapters can share the same lifecycle
// instead of creating per-card renderers.
// ══════════════════════════════════════════════════════════════

export interface SharedPixiRuntime {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  PIXI: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Live2DModel: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app: any
  view: HTMLCanvasElement
  tick: (timestamp: number) => void
  renderToCanvas: (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    displayObject: any,
    target: HTMLCanvasElement,
    width: number,
    height: number,
  ) => void
}

let runtimePromise: Promise<SharedPixiRuntime> | null = null
let runtime: SharedPixiRuntime | null = null
let rendererSize = { w: 0, h: 0 }

export function getSharedPixiRuntime(mountEl: HTMLElement | null): Promise<SharedPixiRuntime> {
  if (runtimePromise) return runtimePromise

  runtimePromise = Promise.all([
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    import('pixi.js'),
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    import('pixi-live2d-display/cubism4').then((m: any) => m.Live2DModel),
  ]).then(([PIXI, Live2DModel]) => {
    configurePixiCrossOrigin(PIXI)
    Live2DModel.registerTicker(PIXI.Ticker)

    const view = document.createElement('canvas')
    view.width = 1
    view.height = 1
    view.style.cssText = 'position:absolute;left:-9999px;pointer-events:none'
    mountEl?.appendChild(view)

    const app = new PIXI.Application({
      view,
      width: 1,
      height: 1,
      backgroundAlpha: 0,
      antialias: true,
      resolution: 1,
    })
    app.ticker.stop()

    runtime = {
      PIXI,
      Live2DModel,
      app,
      view,
      tick: (timestamp: number) => app.ticker.update(timestamp),
      renderToCanvas: (
        displayObject: any,
        target: HTMLCanvasElement,
        width: number,
        height: number,
      ) => {
        if (rendererSize.w !== width || rendererSize.h !== height) {
          app.renderer.resize(width, height)
          rendererSize = { w: width, h: height }
        }
        app.renderer.clear()
        app.renderer.render(displayObject)
        const ctx = target.getContext('2d')
        if (!ctx) return
        ctx.clearRect(0, 0, width, height)
        ctx.drawImage(app.renderer.view as HTMLCanvasElement, 0, 0)
      },
    }
    return runtime
  })

  return runtimePromise
}

export function resetSharedPixiRuntime(): void {
  try {
    runtime?.app?.destroy?.(true)
  } catch {
    /* ignore */
  }
  runtime?.view.remove()
  runtime = null
  runtimePromise = null
  rendererSize = { w: 0, h: 0 }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function configurePixiCrossOrigin(PIXI: any): void {
  // pixi-live2d-display v0.4 uses the legacy PIXI.Loader internally.
  // Without anonymous CORS, WebGL texture upload can taint the canvas.
  if (PIXI.Loader?.shared) {
    PIXI.Loader.shared.pre((resource: any, next: any) => {
      resource.crossOrigin = 'anonymous'
      next()
    })
  }
  if (PIXI.Assets?.setPreferences) {
    PIXI.Assets.setPreferences({ crossOrigin: 'anonymous' })
  }
}
