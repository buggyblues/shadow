// ECS Content System — Three.js 3D Card
// Uses AnimationManager to spin up a WebGL renderer per card.
// Each card gets an isolated Three.js scene rendered every RAF,
// with the result blitted into the card's Canvas 2D texture.
//
// Preset scenes:
//   cube       — wireframe + solid rotating box
//   torus      — metallic torus knot
//   particles  — point-cloud galaxy
//   dna        — double helix with spheres
//   earth      — sphere with grid lines
//   galaxy     — swirling star particles

import * as THREE from 'three'

import { canvasStore } from '../components/canvasComponent'
import { cardDataStore } from '../components/cardDataComponent'
import { advance, layoutStore, remainingH } from '../components/layoutComponent'
import { threeDMetaStore } from '../components/metaComponent'
import { styleStore } from '../components/styleComponent'
import { animationManager } from '../resources/animationManager'
import { fillRoundRect, fontStr, hexAlpha, safeStr } from '../utils/canvasUtils'

// ─────────────────────────────────────
// Scene factories
// ─────────────────────────────────────

type SceneSetup = (
  s: THREE.Scene,
  cam: THREE.PerspectiveCamera,
  color: THREE.Color,
  color2: THREE.Color,
  wireframe: boolean,
) => (elapsed: number) => void

const SCENE_FACTORIES: Record<string, SceneSetup> = {
  cube: (s, _cam, color, color2, wf) => {
    const geo = new THREE.BoxGeometry(1.4, 1.4, 1.4)
    const mat = new THREE.MeshPhongMaterial({ color, wireframe: wf })
    const mesh = new THREE.Mesh(geo, mat)
    s.add(mesh)
    if (wf) {
      const outline = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({ color: color2, wireframe: true }),
      )
      s.add(outline)
    }
    s.add(new THREE.AmbientLight(0xffffff, 0.6))
    const dl = new THREE.DirectionalLight(0xffffff, 1.2)
    dl.position.set(3, 5, 3)
    s.add(dl)
    return (t) => {
      mesh.rotation.y = t * 0.001
      mesh.rotation.x = t * 0.0007
    }
  },

  torus: (s, _cam, color, _c2, wf) => {
    const geo = new THREE.TorusKnotGeometry(0.9, 0.3, 100, 16)
    const mat = new THREE.MeshPhongMaterial({ color, wireframe: wf, shininess: 120 })
    const mesh = new THREE.Mesh(geo, mat)
    s.add(mesh)
    s.add(new THREE.AmbientLight(0xffffff, 0.4))
    const dl = new THREE.DirectionalLight(0xffffff, 1.4)
    dl.position.set(2, 4, 3)
    s.add(dl)
    const dl2 = new THREE.DirectionalLight(0x8888ff, 0.6)
    dl2.position.set(-3, -2, -1)
    s.add(dl2)
    return (t) => {
      mesh.rotation.y = t * 0.0008
      mesh.rotation.z = t * 0.0005
    }
  },

  particles: (s, cam, color, _c2) => {
    cam.position.set(0, 0, 4)
    const count = 2000
    const positions = new Float32Array(count * 3)
    for (let i = 0; i < count * 3; i++) positions[i] = (Math.random() - 0.5) * 8
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const mat = new THREE.PointsMaterial({ color, size: 0.04 })
    const pts = new THREE.Points(geo, mat)
    s.add(pts)
    s.add(new THREE.AmbientLight(0xffffff, 1))
    return (t) => {
      pts.rotation.y = t * 0.0003
      pts.rotation.x = Math.sin(t * 0.0002) * 0.3
    }
  },

  dna: (s, cam, color, color2) => {
    cam.position.set(0, 0, 5)
    const group = new THREE.Group()
    const sphereGeo = new THREE.SphereGeometry(0.08, 8, 8)
    const mat1 = new THREE.MeshPhongMaterial({ color })
    const mat2 = new THREE.MeshPhongMaterial({ color: color2 })
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x888888,
      opacity: 0.5,
      transparent: true,
    })
    for (let i = 0; i < 24; i++) {
      const t = (i / 24) * Math.PI * 4
      const y = (i / 24) * 4 - 2
      const r = 0.8
      const s1 = new THREE.Mesh(sphereGeo, i % 2 === 0 ? mat1 : mat2)
      s1.position.set(Math.cos(t) * r, y, Math.sin(t) * r)
      group.add(s1)
      const s2 = new THREE.Mesh(sphereGeo, i % 2 === 0 ? mat2 : mat1)
      s2.position.set(Math.cos(t + Math.PI) * r, y, Math.sin(t + Math.PI) * r)
      group.add(s2)
      // Rung
      const lineGeo = new THREE.BufferGeometry().setFromPoints([s1.position, s2.position])
      group.add(new THREE.Line(lineGeo, lineMat))
    }
    s.add(group)
    s.add(new THREE.AmbientLight(0xffffff, 0.5))
    const dl = new THREE.DirectionalLight(0xffffff, 1)
    dl.position.set(3, 5, 3)
    s.add(dl)
    return (t) => {
      group.rotation.y = t * 0.0005
    }
  },

  earth: (s, _cam, color, color2) => {
    const geo = new THREE.SphereGeometry(1.2, 32, 32)
    const mat = new THREE.MeshPhongMaterial({ color, wireframe: false })
    const mesh = new THREE.Mesh(geo, mat)
    s.add(mesh)
    // Grid lines
    const wireGeo = new THREE.SphereGeometry(1.21, 16, 16)
    const wireMat = new THREE.MeshBasicMaterial({
      color: color2,
      wireframe: true,
      opacity: 0.25,
      transparent: true,
    })
    s.add(new THREE.Mesh(wireGeo, wireMat))
    s.add(new THREE.AmbientLight(0x334455, 0.8))
    const sun = new THREE.DirectionalLight(0xffeedd, 1.4)
    sun.position.set(5, 3, 5)
    s.add(sun)
    return (t) => {
      mesh.rotation.y = t * 0.0004
    }
  },

  galaxy: (s, cam, color) => {
    cam.position.set(0, 2, 4)
    cam.lookAt(0, 0, 0)
    const count = 3000
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    const c1 = new THREE.Color(color)
    const c2 = new THREE.Color(0xffffff)
    for (let i = 0; i < count; i++) {
      const r = Math.random() * 3 + 0.2
      const angle = Math.random() * Math.PI * 2
      const spin = r * 0.5
      const branch = ((i % 3) * Math.PI * 2) / 3
      positions[i * 3] = Math.cos(angle + branch + spin) * r + (Math.random() - 0.5) * 0.3
      positions[i * 3 + 1] = (Math.random() - 0.5) * 0.2
      positions[i * 3 + 2] = Math.sin(angle + branch + spin) * r + (Math.random() - 0.5) * 0.3
      const mixed = new THREE.Color().lerpColors(c1, c2, Math.random())
      colors[i * 3] = mixed.r
      colors[i * 3 + 1] = mixed.g
      colors[i * 3 + 2] = mixed.b
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    const mat = new THREE.PointsMaterial({ size: 0.03, vertexColors: true })
    const pts = new THREE.Points(geo, mat)
    s.add(pts)
    s.add(new THREE.AmbientLight(0xffffff, 1))
    return (t) => {
      pts.rotation.y = t * 0.0002
    }
  },
}

