/**
 * VỊ TRÍ   — archplan/src/archplan/gui/particle-preview.ts
 * VAI TRÒ  — Mini-scene WebGL render hệ PARTICLES trong 🧪 Lab. MỨC 1 = CPU Points: giữ N hạt sống (đài phun),
 *            tích phân trọng lực trên CPU mỗi frame, hạt hết đời → respawn. Nền học cơ chế particle (emit/đời/buffer).
 * LIÊN HỆ  — setupParticleLab (particle-lab.ts): setCount/setSpeed/setSpread/setGravity/setLifetime/setSize (slider) ·
 *            setGridOpacity/setColor (⚙ settings). Mức 2 (shader Points) / Mức 3 (GPGPU) sẽ nối thêm sau.
 *
 * ⚠️ Mức 1 CPU: vị trí hạt update TRÊN CPU (Float32Array) → posAttr.needsUpdate mỗi frame. ≤ vài nghìn hạt OK.
 * DISPOSE: dispose() — loop null + ro + controls + geo/mat/renderer + grid + panel remove.
 */

import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

const INIT = 220 // px — cạnh khởi tạo trước khi ResizeObserver đo canvas thật
const MAX = 20000 // buffer cấp 1 lần; số hạt SỐNG = active ≤ MAX (drawRange cắt phần thừa)

// Thông số đài phun Mức 1 — slider trong particle-lab đổi qua setter.
export interface ParticleParams {
  count: number // số hạt giữ sống liên tục
  speed: number // vận tốc bắn lên ban đầu
  spread: number // tản ngang (bán kính vận tốc xy)
  gravity: number // trọng lực kéo xuống
  lifetime: number // đời mỗi hạt (giây) → hết thì respawn
  size: number // cỡ điểm
}

export const DEFAULT_PARTICLE: ParticleParams = {
  count: 1200,
  speed: 4,
  spread: 1.2,
  gravity: 6,
  lifetime: 2.2,
  size: 0.08,
}

export class ParticlePreview {
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera: THREE.PerspectiveCamera
  private readonly controls: OrbitControls
  private readonly canvas: HTMLCanvasElement
  private readonly panel: HTMLElement
  private readonly geom = new THREE.BufferGeometry()
  private readonly posAttr: THREE.BufferAttribute
  private readonly pos: Float32Array // = posAttr.array — vị trí (cập nhật mỗi frame)
  private readonly vel = new Float32Array(MAX * 3) // vận tốc CPU
  private readonly life = new Float32Array(MAX) // đời còn lại (s) — ≤0 thì respawn
  private readonly mat: THREE.PointsMaterial
  private readonly params: ParticleParams
  private active = 0 // số hạt đang sống (= drawRange)
  private grid: THREE.GridHelper | null = null
  private readonly ro: ResizeObserver
  private lastW = 0
  private lastH = 0
  private lastT = performance.now() / 1000
  private isDisposed = false

  constructor(container: Element | null) {
    this.panel = document.createElement('div')
    this.panel.className = 'ap-scan-panel ap-preview-panel'
    const ttl = document.createElement('div')
    ttl.className = 'ap-scan-title'
    ttl.textContent = '✨ Preview particles — Mức 1 CPU (đài phun)'
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'ap-preview-canvas'
    this.panel.append(ttl, this.canvas)
    container?.appendChild(this.panel)

    this.scene.background = new THREE.Color(0x10141a) // nền tối → hạt sáng nổi
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.05, 100)
    this.camera.position.set(5, 4, 7)
    this._initDecor()

