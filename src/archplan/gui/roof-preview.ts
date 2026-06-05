/**
 * VỊ TRÍ   — archplan/src/archplan/gui/roof-preview.ts
 * VAI TRÒ  — Mini-scene WebGL render 1 khối MÁI đang dựng trong 🧪 Lab (cột phải). Soi hình + xoay/zoom/pan.
 * LIÊN HỆ  — setupRoofLab (roof-lab.ts) tạo + giữ; gọi setGeometry(geo) mỗi lần slider đổi thông số.
 *
 * ⚠️ WebGL THƯỜNG (khác GrassPreview dùng WebGPU): mái = BufferGeometry + MeshStandardMaterial, không cần TSL.
 *    Canvas khớp ĐÚNG kích thước ô (rộng×cao) qua ResizeObserver + camera.aspect → không méo (như grass-preview).
 * DISPOSE: dispose() — setAnimationLoop(null) + controls/geo/mat/renderer.dispose() + gỡ panel.
 */

import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

const INIT = 220 // px — cạnh khởi tạo trước khi ResizeObserver đo canvas thật

export class RoofPreview {
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera: THREE.PerspectiveCamera
  private readonly controls: OrbitControls
  private readonly canvas: HTMLCanvasElement
  private readonly panel: HTMLElement
  private readonly mat: THREE.MeshStandardMaterial
  private mesh: THREE.Mesh | null = null
  private readonly ro: ResizeObserver
  private lastW = 0
  private lastH = 0
  private isDisposed = false

  constructor(container: Element | null) {
    this.panel = document.createElement('div')
    this.panel.className = 'ap-scan-panel ap-preview-panel'
    const ttl = document.createElement('div')
    ttl.className = 'ap-scan-title'
    ttl.textContent = '🔎 Preview mái'
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'ap-preview-canvas'
    this.panel.append(ttl, this.canvas)
    container?.appendChild(this.panel)

    this.scene.background = new THREE.Color(0xe9edf1) // nền studio sáng để khối mái nổi silhouette

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.05, 100)
    this.camera.position.set(6, 5, 8)

    this.scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x4a4036, 1.1))
    const dir = new THREE.DirectionalLight(0xfff2e0, 2.0)
    dir.position.set(5, 9, 4)
    this.scene.add(dir)

    // Sàn lưới mờ — thấy tỉ lệ + mặt phẳng đáy mái khi xoay.
    const grid = new THREE.GridHelper(12, 12, 0xaab2ba, 0xd6dce1)
    const gm = grid.material as THREE.Material
    gm.transparent = true
    gm.opacity = 0.5
    this.scene.add(grid)

    this.mat = new THREE.MeshStandardMaterial({
      color: 0x9c7248, // COL_ROOF — khớp màu mái building-kit
      roughness: 0.85,
      metalness: 0,
      side: THREE.DoubleSide, // dựng dở chưa kín → thấy cả 2 mặt
      flatShading: true, // facet rõ → soi từng mảng mái khi chỉnh
    })

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    this.renderer.setSize(INIT, INIT, false)

    this.controls = new OrbitControls(this.camera, this.canvas)
    this.controls.target.set(0, 1, 0) // tâm xoay ~ giữa khối mái
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.12
    this.controls.update()

    this.ro = new ResizeObserver(() => this._syncSize())
    this.ro.observe(this.canvas)

    this.renderer.setAnimationLoop(() => {
      this.controls.update() // damping + thao tác kéo/zoom
      this.renderer.render(this.scene, this.camera)
    })
  }

  // Khớp buffer render với kích thước HIỂN THỊ canvas (rộng×cao theo CSS) + aspect. Bỏ qua khi ẩn (client = 0).
  private _syncSize(): void {
    const cw = this.canvas.clientWidth
    const ch = this.canvas.clientHeight
    if (cw < 1 || ch < 1) return
    const w = Math.max(40, Math.round(cw))
    const h = Math.max(40, Math.round(ch))
    if (w === this.lastW && h === this.lastH) return
    this.lastW = w
    this.lastH = h
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h, false) // updateStyle=false → CSS lo hiển thị
  }

  // Thay khối mái = geo mới (slider đổi thông số → dựng lại geometry → gọi đây). Dispose geo cũ.
  setGeometry(geo: THREE.BufferGeometry): void {
    if (this.isDisposed) {
      geo.dispose()
      return
    }
    if (this.mesh) {
      this.scene.remove(this.mesh)
      this.mesh.geometry.dispose()
    }
    this.mesh = new THREE.Mesh(geo, this.mat)
    this.scene.add(this.mesh)
  }

  dispose(): void {
    if (this.isDisposed) return
    this.isDisposed = true
    this.ro.disconnect()
    this.controls.dispose()
    this.renderer.setAnimationLoop(null)
    if (this.mesh) this.mesh.geometry.dispose()
    this.mat.dispose()
    this.renderer.dispose()
    this.panel.remove()
  }
}