// ─────────────────────────────────────
// System
// ─────────────────────────────────────

export function threeSystem(eid: number): boolean {
  const meta = threeDMetaStore[eid]
  if (!meta) return false
  // Guard: scene must be a recognized preset — skip stressCards with no scene
  const sceneKey = meta.scene || ''
  if (!SCENE_FACTORIES[sceneKey]) return false

  const { ctx } = canvasStore[eid]!
  const layout = layoutStore[eid]!
  const { padX, contentW } = layout
  const { accentColor } = styleStore[eid]!
  const { card } = cardDataStore[eid]!

  const availH = remainingH(layout)
  const viewH = Math.min(availH - 24, contentW * 1.1)
  const viewW = contentW
  const vX = padX - 2,
    vY = layout.cursorY + 2

  // ── Get or create the Three.js render canvas ──────────
  let threeCanvas = animationManager.getThreeCanvas(card.id)

  if (!threeCanvas) {
    const px = Math.round(viewW * 2)
    const py = Math.round(viewH * 2)
    const color1 = new THREE.Color(meta.color || accentColor)
    const color2 = new THREE.Color(meta.color2 || '#ffffff')
    const wf = meta.wireframe ?? false
    const sceneKey = meta.scene || 'cube'
    const factory = SCENE_FACTORIES[sceneKey] ?? SCENE_FACTORIES.cube

    let tickFn: (e: number) => void = () => {}

    threeCanvas = animationManager.registerThree(
      card.id,
      px,
      py,
      (scene, camera) => {
        // Set scene background transparent
        scene.background = null
        tickFn = factory(scene, camera, color1, color2, wf)
        // Render once immediately so static first-frame is visible
        tickFn(0)
      },
      (elapsed) => tickFn(elapsed),
    )
    // Register autoplay preference
    if (meta.autoplay) animationManager.markAutoplay(card.id)
  }

  // ── Blit Three.js canvas into card canvas (contain ratio, no bg fill) ──
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(vX, vY, viewW, viewH, 6)
  ctx.clip()
  // Contain: preserve aspect ratio of the Three.js canvas
  const sw3 = threeCanvas.width || 1,
    sh3 = threeCanvas.height || 1
  const s3 = Math.min(viewW / sw3, viewH / sh3)
  const dw3 = sw3 * s3,
    dh3 = sh3 * s3
  const dx3 = vX + (viewW - dw3) / 2,
    dy3 = vY + (viewH - dh3) / 2
  ctx.drawImage(threeCanvas, dx3, dy3, dw3, dh3)
  ctx.restore()

  advance(layout, viewH + 8)

  // Description
  const desc = safeStr(meta.description)
  if (desc && remainingH(layout) > 10) {
    ctx.font = fontStr(7, '', '', '"Noto Sans SC", sans-serif')
    ctx.fillStyle = hexAlpha(accentColor, 0.6)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(desc.slice(0, 44), padX + contentW / 2, layout.cursorY + 2)
    advance(layout, 11)
  }

  return true
}
