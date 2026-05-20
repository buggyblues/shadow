// ══════════════════════════════════════════════════════════════
// Resource — Shared Three.js Runtime
//
// One Three.js WebGL renderer/context for all 3D card runtimes. Each card
// owns only a lightweight 2D canvas that the GPU compositor can sample.
// ══════════════════════════════════════════════════════════════

import * as THREE from 'three'

export interface SharedThreeRuntime {
  renderer: THREE.WebGLRenderer
  view: HTMLCanvasElement
  renderToCanvas: (
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    target: HTMLCanvasElement,
    width: number,
    height: number,
  ) => void
}

let runtime: SharedThreeRuntime | null = null
let rendererSize = { w: 0, h: 0 }
const targetContexts = new WeakMap<HTMLCanvasElement, CanvasRenderingContext2D>()

export function getSharedThreeRuntime(mountEl: HTMLElement | null): SharedThreeRuntime {
  if (runtime) return runtime

  const view = document.createElement('canvas')
  view.width = 1
  view.height = 1
  view.style.cssText = 'position:absolute;left:-9999px;top:0;pointer-events:none'
  mountEl?.appendChild(view)

  const renderer = new THREE.WebGLRenderer({
    canvas: view,
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance',
  })
  renderer.setPixelRatio(1)
  renderer.setClearColor(0x000000, 0)

  runtime = {
    renderer,
    view,
    renderToCanvas: (scene, camera, target, width, height) => {
      if (rendererSize.w !== width || rendererSize.h !== height) {
        renderer.setSize(width, height, false)
        rendererSize = { w: width, h: height }
      }

      const aspect = width / height
      if (camera.aspect !== aspect) {
        camera.aspect = aspect
        camera.updateProjectionMatrix()
      }

      renderer.clear()
      renderer.render(scene, camera)

      const ctx = getTargetContext(target)
      if (!ctx) return
      ctx.clearRect(0, 0, width, height)
      ctx.drawImage(view, 0, 0, width, height)
    },
  }

  return runtime
}

export function resetSharedThreeRuntime(): void {
  try {
    runtime?.renderer.dispose()
    runtime?.renderer.forceContextLoss()
  } catch {
    /* ignore */
  }
  runtime?.view.remove()
  runtime = null
  rendererSize = { w: 0, h: 0 }
}

function getTargetContext(target: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const cached = targetContexts.get(target)
  if (cached) return cached

  const ctx = target.getContext('2d', { alpha: true })
  if (!ctx) return null
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  targetContexts.set(target, ctx)
  return ctx
}
