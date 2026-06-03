/**
 * VỊ TRÍ   — archplan/src/archplan/gui/grass-preview.ts
 * VAI TRÒ  — Bảng preview nhỏ cạnh panel 🎛️ Tinh chỉnh: mini-scene WebGPU render ĐÚNG 1 ngọn cỏ.
 *            Vừa quan sát vừa tinh chỉnh 1 lá → áp hàng loạt ra bãi ngoài. Live-sync cùng grass3d.
 * LIÊN HỆ  — ArchPlanLab dựng + giữ ref; rebuild(cfg) khi structural, getGrass() để tune uniform live.
 *
 * ⚠️ Dùng WebGPURenderer RIÊNG (canvas riêng) — TSL/NodeMaterial bắt buộc WebGPU; không hook được
 *    vào loop BaseWorld để vẽ inset. 1 lá → cost không đáng kể. Gió chạy bằng built-in time.
 *    OrbitControls: kéo trái=xoay, chuột phải=pan (dời lá), cuộn=zoom (damping → loop gọi update()).
 * DISPOSE: dispose() — setAnimationLoop(null) + controls/grass/renderer.dispose() + gỡ panel.
 */

import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { color, mix, normalWorld, smoothstep } from 'three/tsl'
import { WebGPURenderer } from 'three/webgpu'
import { GrassBlades } from 'threejs-modules/components/GrassBlades'
import type { Grass3DConfig } from 'threejs-modules/site/state'

const INIT = 130 // px — cạnh VUÔNG ban đầu (trước khi ResizeObserver đo bề ngang host)

export class GrassPreview {
  private renderer: WebGPURenderer | null = null
  private readonly scene = new THREE.Scene()
  private readonly camera: THREE.PerspectiveCamera
  private grass: GrassBlades | null = null
  private readonly canvas: HTMLCanvasElement
  private readonly panel: HTMLElement
  private controls: OrbitControls | null = null // kéo-xoay + cuộn-zoom quanh lá
  private ro: ResizeObserver | null = null // theo bề ngang host → render VUÔNG full-width
  private lastW = 0
  private isDisposed = false

  constructor(container: Element | null) {
    this.panel = document.createElement('div')
    this.panel.className = 'ap-scan-panel ap-preview-panel'
    const ttl = document.createElement('div')
    ttl.className = 'ap-scan-title'
    ttl.textContent = '🔎 Preview 1 lá'
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'ap-preview-canvas'
    this.panel.appendChild(ttl)
    this.panel.appendChild(this.canvas)
    container?.appendChild(this.panel)

    // Nền gradient studio SÁNG (đỉnh slate → đáy sáng) để lá xanh nổi rõ silhouette khi soi hình dáng.
    // WebGPU chỉ nhận màu đặc (isColor) HOẶC backgroundNode (TSL → skydome sphere); CanvasTexture
    // rơi vào 'Unsupported background configuration'. normalWorld.y: dưới chân trời→0, trên đỉnh→1.
    const bg = mix(color(0xe6ebef), color(0x7c91a6), smoothstep(-0.6, 0.7, normalWorld.y))
    ;(this.scene as THREE.Scene & { backgroundNode: unknown }).backgroundNode = bg
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.01, 10) // aspect 1 = khung vuông
    this.camera.position.set(0.06, 0.17, 0.52)
    this.camera.lookAt(0, 0.13, 0)
    this.scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x35502a, 2.2))
    const dir = new THREE.DirectionalLight(0xffffff, 2.2)
    dir.position.set(0.5, 1, 0.6)
    this.scene.add(dir)

    // Kéo trái = xoay; chuột phải kéo = pan (dời lá lên/xuống/qua lại); cuộn = zoom.
    // Damping mượt → loop gọi controls.update(). screenSpacePanning mặc định true → pan theo mặt phẳng màn hình.
    const controls = new OrbitControls(this.camera, this.canvas)
    controls.target.set(0, 0.13, 0) // tâm xoay ~ giữa lá
    controls.enableDamping = true
    controls.dampingFactor = 0.12
    controls.enablePan = true
    controls.panSpeed = 0.6 // chậm lại chút cho khung nhỏ khỏi văng lá ra ngoài
    controls.minDistance = 0.2
    controls.maxDistance = 1.5
    controls.update()
    this.controls = controls

    this.ro = new ResizeObserver(() => this._syncSize())
    this.ro.observe(this.panel)
  }

  // Khớp buffer render với bề ngang host (VUÔNG w×w). Bỏ qua khi panel ẩn (tab khác → clientWidth 0).
  private _syncSize(): void {
    const cw = this.panel.clientWidth
    if (cw < 1) return
    const w = Math.max(40, Math.round(cw))
    if (w === this.lastW) return
    this.lastW = w
    this.renderer?.setSize(w, w, false) // updateStyle=false → CSS (width:100%) lo hiển thị
  }

  // Khởi tạo renderer WebGPU (async). Gọi 1 lần; sau đó chạy loop render (gió tự đong đưa qua time).
  async init(): Promise<void> {
    const r = new WebGPURenderer({ canvas: this.canvas, antialias: true })
    r.setPixelRatio(Math.min(2, window.devicePixelRatio))
    r.setSize(INIT, INIT, false)
    await r.init()
    if (this.isDisposed) {
      r.dispose()
      return
    }
    this.renderer = r
    this.lastW = 0
    this._syncSize() // đo bề ngang host thật ngay khi renderer sẵn sàng
    r.setAnimationLoop(() => {
      this.controls?.update() // damping + áp thao tác kéo/zoom vào camera
      this.renderer?.render(this.scene, this.camera)
    })
  }

  // Dựng lại 1 lá từ config (structural đổi → tạo instance mới). Trả grass để caller tune uniform live.
  rebuild(cfg: Grass3DConfig): GrassBlades | null {
    if (this.isDisposed) return null
    this.grass?.dispose()
    this.grass = null
    if (!cfg.enabled) return null
    // width/depth siêu nhỏ + maxBlades 1 → đúng 1 lá ở tâm (camera frame sẵn). DÙNG CHUNG model với bãi.
    this.grass = new GrassBlades({
      width: 0.01,
      depth: 0.01,
      baseY: 0,
      density: 100,
      maxBlades: 1,
      bladeHeight: cfg.height,
      bladeWidth: cfg.bladeWidth,
      midWidth: cfg.midWidth,
      segments: cfg.segments,
      taper: cfg.taper,
      curveLR: cfg.curveLR,
      bend: cfg.bend,
      cup: cfg.cup,
      cupGeo: cfg.cupGeo,
      bladesPerClump: cfg.bladesPerClump,
      clumpRadius: cfg.clumpRadius,
      clumpSplay: cfg.clumpSplay,
      color: cfg.color,
    })
    this.scene.add(this.grass.getMesh())
    return this.grass
  }

  getGrass(): GrassBlades | null {
    return this.grass
  }

  dispose(): void {
    if (this.isDisposed) return
    this.isDisposed = true
    this.ro?.disconnect()
    this.ro = null
    this.controls?.dispose()
    this.controls = null
    this.renderer?.setAnimationLoop(null)
    this.grass?.dispose()
    this.renderer?.dispose()
    this.grass = null
    this.renderer = null
    this.panel.remove()
  }
}
