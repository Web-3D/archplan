/**
 * VỊ TRÍ   — archplan/src/archplan/gui/grass-preview.ts
 * VAI TRÒ  — Bảng preview nhỏ cạnh panel 🎛️ Tinh chỉnh: mini-scene WebGPU render ĐÚNG 1 ngọn cỏ.
 *            Vừa quan sát vừa tinh chỉnh 1 lá → áp hàng loạt ra bãi ngoài. Live-sync cùng grass3d.
 * LIÊN HỆ  — ArchPlanLab dựng + giữ ref; rebuild(cfg) khi structural, getGrass() để tune uniform live.
 *
 * ⚠️ Dùng WebGPURenderer RIÊNG (canvas riêng) — TSL/NodeMaterial bắt buộc WebGPU; không hook được
 *    vào loop BaseWorld để vẽ inset. 1 lá → cost không đáng kể. Gió chạy bằng built-in time.
 * DISPOSE: dispose() — setAnimationLoop(null) + grass.dispose() + renderer.dispose() + gỡ panel.
 */

import * as THREE from 'three'
import { WebGPURenderer } from 'three/webgpu'
import { GrassBlades } from 'threejs-modules/components/GrassBlades'
import type { Grass3DConfig } from 'threejs-modules/site/state'

const W = 130
const H = 150

export class GrassPreview {
  private renderer: WebGPURenderer | null = null
  private readonly scene = new THREE.Scene()
  private readonly camera: THREE.PerspectiveCamera
  private grass: GrassBlades | null = null
  private readonly canvas: HTMLCanvasElement
  private readonly panel: HTMLElement
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

    this.scene.background = new THREE.Color(0x10141c)
    this.camera = new THREE.PerspectiveCamera(34, W / H, 0.01, 10)
    this.camera.position.set(0.06, 0.17, 0.52)
    this.camera.lookAt(0, 0.13, 0)
    this.scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x35502a, 2.2))
    const dir = new THREE.DirectionalLight(0xffffff, 2.2)
    dir.position.set(0.5, 1, 0.6)
    this.scene.add(dir)
  }

  // Khởi tạo renderer WebGPU (async). Gọi 1 lần; sau đó chạy loop render (gió tự đong đưa qua time).
  async init(): Promise<void> {
    const r = new WebGPURenderer({ canvas: this.canvas, antialias: true })
    r.setPixelRatio(Math.min(2, window.devicePixelRatio))
    r.setSize(W, H, false)
    await r.init()
    if (this.isDisposed) {
      r.dispose()
      return
    }
    this.renderer = r
    r.setAnimationLoop(() => this.renderer?.render(this.scene, this.camera))
  }

  // Dựng lại 1 lá từ config (structural đổi → tạo instance mới). Trả grass để caller tune uniform live.
  rebuild(cfg: Grass3DConfig): GrassBlades | null {
    if (this.isDisposed) return null
    this.grass?.dispose()
    this.grass = null
    if (!cfg.enabled) return null
    // width/depth siêu nhỏ + maxBlades 1 → đúng 1 lá ở tâm (camera frame sẵn).
    this.grass = new GrassBlades({
      width: 0.01,
      depth: 0.01,
      baseY: 0,
      density: 100,
      maxBlades: 1,
      bladeHeight: cfg.height,
      bladeWidth: cfg.bladeWidth,
      wind: cfg.wind,
      windSpeed: cfg.windSpeed,
      baseColor: cfg.baseColor,
      tipColor: cfg.tipColor,
      edgeColor: cfg.edgeColor,
      curve: cfg.curve,
      twist: cfg.twist,
      taper: cfg.taper,
      heightVar: cfg.heightVar,
      leanAmt: cfg.leanAmt,
      leanAngle: cfg.leanAngle,
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
    this.renderer?.setAnimationLoop(null)
    this.grass?.dispose()
    this.renderer?.dispose()
    this.grass = null
    this.renderer = null
    this.panel.remove()
  }
}
