/**
 * VỊ TRÍ   — 01-Doraemon/src/sandbox/archplan/ArchPlanLab.ts
 * VAI TRÒ  — Sandbox: nhập thông số từ bản vẽ kiến trúc → render 3D real-time.
 *             AP4: Multi-floor — BuildingState { floors[] }, mỗi floor có instances[].
 * LIÊN HỆ  — Lazy-load từ main.ts (#archplan-btn). Types: archplan-state.ts. GUI: archplan-gui.ts.
 *
 * Multi-floor model (AP4):
 *   BuildingState { floors: FloorDef[] }
 *   FloorDef { id, instances[] }
 *   ShapeInstance.wallDepth: số mm dày tường riêng cho từng shape (default 200mm)
 *   Mỗi floor stacks on top of previous: yAcc tích lũy per floor.
 *   Ground floor (fi=0): có thể có foundation per-instance → yLift = foundH.
 *   Upper floors (fi>0): không foundation, wallBase = yAcc.
 *
 * Turtle: heading 0°=East(+X), 90°=North(-Z). +90°=trái, -90°=phải.
 * AP5 hook: colorIndex + style per wall — placeholder cho Surface Shader.
 */

import './archplan-lab.css'

import { renderBuildingState } from 'building-kit/BuildingFromState' // renderer chung lõi (Phase 1b)
import { makeSurfaceMaterial, WallMaterialCache } from 'building-kit/wallMaterials' // material engine
import type GUI from 'lil-gui'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import { PMREMGenerator } from 'three/webgpu'
import type { InstancedBrickWall } from 'threejs-modules/components/InstancedBrickWall'
import type { WoodSidingStrip } from 'threejs-modules/components/WoodSidingStrip'
import type { WoodSidingWall } from 'threejs-modules/components/WoodSidingWall'
import { AsphaltGround } from 'threejs-modules/shaders/ground/AsphaltGround'
import { BaseWorld } from 'threejs-modules/utils/core/BaseWorld'
import { RuntimeGuard } from 'threejs-modules/utils/core/RuntimeGuard'

import { DevHud } from './gui/devhud' // perf HUD dev (fps/budget/leak) — tách monolith
import { type APGuiCtx, setupGridPanel, setupGroundPanel, setupGUI, setupSunPanel } from './gui/gui'
import { type HighlightHost, HighlightOverlay } from './interaction/highlight' // flash viền phần đang chỉnh — tách monolith
import { type ManipulateHost, ManipulateTool } from './interaction/manipulate' // 🤚 Move + 🎯 Focus — tách monolith
import { type PaletteHost, PalettePanel } from './interaction/palette' // 🎨 khay swatch atelier — tách monolith
import {
  CoordPicker,
  type GroundType,
  HeightGridSystem,
  HumanFigure,
  type SunOpts,
} from './scene/scene'
import { DesignStore } from './state/persistence' // I/O save/load/autosave/export — tách monolith
import {
  type BuildingState,
  defaultBuildingState,
  mkColumn,
  mkFloor,
  mkInstance,
  SHAPE_CONFIGS,
  type ShapeInstance,
} from './state/state'

// File System Access API — TS 5.9 lib.dom đã có FileSystemFileHandle/WritableFileStream
// nhưng THIẾU 2 hàm picker. Khai báo tối thiểu phần dùng (optional → feature-detect được).
declare global {
  interface FilePickerAcceptType {
    description?: string
    accept: Record<string, string[]>
  }
  interface SaveFilePickerOptions {
    suggestedName?: string
    types?: FilePickerAcceptType[]
  }
  interface OpenFilePickerOptions {
    types?: FilePickerAcceptType[]
    multiple?: boolean
  }
  interface Window {
    showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>
    showOpenFilePicker?: (options?: OpenFilePickerOptions) => Promise<FileSystemFileHandle[]>
  }
}

// Footprint XZ (world): tâm + kích thước AABB — dùng đặt pick box found/slab/roof.

// ── ArchPlanLab ────────────────────────────────────────────────────────────────

export class ArchPlanLab extends BaseWorld {
  private state: BuildingState = defaultBuildingState()
  private gui: GUI | null = null
  private leftTools: HTMLElement | null = null // wrapper xếp scanner + sun panel thành cột
  private controls: OrbitControls | null = null

  // Đèn mặt trời + tham số (điều khiển qua panel ☀ Sun). Default ≈ vị trí cũ (10,18,10).
  private sun: THREE.DirectionalLight | null = null
  private readonly sunOpts: SunOpts = { azimuth: 45, elevation: 52, intensity: 2.2 }

  // opFolders — key: "${instId}:${segIdx}" → opening sub-folders per segment
  private opFolders = new Map<string, GUI[]>()
  // Tab đang mở mỗi tab-bar (key ổn định, vd "section:${instId}") — sống qua _rebuildGUI
  // nên thêm/xóa column không reset về tab đầu (Struct). Chỉ clear ở onDispose.
  private _activeTabs = new Map<string, number>()

