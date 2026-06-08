/**
 * VỊ TRÍ   — 01-Doraemon/src/sandbox/archplan/gui/ctx.ts
 * VAI TRÒ  — APGuiCtx interface — context object truyền state + callbacks vào GUI builders.
 * LIÊN HỆ  — Import bởi gui/gui.ts, gui/sections.ts, ArchPlanLab.ts.
 */

import type GUI from 'lil-gui'
import type * as THREE from 'three'
import type { GrassBlades } from 'threejs-modules/components/GrassBlades'
import type { RockCluster } from 'threejs-modules/components/RockCluster'
import type { StoneScatter } from 'threejs-modules/components/StoneScatter'
import type { WaterSurface } from 'threejs-modules/components/WaterSurface'
import type {
  CoverageStats,
  RockConfig,
  SiteState,
  StoneFieldConfig,
  WaterConfig,
} from 'threejs-modules/site/state'

import type { GridOpts, GroundType, SunOpts } from '../scene/scene'
import type { BuildingState, ShapeInstance } from '../state/state'

// Highlight 3D khi click tab GUI: flash viền wireframe vàng nhạt quanh phần đang chỉnh ~0.6s.
// wall/open = 1 tường/lỗ (segIdx[/opIdx]); col = 1 cột (colIdx); còn lại = phần của shape (instId).
// Cols (section) KHÔNG highlight — chỉ từng cột riêng (col 1/2/3) mới highlight.
export type HighlightTarget =
  | { kind: 'wall'; instId: string; segIdx: number }
  | { kind: 'open'; instId: string; segIdx: number; opIdx: number }
  | { kind: 'col'; instId: string; colIdx: number }
  | { kind: 'balcony'; instId: string; balconyIdx: number }
  | { kind: 'walls' | 'struct' | 'roof' | 'foundation' | 'slab' | 'stairs'; instId: string }

