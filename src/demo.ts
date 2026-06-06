/**
 * VỊ TRÍ   — archplan/src/demo.ts
 * VAI TRÒ  — Tool-demo NHẸ "diorama": nhà procedural trên cỏ + KÉO MẶT TRỜI (slider giờ-trong-ngày) →
 *            ánh sáng + bóng nhà + vệt cỏ-tiếp-đất phản ứng LIVE; orbit ngắm. Cho cộng đồng nghịch
 *            (KHÔNG bê editor nặng). Entry Vite thứ 3 (demo.html), bundle riêng nhẹ.
 * LIÊN HỆ  — Dùng BuildingRenderer (building-kit) + GrassBlades (threejs-modules) + BaseWorld.
 *
 * DISPOSE: controls + building + grass + ground + panel DOM + BaseWorld (renderer/loop).
 */

import { BuildingRenderer } from 'building-kit/render/fromState'
import { defaultBuildingState } from 'building-kit/state'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GrassBlades } from 'threejs-modules/components/GrassBlades'
import { BaseWorld } from 'threejs-modules/utils/core/BaseWorld'

class ToolDemo extends BaseWorld {
  private controls: OrbitControls | null = null
  private building: BuildingRenderer | null = null
  private grass: GrassBlades | null = null
  private ground: THREE.Mesh | null = null
  private panel: HTMLElement | null = null
  private readonly sun = new THREE.DirectionalLight(0xfff2d6, 2.4)
  private readonly hemi = new THREE.HemisphereLight(0xcfe3ff, 0x5a4a38, 0.9)
  private readonly center = new THREE.Vector3()
  private radius = 8
  private minY = 0

  protected async onInit(): Promise<void> {
    this.scene.background = new THREE.Color(0xaac4d8)
    this.renderer.shadowMap.enabled = true
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    this.scene.add(this.hemi, this.sun, this.sun.target)

    const building = new BuildingRenderer(defaultBuildingState())
    this.building = building
    this.scene.add(building.getGroup())
    this._measure(building.getGroup())
    this._addGrass()
    this._addGround()
    this._frameCamera()
    this._buildControls()
    this._setTime(0.5) // khởi đầu: trưa
  }

  private _measure(group: THREE.Object3D): void {
    const box = new THREE.Box3().setFromObject(group)
    if (box.isEmpty()) return
    const size = box.getSize(new THREE.Vector3())
    box.getCenter(this.center)
    this.radius = Math.max(size.x, size.y, size.z) || 8
    this.minY = box.min.y
  }

  private _addGrass(): void {
    const span = Math.max(this.radius * 1.8, 6)
    const grass = new GrassBlades({
      width: span,
      depth: span,
      baseY: this.minY + 0.01,
      density: 80,
    })
    grass.getMesh().position.set(this.center.x, 0, this.center.z)
    this.scene.add(grass.getMesh())
    this.grass = grass
  }

  private _addGround(): void {
    const geo = new THREE.PlaneGeometry(this.radius * 14, this.radius * 14)
    const mat = new THREE.MeshStandardMaterial({ color: 0x5f6b48, roughness: 1 })
    const g = new THREE.Mesh(geo, mat)
    g.rotation.x = -Math.PI / 2
    g.position.set(this.center.x, this.minY, this.center.z)
    g.receiveShadow = true
    this.scene.add(g)
    this.ground = g
  }

  private _frameCamera(): void {
    const r = this.radius
    this.camera.near = r / 100
    this.camera.far = r * 60
    this.camera.position.copy(this.center).add(new THREE.Vector3(r * 1.5, r * 0.8, r * 1.7))
    this.camera.lookAt(this.center)
    this.camera.updateProjectionMatrix()
    const sc = this.sun.shadow.camera
    sc.left = -r
    sc.right = r
    sc.top = r
    sc.bottom = -r
    sc.near = 0.1
    sc.far = r * 8
    sc.updateProjectionMatrix()
  }

  private _buildControls(): void {
    const controls = new OrbitControls(this.camera, this.canvas)
    controls.enableDamping = true
    controls.target.copy(this.center)
    controls.update()
    this.controls = controls
    this._buildSunSlider()
  }

  // Thanh "giờ trong ngày" (DOM inline) → _setTime. Style pill tối, đáy-giữa.
  private _buildSunSlider(): void {
    const panel = document.createElement('div')
    panel.style.cssText =
      'position:absolute;left:50%;bottom:22px;transform:translateX(-50%);z-index:30;display:flex;' +
      'align-items:center;gap:12px;padding:10px 18px;border-radius:999px;background:rgba(14,26,22,.82);' +
      'border:1px solid rgba(120,200,170,.35);box-shadow:0 6px 18px rgba(0,0,0,.3);backdrop-filter:blur(4px)'
    const label = document.createElement('span')
    label.textContent = '☀️ Giờ'
    label.style.cssText = 'color:#cde7dd;font:600 13px/1 ui-sans-serif,system-ui,sans-serif'
    const slider = document.createElement('input')
    slider.type = 'range'
    slider.min = '0'
    slider.max = '1'
    slider.step = '0.01'
    slider.value = '0.5'
    slider.style.cssText = 'width:240px;cursor:pointer;accent-color:#ffd27a'
    slider.addEventListener('input', () => this._setTime(parseFloat(slider.value)))
    panel.appendChild(label)
    panel.appendChild(slider)
    this.canvas.parentElement?.appendChild(panel)
    this.panel = panel
  }

  // t: 0=bình minh (đông), 0.5=trưa (đỉnh), 1=hoàng hôn (tây). Cập nhật cung mặt trời + cường độ + màu
  // (ấm khi thấp → trắng khi trưa) + grass.setSun (vệt tiếp đất theo nắng). Không xuống hẳn chân trời.
  private _setTime(t: number): void {
    const ang = (0.12 + 0.76 * t) * Math.PI
    const horiz = Math.cos(ang)
    const elev = Math.sin(ang) // 0 ở 2 đầu, 1 ở trưa
    const r = this.radius
    this.sun.position.set(
      this.center.x + horiz * r * 1.6,
      this.center.y + elev * r * 1.8 + 0.2,
      this.center.z + r * 0.5
    )
    this.sun.target.position.copy(this.center)
    this.sun.intensity = 1.0 + 1.8 * elev
    this.sun.color.setHSL(0.09 + 0.04 * elev, 0.7 - 0.3 * elev, 0.5 + 0.1 * elev)
    this.hemi.intensity = 0.5 + 0.5 * elev
    this.grass?.setSun(
      this.sun.position.x - this.center.x,
      this.sun.position.y - this.center.y,
      this.sun.position.z - this.center.z
    )
  }

  protected onUpdate(): void {
    this.controls?.update()
  }

  protected onDispose(): void {
    this.controls?.dispose()
    this.building?.dispose()
    this.grass?.dispose()
    this.ground?.geometry.dispose()
    const gm = this.ground?.material
    if (gm && !Array.isArray(gm)) gm.dispose()
    this.panel?.remove()
  }
}

const canvas = document.querySelector<HTMLCanvasElement>('#app')
if (!canvas) throw new Error('Demo: không tìm thấy canvas #app')
const demo = new ToolDemo(canvas)
void demo.init()
