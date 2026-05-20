// ══════════════════════════════════════════════════════════════
// Resource — Three.js Scene Presets
//
// Shared scene factory for the 3D card runtime. Content systems draw only
// static posters; ECS runtime preparation owns when these scenes materialize.
// ══════════════════════════════════════════════════════════════

import type { ThreeDCardMeta } from '@shadowob/flash-types'
import * as THREE from 'three'
import { resolveImageAssetSource } from './compressedTexturePipeline'
import { ktx2Runtime } from './ktx2Runtime'

export type SceneSetup = (
  s: THREE.Scene,
  cam: THREE.PerspectiveCamera,
  color: THREE.Color,
  color2: THREE.Color,
  wireframe: boolean,
) => (elapsed: number) => void

export interface ThreeSceneRuntimeOptions {
  cardId: string
  sceneKey: string
  color: string
  color2: string
  wireframe: boolean
  textureMeta?: Partial<ThreeDCardMeta>
  onFrameDirty?: () => void
}

export const THREE_SCENE_FACTORIES: Record<string, SceneSetup> = {
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

  particles: (s, cam, color) => {
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

export function hasThreeScenePreset(sceneKey: string): boolean {
  return !!THREE_SCENE_FACTORIES[sceneKey]
}

export function createThreeSceneRuntime(options: ThreeSceneRuntimeOptions): {
  setup: (
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    renderer: THREE.WebGLRenderer,
  ) => void
  tick: (elapsed: number) => void
} {
  let tickFn: (elapsed: number) => void = () => {}
  const factory = THREE_SCENE_FACTORIES[options.sceneKey] ?? THREE_SCENE_FACTORIES.cube!
  return {
    setup: (scene, camera, renderer) => {
      scene.background = null
      tickFn = factory(
        scene,
        camera,
        new THREE.Color(options.color),
        new THREE.Color(options.color2),
        options.wireframe,
      )
      maybeLoadCompressedTexture(options, scene, renderer)
      tickFn(0)
    },
    tick: (elapsed) => tickFn(elapsed),
  }
}

function maybeLoadCompressedTexture(
  options: ThreeSceneRuntimeOptions,
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
): void {
  const meta = options.textureMeta
  if (!meta) return
  const textureAsset = resolveImageAssetSource(`${options.cardId}:three:${options.sceneKey}`, {
    ktx2: meta.ktx2,
    basis: meta.basis,
    fallbackSrc: meta.fallbackSrc,
    compressed: meta.compressed,
  })
  if (!textureAsset.compressed) return

  ktx2Runtime
    .loadTexture(textureAsset.compressed, renderer)
    .then((texture) => {
      if (!texture) return
      applyTextureToScene(scene, texture)
      options.onFrameDirty?.()
    })
    .catch(() => {
      /* keep color-only material */
    })
}

function applyTextureToScene(scene: THREE.Scene, texture: THREE.Texture): void {
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh
    const material = mesh.material
    if (!material) return
    const materials = Array.isArray(material) ? material : [material]
    for (const item of materials) {
      if (!('map' in item)) continue
      item.map = texture
      item.needsUpdate = true
    }
  })
}
