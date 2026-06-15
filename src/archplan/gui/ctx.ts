/**
 * VỊ TRÍ   — 01-Doraemon/src/sandbox/archplan/gui/ctx.ts
 * VAI TRÒ  — APGuiCtx interface — context object truyền state + callbacks vào GUI builders.
 * LIÊN HỆ  — Import bởi gui/gui.ts, gui/sections.ts, ArchPlanLab.ts.
 */

import type GUI from 'lil-gui'
import type * as THREE from 'three'
import type { GrassBlades } from 'threejs-modules/components/GrassBlades'
import type { PondFish } from 'threejs-modules/components/PondFish'
import type { WaterSurface } from 'threejs-modules/components/WaterSurface'
import type {
  CoverageStats,
  FenceConfig,
  FishSchool,
  GroundLayer,
  GroundMixParams,
  SiteState,
  WaterConfig,
} from 'threejs-modules/site/state'

import type { GridOpts, GroundType, SunOpts } from '../scene/scene'
import type { BuildingState, ShapeInstance } from '../state/state'

// 🖌 Target của bảng mix + cọ vẽ mask: zone (GroundLayer.mix) · nền lô G0 ('base' — site.groundMix) ·
// đáy/vách hồ (w.floorMix/wallMix — stage 4) · mặt tường rào (f.mix — KHÔNG cọ vẽ, mapping 'wall').
// Wrapper water/fence được GUI tạo mới mỗi lần build pane → SO SÁNH bằng sameMixTarget, KHÔNG ===.
export type MixPaintTarget =
  | GroundLayer
  | 'base'
  | { water: WaterConfig; face: 'floor' | 'wall' }
  | { fence: FenceConfig }
  // 🎨 GENERIC mặt đứng KHÔNG cọ vẽ (mapping 'wall') — trỏ THẲNG params object (vd seg.mix tường building,
  // foundMix móng). Consumer mới dùng thẳng dạng này: KHÔNG thêm nhánh Lab (cấy = render hook + GUI).
  | { wallMix: GroundMixParams }
  // 🎨 GENERIC mặt NẰM KHÔNG cọ vẽ (mapping 'xz' world — vd slabMix sàn building).
  | { flatMix: GroundMixParams }

// 🧽🎯 HỌ MODE XÔ MIX (khay 🧱 — NgQuan 2026-06-11 bỏ 'apply', gộp vào 'edit'): 'edit' click bề mặt →
// CÓ mix thì mở board chỉnh tại chỗ; CHƯA có thì tạo CLONE từ src (preset đang chọn) rồi mở board luôn.
// 'erase' = gỡ mix. src = nguồn clone khi bề mặt còn trống (panel luôn cấp).
export type MixBucketOp = { mode: 'erase' } | { mode: 'edit'; src: GroundMixParams }

// 🎯 Đích mode 'edit' resolve được — khay mở board: target thật (zone/G0/hồ = CÓ cọ vẽ) + params
// hiện hành + kind để commit đúng hệ (build = ctx.build / site = applySite) + label tiêu đề.
export interface MixEditSel {
  target: MixPaintTarget
  kind: 'site' | 'build'
  label: string
  params: GroundMixParams
}

// Cùng target HỒ (cùng WaterConfig ref + cùng face)? — tách hàm giữ sameMixTarget dưới trần complexity.
function sameWaterTarget(a: MixPaintTarget, b: MixPaintTarget): boolean {
  if (typeof a === 'string' || typeof b === 'string') return false
  return 'water' in a && 'water' in b && a.water === b.water && a.face === b.face
}

// Cùng target RÀO (cùng FenceConfig ref)?
function sameFenceTarget(a: MixPaintTarget, b: MixPaintTarget): boolean {
  if (typeof a === 'string' || typeof b === 'string') return false
  return 'fence' in a && 'fence' in b && a.fence === b.fence
}

// Cùng target wallMix/flatMix generic (cùng GroundMixParams ref)?
function sameWallMixTarget(a: MixPaintTarget, b: MixPaintTarget): boolean {
  if (typeof a === 'string' || typeof b === 'string') return false
  if ('flatMix' in a) return 'flatMix' in b && a.flatMix === b.flatMix
  return 'wallMix' in a && 'wallMix' in b && a.wallMix === b.wallMix
}

