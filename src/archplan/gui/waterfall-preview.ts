/**
 * VỊ TRÍ   — archplan/src/archplan/gui/waterfall-preview.ts
 * VAI TRÒ  — Mini-scene WebGPU render THÁC NƯỚC (module Waterfall) trong 🧪 Lab: tường đá + bể nhận nước +
 *            thác đổ từ mép tường (đúng kịch bản test Phase A2 — "dựng tường trước"). OrbitControls xoay-ngắm.
 * LIÊN HỆ  — setupWaterfallLab (waterfall-lab.ts) lái qua setter live (flow/vệt/tint/refract/poster/wobble/
 *            mist/màu) + rebuild() structural (width/height/arc/mistCount — throttle rAF). Module:
 *            threejs-modules/components/Waterfall.
 *
 * ⚠️ WebGPURenderer RIÊNG (module = TSL NodeMaterial — WebGL preview không chạy); dispose đủ khi rời tab.
 * DISPOSE: dispose() — loop null + ro + controls + waterfall + scene mesh + renderer + panel remove.
 */

import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { WebGPURenderer } from 'three/webgpu'
import { Waterfall } from 'threejs-modules/components/Waterfall'

const INIT = 220 // px — cạnh khởi tạo trước khi ResizeObserver đo canvas thật

// Thông số STRUCTURAL (đổi = dựng lại Waterfall) — live uniform đi thẳng setter, không nằm đây.
export interface WaterfallStructural {
  width: number
  height: number
  arc: number
  mistCount: number
  crestLength: number // m — đoạn mặt nước nằm ngang trên đỉnh (0 = tắt)
  crestDepth: number // m — độ sâu dòng (drawdown võng về mép)
}

export const DEFAULT_STRUCTURAL: WaterfallStructural = {
  width: 2,
  height: 1.8,
  arc: 0.28,
  mistCount: 220,
  crestLength: 1,
  crestDepth: 0.08,
}

export class WaterfallPreview {
  private readonly renderer: WebGPURenderer
  private readonly scene = new THREE.Scene()
  private readonly camera: THREE.PerspectiveCamera
  private readonly controls: OrbitControls
  private readonly canvas: HTMLCanvasElement
  private readonly panel: HTMLElement
  private readonly subject = new THREE.Group() // tường + bể + thác (rebuild structural thay cả cụm)
  private wf: Waterfall | null = null
  private deco: { geo: THREE.BufferGeometry; mat: THREE.Material }[] = []
  private readonly params: WaterfallStructural = { ...DEFAULT_STRUCTURAL }
  // Setter live đã áp, key theo tên (ghi-đè, KHÔNG tích lũy khi kéo slider) — áp LẠI sau rebuild structural.
  private readonly live = new Map<string, (w: Waterfall) => void>()
  private rebuildRaf = 0
  private readonly ro: ResizeObserver
  private lastW = 0
  private lastH = 0
  private isDisposed = false