  private readonly buildingGroup = new THREE.Group()
  private buildingGeos: THREE.BufferGeometry[] = []
  private buildingMats: THREE.Material[] = []
  // SPIKE palette brush — lớp pick vô hình (1 box/tường, visible=false → 0 render, vẫn raycast vì
  // Raycaster bỏ qua .visible) để click tường trong 3D xác định đúng tường kể cả khi render đã merge.
  private readonly pickGroup = new THREE.Group()
  private pickBoxGeos: THREE.BufferGeometry[] = []
  private _pickMat: THREE.MeshBasicMaterial | null = null
  private readonly _ray = new THREE.Raycaster()
  private paintMode = false
  private _brushColor: number | null = null // màu cọ đang cầm (hex int) — null = chưa chọn swatch
  // 🎨 Palette panel (khay swatch + browser + cọ) — tách ra interaction/palette.ts. Tạo lazy trong
  // _setupGUI, persist qua _rebuildGUI (giữ _palPos/vị trí kéo). Brush color + paintMode vẫn ở lab
  // (paint subsystem dùng chung) → palette set qua PaletteHost.
  private palette: PalettePanel | null = null
  // Move tool (kéo element) + Focus (click→GUI) — tách ra interaction/manipulate.ts. moveMode + nút
  // GIỮ ở lab (điều phối 3 mode loại trừ); phiên kéo + map anchor folder nằm trong ManipulateTool.
  private manipulate: ManipulateTool | null = null
  private moveMode = false
  private _moveBtn: HTMLElement | null = null
  // _downPos = vị trí nhấn (phân biệt click vs drag/orbit) — _onPointerUp dùng cho click→Focus.
  private _downPos: { x: number; y: number } | null = null
  // brick-3d — geometry thật, không merge; track để dispose mỗi build.
  private brick3dWalls: InstancedBrickWall[] = []
  private woodWalls: WoodSidingWall[] = []
  private stripWalls: WoodSidingStrip[] = []
  // Wall material cache (material+color+scale → 1 material, merge tường ít draw call) — tách ra
  // build/materials.ts (pure, không host). Brick textures + dispose nằm trong cache.
  private wallMats = new WallMaterialCache()

  private groundGeo: THREE.PlaneGeometry | null = null
  private groundMat: THREE.MeshToonMaterial | null = null // nền tối mặc định ('none')
  private groundMesh: THREE.Mesh | null = null // để swap material theo groundType
  private hemiLight: THREE.HemisphereLight | null = null // groundColor = màu bounce theo nền
  private groundShader: { dispose(): void } | null = null // shader nền procedural (grass/cement…)
  private groundType: GroundType = 'none'
  private envTexture: THREE.Texture | null = null // IBL từ PMREM(RoomEnvironment)
  private gridHelper: THREE.GridHelper | null = null
  private css2dRenderer: CSS2DRenderer | null = null
  private css2dEl: HTMLElement | null = null
  private readonly gridOpts = {
    zPos: -30.0,
    xPos: -30.0,
    zVisible: false, // mặc định CHƯA tick — cả X/Y/Z đều ẩn tới khi tick
    xVisible: false,
    cyPos: 50.0, // 50000mm — mặt ngang đậu cao, ngoài tầm; tick để hiện rồi trượt xuống
    cyVisible: false,
  }

  private heightGridSystem: HeightGridSystem | null = null
  private humanFigure: HumanFigure | null = null

  // RuntimeGuard — DEV-only, cảnh báo khi vượt budget draw calls/triangles (rule #2)
  private guard: RuntimeGuard | null = null

  private _undoStack: string[] = []
  private _redoStack: string[] = []
  private _prevState = '' // JSON snapshot trước mỗi _buildScene; '' = chưa record
  private _historyLock = false // true khi đang undo/redo — ngăn push trùng
  // LIVE drag: kéo slider → chỉ rebuild geometry (throttle 1 lần/frame qua rAF), KHÔNG ghi
  // history/persist mỗi frame (kẻo undo stack ngập + localStorage spam). Buông chuột → _buildScene
  // commit 1 lần. 0 = chưa schedule.
  private _rafBuild = 0

  // Highlight 3D: viền wireframe vàng flash ~0.5s khi click tab GUI (biết đang chỉnh phần nào).
  // Group riêng (NGOÀI buildingGroup → _clearBuilding không xoá). Transient → tự dọn qua timer.
  private highlight: HighlightOverlay | null = null

  // I/O thiết kế: autosave localStorage + Save/Load file + export AP4. Giữ FileSystemFileHandle.
  private store = new DesignStore()