// So 2 target mix (null-safe): zone/'base' = identity; water = cùng WaterConfig ref + cùng face;
// fence = cùng FenceConfig ref. Wrapper object khác nhau nhưng trỏ cùng config → CÙNG target.
export function sameMixTarget(
  a: MixPaintTarget | null | undefined,
  b: MixPaintTarget | null | undefined
): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return sameWaterTarget(a, b) || sameFenceTarget(a, b) || sameWallMixTarget(a, b)
}

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
  applyLampLive(): void // 💡 kéo slider đèn: transform group + recompute pool (0 rebuild). Buông → applySite(true)
  // 🟫 Báo Lab layer ground nào đang active (focus tab / click 3D). Cut → hiện mảng XÁM trên editor; add/-1 →
  // ẩn mọi cut. Lab toggle mesh.visible (raycaster vẫn pick). Optional — GUI builder không cần thì bỏ qua.
  setActiveGroundLayer?(idx: number): void
  applySiteLive(): void // re-render lô THROTTLE ≤1/frame (rAF), không persist — cho kéo slider Tinh chỉnh
  applyFenceLive(): void // CHỈ dựng lại RÀO (throttle, LOD box) — kéo slider rào/cổng: rebuild tối thiểu, KHÔNG grass/preview/readout/nước
  applyBridgeLive(): void // 🌉 CHỈ dựng lại CẦU (throttle ≤1/frame) — kéo slider cầu LIVE: box thuần rẻ, KHÔNG đụng nước-RTT/cỏ
  applyPoolFloorLive(w: WaterConfig): void // 🏔️ CHỈ swap geometry ĐÁY hồ w (throttle) — kéo slider gò đáy: KHÔNG rebuild site/water-RTT (né tụt fps)
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
  // 🌊 Render bộ điều khiển VA CHẠM mặt nước (toàn cục — Demo + slider gợn) vào sub-tab Water. ArchPlanLab cấp;
  // site.ts gọi 1 lần ở đáy buildWaterDomain. Optional — builder/mock không cần thì bỏ qua.
  buildWaterFx?(host: HTMLElement): void
  // 🐟 Chỉnh bầy cá LIVE (vị trí/vùng/sâu/cỡ/tốc/màu — transform mesh + setter PondFish, 0 rebuild) của
  // ĐÚNG bầy cfg (tab F1 F2…). No-op nếu bầy chưa render (enabled=false).
  tuneFish(cfg: FishSchool, apply: (f: PondFish) => void, persist: boolean): void
  // 👆 MODE click thả mồi: on = click hồ 3D → rải thức-ăn (rơi từ cao) tại điểm cho cá hồ đó. getFeedMode = trạng thái (toggle hiện đúng).
  setFeedMode?(on: boolean): void
  getFeedMode?(): boolean
  // 🌊 Tham số DÁNG sóng gợn (GLOBAL — mọi hồ + chung gợn mưa): amp(độ dày)/speed(độ rộng)/life(thời gian)/wave(bước sóng).
  // set → áp ngay mọi hồ; get → giá trị hiện tại cho slider khởi tạo. Dùng ở tab Thả mồi (nhóm sóng khi cá ăn).
  setRippleParam?(key: 'rippleAmp' | 'rippleSpeed' | 'rippleLife' | 'rippleWave', v: number): void
  getRippleParam?(key: 'rippleAmp' | 'rippleSpeed' | 'rippleLife' | 'rippleWave'): number
  // 💧 Chọn pool active (= tab instance đang mở) → 3D drag/handle nhắm hồ này. Gọi khi đổi tab Pl.
  setActiveWater(cfg: WaterConfig): void
  // 🪨 XOAY path-zone LIVE: CHỈ set mesh.rotation.y (transform thuần — KHÔNG rebuild gì → né water-RTT = tụt fps).
  // flatIdx = index trong groundLayers (mesh.userData.groundLayerIdx). Buông slider → applySite(true) commit.
  tunePathRotLive(flatIdx: number, rotDeg: number): void
  // 🪨 LIVE drag slider STRUCTURAL path (frame/R/gap/seed…): rebuild CHỈ zone meshes (surface+path, throttle) —
  // KHÔNG đụng water-RTT/cỏ/nền. Buông → applySite(true) commit.
  applyZonesLive(): void
  // 🖌 VẼ MASK MIX per-zone + G0 base (stage 3 — PhotoGroundMix.paint). Optional: builder khác/mock không cần.
  // Target: GroundLayer = zone Z1+ (layer.mix) · 'base' = NỀN LÔ G0 (site.groundMix).
  // setMixPaint(target, slot) = bật cọ slot đó (orbit khóa, loại trừ Move/Pick/Paint); (null, _) = thoát.
  setMixPaint?(target: MixPaintTarget | null, slot: number): void
  getMixPaint?(): { target: MixPaintTarget; slot: number } | null // target+slot đang vẽ — highlight 🖌
  getMixBrush?(): { size: number; erase: boolean } // cọ hiện tại (board mở lại hiện đúng số)
  setMixBrush?(sizeM: number, erase: boolean): void // bán kính m world + chế độ tẩy
  clearMixPaint?(target: MixPaintTarget, slot: number): void // xóa kênh slot + persist
  // Kéo slider mix (Ngưỡng/Macro/…) → đẩy uniform vào material sống — KHÔNG rebuild site (stage 3 hết khựng).
  tuneMixLive?(target: MixPaintTarget): void
  registerMixPaintSync?(fn: () => void): void // UI đăng ký redraw — bỏ highlight 🖌 khi mode tắt từ ngoài
  // 🪣🧽🎯 HỌ MODE XÔ MIX (khay 🧪 — UI inline trong panel ĐÃ THÁO, NgQuan 2026-06-11): click 3D vào đích
  // (tường building/rào/đáy-vách hồ/zone surface/G0/móng/sàn) →
  //   'apply' = CLONE preset vào field mix · 'erase' = gỡ mix (field=undefined) · 'edit' = mở board
  //   của ĐỐI TƯỢNG trong khay (registerMixEditOpen — cọ vẽ/slider live trên target thật).
  // null = buông mode. Optional như nhóm cọ.
  setMixBucket?(op: MixBucketOp | null): void
  getMixBucketMode?(): MixBucketOp['mode'] | null // 3 nút khay hiện đúng trạng thái
  registerMixBucketSync?(fn: () => void): void // panel đăng ký — bỏ highlight khi mode tắt từ ngoài
  registerMixEditOpen?(fn: (sel: MixEditSel) => void): void // 🎯 click trúng đích có mix → khay mở board
  // (✨ hover ghost: toggle qua KHAY TIỆN ÍCH 🧰 / Space — Lab gọi thẳng _setHoverOn, không qua ctx)
  // 🔎 Ô PREVIEW cho EDITOR PRESET (khay 🧪 đang ✎): canvas WebGPU riêng bên phải khay (MixPreview),
  // material riêng của component → slider board tune LIVE qua tune() (CLONE chỉ áp lúc 🪣 — đối
  // tượng đã áp KHÔNG đổi theo, đúng chốt). null = ẩn ô. Gọi lại sau commit structural (đổi texture/rule).
  setMixPreview?(mix: GroundMixParams | null): void
  // 💧 Hiện VIỀN form định vị (mảng mờ mặt nền) khi KÉO slider Pos/Width/Depth — live preview vị trí+kích
  // thước KHÔNG rebuild (né leak reflector). Buông slider = applySite(true) commit + tự ẩn viền.
  previewWater(cfg: WaterConfig): void
  // 🐟 FLASH tia trục-Y tại vị trí bầy cá (đổi tab F / kéo slider) — cá chìm dưới nền nên cần mốc;
  // marker depthTest=false (nhìn xuyên đất/nước), tự ẩn sau ~1.5s.
  previewFish(fs: FishSchool): void
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
  // 3D → GUI biến thể cho section GỌN (round N mặt 1 folder): action chạy TRƯỚC khi tra anchor —
  // đổi mặt đang chọn + rebuild GUI, anchor mặt mới tự đăng ký trong rebuild nên focus vẫn trúng.
  registerFocusAction(key: string, fn: () => void): void
  // 🚪 C2: kéo slider Mở % cánh cửa → xoay pivot TRỰC TIẾP (transform thuần, 0 rebuild/recompile).
  // key = `${instId}:${segIdx}:${opIdx}` (khớp userData.leafKey gắn lúc assembleLeaves).
  tuneLeafLive(key: string, openPct: number): void
  // ⏳ Prefetch ASYNC mọi texture ground khi user MỞ dropdown Surface (mousedown) → bấm key nào cũng đã tải
  // sẵn, hiện tức thì (câu giờ chờ load). Optional — GUI builder không cần thì bỏ qua. Tự guard trùng-load.
  prefetchGroundTextures?(): void
}
