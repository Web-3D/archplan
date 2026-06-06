/**
 * VỊ TRÍ   — archplan/src/viewer.ts
 * VAI TRÒ  — Showcase VIEWER nhẹ (portfolio): nạp BuildingState → render HEADLESS (BuildingRenderer) +
 *            OrbitControls + ánh sáng/sky + auto-rotate. KHÔNG editor/GUI — chỉ orbit ngắm công trình.
 * LIÊN HỆ  — Entry Vite thứ 2 (viewer.html), bundle RIÊNG nhẹ (tree-shake bỏ editor). Editor = main.ts
 *            (ArchPlanLab, nặng). Dùng building-kit (BuildingRenderer) + BaseWorld (threejs-modules).
 *
 * CÁCH DÙNG: new ShowcaseViewer(canvas, design).init(). design = BuildingState (mm) export từ tool.
 * DISPOSE: controls + building (geos/mats/components/wallCache) + ground + BaseWorld (renderer/loop).
 */

import { BuildingRenderer } from 'building-kit/render/fromState'
import { type BuildingState, defaultBuildingState } from 'building-kit/state'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { BaseWorld } from 'threejs-modules/utils/core/BaseWorld'

class ShowcaseViewer extends BaseWorld {
  private controls: OrbitControls | null = null
  private building: BuildingRenderer | null = null
  private ground: THREE.Mesh | null = null
  private sun: THREE.DirectionalLight | null = null
  private readonly target = new THREE.Vector3()
  private readonly design: BuildingState

  constructor(canvas: HTMLCanvasElement, design: BuildingState) {
    super(canvas, { antialias: true })
    this.design = design
  }

  protected async onInit(): Promise<void> {
    this.scene.background = new THREE.Color(0xaac4d8) // sky xanh nhạt
    this.renderer.shadowMap.enabled = true
    this._addLights()

    const building = new BuildingRenderer(this.design)
    this.building = building
    this.scene.add(building.getGroup())
    this._frame(building.getGroup()) // khung camera + ground + bóng theo bbox (robust mọi scale)

    const controls = new OrbitControls(this.camera, this.canvas)
    controls.enableDamping = true
    controls.autoRotate = true
    controls.autoRotateSpeed = 0.6
    controls.target.copy(this.target)
    controls.update()
    this.controls = controls
  }

  private _addLights(): void {
    this.scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x5a4a38, 1.0)) // trời/đất
    const sun = new THREE.DirectionalLight(0xfff2d6, 2.4)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    this.scene.add(sun)
    this.sun = sun
  }

  // Khung camera + ground + shadow-bounds theo bbox công trình — robust mm hay m.
  private _frame(group: THREE.Object3D): void {
    const box = new THREE.Box3().setFromObject(group)
    if (box.isEmpty()) return
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const r = Math.max(size.x, size.y, size.z) || 1
    this.target.copy(center)
    this._addGround(center, box.min.y, r)
    this._placeSun(center, r)
    this.camera.near = r / 100
    this.camera.far = r * 50
    this.camera.position.copy(center).add(new THREE.Vector3(r * 1.4, r * 0.9, r * 1.6))
    this.camera.lookAt(center)
    this.camera.updateProjectionMatrix()
  }

  private _placeSun(center: THREE.Vector3, r: number): void {
    const sun = this.sun
    if (!sun) return
    sun.position.copy(center).add(new THREE.Vector3(r, r * 1.6, r * 0.8))
    sun.target.position.copy(center)
    this.scene.add(sun.target)
    const cam = sun.shadow.camera
    cam.left = -r
    cam.right = r
    cam.top = r
    cam.bottom = -r
    cam.near = 0.1
    cam.far = r * 6
    cam.updateProjectionMatrix()
  }

  private _addGround(center: THREE.Vector3, minY: number, r: number): void {
    const geo = new THREE.PlaneGeometry(r * 12, r * 12)
    const mat = new THREE.MeshStandardMaterial({ color: 0x7d8a6f, roughness: 1 })
    const ground = new THREE.Mesh(geo, mat)
    ground.rotation.x = -Math.PI / 2
    ground.position.set(center.x, minY, center.z)
    ground.receiveShadow = true
    this.scene.add(ground)
    this.ground = ground
  }

  protected onUpdate(): void {
    this.controls?.update()
  }

  protected onDispose(): void {
    this.controls?.dispose()
    this.building?.dispose()
    this.ground?.geometry.dispose()
    const gm = this.ground?.material
    if (gm && !Array.isArray(gm)) gm.dispose()
  }
}

const canvas = document.querySelector<HTMLCanvasElement>('#app')
if (!canvas) throw new Error('Viewer: không tìm thấy canvas #app')
const viewer = new ShowcaseViewer(canvas, defaultBuildingState())
void viewer.init()
