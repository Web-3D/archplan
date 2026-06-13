/**
 * VỊ TRÍ   — archplan/src/archplan/gui/weather-preview.ts
 * VAI TRÒ  — Mini-scene WebGPU render THỜI TIẾT (module Precipitation) trong 🧪 Lab: nền + nhà hộp tham
 *            chiếu chiều sâu + mưa/tuyết đổ. OrbitControls xoay-ngắm. Đổi mode = tạo lại Precipitation.
 * LIÊN HỆ  — setupWeatherLab (weather-lab.ts) lái qua setMode (rebuild) + tune live (speed/wind/opacity/
 *            size/drift/radius/height/color) + setBackground. Module: threejs-modules/effects/Precipitation.
 *
 * ⚠️ WebGPURenderer RIÊNG (module = TSL NodeMaterial). DISPOSE đủ khi rời tab.
 * DISPOSE: dispose() — loop null + ro + controls + precip + scene mesh + renderer + panel remove.
 */

import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { WebGPURenderer } from 'three/webgpu'
import { Precipitation, type PrecipMode } from 'threejs-modules/effects/Precipitation'

const INIT = 220 // px — cạnh khởi tạo trước khi ResizeObserver đo canvas thật

export class WeatherPreview {
  private readonly renderer: WebGPURenderer
  private readonly scene = new THREE.Scene()
  private readonly camera: THREE.PerspectiveCamera
  private readonly controls: OrbitControls
  private readonly canvas: HTMLCanvasElement
  private readonly panel: HTMLElement
  private readonly deco: { geo: THREE.BufferGeometry; mat: THREE.Material }[] = []
  private precip: Precipitation | null = null
  private mode: PrecipMode = 'rain'
  // Setter live đã áp (key ghi-đè) — áp lại sau mỗi rebuild mode.
  private readonly live = new Map<string, (p: Precipitation) => void>()
  private readonly clock = new THREE.Clock()
  private readonly ro: ResizeObserver
  private lastW = 0
  private lastH = 0
  private isDisposed = false

  constructor(container: Element | null) {
    this.panel = document.createElement('div')
    this.panel.className = 'ap-scan-panel ap-preview-panel'
    const ttl = document.createElement('div')
    ttl.className = 'ap-scan-title'
    ttl.textContent = '🌧️ Preview thời tiết — mưa/tuyết (Phase A)'
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'ap-preview-canvas'
    this.panel.append(ttl, this.canvas)
    container?.appendChild(this.panel)

    this.scene.background = new THREE.Color(0x2a3038) // trời xám u ám
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.05, 200)
    this.camera.position.set(10, 7, 16)
    this.scene.add(new THREE.HemisphereLight(0x8a96a4, 0x202a22, 1.4))
    const sun = new THREE.DirectionalLight(0xc8d0da, 0.8)
    sun.position.set(4, 9, 3)
    this.scene.add(sun)
    this._buildSubject()
    this._rebuildPrecip()

    this.renderer = new WebGPURenderer({ canvas: this.canvas, antialias: false })
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    this.renderer.setSize(INIT, INIT, false)

    this.controls = new OrbitControls(this.camera, this.canvas)
    this.controls.target.set(0, 4, 0)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.12
    this.controls.update()

    this.ro = new ResizeObserver(() => this._syncSize())
    this.ro.observe(this.canvas)
    this.renderer.setAnimationLoop(() => this._frame())
  }

  // Nền + nhà hộp — tham chiếu chiều sâu cho hạt rơi (xoay quanh thấy mưa phủ thể tích).
  private _buildSubject(): void {
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh => {
      const m = new THREE.Mesh(geo, mat)
      this.deco.push({ geo, mat })
      this.scene.add(m)
      return m
    }
    const ground = add(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshStandardMaterial({ color: 0x2e3a30, roughness: 1 })
    )
    ground.rotation.x = -Math.PI / 2
    const house = add(
      new THREE.BoxGeometry(6, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0x6b5a48, roughness: 0.9 })
    )
    house.position.y = 4
  }

  /** Đổi mode (rain/snow) = tạo lại Precipitation với defaults mode đó, áp lại live setter. */
  setMode(mode: PrecipMode): void {
    if (this.mode === mode) return
    this.mode = mode
    this._rebuildPrecip()
  }

  /** Setter live lên Precipitation — nhớ theo key (ghi-đè) để áp lại sau rebuild mode. */
  tune(key: string, apply: (p: Precipitation) => void): void {
    this.live.set(key, apply)
    if (this.precip) apply(this.precip)
  }

  private _rebuildPrecip(): void {
    try {
      this.precip?.dispose()
    } catch (e) {
      console.error('[WeatherPreview] dispose fail (bỏ qua):', e)
    }
    this.precip = new Precipitation({ mode: this.mode })
    this.scene.add(this.precip.getObject())
    for (const apply of this.live.values()) apply(this.precip) // áp lại live lên instance mới
  }

  private _frame(): void {
    this.precip?.update(this.clock.getDelta())
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }

  /** 0 tối (đêm bão) ↔ 1 sáng (âm u nhạt) — nền lerp xám đậm↔xám sáng. */
  setBackground(v: number): void {
    ;(this.scene.background as THREE.Color).lerpColors(
      new THREE.Color(0x161b22),
      new THREE.Color(0x9aa6b2),
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
    this.ro.disconnect()
    this.controls.dispose()
    this.renderer.setAnimationLoop(null)
    try {
      this.precip?.dispose()
    } catch (e) {
      console.error('[WeatherPreview] dispose fail:', e)
    }
    this.precip = null
    for (const d of this.deco) {
      d.geo.dispose()
      d.mat.dispose()
    }
    this.deco.length = 0
    this.renderer.dispose()
    this.panel.remove()
  }
}
