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

import { computeLocalBbox } from 'building-kit/build' // footprint nhà (m²) cho bảng số liệu lô
import { renderBuildingState } from 'building-kit/render/fromState' // renderer chung lõi (Phase 1b)
import { makeSurfaceMaterial, WallMaterialCache } from 'building-kit/wallMaterials' // material engine
import type GUI from 'lil-gui'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import { PMREMGenerator } from 'three/webgpu'
import type { GrassBlades, GrassExcludeRect } from 'threejs-modules/components/GrassBlades'
import type { InstancedBrickWall } from 'threejs-modules/components/InstancedBrickWall'
import type { WaterSurface } from 'threejs-modules/components/WaterSurface'
import type { WoodSidingStrip } from 'threejs-modules/components/WoodSidingStrip'
import type { WoodSidingWall } from 'threejs-modules/components/WoodSidingWall'
import { AsphaltGround } from 'threejs-modules/shaders/ground/AsphaltGround'
import {
  pondWorldXZ,
  renderSiteState,
  type SiteRenderCtx,
} from 'threejs-modules/site/render/fromState'
import { coverageStats, defaultSiteState, type SiteState } from 'threejs-modules/site/state'
import { Tabs } from 'threejs-modules/ui/Tabs' // 🗂️ tab ngang drawer (Building|Ground|Tinh chỉnh)
import { BaseWorld } from 'threejs-modules/utils/core/BaseWorld'
import { RuntimeGuard } from 'threejs-modules/utils/core/RuntimeGuard'