  constructor(container: Element | null) {
    this.panel = document.createElement('div')
    this.panel.className = 'ap-scan-panel ap-preview-panel'
    const ttl = document.createElement('div')
    ttl.className = 'ap-scan-title'
    ttl.textContent = '🌊 Preview thác — tường + bể (Phase A2)'
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'ap-preview-canvas'
    this.panel.append(ttl, this.canvas)
    container?.appendChild(this.panel)

    this.scene.background = new THREE.Color(0xa8c4d4)
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.05, 100)
    this.camera.position.set(2.6, 2.2, 4.6)
    this.scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x4a4035, 1.1))
    const sun = new THREE.DirectionalLight(0xfff2d8, 1.5)
    sun.position.set(4, 6, 3)
    this.scene.add(sun)
    this.scene.add(this.subject)
    this._buildSubject()

    // antialias:false như editor (KI-007) — preview không reflector nhưng giữ cùng baseline render
    this.renderer = new WebGPURenderer({ canvas: this.canvas, antialias: false })
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    this.renderer.setSize(INIT, INIT, false)

    this.controls = new OrbitControls(this.camera, this.canvas)
    this.controls.target.set(0, this.params.height / 2, 0)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.12
    this.controls.update()

    this.ro = new ResizeObserver(() => this._syncSize())
    this.ro.observe(this.canvas)
    this.renderer.setAnimationLoop((t) => this._frame(t ?? 0))
  }

  // ── Structural (rebuild — caller CHỈ gọi khi buông slider; rAF throttle là lưới an toàn) ──
  setStructural(patch: Partial<WaterfallStructural>): void {
    Object.assign(this.params, patch)
    if (this.rebuildRaf) return
    this.rebuildRaf = requestAnimationFrame(() => {
      this.rebuildRaf = 0
      try {
        this._buildSubject()
      } catch (e) {
        // rebuild fail → scene trống không lý do; lộ lỗi ra console thay vì nuốt (debug KI-013 họ hàng)
        console.error('[WaterfallPreview] rebuild fail:', e)
      }
    })
  }

  /** Setter live lên Waterfall — nhớ theo key (ghi-đè) để áp lại sau mỗi rebuild structural. */
  tune(key: string, apply: (w: Waterfall) => void): void {
    this.live.set(key, apply)
    if (this.wf) apply(this.wf)
  }

  // Dựng (lại) cụm tường + bể + thác theo params. Tường ôm bề ngang thác (+0.6m mỗi bên).
  private _buildSubject(): void {
    this._clearSubject()
    const p = this.params
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh => {
      const m = new THREE.Mesh(geo, mat)
      this.deco.push({ geo, mat })
      this.subject.add(m)
      return m
    }
    const ground = add(
      new THREE.PlaneGeometry(12, 12),
      new THREE.MeshStandardMaterial({ color: 0x5d7a4e, roughness: 1 })
    )
    ground.rotation.x = -Math.PI / 2
    // tường nới sâu theo đoạn mặt ngang — crest nằm TRÊN nóc tường, không lơ lửng sau lưng
    const wallDepth = Math.max(0.35, p.crestLength + 0.3)
    const wall = add(
      new THREE.BoxGeometry(p.width + 1.2, p.height, wallDepth),
      new THREE.MeshStandardMaterial({ color: 0x8a8278, roughness: 0.95 })
    )
    wall.position.set(0, p.height / 2, -wallDepth / 2 + 0.01) // mặt trước tường tại z≈0
    const pool = add(
      new THREE.CircleGeometry(Math.max(1.2, p.width * 0.75), 40),
      new THREE.MeshStandardMaterial({ color: 0x254a59, roughness: 0.35 })
    )
    pool.rotation.x = -Math.PI / 2
    pool.position.set(0, 0.005, Math.max(0.55, p.arc + 0.35))

    this.wf = new Waterfall({ ...p })
    this.wf.getGroup().position.set(0, p.height, 0.01) // gốc = TÂM MÉP TRÊN tại mép đỉnh tường
    this.subject.add(this.wf.getGroup())
    for (const apply of this.live.values()) apply(this.wf) // áp lại live setter (flow/màu/…) lên instance mới
  }

  private _clearSubject(): void {
    // dispose có thể nổ từ backend WebGPU (resource đang in-flight) — KHÔNG để nó phá vòng rebuild
    try {
      this.wf?.dispose()
    } catch (e) {
      console.error('[WaterfallPreview] dispose fail (bỏ qua, rebuild tiếp):', e)
    }
    this.wf = null
    for (const d of this.deco) {
      d.geo.dispose()
      d.mat.dispose()
    }
    this.deco = []
    this.subject.clear()
  }

  private _frame(tMs: number): void {
    this.wf?.setTime(tMs / 1000)
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }

  // ── ⚙ Settings ──
  setBackground(v: number): void {
    // 0 tối ↔ 1 sáng — lerp giữa xanh đêm và xanh trời nhạt
    ;(this.scene.background as THREE.Color).lerpColors(
      new THREE.Color(0x18222c),
      new THREE.Color(0xbcd6e4),
      Math.max(0, Math.min(1, v))
    )
  }

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
    if (this.rebuildRaf) cancelAnimationFrame(this.rebuildRaf)
    this.ro.disconnect()
    this.controls.dispose()
    this.renderer.setAnimationLoop(null)
    this._clearSubject()
    this.renderer.dispose()
    this.panel.remove()
  }
}