    this.params = { ...DEFAULT_PARTICLE }
    this.pos = new Float32Array(MAX * 3)
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage)
    this.geom.setAttribute('position', this.posAttr)
    this.mat = new THREE.PointsMaterial({
      color: 0x59c2ff,
      size: this.params.size,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending, // hạt chồng → sáng hơn (kiểu lửa/khói)
    })
    this.scene.add(new THREE.Points(this.geom, this.mat))
    this.setCount(this.params.count) // spawn lứa đầu (đời ngẫu nhiên → không respawn đồng loạt)

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    this.renderer.setSize(INIT, INIT, false)

    this.controls = new OrbitControls(this.camera, this.canvas)
    this.controls.target.set(0, 1.5, 0)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.12
    this.controls.update()

    this.ro = new ResizeObserver(() => this._syncSize())
    this.ro.observe(this.canvas)

    this.renderer.setAnimationLoop(() => this._frame())
  }

  // Sàn lưới mờ → đọc không gian. (Points không cần đèn — PointsMaterial unlit.)
  private _initDecor(): void {
    this.grid = new THREE.GridHelper(12, 12, 0x3a4658, 0x232a35)
    const m = this.grid.material as THREE.Material
    m.transparent = true
    m.opacity = 0.5
    this.scene.add(this.grid)
  }

  // Sinh/đặt lại 1 hạt tại gốc với vận tốc đài phun. phase=true → đời ngẫu nhiên (lứa đầu, tránh respawn đồng loạt).
  private _spawn(i: number, phase: boolean): void {
    const o = i * 3
    this.pos[o] = 0
    this.pos[o + 1] = 0
    this.pos[o + 2] = 0
    const a = Math.random() * Math.PI * 2
    const r = Math.random() * this.params.spread
    this.vel[o] = Math.cos(a) * r
    this.vel[o + 1] = this.params.speed * (0.6 + 0.6 * Math.random())
    this.vel[o + 2] = Math.sin(a) * r
    this.life[i] = this.params.lifetime * (phase ? Math.random() : 1)
  }

  // 1 bước mô phỏng: đời giảm → hết thì respawn; tích phân trọng lực + vị trí (Euler).
  private _step(dt: number): void {
    const g = this.params.gravity * dt
    for (let i = 0; i < this.active; i++) {
      this.life[i] -= dt
      if (this.life[i] <= 0) this._spawn(i, false)
      const o = i * 3
      this.vel[o + 1] -= g
      this.pos[o] += this.vel[o] * dt
      this.pos[o + 1] += this.vel[o + 1] * dt
      this.pos[o + 2] += this.vel[o + 2] * dt
    }
  }

  private _frame(): void {
    const now = performance.now() / 1000
    const dt = Math.min(0.05, now - this.lastT) // kẹp dt → tab ẩn quay lại không nhảy vọt
    this.lastT = now
    this._step(dt)
    this.posAttr.needsUpdate = true
    this.geom.setDrawRange(0, this.active)
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }

  // ── Slider (particle-lab) ──
  setCount(n: number): void {
    const c = Math.max(0, Math.min(MAX, Math.round(n)))
    for (let i = this.active; i < c; i++) this._spawn(i, true) // mở rộng → spawn hạt mới
    this.active = c
    this.params.count = c
  }
  setSpeed(v: number): void {
    this.params.speed = v
  }
  setSpread(v: number): void {
    this.params.spread = v
  }
  setGravity(v: number): void {
    this.params.gravity = v
  }
  setLifetime(v: number): void {
    this.params.lifetime = v
  }
  setSize(v: number): void {
    this.params.size = v
    this.mat.size = v
  }

  // ── ⚙ Settings ──
  setGridOpacity(v: number): void {
    if (this.grid) (this.grid.material as THREE.Material).opacity = v
  }
  setColor(hex: number): void {
    this.mat.color.setHex(hex)
  }

  // Khớp buffer render với kích thước HIỂN THỊ canvas + aspect. Bỏ qua khi ẩn (client = 0).
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
    this.renderer.setSize(w, h, false)
  }

  dispose(): void {
    if (this.isDisposed) return
    this.isDisposed = true
    this.ro.disconnect()
    this.controls.dispose()
    this.renderer.setAnimationLoop(null)
    if (this.grid) {
      this.grid.geometry.dispose()
      ;(this.grid.material as THREE.Material).dispose()
    }
    this.geom.dispose()
    this.mat.dispose()
    this.renderer.dispose()
    this.panel.remove()
  }
}