import { DevHud } from './gui/devhud' // perf HUD dev (fps/budget/leak) — tách monolith
import { GrassPreview } from './gui/grass-preview' // 🔎 preview 1 lá cỏ cạnh Tinh chỉnh
import { type APGuiCtx, setupGUI, setupToolsPanel } from './gui/gui'
import { setupSitePanel } from './gui/site' // 🌳 panel sân vườn (site/lô)
import { setupTweakPanel } from './gui/tweak' // 🎛️ tinh chỉnh decor (cỏ 3D, sau: đá/effect)
import { type HighlightHost, HighlightOverlay } from './interaction/highlight' // flash viền phần đang chỉnh — tách monolith
import { type ManipulateHost, ManipulateTool } from './interaction/manipulate' // 🤚 Move + 🎯 Focus — tách monolith
import { type PaletteHost, PalettePanel } from './interaction/palette' // 🎨 khay swatch atelier — tách monolith
import { SunGizmo, type SunGizmoHost } from './interaction/sunGizmo' // ☀ sun = vật thể kéo trong scene
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
  private drawer: HTMLElement | null = null // 🗄️ drawer phải (shell bền qua rebuild): nhà + Sân vườn + Tinh chỉnh
  private drawerBody: HTMLElement | null = null // cột cuộn trong drawer — gui + panels dựng vào đây
  private drawerTabs: Tabs | null = null // tab ngang đầu drawer (Building | Ground | Tinh chỉnh)
  private siteTabs: Tabs | null = null // tab CON trong panel Ground (Ground | Fence)
  private tweakTabs: Tabs[] = [] // tab CON panel Tinh chỉnh: cấp 1 (Lá đơn|Bụi cỏ) + cấp 2 (Số đo|Độ cong|Bóng đổ)
  private drawerPanels: HTMLElement[] = [] // panel non-gui trong drawer (Ground+Tinh chỉnh) — gỡ khi teardown
  private _drawerTab = 0 // tab drawer đang mở — nhớ qua _rebuildGUI
  private lDrawer: HTMLElement | null = null // drawer TRÁI: bảng Tools (Surface+tọa độ) — ẩn mặc định
  private lDrawerBody: HTMLElement | null = null
  private paletteWrap: HTMLElement | null = null // 🎨 Palette = tool TỰ DO float (ngoài drawer), kéo được
  private moveFloat: HTMLButtonElement | null = null // 🤚 Move = nút float góc trái-dưới (cạnh thanh sáng sun)
  private controls: OrbitControls | null = null

  // Đèn mặt trời + tham số (điều khiển qua panel ☀ Sun). Default ≈ vị trí cũ (10,18,10).
  private sun: THREE.DirectionalLight | null = null
  private readonly sunOpts: SunOpts = {
    azimuth: 45,
    elevation: 52,
    intensity: 2.2,
    color: 0xfff5e0,
    enabled: true,
  }
  private sunGizmo: SunGizmo | null = null // ☀ sun = vật thể kéo trong scene (thay panel GUI)

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
  private _syncMoveToggle: ((on: boolean) => void) | null = null // sync nút 🤚 trong gui Tools
  // 💧 Phiên kéo hồ trong 3D (Move tool). body = dời cả hồ; vertex = nắn 1 đỉnh polygon (shape='free').
  private _waterDrag:
    | { kind: 'body'; plane: THREE.Plane; sx: number; sz: number; ox0: number; oz0: number }
    | { kind: 'vertex'; plane: THREE.Plane; idx: number }
    | null = null
  // Handle đỉnh polygon hồ (overlay editor) — group ở scene; chỉ hiện khi shape='free' + moveMode.
  private _waterHandles: THREE.Group | null = null
  private _waterHandleGeo: THREE.SphereGeometry | null = null // dùng chung mọi handle
  private _waterHandleMat: THREE.MeshBasicMaterial | null = null
  // _downPos = vị trí nhấn (phân biệt click vs drag/orbit) — _onPointerUp dùng cho click→Focus.
  private _downPos: { x: number; y: number } | null = null
  // brick-3d — geometry thật, không merge; track để dispose mỗi build.
  private brick3dWalls: InstancedBrickWall[] = []
  private woodWalls: WoodSidingWall[] = []
  private stripWalls: WoodSidingStrip[] = []
  // Wall material cache (material+color+scale → 1 material, merge tường ít draw call) — tách ra
  // build/materials.ts (pure, không host). Brick textures + dispose nằm trong cache.
  private wallMats = new WallMaterialCache()

  // 🌳 Sân vườn (site/lô) — group + arrays riêng (dispose độc lập building). Persist cùng design qua
  // DesignStore. show=true → đôn building lên groundThick để foundation nằm trên mặt nền.
  private site: SiteState = defaultSiteState()
  private readonly siteGroup = new THREE.Group()
  private siteGeos: THREE.BufferGeometry[] = []
  private siteMats: THREE.Material[] = []
  private siteShaders: { dispose(): void; setTime?(s: number): void }[] = [] // GrassGround… — dispose + gió theo time
  private _siteGrass: GrassBlades | null = null // ref cỏ 3D đang sống → tinh chỉnh uniform live (no rebuild)
  private _siteWater: WaterSurface | null = null // ref hồ nước đang sống → setSun + tune uniform live
  private preview: GrassPreview | null = null // 🔎 bảng preview 1 lá (mini WebGPU riêng)
  private _previewGrass: GrassBlades | null = null // lá trong preview → tune cùng lúc với bãi ngoài
  private _refreshSiteReadout: (() => void) | null = null

  private groundGeo: THREE.BufferGeometry | null = null // nền backdrop editor — Plane, hoặc Shape-có-lỗ khi có hồ
  private groundMat: THREE.MeshToonMaterial | null = null // nền tối mặc định ('none')
  private groundMesh: THREE.Mesh | null = null // để swap material theo groundType
  private hemiLight: THREE.HemisphereLight | null = null // groundColor = màu bounce theo nền
  private groundShader: { dispose(): void } | null = null // shader nền procedural (grass/cement…)
  private groundType: GroundType = 'none'
  private envTexture: THREE.Texture | null = null // IBL từ PMREM(RoomEnvironment)
  private gridHelper: THREE.LineSegments | null = null // lưới editor (y=0) — tự dựng để KHOÉT lỗ hồ
  private gridMat: THREE.LineBasicMaterial | null = null
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
  private _siteRaf = 0 // throttle rAF cho live-drag slider site/grass (Tinh chỉnh) — né re-scatter mỗi input

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
    // Z = bật/tắt Move tool 🤚 (_setMoveMode tự đồng bộ nút float góc trái). Guard tách ra _isPlainZ.
    if (this._isPlainZ(e)) {
      e.preventDefault()
      this._setMoveMode(!this.moveMode)
      return
    }
    this._keysDown.add(e.code)
  }
  // Z trơn (không Ctrl/Meta/Alt, không auto-repeat) = phím tắt Move. Né Ctrl+Z/Alt+Z (undo…).
  private _isPlainZ(e: KeyboardEvent): boolean {
    return e.code === 'KeyZ' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey
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
    if (this.sunGizmo?.tryStartDrag(e)) return // ☀ nhấn trúng quả sun → kéo (ưu tiên cao nhất, mọi mode)
    if (this.paintMode) {
      this._paintAt(e) // SPIKE brush: click → sơn tường
      return
    }
    if (this.moveMode) {
      if (this._tryStartWaterDrag(e)) return // 💧 trúng mặt hồ (gần hơn pick-box) → kéo hồ
      this.manipulate?.dragStart(e) // Move tool: nhấn-giữ element → kéo (focus GUI ngay khi nhấn)
      return
    }
    if (!this.pickMode) return
    this.picking = true
    this._pickAt(e)
  }
  private readonly _onPointerMove = (e: PointerEvent): void => {
    if (this.sunGizmo?.isDragging()) {
      this.sunGizmo.drag(e) // ☀ đang kéo sun → đổi hướng nắng theo vòm
      return
    }
    if (this.moveMode) {
      this._moveModeMove(e) // 💧 hồ hoặc element building (pick off khi moveMode → an toàn return)
      return
    }
    if (this.pickMode && this.picking) this._pickAt(e)
  }

  // Move mode đang kéo: ưu tiên hồ (_waterDrag) rồi tới element building (manipulate).
  private _moveModeMove(e: PointerEvent): void {
    if (this._waterDrag) this._waterDragMove(e)
    else if (this.manipulate?.isDragging()) this.manipulate.dragMove(e)
  }
  private readonly _onPointerUp = (e: PointerEvent): void => {
    if (this.sunGizmo?.isDragging()) {
      this.sunGizmo.endDrag() // ☀ thả sun → bật lại orbit
      this._downPos = null
      return
    }
    if (this._waterDrag) {
      this._waterDrag = null
      this._applySite(true) // 💧 commit: cỏ né lại dưới hồ vị trí mới + autosave (Move giữ nguyên)
      this._downPos = null
      return
    }
    if (this.manipulate?.isDragging()) {
      this.manipulate?.dragEnd()
      this._downPos = null
      return
    }
    this.picking = false
    this._maybeClickFocus(e)
    this._downPos = null
  }

  // Click (không kéo) ở chế độ thường → trỏ GUI tới đúng panel. Bỏ qua paint/pick. <5px = click.
  private _maybeClickFocus(e: PointerEvent): void {
    if (!this._downPos || this.paintMode || this.pickMode) return
    const dx = e.clientX - this._downPos.x
    const dy = e.clientY - this._downPos.y
    if (dx * dx + dy * dy < 25) this.manipulate?.clickFocus(e)
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
    this._waterDrag = null // huỷ kéo hồ đang dở (đổi mode / thoát chuột phải / Alt)
    if (on) {
      this._setPaintMode(false)
      this.palette?.markSwatch(null)
      this._setPickMode(false)
    }
    if (this.controls) this.controls.enabled = !on
    this._syncMoveToggle?.(on) // đổi class nút 🤚 (ap-move-on) — text bỏ, chỉ symbol
    this._rebuildWaterHandles() // 💧 hiện/ẩn handle đỉnh hồ theo moveMode
  }

  // ── 💧 Kéo hồ trong 3D (Move tool) — site element, lab tự xử lý (manipulate chỉ lo building) ──

  private _ndc(e: PointerEvent): THREE.Vector2 {
    const r = this.canvas.getBoundingClientRect()
    return new THREE.Vector2(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1
    )
  }

  // Nhấn Move: ưu tiên ĐỈNH polygon (free) → thân hồ (gần hơn mọi pick-box building) → nhường manipulate.
  private _tryStartWaterDrag(e: PointerEvent): boolean {
    const mesh = this._siteWater?.getMesh()
    if (!mesh) return false
    this._ray.setFromCamera(this._ndc(e), this.camera)
    if (this._tryStartVertexDrag(mesh)) {
      this.canvas.setPointerCapture(e.pointerId) // đỉnh trước (handle nhỏ, nằm trên mặt hồ)
      return true
    }
    const wHit = this._ray.intersectObject(mesh, false)[0]
    if (!wHit) return false
    const pHit = this._ray.intersectObjects(this.pickGroup.children, false)[0]
    if (pHit && pHit.distance < wHit.distance) return false // building element gần hơn → nhường manipulate
    const w = this.site.water
    this._waterDrag = {
      kind: 'body',
      plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -wHit.point.y),
      sx: wHit.point.x,
      sz: wHit.point.z,
      ox0: w.offsetX,
      oz0: w.offsetZ,
    }
    this.canvas.setPointerCapture(e.pointerId)
    return true
  }

  // Trúng 1 handle đỉnh → phiên kéo đỉnh (ray đã set ở caller). Mặt chiếu = ngang tại mặt nước.
  private _tryStartVertexDrag(mesh: THREE.Mesh): boolean {
    const handles = this._waterHandles
    if (!handles || handles.children.length === 0) return false
    const hit = this._ray.intersectObjects(handles.children, false)[0]
    const idx = hit ? (hit.object.userData as { vi?: number }).vi : undefined
    if (typeof idx !== 'number') return false
    this._waterDrag = {
      kind: 'vertex',
      plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -mesh.position.y),
      idx,
    }
    return true // pointer capture do caller _tryStartWaterDrag lo
  }

  // Kéo hồ: chiếu lên mặt ngang → dispatch dời-thân / nắn-đỉnh.
  private _waterDragMove(e: PointerEvent): void {
    const d = this._waterDrag
    if (!d) return
    this._ray.setFromCamera(this._ndc(e), this.camera)
    const cur = new THREE.Vector3()
    if (!this._ray.ray.intersectPlane(d.plane, cur)) return
    if (d.kind === 'body') this._waterDragBody(d, cur)
    else this._waterDragVertex(d, cur)
  }

  // Dời cả hồ: ghi offset (mm) + DỜI MESH LIVE (reflector.target con → theo cùng) + handle theo.
  private _waterDragBody(
    d: { sx: number; sz: number; ox0: number; oz0: number },
    cur: THREE.Vector3
  ): void {
    const w = this.site.water
    w.offsetX = Math.round(d.ox0 + (cur.x - d.sx) * 1000)
    w.offsetZ = Math.round(d.oz0 + (cur.z - d.sz) * 1000)
    const mesh = this._siteWater?.getMesh()
    if (!mesh) return
    mesh.position.set(w.offsetX / 1000, mesh.position.y, w.offsetZ / 1000)
    this._waterHandles?.position.set(mesh.position.x, mesh.position.y + 0.05, mesh.position.z)
  }

  // Nắn 1 đỉnh: world → local (trừ tâm hồ) → ghi points[idx] (mm) + dựng lại geometry live + dời handle.
  private _waterDragVertex(d: { idx: number }, cur: THREE.Vector3): void {
    const water = this._siteWater
    const mesh = water?.getMesh()
    const p = this.site.water.points[d.idx]
    if (!water || !mesh || !p) return
    p.x = Math.round((cur.x - mesh.position.x) * 1000)
    p.z = Math.round((cur.z - mesh.position.z) * 1000)
    water.setShape(this.site.water.points.map((q) => ({ x: q.x / 1000, z: q.z / 1000 })))
    const handle = this._waterHandles?.children[d.idx]
    if (handle) handle.position.set(p.x / 1000, 0, p.z / 1000)
  }

  // Dựng lại handle đỉnh: group đặt tại tâm hồ (world), mỗi handle = sphere tại đỉnh (local). Chỉ khi
  // shape='free' + moveMode + hồ enabled (≥3 đỉnh). Geo/mat dùng chung → clear chỉ gỡ mesh, không leak.
  private _rebuildWaterHandles(): void {
    const g = this._waterHandles
    if (!g) return
    g.clear()
    const water = this._siteWater
    const w = this.site.water
    if (!water || !w.enabled || w.shape !== 'free' || !this.moveMode || w.points.length < 3) return
    const mesh = water.getMesh()
    g.position.set(mesh.position.x, mesh.position.y + 0.05, mesh.position.z)
    const geo = (this._waterHandleGeo ??= new THREE.SphereGeometry(0.12, 12, 8))
    const mat = (this._waterHandleMat ??= new THREE.MeshBasicMaterial({ color: 0xffcc33 }))
    w.points.forEach((p, i) => {
      const h = new THREE.Mesh(geo, mat)
      h.position.set(p.x / 1000, 0, p.z / 1000)
      h.userData = { vi: i }
      g.add(h)
    })
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
    if (saved) {
      this.state = saved.state
      this.site = saved.site
    }
    this._loadSunOpts() // khôi phục sun (az/el/intensity/màu/on-off) TRƯỚC khi _setupScene áp lên light
    this._setupScene()
    await this._setupEnvironment() // IBL → MeshStandardNodeMaterial phản chiếu specular (bớt nhựa)
    this._setupCamera()
    this._setupCSS2D()
    if (this.sun) this.sunGizmo = new SunGizmo(this._sunGizmoHost(this.sun)) // ☀ sun kéo được trong scene
    this.humanFigure = new HumanFigure()
    this.humanFigure.build()
    this.scene.add(this.humanFigure.group)
    this.heightGridSystem = new HeightGridSystem(this.scene, this.gridOpts)
    this.heightGridSystem.build()
    this.coordPicker = new CoordPicker(this.scene)
    this.coordPicker.build()
    this.scene.add(this.siteGroup) // 🌳 nền + rào lô (dưới building)
    this.scene.add(this.buildingGroup)
    this.scene.add(this.pickGroup) // SPIKE: lớp pick vô hình cho brush paint
    this._waterHandles = new THREE.Group() // 💧 overlay handle đỉnh polygon hồ (free + moveMode)
    this.scene.add(this._waterHandles)
    this.manipulate = new ManipulateTool(this._manipulateHost()) // trước _setupGUI: nhận registerFocus
    this.highlight = new HighlightOverlay(this._highlightHost())
    this._setupDrawer() // 🗄️ shell bền — tạo 1 lần trước GUI; gui+panels rebuild bên trong
    this._setupLeftDrawer() // ◀ drawer trái (Tools) — shell bền, ẩn mặc định
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

  protected onUpdate(time: number, deltaTime: number): void {
    this._applyWASD()
    this.controls?.update()
    for (const s of this.siteShaders) s.setTime?.(time) // 🌿 gió lùa cỏ (GrassGround) chạy theo elapsed
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
    if (this._siteRaf) {
      cancelAnimationFrame(this._siteRaf)
      this._siteRaf = 0
    }
    this.highlight?.dispose()
    this._pickMat?.dispose() // SPIKE brush: material chung của pick layer
    this._pickMat = null
    this.controls?.dispose()
    this.controls = null
    this.palette?.dispose() // gỡ listener doc (mousedown/keydown) của popover palette
    this._teardownPanels() // preview + gui nhà + 2 nhóm panel
    this.drawer?.remove() // 🗄️ gỡ shell drawer phải (handle + body) — chỉ ở dispose, KHÔNG ở _rebuildGUI
    this.drawer = null
    this.drawerBody = null
    this.lDrawer?.remove() // ◀ gỡ shell drawer trái (Tools)
    this.lDrawer = null
    this.lDrawerBody = null
    this.opFolders.clear()
    this._activeTabs.clear()
    this._clearBuilding()
    this._clearSite() // 🌳 dispose nền + rào lô
    this._disposeSceneResources()
  }

  // Dispose tài nguyên scene tĩnh (không rebuild mỗi frame) + wall material cache.
  private _disposeSceneResources(): void {
    this.wallMats.dispose() // dispose + clear toàn bộ material cache + brick textures
    this._disposeEnvironment()
    this._disposeGround()
    this._disposeGrid()
    this.heightGridSystem?.dispose()
    this.heightGridSystem = null
    this.css2dEl?.remove()
    this.css2dEl = null
    this.css2dRenderer = null
    this.humanFigure?.dispose()
    this.humanFigure = null
    this.coordPicker?.dispose()
    this.coordPicker = null
    this.sunGizmo?.dispose() // ☀ gỡ quả sun + panel CSS2D
    this.sunGizmo = null
    this.sun?.dispose() // dispose shadow map render target
    this.sun = null
    this.guard?.dispose()
    this.guard = null
    this.devHud?.dispose()
    this.devHud = null
    this._disposeWaterHandles()
  }

  // 💧 Dispose geo/mat handle đỉnh dùng chung (group ở scene tự dọn khi scene teardown).
  private _disposeWaterHandles(): void {
    this._waterHandleGeo?.dispose()
    this._waterHandleMat?.dispose()
    this._waterHandleGeo = null
    this._waterHandleMat = null
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

    this.gridMat = new THREE.LineBasicMaterial({ color: 0x1a2240 })
    this.gridHelper = new THREE.LineSegments(this._buildGridGeo(null), this.gridMat) // tự dựng → khoét được
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

  // Đặt vị trí (cầu az/el, bán kính 24m trong tầm shadow camera) + intensity/màu/on-off của sun từ
  // sunOpts. Cuối hàm sync gizmo (vị trí quả sun bám theo light). Mọi nguồn đổi sun đều qua đây.
  private _applySun(): void {
    if (!this.sun) return
    const az = (this.sunOpts.azimuth * Math.PI) / 180
    const el = (this.sunOpts.elevation * Math.PI) / 180
    const r = 24
    const cosEl = Math.cos(el)
    this.sun.position.set(r * cosEl * Math.cos(az), r * Math.sin(el), r * cosEl * Math.sin(az))
    this.sun.intensity = this.sunOpts.intensity
    this.sun.color.set(this.sunOpts.color)
    this.sun.visible = this.sunOpts.enabled // tắt → chỉ còn hemisphere fill, không đổ bóng
    this.sun.shadow.needsUpdate = true // sun dời → shadow map cần vẽ lại (autoUpdate đang off)
    this._applySunToGrass() // vệt tiếp đất cỏ đổi hướng/độ dài theo sun (live, không dựng lại)
    this._applySunToWater() // đốm nắng glint trên mặt hồ đổi theo sun (live)
    this.sunGizmo?.sync()
  }

  // Hướng + độ dài vệt tiếp đất của bãi cỏ theo sun (live). Gọi khi sun đổi + sau mỗi lần dựng lại _siteGrass.
  private _applySunToGrass(): void {
    if (this._siteGrass && this.sun) {
      const sp = this.sun.position
      this._siteGrass.setSun(sp.x, sp.y, sp.z)
    }
  }

  // Đốm nắng glint trên hồ theo sun (live). Gọi khi sun đổi + sau mỗi lần dựng lại _siteWater.
  private _applySunToWater(): void {
    if (this._siteWater && this.sun) {
      const sp = this.sun.position
      this._siteWater.setSun(sp.x, sp.y, sp.z)
    }
  }

  // Sun persist riêng (localStorage 'archplan:sun') — độc lập design store. Load TRƯỚC _setupScene.
  private _loadSunOpts(): void {
    try {
      const raw = localStorage.getItem('archplan:sun')
      if (!raw) return
      const o = JSON.parse(raw) as Partial<SunOpts>
      if (typeof o.azimuth === 'number') this.sunOpts.azimuth = ((o.azimuth % 360) + 360) % 360
      if (typeof o.elevation === 'number')
        this.sunOpts.elevation = Math.max(5, Math.min(89, o.elevation))
      if (typeof o.intensity === 'number')
        this.sunOpts.intensity = Math.max(0, Math.min(5, o.intensity))
      if (typeof o.color === 'number') this.sunOpts.color = Math.floor(o.color) & 0xffffff
      if (typeof o.enabled === 'boolean') this.sunOpts.enabled = o.enabled
    } catch {
      /* JSON hỏng → giữ default */
    }
  }

  private _saveSunOpts(): void {
    try {
      localStorage.setItem('archplan:sun', JSON.stringify(this.sunOpts))
    } catch {
      /* quota/private mode → bỏ qua */
    }
  }

  // Host cho SunGizmo: bơm scene/camera/canvas/light + opts + tắt-orbit-khi-kéo + apply + persist.
  private _sunGizmoHost(light: THREE.DirectionalLight): SunGizmoHost {
    return {
      scene: this.scene,
      camera: this.camera,
      canvas: this.canvas,
      light,
      opts: this.sunOpts,
      setOrbit: (on) => {
        if (this.controls) this.controls.enabled = on
      },
      apply: () => this._applySun(),
      persist: () => this._saveSunOpts(),
    }
  }

  private _setupCamera(): void {
    this.camera.fov = 75
    this.camera.near = 0.1
    this.camera.far = 300
    this.camera.updateProjectionMatrix()
    this.camera.position.set(0, 12, 18) // x=0 → nhìn thẳng trục Z (mặc định)
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
    const body = this.drawerBody
    if (!body) return
    const ctx = this._makeGuiCtx()
    this.gui = setupGUI(ctx, body) // lil-gui vào drawer (container) → hết fixed, title=thu/mở
    this._buildLeftTools(ctx, body)
  }

  // Gom callbacks GUI (state + handlers) thành APGuiCtx — tách khỏi _setupGUI cho gọn (Rule-50).
  private _makeGuiCtx(): APGuiCtx {
    return {
      state: this.state,
      opFolders: this.opFolders,
      gridOpts: this.gridOpts,
      sunOpts: this.sunOpts,
      groundType: this.groundType,
      setGround: (t) => this._setGroundType(t),
      site: this.site,
      applySite: (persist) => this._applySite(persist),
      applySiteLive: () => this._applySiteLive(),
      siteStats: () => this._siteStats(),
      registerSiteReadout: (fn) => (this._refreshSiteReadout = fn),
      tuneGrass: (apply, persist) => this._tuneGrass(apply, persist),
      tuneWater: (apply, persist) => this._tuneWater(apply, persist),
      applySun: () => this._applySun(),
      getZGridGroup: () => this.heightGridSystem?.getZGridGroup() ?? null,
      getXGridGroup: () => this.heightGridSystem?.getXGridGroup() ?? null,
      getCYGridGroup: () => this.heightGridSystem?.getCYGridGroup() ?? null,
      setPickMode: (on) => this._setPickMode(on),
      registerPickToggle: (fn) => (this._syncPickCheckbox = fn),
      setMoveMode: (on) => this._setMoveMode(on),
      getMoveMode: () => this.moveMode,
      registerMoveToggle: (fn) => (this._syncMoveToggle = fn),
      build: () => this._buildScene(),
      buildLive: () => this._buildSceneLive(),
      rebuild: () => this._rebuildGUI(),
      addInstance: (fId, key) => this._addInstance(fId, key),
      removeInstance: (fId, id) => this._removeInstance(fId, id),
      resetInstance: (fId, id) => this._resetInstance(fId, id),
      removeFloor: (id) => this._removeFloor(id),
      addFloor: () => this._addFloor(),
      resetState: () => this._resetState(),
      exportJSON: () => this.store.exportJSON(this.state, this.site),
      saveFile: () => void this.store.saveFile(this.state, this.site),
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
  }

  // 🗄️ Drawer phải: shell bền (tạo 1 lần) — tay kéo [»/«] trượt ẩn/hiện; body = cột cuộn chứa mọi gui.
  private _setupDrawer(): void {
    const drawer = document.createElement('div')
    drawer.className = 'ap-drawer'
    drawer.style.width = `${Math.max(240, Math.round(window.innerWidth / 5) + 10)}px`
    const handle = document.createElement('button')
    handle.className = 'ap-drawer-handle'
    handle.textContent = '»'
    handle.title = 'Thu / mở bảng điều khiển'
    const body = document.createElement('div')
    body.className = 'ap-drawer-body'
    handle.addEventListener('click', () => {
      const closed = drawer.classList.toggle('ap-drawer-closed')
      handle.textContent = closed ? '«' : '»'
    })
    drawer.appendChild(handle)
    drawer.appendChild(body)
    this.canvas.parentElement?.appendChild(drawer)
    this.drawer = drawer
    this.drawerBody = body
  }

  // ◀ Drawer TRÁI: bảng Tools (Surface + tọa độ) ẩn vào mép trái mặc định; tay kéo »/« nhô ra/ẩn vào.
  private _setupLeftDrawer(): void {
    const drawer = document.createElement('div')
    drawer.className = 'ap-ldrawer ap-ldrawer-closed' // ẩn vào trái mặc định
    const handle = document.createElement('button')
    handle.className = 'ap-ldrawer-handle'
    handle.textContent = '»'
    handle.title = 'Hiện / ẩn bảng Tools (Surface + tọa độ)'
    const body = document.createElement('div')
    body.className = 'ap-ldrawer-body'
    handle.addEventListener('click', () => {
      const closed = drawer.classList.toggle('ap-ldrawer-closed')
      handle.textContent = closed ? '»' : '«'
    })
    drawer.append(handle, body)
    this.canvas.parentElement?.appendChild(drawer)
    this.lDrawer = drawer
    this.lDrawerBody = body
  }

  // TRONG drawer: 3 panel (Building=gui nhà · Ground=lô · Tinh chỉnh) là CON TRỰC TIẾP drawerBody →
  // Tabs ngang quản lý (ẩn/hiện). NGOÀI drawer: float góc trái (Scanner/Sun/Ground/Move/Palette).
  private _buildLeftTools(ctx: APGuiCtx, drawerBody: HTMLElement): void {
    const site = setupSitePanel(ctx, drawerBody) // 🌳 Ground: sub-tab Ground|Fence → { panel, tabs }
    this.siteTabs = site.tabs
    const tweak = setupTweakPanel(ctx, drawerBody) // 🎛️ Tinh chỉnh — { panel, previewHost, tabs }
    this.tweakTabs = tweak.tabs // tab con: cấp 1 (Lá đơn|Bụi cỏ) + cấp 2 (Số đo|Độ cong|Bóng đổ)
    this.preview = new GrassPreview(tweak.previewHost) // 🔎 preview 1 lá/bụi GỘP trong panel Tinh chỉnh
    void this.preview.init().then(() => this._previewRebuild())
    this.drawerPanels = [site.panel, tweak.panel] // gỡ khi teardown (gui.domElement do gui.destroy lo)
    this._buildDrawerTabs(drawerBody, site.panel, tweak.panel)
    this._buildFloatingTools(ctx)
  }

  // Tab ngang đầu drawer: Building | Ground | Tinh chỉnh — tái dùng Tabs + ap-tab CSS, nhớ tab active.
  private _buildDrawerTabs(host: HTMLElement, ground: HTMLElement, tweak: HTMLElement): void {
    const guiEl = this.gui?.domElement
    if (!guiEl) return
    this.drawerTabs = new Tabs(
      host,
      [
        { label: '🏠 Building', panel: guiEl, title: 'Điều khiển nhà' },
        { label: '🌳 Ground', panel: ground, title: 'Nền / rào / lô (sân vườn)' },
        { label: '🎛️ Lab', panel: tweak, title: 'Cỏ 3D…' },
      ],
      {
        initial: this._drawerTab,
        classes: {
          bar: 'ap-tab-bar ap-drawer-tabs',
          tab: 'ap-tab-btn',
          panel: 'ap-drawer-panel',
          active: 'ap-tab-active',
        },
        injectCss: false,
        onChange: (idx) => {
          this._drawerTab = idx
        },
      }
    )
  }

  // Float góc trái (absolute, NGOÀI drawer): [gui Tools = Surface+Scanner+Pick/Move] · Palette (bên phải).
  private _buildFloatingTools(ctx: APGuiCtx): void {
    const tools = document.createElement('div')
    tools.className = 'ap-left-tools'
    this.lDrawerBody?.appendChild(tools) // vào drawer TRÁI (ẩn mặc định)
    this.leftTools = tools
    setupToolsPanel(ctx, tools) // 🛠 Surface(symbol) + Scanner X/Y/Z + Pick/Move (1 panel)
    // 🎨 Palette = tool TỰ DO: float riêng trên canvas (NGOÀI drawer), kéo được
    const palWrap = document.createElement('div')
    palWrap.className = 'ap-palette-float'
    this.canvas.parentElement?.appendChild(palWrap)
    this.paletteWrap = palWrap
    this._mountPalette(palWrap)
    this._buildFloatingMove(ctx) // 🤚 Move = nút float góc trái-dưới (cạnh thanh sáng sun)
  }

  // 🤚 Move = nút float CỐ ĐỊNH góc trái-dưới (cạnh thanh sáng sun ap-sun-ctrl), NGOÀI drawer → luôn
  // bấm được. Toggle Move mode (= phím Z). registerMoveToggle đồng bộ class khi đổi bằng phím/chuột phải.
  private _buildFloatingMove(ctx: APGuiCtx): void {
    const btn = document.createElement('button')
    btn.className = 'ap-move-btn ap-move-float'
    btn.textContent = '🤚'
    btn.title = 'Move (Z) — kéo tường/cột/cầu thang/cửa/hồ trong 3D. Chuột phải = thoát.'
    btn.addEventListener('click', () => ctx.setMoveMode(!ctx.getMoveMode()))
    btn.classList.toggle('ap-move-on', ctx.getMoveMode()) // giữ trạng thái qua _rebuildGUI
    ctx.registerMoveToggle((on) => btn.classList.toggle('ap-move-on', on))
    this.canvas.parentElement?.appendChild(btn)
    this.moveFloat = btn
  }

  // Tạo PalettePanel lần đầu (persist qua _rebuildGUI) rồi dựng DOM vào leftTools.
  private _mountPalette(tools: HTMLElement): void {
    if (!this.palette) this.palette = new PalettePanel(this._paletteHost())
    this.palette.build(tools)
  }

  // Host cho PalettePanel: brush color + paintMode dùng chung với paint nên giữ ở lab; palette set qua đây.
  private _paletteHost(): PaletteHost {
    return {
      parent: () => this.paletteWrap,
      getState: () => this.state,
      persist: () => this.store.autosave(this.state, this.site),
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

  // Gỡ preview + gui nhà + 2 nhóm panel (dùng chung dispose & _rebuildGUI). Drawer SHELL giữ nguyên.
  // Dispose preview ở đây → hết leak WebGPU renderer mỗi lần rebuild (trước: tạo mới đè, KHÔNG dispose cũ).
  private _teardownPanels(): void {
    this.preview?.dispose() // 🔎 mini WebGPU preview: stop loop + dispose renderer/blade
    this.preview = null
    this._previewGrass = null
    this.siteTabs?.dispose() // gỡ tab CON Ground|Fence trước (nằm trong panel Ground)
    this.siteTabs = null
    for (const t of this.tweakTabs) t.dispose() // gỡ cả 2 cấp tab panel Tinh chỉnh
    this.tweakTabs = []
    this.drawerTabs?.dispose() // gỡ tab bar drawer (KHÔNG đụng panel — caller sở hữu)
    this.drawerTabs = null
    for (const p of this.drawerPanels) p.remove() // Ground + Tinh chỉnh (con trực tiếp drawerBody)
    this.drawerPanels = []
    this.gui?.destroy()
    this.gui = null
    this.leftTools?.remove() // bảng Tools (trong drawer trái)
    this.leftTools = null
    this.paletteWrap?.remove() // 🎨 palette float tự do
    this.paletteWrap = null
    this.moveFloat?.remove() // 🤚 Move float góc trái-dưới
    this.moveFloat = null
  }

  private _rebuildGUI(): void {
    this._setPickMode(false) // panel dựng lại → checkbox pick về unchecked, đồng bộ state
    this._setPaintMode(false) // SPIKE: brush về off khi rebuild GUI (checkbox mới = unchecked)
    this._setMoveMode(false) // Move về off — nút dựng lại ở trạng thái off
    this.palette?.closeBrowser() // gỡ listener doc + popover trước khi dựng lại panel
    this._teardownPanels()
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
    this.store.autosave(this.state, this.site) // autosave mỗi build → reload/mở lại là ra nguyên thiết kế
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
    this._renderSite() // 🌳 nền + rào lô + đôn building lên mặt nền (theo site.show)
    this._refreshSiteReadout?.() // footprint nhà đổi → cập nhật phủ% trong bảng số liệu
    if (this.sun) this.sun.shadow.needsUpdate = true // geometry đổi → shadow map vẽ lại 1 lần
    this.heightGridSystem?.update(this.buildingGroup)
  }

  // 🌳 Dựng lại nền + rào lô vào siteGroup; đôn building + pick lên mặt nền khi show (foundation
  // nằm trên nền, không cắm xuyên). show=false → lift 0 (building về y=0). Lõi headless site-kit.
  private _renderSite(): void {
    this._clearSite()
    const ctx: SiteRenderCtx = {
      group: this.siteGroup,
      geos: this.siteGeos,
      mats: this.siteMats,
      shaders: this.siteShaders,
    }
    // exclude = footprint foundation → cỏ KHÔNG mọc nơi có nhà ("không đặt nền ground nơi có foundation").
    const h = renderSiteState(this.site, ctx, {
      exclude: this._foundationRects(),
    }) // handle trực tiếp (không instanceof → live ổn)
    this._siteGrass = h.grass
    this._siteWater = h.water
    this._applySunToGrass() // _siteGrass mới → set hướng vệt theo sun hiện tại
    this._applySunToWater() // _siteWater mới → set hướng glint theo sun hiện tại
    this._rebuildWaterHandles() // 💧 handle đỉnh theo hồ mới (free + moveMode)
    this._rebuildEditorGround() // 🕳️ khoét lỗ hồ vào nền backdrop editor → không che đáy basin
    this._rebuildGrid() // 🕳️ khoét lưới y=0 theo bbox hồ → hết sọc lưới đè lên lòng hồ
    const lift = this.site.show ? this.site.groundThick / 1000 : 0
    this.buildingGroup.position.y = lift
    this.pickGroup.position.y = lift // giữ pick-box khớp building đã đôn
  }

  // 🕳️ Nền backdrop editor (Plane 80×80 @ y=0, đặc) sẽ CHE đáy basin (basin chạy xuống dưới y=0). Khi có
  // hồ → thay bằng ShapeGeometry KHOÉT CÙNG lỗ hồ (pondWorldXZ lõi = single source) → nhìn xuyên thấy đáy.
  // Geo ở mặt phẳng XY như PlaneGeometry → mesh.rotation.x=-90° (đặt sẵn) lo hướng; lỗ (q.x,−q.z) khớp lõi.
  private _rebuildEditorGround(): void {
    if (!this.groundMesh) return
    this.groundGeo?.dispose()
    const w = this.site.water
    if (this.site.show && w.enabled) {
      const H = 40 // nửa cạnh 80m
      const s = new THREE.Shape()
      s.moveTo(-H, -H)
      s.lineTo(H, -H)
      s.lineTo(H, H)
      s.lineTo(-H, H)
      s.closePath()
      const hole = new THREE.Path()
      pondWorldXZ(this.site).forEach((q, i) => {
        if (i === 0) hole.moveTo(q.x, -q.z)
        else hole.lineTo(q.x, -q.z)
      })
      hole.closePath()
      s.holes.push(hole)
      this.groundGeo = new THREE.ShapeGeometry(s)
    } else {
      this.groundGeo = new THREE.PlaneGeometry(80, 80)
    }
    this.groundMesh.geometry = this.groundGeo
  }

  // bbox hồ (world XZ, mét) để khoét lưới — null khi không có hồ. Free polygon → bbox bao ngoài.
  private _pondBbox(): { x0: number; x1: number; z0: number; z1: number } | null {
    const w = this.site.water
    if (!this.site.show || !w.enabled) return null
    let x0 = Infinity
    let x1 = -Infinity
    let z0 = Infinity
    let z1 = -Infinity
    for (const p of pondWorldXZ(this.site)) {
      x0 = Math.min(x0, p.x)
      x1 = Math.max(x1, p.x)
      z0 = Math.min(z0, p.z)
      z1 = Math.max(z1, p.z)
    }
    return { x0, x1, z0, z1 }
  }

  // Lưới editor = LineSegments tự dựng (GridHelper KHÔNG khoét lỗ được). Mỗi đường //trục bị CẮT đoạn nằm
  // trong bbox hồ → hết sọc lưới đè lòng hồ (lưới y=0 nằm TRÊN mặt nước −2cm). 80×80, ô 1m như cũ.
  private _buildGridGeo(
    hole: { x0: number; x1: number; z0: number; z1: number } | null
  ): THREE.BufferGeometry {
    const H = 40
    const seg: number[] = []
    const line = (ax: number, az: number, bx: number, bz: number): void => {
      seg.push(ax, 0, az, bx, 0, bz)
    }
    for (let i = -H; i <= H; i++) {
      if (hole && i > hole.z0 && i < hole.z1) {
        line(-H, i, hole.x0, i)
        line(hole.x1, i, H, i)
      } else line(-H, i, H, i)
      if (hole && i > hole.x0 && i < hole.x1) {
        line(i, -H, i, hole.z0)
        line(i, hole.z1, i, H)
      } else line(i, -H, i, H)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3))
    return g
  }

  // Dựng lại lưới theo bbox hồ hiện tại (gọi sau _renderSite). Giữ material, chỉ thay geometry.
  private _rebuildGrid(): void {
    if (!this.gridHelper) return
    this.gridHelper.geometry.dispose()
    this.gridHelper.geometry = this._buildGridGeo(this._pondBbox())
  }

  // Giải phóng lưới (geometry + material). Tách khỏi _disposeSceneResources cho gọn (Rule complexity).
  private _disposeGrid(): void {
    this.gridHelper?.geometry.dispose()
    this.gridMat?.dispose()
    this.gridHelper = null
    this.gridMat = null
  }

  // 🎛️ Chỉnh uniform LIVE — áp ĐỒNG THỜI bãi ngoài (_siteGrass) + lá preview (_previewGrass). Né recompile.
  private _tuneGrass(apply: (g: GrassBlades) => void, persist: boolean): void {
    if (this._siteGrass) apply(this._siteGrass)
    if (this._previewGrass) apply(this._previewGrass)
    if (this.sun) this.sun.shadow.needsUpdate = true // refresh shadow map khi đổi (đổ-bóng/hình)
    if (persist) this.store.autosave(this.state, this.site)
  }

  // 🎛️ Chỉnh uniform LIVE trên hồ đang sống (màu/gương/sóng) — KHÔNG dựng lại. No-op nếu hồ chưa render.
  private _tuneWater(apply: (w: WaterSurface) => void, persist: boolean): void {
    if (this._siteWater) apply(this._siteWater)
    if (persist) this.store.autosave(this.state, this.site)
  }

  // 🔎 Dựng lại lá trong bảng preview từ grass3d (structural đổi). Giữ ref để tune uniform live cùng bãi.
  private _previewRebuild(): void {
    this._previewGrass = this.preview?.rebuild(this.site.grass3d) ?? null
  }

  private _clearSite(): void {
    for (const g of this.siteGeos) g.dispose()
    for (const m of this.siteMats) m.dispose()
    for (const s of this.siteShaders) s.dispose() // GrassGround… NodeMaterial
    this.siteGeos = []
    this.siteMats = []
    this.siteShaders = []
    this._siteGrass = null
    this._siteWater = null // dispose thật do siteShaders lo (WaterSurface trong đó)
    this.siteGroup.clear()
  }

  // Re-render lô (không đụng building geometry — chỉ siteGroup + lift + readout). persist=true →
  // autosave (commit: tick/select/buông slider); false = live drag slider. Site KHÔNG vào undo (G0).
  private _applySite(persist: boolean): void {
    if (this._siteRaf) {
      cancelAnimationFrame(this._siteRaf) // commit nuốt rAF live đang chờ → render cuối là bản này
      this._siteRaf = 0
    }
    this._renderSite()
    this._previewRebuild() // structural (mật độ/cao/rộng lá…) → đồng bộ lá preview
    this._refreshSiteReadout?.()
    if (this.sun) this.sun.shadow.needsUpdate = true
    if (persist) this.store.autosave(this.state, this.site)
  }

  // LIVE drag slider Tinh chỉnh: rebuild lô (field + preview) THROTTLE ≤1/frame qua rAF, KHÔNG persist.
  // Buông tay → _applySite(true) commit. Né re-scatter ngàn lá mỗi input event (vd kéo Mật độ → 24000 lá).
  private _applySiteLive(): void {
    if (this._siteRaf) return
    this._siteRaf = requestAnimationFrame(() => {
      this._siteRaf = 0
      this._renderSite()
      this._previewRebuild()
      this._refreshSiteReadout?.()
      if (this.sun) this.sun.shadow.needsUpdate = true
    })
  }

  // Diện tích nhà phủ (m²) = Σ bbox shape tầng trệt — đối chiếu 建ぺい率 trong bảng số liệu.
  private _footprintArea(): number {
    const gf = this.state.floors[0]
    if (!gf) return 0
    let area = 0
    for (const inst of gf.instances) {
      const { w, d } = computeLocalBbox(inst) // mét
      area += w * d
    }
    return area
  }

  private _siteStats(): ReturnType<typeof coverageStats> {
    return coverageStats(this.site, this._footprintArea())
  }

  // Rect footprint foundation (m, world XZ) cho cỏ né. Chỉ instance tầng trệt CÓ foundation. Lề =
  // overhang foundOh lớn nhất 4 phía → rect phủ trọn móng (thừa chút an toàn, không hở cỏ ở mép).
  private _foundationRects(): GrassExcludeRect[] {
    const gf = this.state.floors[0]
    if (!gf) return []
    const rects: GrassExcludeRect[] = []
    for (const inst of gf.instances) {
      if (!inst.structure.showFoundation) continue
      const { w, d } = computeLocalBbox(inst)
      const oh = inst.structure.foundOh
      const margin = Math.max(oh.n, oh.e, oh.s, oh.w)
      rects.push({
        cx: inst.posX / 1000,
        cz: inst.posZ / 1000,
        halfW: w / 2 + margin,
        halfD: d / 2 + margin,
        rot: (inst.rotY * Math.PI) / 180,
      })
    }
    return rects
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
    this.site = defaultSiteState() // 🌳 lô về mặc định
    this.store.forgetHandle() // dự án mới → quên file đang gắn, Save kế tiếp hỏi nơi lưu
    this._rebuildGUI()
    this._buildScene()
  }

  // Load file → reset undo + rebuild scene. Toàn bộ I/O + alert nằm trong DesignStore.
  private async _loadFile(): Promise<void> {
    const loaded = await this.store.loadFile()
    if (!loaded) return
    this._undoStack = []
    this._redoStack = []
    this._prevState = ''
    this.state = loaded.state
    this.site = loaded.site
    this._rebuildGUI()
    this._buildScene()
  }
}