  // Dev HUD perf — LUÔN hiện ở dev (fps/budget/leak từ renderer.info); phím ` ẩn/hiện. → gui/devhud.ts
  private devHud: DevHud | null = null
  private _keysDown = new Set<string>()
  private readonly _onKeyDown = (e: KeyboardEvent): void => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
    if (e.code === 'Backquote' && !e.repeat) this.devHud?.toggle() // ` → bật/tắt HUD perf
    this._keysDown.add(e.code)
  }
  private readonly _onKeyUp = (e: KeyboardEvent): void => {
    this._keysDown.delete(e.code)
  }

  // Coordinate picker — click/rê chuột trái trên XZ ra tọa độ; chuột phải = thoát.
  private coordPicker: CoordPicker | null = null
  private pickMode = false
  private picking = false
  private _syncPickCheckbox: ((on: boolean) => void) | null = null
  private readonly _onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0) return // chỉ chuột trái
    this._downPos = { x: e.clientX, y: e.clientY } // để _onPointerUp phân biệt click vs drag/orbit
    if (this.paintMode) {
      this._paintAt(e) // SPIKE brush: click → sơn tường
      return
    }
    if (this.moveMode) {
      this.manipulate?.dragStart(e) // Move tool: nhấn-giữ element → kéo (focus GUI ngay khi nhấn)
      return
    }
    if (!this.pickMode) return
    this.picking = true
    this._pickAt(e)
  }
  private readonly _onPointerMove = (e: PointerEvent): void => {
    if (this.moveMode && this.manipulate?.isDragging()) {
      this.manipulate?.dragMove(e)
      return
    }
    if (this.pickMode && this.picking) this._pickAt(e)
  }
  private readonly _onPointerUp = (e: PointerEvent): void => {
    if (this.manipulate?.isDragging()) {
      this.manipulate?.dragEnd()
      this._downPos = null
      return
    }
    this.picking = false
    // Click (không kéo) trên element ở chế độ thường → trỏ GUI tới đúng panel. Bỏ qua paint/pick.
    if (this._downPos && !this.paintMode && !this.pickMode) {
      const dx = e.clientX - this._downPos.x
      const dy = e.clientY - this._downPos.y
      if (dx * dx + dy * dy < 25) this.manipulate?.clickFocus(e) // < 5px = click, không phải orbit
    }
    this._downPos = null
  }
  // Chuột phải khi đang pick/paint/move → thoát mode + chặn menu chuột phải
  private readonly _onContextMenu = (e: MouseEvent): void => {
    if (this.paintMode) {
      e.preventDefault()
      this._setPaintMode(false)
      this.palette?.markSwatch(null)
      return
    }
    if (this.moveMode) {
      e.preventDefault()
      this._setMoveMode(false)
      return
    }
    if (!this.pickMode) return
    e.preventDefault()
    this._setPickMode(false)
  }

  private _pickAt(e: PointerEvent): void {
    const r = this.canvas.getBoundingClientRect()
    const ndcX = ((e.clientX - r.left) / r.width) * 2 - 1
    const ndcY = -((e.clientY - r.top) / r.height) * 2 + 1
    this.coordPicker?.pick(ndcX, ndcY, this.camera)
  }

  private _setPickMode(on: boolean): void {
    this.pickMode = on
    this.picking = false
    if (on) this._setMoveMode(false) // 3 mode loại trừ
    if (this.controls) this.controls.enabled = !on
    if (!on) this.coordPicker?.setVisible(false)
    this._syncPickCheckbox?.(on) // đồng bộ ô tick trong panel (vd khi thoát bằng chuột phải)
  }

  // SPIKE palette brush — bật: tắt orbit, click tường trong 3D → đổi màu (proof pick-layer).
  private _setPaintMode(on: boolean): void {
    this.paintMode = on
    if (on) {
      this._setPickMode(false) // 3 mode loại trừ
      this._setMoveMode(false)
    }
    if (this.controls) this.controls.enabled = !on
  }

  // Move tool: bật → tắt paint/pick + tắt orbit; nhấn-giữ element trong 3D để kéo. Loại trừ 3 mode.
  private _setMoveMode(on: boolean): void {
    this.moveMode = on
    this.manipulate?.cancelDrag()
    if (on) {
      this._setPaintMode(false)
      this.palette?.markSwatch(null)
      this._setPickMode(false)
    }
    if (this.controls) this.controls.enabled = !on
    if (this._moveBtn) {
      this._moveBtn.classList.toggle('ap-move-on', on)
      this._moveBtn.textContent = on ? '🤚 Move: ON — kéo vật' : '🤚 Move: off'
    }
  }

  // Cọ palette: click element trong 3D → sơn màu cọ đang cầm. Chưa chọn swatch → không sơn.
  private _paintAt(e: PointerEvent): void {
    if (this._brushColor === null) return
    const r = this.canvas.getBoundingClientRect()
    const ndc = new THREE.Vector2(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1
    )
    this._ray.setFromCamera(ndc, this.camera)
    const hit = this._ray.intersectObjects(this.pickGroup.children, false)[0]
    if (!hit) return
    const ud = hit.object.userData as { instId?: string; segIdx?: number; key?: string }
    const inst = typeof ud.instId === 'string' ? this._locateInst(ud.instId)?.inst : null
    if (inst && this._applyBrush(inst, ud)) this._buildScene()
  }

  // Sơn 1 element: tường (segIdx) → seg.paintColor (merge, qua cache key); struct (key) →
  // inst.paint[key] (không merge, recolor sau build). Trả false nếu không đổi (khỏi rebuild).
  private _applyBrush(inst: ShapeInstance, ud: { segIdx?: number; key?: string }): boolean {
    const c = this._brushColor
    if (c === null) return false
    if (typeof ud.segIdx === 'number') {
      const seg = inst.segments[ud.segIdx]
      if (!seg || seg.paintColor === c) return false
      seg.paintColor = c
      return true
    }
    if (typeof ud.key === 'string') {
      if (!inst.paint) inst.paint = {}
      if (inst.paint[ud.key] === c) return false
      inst.paint[ud.key] = c
      return true
    }
    return false
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  protected async onInit(): Promise<void> {
    const saved = this.store.loadAutosave() // khôi phục thiết kế lần trước TRƯỚC khi dựng GUI/scene
    if (saved) this.state = saved
    this._setupScene()
    await this._setupEnvironment() // IBL → MeshStandardNodeMaterial phản chiếu specular (bớt nhựa)
    this._setupCamera()
    this._setupCSS2D()
    this.humanFigure = new HumanFigure()
    this.humanFigure.build()
    this.scene.add(this.humanFigure.group)
    this.heightGridSystem = new HeightGridSystem(this.scene, this.gridOpts)
    this.heightGridSystem.build()
    this.coordPicker = new CoordPicker(this.scene)
    this.coordPicker.build()
    this.scene.add(this.buildingGroup)
    this.scene.add(this.pickGroup) // SPIKE: lớp pick vô hình cho brush paint
    this.manipulate = new ManipulateTool(this._manipulateHost()) // trước _setupGUI: nhận registerFocus
    this.highlight = new HighlightOverlay(this._highlightHost())
    this._setupGUI()
    this._buildScene()
    window.addEventListener('keydown', this._onKeyDown)
    window.addEventListener('keyup', this._onKeyUp)
    this.canvas.addEventListener('pointerdown', this._onPointerDown)
    this.canvas.addEventListener('pointermove', this._onPointerMove)
    window.addEventListener('pointerup', this._onPointerUp)
    this.canvas.addEventListener('contextmenu', this._onContextMenu)
    if (import.meta.env.DEV) {
      this.guard = new RuntimeGuard(this.renderer)
      this.devHud = new DevHud(this.canvas.parentElement ?? document.body) // perf HUD — bấm ` để ẩn
    }
  }

  protected onUpdate(_time: number, deltaTime: number): void {
    this._applyWASD()
    this.controls?.update()
    this.css2dRenderer?.render(this.scene, this.camera)
    this.guard?.check()
    this.devHud?.update(this.renderer.info, deltaTime)
  }

  private _applyHorizMove(move: THREE.Vector3, fwd: THREE.Vector3, speed: number): void {
    const right = new THREE.Vector3()
      .crossVectors(fwd, new THREE.Vector3(0, 1, 0))
      .normalize()
      .multiplyScalar(speed)
    if (this._keysDown.has('KeyW')) move.add(fwd)
    if (this._keysDown.has('KeyS')) move.sub(fwd)
    if (this._keysDown.has('KeyD')) move.add(right)
    if (this._keysDown.has('KeyA')) move.sub(right)
  }

  private _applyWASD(): void {
    if (!this.controls || this._keysDown.size === 0) return
    const speed = 0.5
    const move = new THREE.Vector3()
    const fwd = this.controls.target.clone().sub(this.camera.position)
    fwd.y = 0
    if (fwd.lengthSq() >= 0.0001) {
      this._applyHorizMove(move, fwd.normalize().multiplyScalar(speed), speed)
    }
    if (this._keysDown.has('KeyE')) move.y += speed
    if (this._keysDown.has('KeyQ')) move.y -= speed
    if (move.lengthSq() < 0.0001) return
    this.camera.position.add(move)
    this.controls.target.add(move)
  }

  protected onDispose(): void {
    window.removeEventListener('keydown', this._onKeyDown)
    window.removeEventListener('keyup', this._onKeyUp)
    this.canvas.removeEventListener('pointerdown', this._onPointerDown)
    this.canvas.removeEventListener('pointermove', this._onPointerMove)
    window.removeEventListener('pointerup', this._onPointerUp)
    this.canvas.removeEventListener('contextmenu', this._onContextMenu)
    this._keysDown.clear()
    if (this._rafBuild) {
      cancelAnimationFrame(this._rafBuild)
      this._rafBuild = 0
    }
    this.highlight?.dispose()
    this._pickMat?.dispose() // SPIKE brush: material chung của pick layer
    this._pickMat = null
    this.controls?.dispose()
    this.controls = null
    this.palette?.dispose() // gỡ listener doc (mousedown/keydown) của popover palette
    this.gui?.destroy()
    this.gui = null
    this.leftTools?.remove() // gỡ wrapper → bỏ cả Scanner + Sun panel
    this.leftTools = null
    this.opFolders.clear()
    this._activeTabs.clear()
    this._clearBuilding()
    this._disposeSceneResources()
  }

  // Dispose tài nguyên scene tĩnh (không rebuild mỗi frame) + wall material cache.
  private _disposeSceneResources(): void {
    this.wallMats.dispose() // dispose + clear toàn bộ material cache + brick textures
    this._disposeEnvironment()
    this._disposeGround()
    this.gridHelper?.dispose()
    this.gridHelper = null
    this.heightGridSystem?.dispose()
    this.heightGridSystem = null
    this.css2dEl?.remove()
    this.css2dEl = null
    this.css2dRenderer = null
    this.humanFigure?.dispose()
    this.humanFigure = null
    this.coordPicker?.dispose()
    this.coordPicker = null
    this.sun?.dispose() // dispose shadow map render target
    this.sun = null
    this.guard?.dispose()
    this.guard = null
    this.devHud?.dispose()
    this.devHud = null
  }

  // ── Scene setup ────────────────────────────────────────────────────────────

  // IBL: RoomEnvironment → PMREM → scene.environment. Cho MeshStandardNodeMaterial phản chiếu
  // specular thật → bề mặt bớt "nhựa". fromSceneAsync vì WebGPU backend init bất đồng bộ.
  private async _setupEnvironment(): Promise<void> {
    const pmrem = new PMREMGenerator(this.renderer)
    const rt = await pmrem.fromSceneAsync(new RoomEnvironment(), 0.04)
    this.envTexture = rt.texture
    this.scene.environment = rt.texture
    this.scene.environmentIntensity = 0.3 // hạ fill IBL → vùng bóng tối/đậm hơn (bóng chỉ ăn fill)
    pmrem.dispose()
  }

  private _disposeEnvironment(): void {
    this.envTexture?.dispose()
    this.scene.environment = null
    this.envTexture = null
  }

  private _disposeGround(): void {
    this.groundShader?.dispose()
    this.groundShader = null
    this.groundMesh = null
    this.hemiLight = null
    this.groundGeo?.dispose()
    this.groundGeo = null
    this.groundMat?.dispose()
    this.groundMat = null
  }

  private _setupScene(): void {
    this.scene.background = new THREE.Color(0x07080d)
    // pixelRatio: kế thừa min(dpr,2) của BaseWorld (full chất lượng). KHÔNG hạ riêng ở đây —
    // band-aid 1.5 trước kia là để vá lag do Chrome render bằng CPU (software), không phải shader.
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap

    // Hemisphere thay ambient phẳng: sky lạnh từ trên + đất ấm bounce từ dưới → fill môi trường
    // có hướng (đúng "ánh sáng từ đất" — bề mặt bớt nhựa hơn ambient đều tịt).
    const hemi = new THREE.HemisphereLight(0xbcd4ff, 0x6b5240, 0.35) // hạ fill → bóng đổ đậm rõ hơn
    const sun = new THREE.DirectionalLight(0xfff5e0, 2.2)
    this.sun = sun // vị trí + intensity set bởi _applySun (từ sunOpts) cuối hàm
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048) // mịn hơn (~19mm/texel) để bắt bóng relief wood/overhang
    sun.shadow.camera.near = 0.5
    sun.shadow.camera.far = 60
    sun.shadow.camera.left = -20
    sun.shadow.camera.right = 20
    sun.shadow.camera.top = 20
    sun.shadow.camera.bottom = -20
    sun.shadow.bias = -0.001
    sun.shadow.normalBias = 0.015 // hạ từ 0.05: 50mm xoá hết relief; 15mm cho bóng kẽ wood hiện (đổi: acne nhẹ hơn nếu thấy)
    sun.shadow.autoUpdate = false // chỉ re-render shadow khi sun/geometry đổi (đỡ depth-pass/frame)

    this.groundGeo = new THREE.PlaneGeometry(80, 80)
    this.groundMat = new THREE.MeshToonMaterial({ color: 0x060810 })
    const ground = new THREE.Mesh(this.groundGeo, this.groundMat)
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    this.groundMesh = ground
    this.hemiLight = hemi

    this.gridHelper = new THREE.GridHelper(80, 80, 0x1a2240, 0x0f1220)
    this.scene.add(hemi, sun, ground, this.gridHelper)
    this._applySun()
  }

  // Đổi nền môi trường: 'none' = ground tối + lưới (như cũ); còn lại = vật liệu tự nhiên.
  // Set HemisphereLight.groundColor theo nền → công trình nhận ánh bounce màu đất (GI giả, rẻ).
  private _setGroundType(t: GroundType): void {
    if (!this.groundMesh || !this.hemiLight) return
    this.groundType = t
    this.groundShader?.dispose() // shader nền cũ (nếu có)
    this.groundShader = null

    if (t === 'none') {
      if (this.groundMat) this.groundMesh.material = this.groundMat
      if (this.gridHelper) this.gridHelper.visible = true
      this.hemiLight.groundColor.set(0x6b5240) // ấm trung tính như cũ
      return
    }

    if (this.gridHelper) this.gridHelper.visible = false // nền tự nhiên → ẩn lưới cho sạch
    const { mat, shader, bounce } = this._makeGroundMaterial(t)
    this.groundShader = shader
    this.groundMesh.material = mat
    this.groundMesh.receiveShadow = true
    this.hemiLight.groundColor.set(bounce)
  }

  // Tạo material + màu bounce hemisphere cho 1 loại nền procedural (không gồm 'none').
  // bounce = màu đại diện đất → HemisphereLight.groundColor → công trình ám màu từ dưới.
  private _makeGroundMaterial(t: GroundType): {
    mat: THREE.Material
    shader: { dispose(): void } | null
    bounce: number
  } {
    if (t === 'asphalt') {
      const a = new AsphaltGround({ scale: 1.0 })
      return { mat: a.getMaterial(), shader: a, bounce: 0x2a2a2e } // nhựa hấp thụ sáng → bounce yếu tối
    }
    // mặc định 'stone' (đá lát hoa cương — slab grid). Đất/cỏ tự nhiên sẽ từ Megascans/Gaea sau.
    const e = makeSurfaceMaterial('concrete', 0x9a9890, 1.0)
    return { mat: e.mat, shader: e.shader, bounce: 0x8a8880 }
  }

  // Đặt vị trí (cầu az/el, bán kính 24m trong tầm shadow camera) + intensity của sun từ sunOpts.
  private _applySun(): void {
    if (!this.sun) return
    const az = (this.sunOpts.azimuth * Math.PI) / 180
    const el = (this.sunOpts.elevation * Math.PI) / 180
    const r = 24
    const cosEl = Math.cos(el)
    this.sun.position.set(r * cosEl * Math.cos(az), r * Math.sin(el), r * cosEl * Math.sin(az))
    this.sun.intensity = this.sunOpts.intensity
    this.sun.shadow.needsUpdate = true // sun dời → shadow map cần vẽ lại (autoUpdate đang off)
  }

  private _setupCamera(): void {
    this.camera.fov = 75
    this.camera.near = 0.1
    this.camera.far = 300
    this.camera.updateProjectionMatrix()
    this.camera.position.set(16, 12, 18)
    this.camera.lookAt(0, 2, 0)

    this.controls = new OrbitControls(this.camera, this.canvas)
    this.controls.target.set(0, 2, 0)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.05
    this.controls.minDistance = 2
    this.controls.maxDistance = 120
    this.controls.update()
  }

  // CSS2DRenderer overlay — DOM labels project đúng vị trí 3D, luôn face camera
  private _setupCSS2D(): void {
    const el = document.createElement('div')
    el.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden'
    this.canvas.parentElement?.appendChild(el)
    this.css2dEl = el
    this.css2dRenderer = new CSS2DRenderer({ element: el })
    this.css2dRenderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight)
  }

  // ── GUI ────────────────────────────────────────────────────────────────────

  private _setupGUI(): void {
    this.manipulate?.clearFocus() // 3D→GUI: map folder dựng lại mỗi lần build GUI
    const ctx: APGuiCtx = {
      state: this.state,
      opFolders: this.opFolders,
      gridOpts: this.gridOpts,
      sunOpts: this.sunOpts,
      groundType: this.groundType,
      setGround: (t) => this._setGroundType(t),
      applySun: () => this._applySun(),
      getZGridGroup: () => this.heightGridSystem?.getZGridGroup() ?? null,
      getXGridGroup: () => this.heightGridSystem?.getXGridGroup() ?? null,
      getCYGridGroup: () => this.heightGridSystem?.getCYGridGroup() ?? null,
      setPickMode: (on) => this._setPickMode(on),
      registerPickToggle: (fn) => (this._syncPickCheckbox = fn),
      build: () => this._buildScene(),
      buildLive: () => this._buildSceneLive(),
      rebuild: () => this._rebuildGUI(),
      addInstance: (fId, key) => this._addInstance(fId, key),
      removeInstance: (fId, id) => this._removeInstance(fId, id),
      resetInstance: (fId, id) => this._resetInstance(fId, id),
      removeFloor: (id) => this._removeFloor(id),
      addFloor: () => this._addFloor(),
      resetState: () => this._resetState(),
      exportJSON: () => this.store.exportJSON(this.state),
      saveFile: () => void this.store.saveFile(this.state),
      loadFile: () => void this._loadFile(),
      addColumn: (inst) => this._addColumn(inst),
      removeColumn: (inst, idx) => this._removeColumn(inst, idx),
      onDimChange: (inst) => this._onDimChange(inst),
      onDimChangeLive: (inst) => this._onDimChangeLive(inst),
      getActiveTab: (key) => this._activeTabs.get(key) ?? 0,
      setActiveTab: (key, idx) => void this._activeTabs.set(key, idx),
      updateMeasureLabels: () => this.heightGridSystem?.update(this.buildingGroup),
      undo: () => this._undo(),
      redo: () => this._redo(),
      highlightPart: (t) => this.highlight?.show(t),
      registerFocus: (k, f) => this.manipulate?.registerFocus(k, f),
    }
    this.gui = setupGUI(ctx)
    // Wrapper xếp Scanner + Sun thành cột dọc (Sun nằm dưới Scanner).
    const tools = document.createElement('div')
    tools.className = 'ap-left-tools'
    this.canvas.parentElement?.appendChild(tools)
    this.leftTools = tools
    setupGridPanel(ctx, tools)
    setupSunPanel(ctx, tools)
    setupGroundPanel(ctx, tools)
    this._buildMovePanel(tools) // 🤚 toggle kéo element trong 3D
    this._mountPalette(tools) // 🎨 khay swatch atelier — build SAU Move → mặc định nằm dưới Move
  }

  // Nút toggle Move tool — đặt dưới khay Palette. Bật → kéo element trong 3D (loại trừ paint/pick).
  private _buildMovePanel(tools: HTMLElement): void {
    const p = document.createElement('div')
    p.className = 'ap-scan-panel'
    const btn = document.createElement('button')
    btn.className = 'ap-move-btn'
    btn.textContent = '🤚 Move: off'
    btn.title = 'Bật rồi kéo tường/cột/cầu thang/ban công/cửa trong 3D. Chuột phải = thoát.'
    btn.addEventListener('click', () => this._setMoveMode(!this.moveMode))
    this._moveBtn = btn
    p.appendChild(btn)
    tools.appendChild(p)
  }

  // Tạo PalettePanel lần đầu (persist qua _rebuildGUI) rồi dựng DOM vào leftTools.
  private _mountPalette(tools: HTMLElement): void {
    if (!this.palette) this.palette = new PalettePanel(this._paletteHost())
    this.palette.build(tools)
  }

  // Host cho PalettePanel: brush color + paintMode dùng chung với paint nên giữ ở lab; palette set qua đây.
  private _paletteHost(): PaletteHost {
    return {
      parent: () => this.leftTools,
      getState: () => this.state,
      persist: () => this.store.autosave(this.state),
      getBrush: () => this._brushColor,
      setBrush: (c) => {
        this._brushColor = c
      },
      isPainting: () => this.paintMode,
      setPaintMode: (on) => this._setPaintMode(on),
    }
  }

  // Host cho ManipulateTool: scene refs (stable) + callback locate/rebuild. Lab giữ pick layer + mode.
  private _manipulateHost(): ManipulateHost {
    return {
      canvas: this.canvas,
      camera: this.camera,
      raycaster: this._ray,
      pickGroup: this.pickGroup,
      locateInst: (id) => this._locateInst(id)?.inst ?? null,
      buildScene: () => this._buildScene(),
      buildSceneLive: () => this._buildSceneLive(),
      refreshGuiNumbers: () => this.gui?.controllersRecursive().forEach((c) => c.updateDisplay()),
    }
  }

  // Host cho HighlightOverlay: scene + 3 locator (dùng chung build/paint, nên ở lại Lab).
  private _highlightHost(): HighlightHost {
    return {
      scene: this.scene,
      locateInst: (id) => this._locateInst(id),
      instWallBase: (inst, fi) => this._instWallBase(inst, fi),
    }
  }

  private _rebuildGUI(): void {
    this._setPickMode(false) // panel dựng lại → checkbox pick về unchecked, đồng bộ state
    this._setPaintMode(false) // SPIKE: brush về off khi rebuild GUI (checkbox mới = unchecked)
    this._setMoveMode(false) // Move về off — nút dựng lại ở trạng thái off
    this.palette?.closeBrowser() // gỡ listener doc + popover trước khi dựng lại panel
    this.gui?.destroy()
    this.gui = null
    this.leftTools?.remove() // gỡ wrapper → bỏ cả Scanner + Sun panel
    this.leftTools = null
    this.opFolders.clear()
    this._setupGUI()
  }

  // ── Column management ──────────────────────────────────────────────────────

  private _addColumn(inst: ShapeInstance): void {
    inst.structure.columns.push(mkColumn())
    this._rebuildGUI()
    this._buildScene()
  }

  private _removeColumn(inst: ShapeInstance, colIdx: number): void {
    inst.structure.columns.splice(colIdx, 1)
    this._rebuildGUI()
    this._buildScene()
  }

  // ── Instance management ────────────────────────────────────────────────────

  private _addInstance(floorId: string, shapeKey: string | null): void {
    const floor = this.state.floors.find((f) => f.id === floorId)
    if (!floor) return
    floor.instances.push(mkInstance(shapeKey))
    this._rebuildGUI()
    this._buildScene()
  }

  private _removeInstance(floorId: string, instId: string): void {
    const floor = this.state.floors.find((f) => f.id === floorId)
    if (!floor || floor.instances.length <= 1) return
    floor.instances = floor.instances.filter((inst) => inst.id !== instId)
    this._rebuildGUI()
    this._buildScene()
  }

  private _resetInstance(floorId: string, instId: string): void {
    const floor = this.state.floors.find((f) => f.id === floorId)
    if (!floor) return
    const inst = floor.instances.find((i) => i.id === instId)
    if (!inst) return
    const fresh = mkInstance(inst.shapeKey)
    fresh.id = instId
    floor.instances = floor.instances.map((i) => (i.id === instId ? fresh : i))
    this._rebuildGUI()
    this._buildScene()
  }

  private _addFloor(): void {
    this.state.floors.push(mkFloor())
    this._rebuildGUI()
    this._buildScene()
  }

  private _removeFloor(id: string): void {
    if (this.state.floors.length <= 1) return
    this.state.floors = this.state.floors.filter((f) => f.id !== id)
    this._rebuildGUI()
    this._buildScene()
  }

  private _onDimChange(inst: ShapeInstance): void {
    if (!inst.shapeKey) return
    const config = SHAPE_CONFIGS[inst.shapeKey]
    inst.segments = config.toSegments(inst.dims, inst.segments)
    this._buildScene()
  }

  // Kéo slider dims (Total W/D…) → regen segments + render LIVE (không history/persist). Không
  // rebuild GUI nên controller đang kéo không bị destroy giữa chừng.
  private _onDimChangeLive(inst: ShapeInstance): void {
    if (!inst.shapeKey) return
    inst.segments = SHAPE_CONFIGS[inst.shapeKey].toSegments(inst.dims, inst.segments)
    this._buildSceneLive()
  }

  // ── Locator helpers (dùng chung build + paint + highlight overlay) ───────────
  private _locateInst(instId: string): { inst: ShapeInstance; fi: number } | null {
    for (let fi = 0; fi < this.state.floors.length; fi++) {
      const inst = this.state.floors[fi].instances.find((i) => i.id === instId)
      if (inst) return { inst, fi }
    }
    return null
  }

  // Cao độ đáy tường của 1 floor = tổng chiều cao các tầng dưới (khớp BuildingFromState.buildFloor: maxLift+maxFloorH).
  private _floorBaseY(targetFi: number): number {
    let yAcc = 0
    for (let fi = 0; fi < targetFi; fi++) {
      let maxLift = 0
      let maxFloorH = 0
      for (const inst of this.state.floors[fi].instances) {
        const yLift = fi === 0 && inst.structure.showFoundation ? inst.structure.foundH / 1000 : 0
        maxLift = Math.max(maxLift, yLift)
        const hm = inst.segments.length ? Math.max(...inst.segments.map((s) => s.wallH)) / 1000 : 3
        maxFloorH = Math.max(maxFloorH, hm)
      }
      yAcc += maxLift + maxFloorH
    }
    return yAcc
  }

  private _instWallBase(inst: ShapeInstance, fi: number): number {
    const lift = fi === 0 && inst.structure.showFoundation ? inst.structure.foundH / 1000 : 0
    return this._floorBaseY(fi) + lift
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  private _undo(): void {
    const prev = this._undoStack.pop()
    if (!prev) return
    this._redoStack.push(JSON.stringify(this.state))
    this.state = JSON.parse(prev) as BuildingState
    this._historyLock = true
    try {
      this._rebuildGUI()
      this._buildScene()
    } finally {
      this._historyLock = false
    }
  }

  private _redo(): void {
    const next = this._redoStack.pop()
    if (!next) return
    this._undoStack.push(JSON.stringify(this.state))
    this.state = JSON.parse(next) as BuildingState
    this._historyLock = true
    try {
      this._rebuildGUI()
      this._buildScene()
    } finally {
      this._historyLock = false
    }
  }

  private _recordHistory(): void {
    if (this._prevState === '' || this._historyLock) return
    this._undoStack.push(this._prevState)
    if (this._undoStack.length > 50) this._undoStack.shift()
    this._redoStack.length = 0
  }

  // Commit 1 thay đổi: ghi history + autosave + dựng lại geometry. Dùng cho select/checkbox/nút
  // và lúc BUÔNG slider (onFinishChange). Cancel rAF live đang chờ để khỏi render thừa.
  private _buildScene(): void {
    if (this._rafBuild) {
      cancelAnimationFrame(this._rafBuild)
      this._rafBuild = 0
    }
    this._recordHistory()
    this._prevState = JSON.stringify(this.state)
    this.store.autosave(this.state) // autosave mỗi build → reload/mở lại là ra nguyên thiết kế
    this._renderScene()
  }

  // LIVE: kéo slider → dựng lại geometry NGAY để xem trực tiếp, gộp ≤1 lần/frame qua rAF. KHÔNG
  // history/persist (việc đó để _buildScene lúc buông chuột làm 1 lần). _prevState giữ nguyên =
  // trạng thái trước drag → undo sau khi commit revert đúng cả cú kéo.
  private _buildSceneLive(): void {
    if (this._rafBuild) return
    this._rafBuild = requestAnimationFrame(() => {
      this._rafBuild = 0
      this._renderScene()
    })
  }

  // Dựng lại geometry tường/structure/mái thuần — KHÔNG đụng history/persist. Tách khỏi _buildScene
  // để live-drag tái dùng (render-only) mà không spam undo/localStorage.
  private _renderScene(): void {
    this._clearBuilding()
    // Dựng walls+structure+roof+paint qua renderer CHUNG ở lõi (building-kit/BuildingFromState). Trả
    // Placement[] (toạ độ pick-box) → editor tự gắn lớp pick vô hình (brush/Move). Renderer headless,
    // KHÔNG đụng pick/chrome/sun.
    const placements = renderBuildingState(this.state, {
      wallCache: this.wallMats,
      group: this.buildingGroup,
      geos: this.buildingGeos,
      mats: this.buildingMats,
      brick3d: this.brick3dWalls,
      wood: this.woodWalls,
      strip: this.stripWalls,
    })
    for (const p of placements) this._addPick(p.cx, p.cy, p.cz, p.sx, p.sy, p.sz, p.rotDeg, p.ud)
    if (this.sun) this.sun.shadow.needsUpdate = true // geometry đổi → shadow map vẽ lại 1 lần
    this.heightGridSystem?.update(this.buildingGroup)
  }

  // Box pick vô hình (visible=false → 0 render, Raycaster vẫn hit) ôm 1 element. userData → _paintAt.
  private _addPick(
    cx: number,
    cy: number,
    cz: number,
    sx: number,
    sy: number,
    sz: number,
    rotDeg: number,
    ud: Record<string, unknown>
  ): void {
    if (!this._pickMat) this._pickMat = new THREE.MeshBasicMaterial()
    const geo = new THREE.BoxGeometry(sx, sy, sz)
    this.pickBoxGeos.push(geo)
    const mesh = new THREE.Mesh(geo, this._pickMat)
    mesh.position.set(cx, cy, cz)
    mesh.rotation.y = (rotDeg * Math.PI) / 180
    mesh.visible = false
    mesh.userData = ud
    this.pickGroup.add(mesh)
  }

  private _clearBuilding(): void {
    for (const geo of this.buildingGeos) geo.dispose()
    for (const mat of this.buildingMats) mat.dispose()
    for (const w of this.brick3dWalls) w.dispose() // InstancedBrickWall: backing+brick geo/mat
    for (const w of this.woodWalls) w.dispose() // WoodSidingWall: backing+plank geo/mat
    for (const w of this.stripWalls) w.dispose() // WoodSidingStrip: 1 mesh geo/mat
    for (const g of this.pickBoxGeos) g.dispose() // SPIKE pick layer
    this.brick3dWalls = []
    this.woodWalls = []
    this.stripWalls = []
    this.buildingGeos = []
    this.buildingMats = []
    this.pickBoxGeos = []
    this.buildingGroup.clear()
    this.pickGroup.clear()
  }

  // ── Reset / Load file (I/O qua DesignStore — state/persistence.ts) ───────────

  private _resetState(): void {
    this._undoStack = []
    this._redoStack = []
    this._prevState = ''
    this.state = defaultBuildingState()
    this.store.forgetHandle() // dự án mới → quên file đang gắn, Save kế tiếp hỏi nơi lưu
    this._rebuildGUI()
    this._buildScene()
  }

  // Load file → reset undo + rebuild scene. Toàn bộ I/O + alert nằm trong DesignStore.
  private async _loadFile(): Promise<void> {
    const st = await this.store.loadFile()
    if (!st) return
    this._undoStack = []
    this._redoStack = []
    this._prevState = ''
    this.state = st
    this._rebuildGUI()
    this._buildScene()
  }
}