export interface APGuiCtx {
  state: BuildingState
  opFolders: Map<string, GUI[]>
  gridOpts: GridOpts
  sunOpts: SunOpts
  groundType: GroundType
  setGround(t: GroundType): void
  // 🌳 Sân vườn (site/lô): SiteState sống ở Lab; panel sửa trực tiếp rồi gọi applySite.
  site: SiteState
  applySite(persist: boolean): void // re-render lô + đôn nhà; persist=true → autosave (false = live drag)
  // 🟫 Báo Lab layer ground nào đang active (focus tab / click 3D). Cut → hiện mảng XÁM trên editor; add/-1 →
  // ẩn mọi cut. Lab toggle mesh.visible (raycaster vẫn pick). Optional — GUI builder không cần thì bỏ qua.
  setActiveGroundLayer?(idx: number): void
  applySiteLive(): void // re-render lô THROTTLE ≤1/frame (rAF), không persist — cho kéo slider Tinh chỉnh
  applyFenceLive(): void // CHỈ dựng lại RÀO (throttle, LOD box) — kéo slider rào/cổng: rebuild tối thiểu, KHÔNG grass/preview/readout/nước
  applyTerrainLive(): void // 🏔️ CHỈ swap geometry nền base (throttle) — kéo slider Terrain: KHÔNG đụng water-RTT/NodeMaterial (né tụt fps)
  applyTerrainDetail(): void // 🏔️ Phase 4: đẩy terrain.detail → uniform PhotoGround cache (micro-relief LIVE, KHÔNG rebuild/recompile)
  siteStats(): CoverageStats // đối chiếu nhà/lô (lotArea/coveragePct/gardenArea) cho bảng số liệu
  registerSiteReadout(fn: () => void): void // panel đăng ký refresh → Lab gọi khi build nhà (footprint đổi)
  // 🎛️ Tinh chỉnh decor: chỉnh uniform LIVE trên GrassBlades đang sống (KHÔNG dựng lại → né recompile).
  // persist=true → autosave (buông slider). No-op nếu cỏ 3D chưa render.
  tuneGrass(apply: (g: GrassBlades) => void, persist: boolean): void
  // 💧 Tinh chỉnh hồ nước LIVE (màu/gương/sóng) trên WaterSurface của ĐÚNG instance cfg. No-op nếu hồ đó
  // chưa render (pool tắt / pond/puddle placeholder). cfg = config của tab instance đang chỉnh.
  tuneWater(cfg: WaterConfig, apply: (w: WaterSurface) => void, persist: boolean): void
  // 💧 Chọn pool active (= tab instance đang mở) → 3D drag/handle nhắm hồ này. Gọi khi đổi tab Pl.
  setActiveWater(cfg: WaterConfig): void
  // 🪨 Tinh chỉnh cụm đá LIVE (vị trí/màu) trên RockCluster của ĐÚNG instance cfg — KHÔNG dựng lại geometry.
  // No-op nếu cụm đó chưa render (tắt). cfg = config tab instance đang chỉnh.
  tuneRock(cfg: RockConfig, apply: (r: RockCluster) => void, persist: boolean): void
  // 🪨 LIVE drag slider STRUCTURAL đá (count/craggy/footprint…): rebuild CHỈ rock meshes (throttle) — KHÔNG đụng
  // water-RTT/cỏ/nền (= chỗ tụt fps). Buông → applySite(true) commit (bám gò + autosave).
  applyRocksLive(): void
  // 🪨 Tinh chỉnh lối đi lát đá LIVE (vị trí/màu) trên StoneScatter của ĐÚNG instance cfg — KHÔNG dựng lại
  // geometry. No-op nếu khuôn đó chưa render (tắt). cfg = config tab instance đang chỉnh.
  tuneStoneField(cfg: StoneFieldConfig, apply: (s: StoneScatter) => void, persist: boolean): void
  // 🪨 LIVE drag slider STRUCTURAL lối đi (frame/rMin/rMax/gap/seed…): rebuild CHỈ stone meshes (throttle) —
  // KHÔNG đụng water-RTT/cỏ/nền. Buông → applySite(true) commit (bám gò + re-scatter cỏ né khuôn + autosave).
  applyStoneFieldsLive(): void
  // 💧 Hiện VIỀN form định vị (mảng mờ mặt nền) khi KÉO slider Pos/Width/Depth — live preview vị trí+kích
  // thước KHÔNG rebuild (né leak reflector). Buông slider = applySite(true) commit + tự ẩn viền.
  previewWater(cfg: WaterConfig): void
  applySun(): void
  getZGridGroup(): THREE.Group | null
  getXGridGroup(): THREE.Group | null
  getCYGridGroup(): THREE.Group | null
  setPickMode(on: boolean): void
  registerPickToggle(setChecked: (on: boolean) => void): void
  setMoveMode(on: boolean): void // 🤚 Move tool — kéo element trong 3D (loại trừ paint/pick)
  getMoveMode(): boolean
  registerMoveToggle(setOn: (on: boolean) => void): void // sync nút 🤚 khi mode đổi (vd thoát chuột phải)
  build(): void // commit: history + persist + render (select/nút/buông slider)
  buildLive(): void // live drag: chỉ render geometry, throttle rAF (kéo slider)
  rebuild(): void
  addInstance(floorId: string, key: string | null): void
  removeInstance(floorId: string, id: string): void
  resetInstance(floorId: string, id: string): void
  removeFloor(id: string): void
  addFloor(): void
  isFloorHidden(id: string): boolean // 🙈 tầng đang ẩn? (ẩn để xây tầng dưới không bị che)
  setFloorHidden(id: string, hidden: boolean): void // ẩn/hiện tầng → re-render (giữ stacking, không persist)
  resetState(): void
  exportJSON(): void
  saveFile(): void
  loadFile(): void
  addColumn(inst: ShapeInstance): void
  removeColumn(inst: ShapeInstance, idx: number): void
  onDimChange(inst: ShapeInstance): void
  onDimChangeLive(inst: ShapeInstance): void // kéo slider dims → regen segments + render live
  getActiveTab(key: string): number
  setActiveTab(key: string, idx: number): void
  updateMeasureLabels(): void
  undo(): void
  redo(): void
  highlightPart(t: HighlightTarget): void // flash viền wireframe vàng phần đang chỉnh ~0.5s
  // 3D → GUI: đăng ký folder của 1 element (key 'wall:id:i' | 'col:id:i' | 'roof:id'…) để click
  // vật thể trong 3D mở + cuộn thẳng tới panel tương ứng. Folder builder gọi khi tạo folder.
  registerFocus(key: string, folder: GUI): void
  // ⏳ Prefetch ASYNC mọi texture ground khi user MỞ dropdown Surface (mousedown) → bấm key nào cũng đã tải
  // sẵn, hiện tức thì (câu giờ chờ load). Optional — GUI builder không cần thì bỏ qua. Tự guard trùng-load.
  prefetchGroundTextures?(): void
}
