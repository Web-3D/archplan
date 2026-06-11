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

import turfManifest from 'assets/textures/ground/artificial_turf/meta.json'
import turfAoUrl from 'assets/textures/ground/artificial_turf/production/ao.ktx2?url'
import turfBaseColorUrl from 'assets/textures/ground/artificial_turf/production/basecolor.ktx2?url'
import turfNormalUrl from 'assets/textures/ground/artificial_turf/production/normal.ktx2?url'
import turfRoughnessUrl from 'assets/textures/ground/artificial_turf/production/roughness.ktx2?url'
import bgravelManifest from 'assets/textures/ground/beach_gravel/meta.json'
import bgravelAoUrl from 'assets/textures/ground/beach_gravel/production/ao.ktx2?url'
import bgravelBaseColorUrl from 'assets/textures/ground/beach_gravel/production/basecolor.ktx2?url'
import bgravelNormalUrl from 'assets/textures/ground/beach_gravel/production/normal.ktx2?url'
import bgravelRoughnessUrl from 'assets/textures/ground/beach_gravel/production/roughness.ktx2?url'
import cobbleManifest from 'assets/textures/ground/cobblestone/meta.json'
import cobbleAoUrl from 'assets/textures/ground/cobblestone/production/ao.ktx2?url'
import cobbleBaseColorUrl from 'assets/textures/ground/cobblestone/production/basecolor.ktx2?url'
import cobbleNormalUrl from 'assets/textures/ground/cobblestone/production/normal.ktx2?url'
import cobbleRoughnessUrl from 'assets/textures/ground/cobblestone/production/roughness.ktx2?url'
import cgravelManifest from 'assets/textures/ground/construction_grave/meta.json'
import cgravelAoUrl from 'assets/textures/ground/construction_grave/production/ao.ktx2?url'
import cgravelBaseColorUrl from 'assets/textures/ground/construction_grave/production/basecolor.ktx2?url'
import cgravelNormalUrl from 'assets/textures/ground/construction_grave/production/normal.ktx2?url'
import cgravelRoughnessUrl from 'assets/textures/ground/construction_grave/production/roughness.ktx2?url'
import grassoManifest from 'assets/textures/ground/grass_o/meta.json'
import grassoAoUrl from 'assets/textures/ground/grass_o/production/ao.ktx2?url'
import grassoBaseColorUrl from 'assets/textures/ground/grass_o/production/basecolor.ktx2?url'
import grassoNormalUrl from 'assets/textures/ground/grass_o/production/normal.ktx2?url'
import grassoRoughnessUrl from 'assets/textures/ground/grass_o/production/roughness.ktx2?url'
// 🏜️ Ground texture thêm (sand/gravel/asphalt) — PhotoGround, keyed theo GroundMaterialKey.
import sandManifest from 'assets/textures/ground/rippled_sand/meta.json'
import sandAoUrl from 'assets/textures/ground/rippled_sand/production/ao.ktx2?url'
import sandBaseColorUrl from 'assets/textures/ground/rippled_sand/production/basecolor.ktx2?url'
import sandNormalUrl from 'assets/textures/ground/rippled_sand/production/normal.ktx2?url'
import sandRoughnessUrl from 'assets/textures/ground/rippled_sand/production/roughness.ktx2?url'
import romanManifest from 'assets/textures/ground/roman_stone_floor/meta.json'
import romanAoUrl from 'assets/textures/ground/roman_stone_floor/production/ao.ktx2?url'
import romanBaseColorUrl from 'assets/textures/ground/roman_stone_floor/production/basecolor.ktx2?url'
import romanNormalUrl from 'assets/textures/ground/roman_stone_floor/production/normal.ktx2?url'
import romanRoughnessUrl from 'assets/textures/ground/roman_stone_floor/production/roughness.ktx2?url'
import asphaltManifest from 'assets/textures/ground/rough_asphalt/meta.json'
import asphaltAoUrl from 'assets/textures/ground/rough_asphalt/production/ao.ktx2?url'
import asphaltBaseColorUrl from 'assets/textures/ground/rough_asphalt/production/basecolor.ktx2?url'
import asphaltNormalUrl from 'assets/textures/ground/rough_asphalt/production/normal.ktx2?url'
import asphaltRoughnessUrl from 'assets/textures/ground/rough_asphalt/production/roughness.ktx2?url'
import sand2kManifest from 'assets/textures/ground/thai_beach_sand2k/meta.json'
import sand2kAoUrl from 'assets/textures/ground/thai_beach_sand2k/production/ao.ktx2?url'
import sand2kBaseColorUrl from 'assets/textures/ground/thai_beach_sand2k/production/basecolor.ktx2?url'
import sand2kNormalUrl from 'assets/textures/ground/thai_beach_sand2k/production/normal.ktx2?url'
import sand2kRoughnessUrl from 'assets/textures/ground/thai_beach_sand2k/production/roughness.ktx2?url'
import sand4kManifest from 'assets/textures/ground/thai_beach_sand4k/meta.json'
import sand4kAoUrl from 'assets/textures/ground/thai_beach_sand4k/production/ao.ktx2?url'
import sand4kBaseColorUrl from 'assets/textures/ground/thai_beach_sand4k/production/basecolor.ktx2?url'
import sand4kNormalUrl from 'assets/textures/ground/thai_beach_sand4k/production/normal.ktx2?url'
import sand4kRoughnessUrl from 'assets/textures/ground/thai_beach_sand4k/production/roughness.ktx2?url'
// 🌱 Texture ground 'grass-tex' = Uncut Grass (assets/textures/ground/uncut-grass). Manifest cho tileSizeMeters;
// ?url cho từng map (Vite serve qua alias 'assets' + fs.allow). Loader chọn KTX2/Texture theo đuôi file.
import grassManifest from 'assets/textures/ground/uncut-grass/meta.json'
import grassAoUrl from 'assets/textures/ground/uncut-grass/production/ao.ktx2?url'
import grassBaseColorUrl from 'assets/textures/ground/uncut-grass/production/basecolor.ktx2?url'
import grassNormalUrl from 'assets/textures/ground/uncut-grass/production/normal.ktx2?url'
import grassRoughnessUrl from 'assets/textures/ground/uncut-grass/production/roughness.ktx2?url'
import pavementManifest from 'assets/textures/ground/worn_pavement/meta.json'
import pavementAoUrl from 'assets/textures/ground/worn_pavement/production/ao.ktx2?url'
import pavementBaseColorUrl from 'assets/textures/ground/worn_pavement/production/basecolor.ktx2?url'
import pavementNormalUrl from 'assets/textures/ground/worn_pavement/production/normal.ktx2?url'
import pavementRoughnessUrl from 'assets/textures/ground/worn_pavement/production/roughness.ktx2?url'
// 🪨 3 texture đá cho RÀO/VIỀN hồ (border, TexturedSurface triplanar) — icelandic KHÔNG có ao
import coalAoUrl from 'assets/textures/stone/coal_stone/production/ao.ktx2?url'
import coalBaseColorUrl from 'assets/textures/stone/coal_stone/production/basecolor.ktx2?url'
import coalNormalUrl from 'assets/textures/stone/coal_stone/production/normal.ktx2?url'
import coalRoughnessUrl from 'assets/textures/stone/coal_stone/production/roughness.ktx2?url'
import icelandicBaseColorUrl from 'assets/textures/stone/icelandic_jagged/production/basecolor.ktx2?url'
import icelandicNormalUrl from 'assets/textures/stone/icelandic_jagged/production/normal.ktx2?url'
import icelandicRoughnessUrl from 'assets/textures/stone/icelandic_jagged/production/roughness.ktx2?url'
import rockAoUrl from 'assets/textures/stone/rock_rough/production/ao.ktx2?url'
import rockBaseColorUrl from 'assets/textures/stone/rock_rough/production/basecolor.ktx2?url'
import rockNormalUrl from 'assets/textures/stone/rock_rough/production/normal.ktx2?url'
import rockRoughnessUrl from 'assets/textures/stone/rock_rough/production/roughness.ktx2?url'
// 🧱 Fence wall 'cinder'/'stone' = tường DỌC → TexturedSurface (triplanar). 4 map (có AO).
import cinderManifest from 'assets/textures/wall/cinder-blocks-wall/meta.json'
import cinderAoUrl from 'assets/textures/wall/cinder-blocks-wall/production/ao.ktx2?url'
import cinderBaseColorUrl from 'assets/textures/wall/cinder-blocks-wall/production/basecolor.ktx2?url'
import cinderNormalUrl from 'assets/textures/wall/cinder-blocks-wall/production/normal.ktx2?url'
import cinderRoughnessUrl from 'assets/textures/wall/cinder-blocks-wall/production/roughness.ktx2?url'
import stoneManifest from 'assets/textures/wall/stone-wall/meta.json'
import stoneAoUrl from 'assets/textures/wall/stone-wall/production/ao.ktx2?url'
import stoneBaseColorUrl from 'assets/textures/wall/stone-wall/production/basecolor.ktx2?url'
import stoneNormalUrl from 'assets/textures/wall/stone-wall/production/normal.ktx2?url'
import stoneRoughnessUrl from 'assets/textures/wall/stone-wall/production/roughness.ktx2?url'
// 🪵 Gỗ KHUNG-DƯỚI stone-pillar (understructMaterial='wood-tex') = Old Plywood — tách hẳn vân deck.
import oldplyManifest from 'assets/textures/wood/Old-piwood/meta.json'
import oldplyAoUrl from 'assets/textures/wood/Old-piwood/production/ao.ktx2?url'
import oldplyBaseColorUrl from 'assets/textures/wood/Old-piwood/production/basecolor.ktx2?url'
import oldplyNormalUrl from 'assets/textures/wood/Old-piwood/production/normal.ktx2?url'
import oldplyRoughnessUrl from 'assets/textures/wood/Old-piwood/production/roughness.ktx2?url'
// 🌳 Vỏ cây KHUNG-DƯỚI stone-pillar (understructMaterial='bark-tex') = Tree Bark — tuỳ chọn thứ 2.
import barkManifest from 'assets/textures/wood/tree_bark/meta.json'
import barkAoUrl from 'assets/textures/wood/tree_bark/production/ao.ktx2?url'
import barkBaseColorUrl from 'assets/textures/wood/tree_bark/production/basecolor.ktx2?url'
import barkNormalUrl from 'assets/textures/wood/tree_bark/production/normal.ktx2?url'
import barkRoughnessUrl from 'assets/textures/wood/tree_bark/production/roughness.ktx2?url'
// 🪵 Slab 'walnut-tex' = Walnut Veneer (sàn NGANG → PhotoGround). KHÔNG có AO map (scan thiếu).
import walnutManifest from 'assets/textures/wood/walnut-veneer/meta.json'
import walnutBaseColorUrl from 'assets/textures/wood/walnut-veneer/production/basecolor.ktx2?url'
import walnutNormalUrl from 'assets/textures/wood/walnut-veneer/production/normal.ktx2?url'
import walnutRoughnessUrl from 'assets/textures/wood/walnut-veneer/production/roughness.ktx2?url'
// 🪵 Gỗ DECK móng 'wood-tex' + slab 'planks-tex' = Wooden Planks (TexturedSurface triplanar — móng có mặt 3D).
import planksManifest from 'assets/textures/wood/Wooden_Plank/meta.json'
import planksAoUrl from 'assets/textures/wood/Wooden_Plank/production/ao.ktx2?url'
import planksBaseColorUrl from 'assets/textures/wood/Wooden_Plank/production/basecolor.ktx2?url'
import planksNormalUrl from 'assets/textures/wood/Wooden_Plank/production/normal.ktx2?url'
import planksRoughnessUrl from 'assets/textures/wood/Wooden_Plank/production/roughness.ktx2?url'
import { computeLocalBbox } from 'building-kit/build' // footprint nhà (m²) cho bảng số liệu lô
import type { GroundDrop } from 'building-kit/parts/Structure' // vùng nền tụt (lòng hồ) → cột chống đâm đáy
import { renderBuildingState } from 'building-kit/render/fromState' // renderer chung lõi (Phase 1b)
import { LEAF_MAX_RAD } from 'building-kit/wallAssembly' // 🚪 C2: góc mở max cánh — live xoay pivot
import { makeSurfaceMaterial, WallMaterialCache } from 'building-kit/wallMaterials' // material engine
import type GUI from 'lil-gui'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import { PMREMGenerator } from 'three/webgpu'
import type { GrassBlades, GrassExcludeRect } from 'threejs-modules/components/GrassBlades'
import type { InstancedBrickWall } from 'threejs-modules/components/InstancedBrickWall'
import { SkyGradient } from 'threejs-modules/components/SkyGradient' // 🌅 bầu trời gradient ngày↔đêm
import type { WaterSurface } from 'threejs-modules/components/WaterSurface'
import type { WoodSidingStrip } from 'threejs-modules/components/WoodSidingStrip'
import type { WoodSidingWall } from 'threejs-modules/components/WoodSidingWall'
import { AsphaltGround } from 'threejs-modules/shaders/ground/AsphaltGround'
import { PhotoGround, type PhotoGroundMaps } from 'threejs-modules/shaders/ground/PhotoGround' // 🌱 ground texture (+ 🪵 slab walnut: sàn ngang)
import { PhotoGroundMix } from 'threejs-modules/shaders/ground/PhotoGroundMix' // 🎨 mix nền per-zone (port bộ nền Lab — TSL)
import {
  TexturedSurface,
  type TexturedSurfaceMaps,
} from 'threejs-modules/shaders/surface/TexturedSurface' // 🧱 fence wall texture (tường dọc, triplanar) + material cache
import {
  buildGroundLayers,
  buildSiteFence,
  buildSiteGrass,
  gateWorldSpec,
  grassBuildSig,
  groundGeometry,
  pondWorldXZ,
  renderSiteState,
  siteGrassExclude,
  type SiteRenderCtx,
  type SiteRenderOpts,
  waterPolygons,
} from 'threejs-modules/site/render/fromState'
import { shapeToLocalPolygon } from 'threejs-modules/site/shapes' // 🖌 bbox zone → rect uv mask vẽ
import {
  type BorderMaterialKey,
  coverageStats,
  defaultSiteState,
  type FenceConfig,
  GROUND_PRESETS,
  type GroundLayer,
  type GroundMaterialKey,
  type GroundMixParams,
  isGroundTexKey,
  renderPuddles,
  renderWaters,
  type SiteState,
  type WaterConfig,
} from 'threejs-modules/site/state'
import { Tabs } from 'threejs-modules/ui/Tabs' // 🗂️ tab ngang drawer (🏠 Building | 🌳 Ground | 🎛️ Lab)
import { BaseWorld } from 'threejs-modules/utils/core/BaseWorld'
import { RuntimeGuard } from 'threejs-modules/utils/core/RuntimeGuard'

import type { MixPaintTarget } from './gui/ctx' // 🖌 target cọ mix: zone GroundLayer | 'base' (nền lô G0)
import { DevHud } from './gui/devhud' // perf HUD dev (fps/budget/leak) — tách monolith
import { PaintMask } from './gui/ground-paint' // 🖌 mask vẽ tay per-zone (stage 3 mix nền — dùng chung class với Lab)
import { type APGuiCtx, setupGUI, setupToolsPanel } from './gui/gui'
import { setupLabExperiments } from './gui/lab-experiments' // 🔀 switcher thí nghiệm Lab (🏛 Mái | ✨ Particles)
import { setupSitePanel } from './gui/site' // 🌳 panel sân vườn (site/lô + Garden ▸ Grass = slider cỏ 3D)
import { setupLabBench } from './gui/tweak' // 🎛️ Lab = bàn thí nghiệm: 2 khung trái + preview cột phải
import { GroundTool, type GroundToolHost } from './interaction/groundDrag' // 🟫 nắn đỉnh/tay-cầm ground free
import { type HighlightHost, HighlightOverlay } from './interaction/highlight' // flash viền phần đang chỉnh — tách monolith
import { type ManipulateHost, ManipulateTool } from './interaction/manipulate' // 🤚 Move + 🎯 Focus — tách monolith
import { MoundTool, type MoundToolHost } from './interaction/moundDrag' // ⛰️ nặn gò terrain 3D (tâm + bán kính)
import { type PaletteHost, PalettePanel } from './interaction/palette' // 🎨 khay swatch atelier — tách monolith
import { ShapeSelection } from './interaction/selection' // 🧲 Shape Group — chọn nhóm + ghost-drag
import { SunGizmo, type SunGizmoHost } from './interaction/sunGizmo' // ☀ sun = vật thể kéo trong scene
import { WaterTool, type WaterToolHost } from './interaction/waterDrag' // 💧 kéo hồ/đỉnh/viền 3D — tách monolith
import {
  CoordPicker,
  type GroundType,
  HeightGridSystem,
  HumanFigure,
  type SunOpts,
} from './scene/scene'
import {
  disposeSurfaceTextureSet,
  loadSurfaceTextureSet,
  type SurfaceTextureSpec,
} from './scene/texture-set' // 🌱 loader texture set ground theo PROTOCOL (KTX2/JPG theo đuôi file)
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

// Trừ các khoảng `gaps` khỏi đoạn [min,max] → trả các đoạn CÒN LẠI (sort theo lo, gộp chồng lấn). Dùng
// khoét lưới: 1 đường grid có thể cắt nhiều hồ → nhiều khoảng cần bỏ trên cùng 1 đường.
function keepSpans(min: number, max: number, gaps: [number, number][]): [number, number][] {
  if (gaps.length === 0) return [[min, max]]
  const sorted = [...gaps].sort((a, b) => a[0] - b[0])
  const out: [number, number][] = []
  let cur = min
  for (const [lo, hi] of sorted) {
    const a = Math.max(lo, min)
    const b = Math.min(hi, max)
    if (a > cur) out.push([cur, a])
    cur = Math.max(cur, b)
  }
  if (cur < max) out.push([cur, max])
  return out
}

// 🌱🏜️ Bảng texture GROUND (key → tile + spec URL) cho loader keyed. Thêm texture đất = thêm 1 dòng đây
// (+ import map + GroundMaterialKey ở site/state). PhotoGround (UV world-XZ, lát theo tileSizeMeters).
const GROUND_TEX_SPEC: Partial<
  Record<GroundMaterialKey, { tile: number; spec: SurfaceTextureSpec }>
> = {
  'grass-tex': {
    tile: grassManifest.tileSizeMeters,
    spec: {
      baseColor: { url: grassBaseColorUrl, colorSpace: 'srgb' },
      normal: { url: grassNormalUrl, colorSpace: 'linear' },
      roughness: { url: grassRoughnessUrl, colorSpace: 'linear' },
      ao: { url: grassAoUrl, colorSpace: 'linear' },
    },
  },
  'rippled-sand': {
    tile: sandManifest.tileSizeMeters,
    spec: {
      baseColor: { url: sandBaseColorUrl, colorSpace: 'srgb' },
      normal: { url: sandNormalUrl, colorSpace: 'linear' },
      roughness: { url: sandRoughnessUrl, colorSpace: 'linear' },
      ao: { url: sandAoUrl, colorSpace: 'linear' },
    },
  },
  'construction-gravel': {
    tile: cgravelManifest.tileSizeMeters,
    spec: {
      baseColor: { url: cgravelBaseColorUrl, colorSpace: 'srgb' },
      normal: { url: cgravelNormalUrl, colorSpace: 'linear' },
      roughness: { url: cgravelRoughnessUrl, colorSpace: 'linear' },
      ao: { url: cgravelAoUrl, colorSpace: 'linear' },
    },
  },
  'beach-gravel': {
    tile: bgravelManifest.tileSizeMeters,
    spec: {
      baseColor: { url: bgravelBaseColorUrl, colorSpace: 'srgb' },
      normal: { url: bgravelNormalUrl, colorSpace: 'linear' },
      roughness: { url: bgravelRoughnessUrl, colorSpace: 'linear' },
      ao: { url: bgravelAoUrl, colorSpace: 'linear' },
    },
  },
  'rough-asphalt': {
    tile: asphaltManifest.tileSizeMeters,
    spec: {
      baseColor: { url: asphaltBaseColorUrl, colorSpace: 'srgb' },
      normal: { url: asphaltNormalUrl, colorSpace: 'linear' },
      roughness: { url: asphaltRoughnessUrl, colorSpace: 'linear' },
      ao: { url: asphaltAoUrl, colorSpace: 'linear' },
    },
  },
  'worn-pavement': {
    tile: pavementManifest.tileSizeMeters,
    spec: {
      baseColor: { url: pavementBaseColorUrl, colorSpace: 'srgb' },
      normal: { url: pavementNormalUrl, colorSpace: 'linear' },
      roughness: { url: pavementRoughnessUrl, colorSpace: 'linear' },
      ao: { url: pavementAoUrl, colorSpace: 'linear' },
    },
  },
  'roman-stone-floor': {
    tile: romanManifest.tileSizeMeters,
    spec: {
      baseColor: { url: romanBaseColorUrl, colorSpace: 'srgb' },
      normal: { url: romanNormalUrl, colorSpace: 'linear' },
      roughness: { url: romanRoughnessUrl, colorSpace: 'linear' },
      ao: { url: romanAoUrl, colorSpace: 'linear' },
    },
  },
  'artificial-turf': {
    tile: turfManifest.tileSizeMeters,
    spec: {
      baseColor: { url: turfBaseColorUrl, colorSpace: 'srgb' },
      normal: { url: turfNormalUrl, colorSpace: 'linear' },
      roughness: { url: turfRoughnessUrl, colorSpace: 'linear' },
      ao: { url: turfAoUrl, colorSpace: 'linear' },
    },
  },
  'grass-o': {
    tile: grassoManifest.tileSizeMeters,
    spec: {
      baseColor: { url: grassoBaseColorUrl, colorSpace: 'srgb' },
      normal: { url: grassoNormalUrl, colorSpace: 'linear' },
      roughness: { url: grassoRoughnessUrl, colorSpace: 'linear' },
      ao: { url: grassoAoUrl, colorSpace: 'linear' },
    },
  },
  'thai-beach-sand-2k': {
    tile: sand2kManifest.tileSizeMeters,
    spec: {
      baseColor: { url: sand2kBaseColorUrl, colorSpace: 'srgb' },
      normal: { url: sand2kNormalUrl, colorSpace: 'linear' },
      roughness: { url: sand2kRoughnessUrl, colorSpace: 'linear' },
      ao: { url: sand2kAoUrl, colorSpace: 'linear' },
    },
  },
  'thai-beach-sand-4k': {
    tile: sand4kManifest.tileSizeMeters,
    spec: {
      baseColor: { url: sand4kBaseColorUrl, colorSpace: 'srgb' },
      normal: { url: sand4kNormalUrl, colorSpace: 'linear' },
      roughness: { url: sand4kRoughnessUrl, colorSpace: 'linear' },
      ao: { url: sand4kAoUrl, colorSpace: 'linear' },
    },
  },
  cobblestone: {
    tile: cobbleManifest.tileSizeMeters,
    spec: {
      baseColor: { url: cobbleBaseColorUrl, colorSpace: 'srgb' },
      normal: { url: cobbleNormalUrl, colorSpace: 'linear' },
      roughness: { url: cobbleRoughnessUrl, colorSpace: 'linear' },
      ao: { url: cobbleAoUrl, colorSpace: 'linear' },
    },
  },
  // 🧱 2 bộ TƯỜNG (wall/) nhóm chung kho nền (NgQuan 2026-06-11 — mix fence cần cinder/stone): cùng URL với
  // _ensureFenceTex (trình duyệt cache HTTP — không tải đôi; 2 bản GPU texture khi dùng cả 2 đường, chấp nhận).
  'cinder-blocks-wall': {
    tile: cinderManifest.tileSizeMeters,
    spec: {
      baseColor: { url: cinderBaseColorUrl, colorSpace: 'srgb' },
      normal: { url: cinderNormalUrl, colorSpace: 'linear' },
      roughness: { url: cinderRoughnessUrl, colorSpace: 'linear' },
      ao: { url: cinderAoUrl, colorSpace: 'linear' },
    },
  },
  'stone-wall': {
    tile: stoneManifest.tileSizeMeters,
    spec: {
      baseColor: { url: stoneBaseColorUrl, colorSpace: 'srgb' },
      normal: { url: stoneNormalUrl, colorSpace: 'linear' },
      roughness: { url: stoneRoughnessUrl, colorSpace: 'linear' },
      ao: { url: stoneAoUrl, colorSpace: 'linear' },
    },
  },
}

// 🪨 Texture đá cho RÀO/VIỀN hồ (TexturedSurface triplanar). tile 0.5m (đá nhỏ ~0.35m → đủ chi tiết đá/viên).
// icelandic KHÔNG có ao map. Key = BorderMaterialKey trừ 'none'.
type BorderTexKey = Exclude<BorderMaterialKey, 'none'>
const BORDER_TILE = 0.5
const BORDER_TEX_SPEC: Record<BorderTexKey, SurfaceTextureSpec> = {
  'icelandic-jagged': {
    baseColor: { url: icelandicBaseColorUrl, colorSpace: 'srgb' },
    normal: { url: icelandicNormalUrl, colorSpace: 'linear' },
    roughness: { url: icelandicRoughnessUrl, colorSpace: 'linear' },
  },
  'coal-stone': {
    baseColor: { url: coalBaseColorUrl, colorSpace: 'srgb' },
    normal: { url: coalNormalUrl, colorSpace: 'linear' },
    roughness: { url: coalRoughnessUrl, colorSpace: 'linear' },
    ao: { url: coalAoUrl, colorSpace: 'linear' },
  },
  'rock-rough': {
    baseColor: { url: rockBaseColorUrl, colorSpace: 'srgb' },
    normal: { url: rockNormalUrl, colorSpace: 'linear' },
    roughness: { url: rockRoughnessUrl, colorSpace: 'linear' },
    ao: { url: rockAoUrl, colorSpace: 'linear' },
  },
}

// ── ArchPlanLab ────────────────────────────────────────────────────────────────

// 💧 Layer RIÊNG cho mặt nước (reflector). virtual-camera của reflector (layer 0 mặc định) KHÔNG render layer này
// → 2+ hồ không render-lẫn-nhau → hết bug three `_inReflector` (re-entrancy nested-render làm hồ thứ 2 đơ gương).
// Camera chính + raycaster pick/drag BẬT thêm layer này (cộng dồn, vẫn hit layer 0) để vẫn thấy + click/kéo hồ.
const WATER_REFLECT_LAYER = 1

// 3 tool nặn/kéo SITE (💧 water / 🟫 ground-free / ⛰️ mound) chia sẻ tập thao tác đồng nhất (trừ tryStart riêng
// tên: tryStartDrag/tryStartVertex/tryStartHandle). Gom 1 interface để dispatch chung qua loop (dragMove/endDrag/
// cancelDrag/rebuildHandles/dispose ở 1 chỗ) → né lặp + giữ complexity ≤10 khi đã có ≥3 tool (Rule-of-3).
interface SiteDragTool {
  isDragging(): boolean
  dragMove(e: PointerEvent): void
  endDrag(): void
  cancelDrag(): void
  rebuildHandles(): void
  dispose(): void
}

export class ArchPlanLab extends BaseWorld {
  private state: BuildingState = defaultBuildingState()
  private gui: GUI | null = null
  private leftTools: HTMLElement | null = null // wrapper xếp scanner + sun panel thành cột
  private drawer: HTMLElement | null = null // 🗄️ drawer phải (shell bền qua rebuild): nhà + Sân vườn + Lab (bench/preview)
  private drawerBody: HTMLElement | null = null // cột cuộn trong drawer — gui + panels dựng vào đây
  private drawerTabs: Tabs | null = null // tab ngang đầu drawer (🏠 Building | 🌳 Ground | 🎛️ Lab)
  private _siteDispose: (() => void) | null = null // teardown tab CON panel Ground (outer + Garden domain + Water domain)
  private _siteNavigate: ((cfg: WaterConfig) => boolean) | null = null // click hồ 3D → nhảy GUI tới tab hồ đó
  private _siteNavigateFence: ((idx: number) => void) | null = null // 🧱 click rào 3D → nhảy GUI tới lớp rào idx
  private _siteNavigateLayer: ((idx: number) => void) | null = null // 🟫 click tầng ground 3D → nhảy GUI Ground▸Gn
  private _activeCutIdx = -1 // 🟫 layer cut đang active (focus tab / click / kéo) → mảng cut HIỆN XÁM; -1 = ẩn hết
  private _activeLayerIdx = -1 // 🟫 layer ground đang focus (add HOẶC cut) → GroundTool hiện tay-cầm nắn (free); -1 = không
  private drawerPanels: HTMLElement[] = [] // panel non-gui trong drawer (Ground + Lab) — gỡ khi teardown
  private _drawerTab = 0 // tab drawer đang mở — nhớ qua _rebuildGUI
  private lDrawer: HTMLElement | null = null // drawer TRÁI: bảng Tools (Surface+tọa độ) — ẩn mặc định
  private lDrawerBody: HTMLElement | null = null
  private paletteWrap: HTMLElement | null = null // 🎨 Palette = tool TỰ DO float (ngoài drawer), kéo được
  private moveFloat: HTMLButtonElement | null = null // 🤚 Move = nút float góc trái-dưới (cạnh thanh sáng sun)
  private controls: OrbitControls | null = null

  // Đèn mặt trời + tham số (điều khiển qua panel ☀ Sun). Default ≈ vị trí cũ (10,18,10).
  private sun: THREE.DirectionalLight | null = null
  private sky: SkyGradient | null = null // 🌅 bầu trời gradient ngày↔đêm (theo độ-cao sun)
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
  // 🚀 Split-drag: shape ĐANG KÉO dựng vào group riêng (translate mỗi frame, 0 rebuild); shape khác static
  // trong buildingGroup. Buông tay = full rebuild merge. Geos/mats riêng (dispose ở _clearDragGroup).
  private _dragGroup: THREE.Group | null = null
  private _dragGeos: THREE.BufferGeometry[] = []
  private _dragMats: THREE.Material[] = []
  private _dragInstId: string | null = null // shape đang kéo (split) — rebuild riêng khi kéo element (cột/cửa/cầu thang)
  // Shape đang kéo có GIỮ cột móng không: true = kéo NGUYÊN nhà (translate, 0 rebuild → cột hiện, định vị trên hồ);
  // false = kéo ELEMENT (rebuild/frame → ép concrete cho rẻ). Set true ở begin, _rebuildDragShapeLive hạ false.
  private _dragShowFound = true
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
  private shapeSel: ShapeSelection | null = null // 🧲 nhóm shape ad-hoc (Shift+click Move mode)
  private waterTool: WaterTool | null = null // 💧 kéo hồ/đỉnh/viền 3D (interaction/waterDrag.ts); lab giữ _siteWaters/_activeWater
  private groundTool: GroundTool | null = null // 🟫 nắn đỉnh/tay-cầm ground free (interaction/groundDrag.ts); lab giữ _activeLayerIdx
  private moundTool: MoundTool | null = null // ⛰️ nặn gò terrain 3D (interaction/moundDrag.ts); state = site.terrain.mounds[]
  private moveMode = false
  private _hiddenFloors = new Set<string>() // 🙈 floor.id ẩn (xây tầng dưới khỏi bị che) — transient, không persist
  private _syncMoveToggle: ((on: boolean) => void) | null = null // sync nút 🤚 trong gui Tools
  // 💧 Phiên kéo hồ + handle đỉnh + viền-định-vị → interaction/waterDrag.ts (WaterTool). Lab chỉ giữ
  // _siteWaters (render zip) + _activeWater (pool đang chọn) — tool đọc/ghi qua WaterToolHost.
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
  // 🌿 Cỏ sống trong GROUP RIÊNG (KHÔNG trong siteGroup) → KHÔNG bị _clearSite xoá mỗi rebuild. Chỉ rải lại
  // khi chữ ký structural đổi (_grassSig) → sửa nhà/màu KHÔNG re-scatter 24000 lá. '' = chưa dựng lần nào.
  private readonly _grassGroup = new THREE.Group()
  private _grassSig = '' // chữ ký FULL (param cỏ + lô + exclude) — khác = dựng lại (lúc commit)
  private _grassParamSig = '' // chữ ký KHÔNG exclude — đổi = dựng lại NGAY cả khi đang kéo (kéo slider cỏ)
  // 🧱 RÀO sống trong GROUP RIÊNG (như cỏ) → KHÔNG bị _clearSite xoá. Dirty-check _fenceSig: kéo slider rào/
  // cổng chỉ dựng lại RÀO (rẻ), KHÔNG đụng nước-RTT (trị tụt fps khi kéo cổng). '' = chưa dựng.
  private readonly _fenceGroup = new THREE.Group()
  private _fenceGeos: THREE.BufferGeometry[] = []
  private _fenceMats: THREE.Material[] = []
  private _fenceShaders: { dispose(): void }[] = []
  private _fenceSig = ''
  // 🚪 Pick-box CỔNG vô hình (group riêng → KHÔNG lẫn raycast _tryClickFence). Move mode kéo box → trượt cổng
  // dọc cạnh (ghi gatePos). Dựng lại trong _syncFence (mỗi fence có gate). _gateDrag = phiên kéo đang chạy.
  private readonly _gatePickGroup = new THREE.Group()
  private _gatePickGeos: THREE.BufferGeometry[] = []
  private _gateDrag: { fenceIdx: number; axis: 'x' | 'z'; plane: THREE.Plane } | null = null
  // 🟫 Phiên kéo 1 TẦNG ground (G1+) bằng Move tool: idx + mesh đang dời + offset gốc + điểm neo (mặt-phẳng
  // ngang). Kéo = dời mesh.position (0 rebuild); buông = gập vào offsetX/Z + _applySite. G0 base KHÔNG kéo.
  private _layerDrag: {
    idx: number
    mesh: THREE.Object3D // 🪨🧱 surface/path = Mesh; paving/wall = Group (CurvedBrickWall/BrickPaving) — chỉ dùng .position
    startOffX: number
    startOffZ: number
    startPt: THREE.Vector3
    startMeshPos: THREE.Vector3 // 🪨 vị trí mesh GỐC trước kéo — surface zone=(0,0,0) geo-world-baked; path=(offX,baseY,offZ)
  } | null = null
  private _liveRebuild = false // true trong rAF live-drag (kéo nhà/hồ/slider) → hoãn rải-lại-cỏ vì exclude
  // Chữ ký SITE (nền/nước/rào, BỎ grass3d — cỏ quản riêng). Kéo NHÀ đổi `state` chứ KHÔNG đổi `site` →
  // sig giữ nguyên → KHÔNG dựng lại reflector RTT mỗi frame (trị leak/tụt-fps lúc kéo nhà). '' = chưa dựng.
  private _siteSig = ''
  // 🌱🏜️ Ground texture (PhotoGround) — load ASYNC 1 lần MỖI KEY (grass-tex/sand/gravel/asphalt độc lập),
  // cache lab-lifetime. Texture do LAB sở hữu (PhotoGround.dispose không đụng) → disposeSurfaceTextureSet ở onDispose.
  private _groundTex: Partial<Record<GroundMaterialKey, PhotoGroundMaps>> = {}
  private _groundTexLoading: Partial<Record<GroundMaterialKey, boolean>> = {}
  // 🌱 Material PhotoGround CACHE 1 lần MỖI KEY (sống lab-lifetime) → bơm ctx.groundMatByKey: nhiều ground
  // (base + layer) cùng key DÙNG CHUNG → KHÔNG recompile NodeMaterial mỗi rebuild. Lab sở hữu → dispose onDispose.
  private _groundMat: Partial<Record<GroundMaterialKey, PhotoGround>> = {}

  // 🎨 PhotoGroundMix CACHE — key = chính OBJECT GroundMixParams (stage 4: target nhân ra zone/'base'/hồ
  // floor+wall/fence → wrapper target không stable, nhưng params object SỐNG TẠI CHỖ trong state qua rebuild).
  // sig = CHỈ keys texture (stage 3: bias/seed/paint-rect = uniform live) — đổi sig = dựng lại material (pm
  // GIỮ). pm = PaintMask 128² mask vẽ tay — sống cùng entry, dispose khi params rời state (prune)/lab dispose.
  private readonly _zoneMix = new Map<
    GroundMixParams,
    { gmix: PhotoGroundMix; sig: string; pm: PaintMask }
  >()
  // 🖌 Mode VẼ MASK mix (stage 3): target (zone | 'base') + slot đang vẽ (null = tắt); _mixPainting = đang giữ
  // chuột kéo nét. Bật = orbit khóa (như paintMode SPIKE); pointer raycast mesh target → uv bbox → pm.stamp.
  // Buông = persist base64.
  private _mixPaint: { target: MixPaintTarget; slot: number } | null = null
  private _mixPainting = false
  private readonly _mixBrush = { size: 0.6, erase: false } // cọ: bán kính m world + chế độ tẩy (UI board đẩy vào)
  private _syncMixPaint: (() => void) | null = null // UI đăng ký — bỏ highlight 🖌 khi mode bị tắt từ ngoài
  // 🪨 Texture đá RÀO/VIỀN hồ: maps + TexturedSurface (triplanar) CACHE 1 lần/key (lab-lifetime) → bơm
  // ctx.borderMatByKey. Lab sở hữu maps + surf → dispose onDispose. Load ASYNC khi hồ dùng borderMaterial≠none.
  private _borderTex: Partial<
    Record<BorderTexKey, { maps: TexturedSurfaceMaps; surf: TexturedSurface }>
  > = {}
  private _borderTexLoading: Partial<Record<BorderTexKey, boolean>> = {}
  // 🪵 Slab walnut: texture-maps + PhotoGround (material CACHE 1 lần → KHÔNG recompile mỗi build/frame kéo;
  // slab dựng lại mỗi edit). Lab sở hữu cả maps lẫn PhotoGround → dispose ở onDispose. Bơm ctx.slabTexMat.
  private _slabTexMaps: PhotoGroundMaps | null = null
  private _slabTex: PhotoGround | null = null
  private _slabTexLoading = false
  // 🏖️ Nền-editor 'sand' = rippled_sand (PhotoGround photo, world-XZ UV) áp lên groundMesh 80×80. Load 1 lần
  // ASYNC, Lab sở hữu maps + PhotoGround → dispose onDispose. Chờ load = fallback màu cát (makeSurfaceMaterial).
  private _editorSandMaps: PhotoGroundMaps | null = null
  private _editorSandTex: PhotoGround | null = null
  private _editorSandLoading = false
  // 🪵 Gỗ DECK móng 'wood-tex' + slab 'planks-tex' = Wooden Planks (TexturedSurface triplanar — móng có mặt 3D
  // trụ/xà/chống; sàn dùng chung). Cache 1 lần. Lab sở hữu maps + TexturedSurface → dispose. Bơm ctx.foundWoodMat.
  private _foundWoodMaps: TexturedSurfaceMaps | null = null
  private _foundWoodTex: TexturedSurface | null = null
  private _foundWoodLoading = false
  // 🪵 Gỗ KHUNG-DƯỚI stone-pillar (understructMaterial='wood-tex') = Old Plywood — texture RIÊNG deck (vân khác).
  // Cache 1 lần. Lab sở hữu maps + TexturedSurface → dispose ở onDispose. Bơm ctx.underWoodMat.
  private _underWoodMaps: TexturedSurfaceMaps | null = null
  private _underWoodTex: TexturedSurface | null = null
  private _underWoodLoading = false
  // 🌳 Vỏ cây KHUNG-DƯỚI stone-pillar (understructMaterial='bark-tex') = Tree Bark — tuỳ chọn thứ 2. Cache 1 lần.
  // Lab sở hữu maps + TexturedSurface → dispose ở onDispose. Bơm ctx.underBarkMat.
  private _underBarkMaps: TexturedSurfaceMaps | null = null
  private _underBarkTex: TexturedSurface | null = null
  private _underBarkLoading = false
  // 🧱 Fence wall: maps + TexturedSurface CACHE 1 lần MỖI KIND (cinder/stone độc lập — đa-lớp rào có thể trộn
  // 2 texture khác nhau, mỗi kind cache riêng → KHÔNG thrash recompile). Material cache (KHÔNG tạo mới mỗi rebuild
  // → KHÔNG recompile shader khi kéo cổng = trị tụt fps). Bơm opts.fenceWallMat per-fence (_syncFence). Lab sở hữu.
  private _fenceTex: Partial<
    Record<'cinder' | 'stone', { maps: TexturedSurfaceMaps; surf: TexturedSurface }>
  > = {}
  private _fenceTexLoading: Partial<Record<'cinder' | 'stone', boolean>> = {}
  // ⏳ Badge "đang tải vật liệu" — hiện khi BẤT KỲ texture set đang load ASYNC ("câu giờ chờ load": user thấy
  // ĐANG chạy chứ không tưởng đơ; texture KTX2 ~vài MB tải khi áp vật liệu mới). Tự-tạo lazy + CSS inline (KHÔNG
  // đụng archplan-lab.css của Factory). Drive từ onUpdate, _texLoadShown = change-detect → chỉ chạm DOM khi đổi.
  private _texLoadBadge: HTMLDivElement | null = null
  private _texLoadShown = false
  // 💧 Hồ ĐANG SỐNG (đa-instance): cfg↔surf zip theo renderWaters(site). _activeWater = pool của tab đang
  // chọn → 3D drag/handle/tune nhắm nó (kéo thân hồ khác cũng set lại active). null khi chưa có pool nào.
  private _siteWaters: { cfg: WaterConfig; surf: WaterSurface }[] = []
  private _siteGroundMesh: THREE.Mesh | null = null // 🏔️ ref mesh nền base → LIVE-rebuild geometry-only (terrain drag)
  private _activeWater: WaterConfig | null = null
  private labExp: { dispose: () => void } | null = null // 🔀 thí nghiệm Lab đang active (Mái / Particles)
  // 🧪 Lab = PHẦN RIÊNG (float persistent, NGOÀI drawer) — bàn thí nghiệm vật thể MỚI trước khi đưa vào GUI
  // chung; Factory phát triển chung. Tạo 1 LẦN (không churn theo _rebuildGUI) → preview KHÔNG dispose/tạo-lại mỗi rebuild.
  private labFloat: HTMLElement | null = null
  private labToggle: HTMLButtonElement | null = null
  private _refreshSiteReadout: (() => void) | null = null

  private groundGeo: THREE.BufferGeometry | null = null // nền backdrop editor — Plane, hoặc Shape-có-lỗ khi có hồ
  private groundMat: THREE.MeshToonMaterial | null = null // nền tối mặc định ('none')
  private groundMesh: THREE.Mesh | null = null // để swap material theo groundType
  private hemiLight: THREE.HemisphereLight | null = null // groundColor = màu bounce theo nền
  private groundShader: { dispose(): void } | null = null // shader nền procedural (grass/cement…)
  private groundType: GroundType = 'none'
  private envRT: THREE.RenderTarget | null = null // RT của PMREM(RoomEnvironment) IBL — dispose cả wrapper (gồm texture)
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
    if (this._isTypingTarget(e)) return
    if (e.code === 'Backquote' && !e.repeat) this.devHud?.toggle() // ` → bật/tắt HUD perf
    // F = bật/tắt Move tool 🤚 (_setMoveMode tự đồng bộ nút float góc trái). Guard tách ra _isPlainF.
    // (Z/C để trống → rơi vào _keysDown → _applyRotate xoay camera trái/phải khi GIỮ.)
    if (this._isPlainF(e)) {
      e.preventDefault()
      this._setMoveMode(!this.moveMode)
      return
    }
    if (this._escClearSel(e)) return // 🧲 Esc (Move mode) = xả nhóm shape — click-trống KHÔNG xả
    // X trơn = thả/thu MENU 🎨 Palette (lưới swatch), KHÔNG phải popover tìm-kiếm-màu (né Ctrl/Meta/Alt+X).
    if (this._isPlainX(e)) {
      e.preventDefault()
      this.palette?.togglePanel()
      return
    }
    // R trơn = bật/tắt 🧪 Lab (né Ctrl+R / Cmd+R reload trang). Guard tách ra _isPlainR cho gọn complexity.
    if (this._isPlainR(e)) {
      e.preventDefault()
      this._toggleLab()
      return
    }
    this._keysDown.add(e.code)
  }
  // Gõ trong input/textarea → phím tắt nhường (guard tách riêng cho gọn complexity _onKeyDown).
  private _isTypingTarget(e: KeyboardEvent): boolean {
    return e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
  }
  // 🧲 Esc trong Move mode + ĐANG có nhóm chọn → xả nhóm (true = đã xử). Guard kiểu _isPlainF.
  private _escClearSel(e: KeyboardEvent): boolean {
    if (e.code !== 'Escape' || !this.moveMode) return false
    const sel = this.shapeSel
    if (!sel || sel.size() === 0) return false
    sel.clear()
    return true
  }
  // F/X/R trơn (không Ctrl/Meta/Alt, không auto-repeat) = phím tắt. Né tổ hợp Ctrl/Cmd (vd Ctrl+F tìm, Ctrl+X cut).
  private _isPlainF(e: KeyboardEvent): boolean {
    return e.code === 'KeyF' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey
  }
  private _isPlainX(e: KeyboardEvent): boolean {
    return e.code === 'KeyX' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey
  }
  // R trơn = phím tắt 🧪 Lab. Né Ctrl+R/Cmd+R (reload trang), Alt+R.
  private _isPlainR(e: KeyboardEvent): boolean {
    return e.code === 'KeyR' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey
  }
  private readonly _onKeyUp = (e: KeyboardEvent): void => {
    this._keysDown.delete(e.code)
  }

  // Coordinate picker — click/rê chuột trái trên XZ ra tọa độ; chuột phải = thoát.
  private coordPicker: CoordPicker | null = null
  private pickMode = false
  private picking = false
  private _syncPickCheckbox: ((on: boolean) => void) | null = null
  // Click vào 3D → BỎ focus khỏi input GUI (ô số slider…). Canvas không focusable nên không tự blur →
  // input giữ focus → keydown Z/X bị `e.target instanceof HTMLInputElement` (trong _onKeyDown) chặn = mất phím tắt.
  private _blurActiveInput(): void {
    const ae = document.activeElement
    if (ae instanceof HTMLInputElement || ae instanceof HTMLTextAreaElement) ae.blur()
  }
  private readonly _onPointerDown = (e: PointerEvent): void => {
    this._blurActiveInput() // bấm 3D → bỏ focus input GUI → phím tắt Z/X về window
    if (e.button !== 0) return // chỉ chuột trái
    this._downPos = { x: e.clientX, y: e.clientY } // để _onPointerUp phân biệt click vs drag/orbit
    if (this.sunGizmo?.tryStartDrag(e)) return // ☀ nhấn trúng quả sun → kéo (ưu tiên cao nhất, mọi mode)
    if (this._mixPaint) {
      this._mixPainting = true // 🖌 vẽ mask mix: giữ chuột kéo nét trên zone (orbit đã khóa khi bật mode)
      this.canvas.setPointerCapture(e.pointerId)
      this._mixStampAt(e)
      return
    }
    if (this.paintMode) {
      this._paintAt(e) // SPIKE brush: click → sơn tường
      return
    }
    if (this.moveMode) {
      this._pointerDownMove(e)
      return
    }
    if (!this.pickMode) return
    this.picking = true
    this._pickAt(e)
  }

  // 3 tool site đang sống (bỏ null trước onInit / sau dispose). Derived → luôn khớp field hiện tại; thứ tự =
  // ưu tiên dispatch (💧 hồ → 🟫 ground-free → ⛰️ gò).
  private _siteDragTools(): SiteDragTool[] {
    // Narrow về union CLASS (không phải SiteDragTool): class có private field → predicate `t is SiteDragTool`
    // sai chiều (interface không gán ngược được). Mỗi class vẫn gán-được vào SiteDragTool (khớp public method).
    return [this.waterTool, this.groundTool, this.moundTool].filter(
      (t): t is WaterTool | GroundTool | MoundTool => t !== null
    )
  }

  // Nhấn Move thử bắt drag 3 tool site theo thứ tự ưu tiên (tryStart tên riêng nên không loop được) → true nếu
  // tool nào bắt (dừng chuỗi, nhường nó). Ưu tiên TRƯỚC cổng/building (handle nhỏ, dễ trượt).
  private _tryStartSiteTool(e: PointerEvent): boolean {
    return (
      !!this.waterTool?.tryStartDrag(e) ||
      !!this.groundTool?.tryStartVertex(e) ||
      !!this.moundTool?.tryStartHandle(e)
    )
  }

  // Tool site nào đang kéo/nặn → dispatch dragMove; true nếu có (dừng chuỗi). Thứ tự = _siteDragTools.
  private _dragSiteTool(e: PointerEvent): boolean {
    for (const t of this._siteDragTools())
      if (t.isDragging()) {
        t.dragMove(e)
        return true
      }
    return false
  }

  // Move mode nhấn xuống: ưu tiên tool site (hồ/ground-free/gò) → cổng → element building. Giữ complexity ≤10.
  private _pointerDownMove(e: PointerEvent): void {
    if (this._shiftToggleSelect(e)) return // 🧲 Shift+click = chọn/bỏ khối vào nhóm, không kéo gì khác
    if (this._tryStartSiteTool(e)) return // 💧🟫⛰️ trúng tool site → tool lo
    if (this._tryStartGateDrag(e)) return // 🚪 trúng cổng → trượt dọc cạnh rào
    this.manipulate?.dragStart(e) // Move tool: nhấn-giữ element building → kéo (focus GUI ngay khi nhấn)
    if (this.manipulate?.isDragging()) return // trúng building → manipulate lo
    this._tryStartLayerDrag(e) // 🟫 không trúng building → thử kéo TẦNG ground (G1+)
  }
  // 🧲 Shift+click (Move mode) = toggle khối vào/khỏi nhóm — NUỐT event kể cả trượt (giữ Shift là "đang
  // chọn", không để rơi xuống kéo khác gây bất ngờ). Pick chung raycast layer với Move (pickInstId).
  private _shiftToggleSelect(e: PointerEvent): boolean {
    if (!e.shiftKey) return false
    const id = this.manipulate?.pickInstId(e) ?? null
    if (id) this.shapeSel?.toggle(id)
    return true
  }

  private readonly _onPointerMove = (e: PointerEvent): void => {
    if (this.sunGizmo?.isDragging()) {
      this.sunGizmo.drag(e) // ☀ đang kéo sun → đổi hướng nắng theo vòm
      return
    }
    if (this._mixPainting) {
      this._mixStampAt(e) // 🖌 đang kéo nét cọ mask mix
      return
    }
    if (this.moveMode) {
      this._moveModeMove(e) // 💧 hồ hoặc element building (pick off khi moveMode → an toàn return)
      return
    }
    if (this.pickMode && this.picking) this._pickAt(e)
  }

  // Move mode đang kéo: ưu tiên hồ (waterTool) → cổng (_gateDrag) → element building (manipulate).
  private _moveModeMove(e: PointerEvent): void {
    if (this._dragSiteTool(e)) return // 💧🟫⛰️ tool site (hồ/ground-free/gò) đang kéo/nặn → dispatch
    if (this._gateDrag) this._gateDragMove(e)
    else if (this.manipulate?.isDragging()) this.manipulate.dragMove(e)
    else if (this._layerDrag) this._layerDragMove(e) // 🟫 kéo tầng ground
  }

  // 🪨🧱 Resolve object raycast TRÚNG → object mang userData.groundLayerIdx. Surface/path = chính nó (idx trên
  // mesh). Paving (BrickPaving) & wall (CurvedBrickWall) = getMesh() trả GROUP (idx trên Group, raycast trúng
  // viên con KHÔNG có idx) → walk-up tới ancestor mang idx (dừng ở siteGroup). null = hit không thuộc tầng ground.
  private _layerObjOf(o: THREE.Object3D): THREE.Object3D | null {
    let n: THREE.Object3D | null = o
    while (n && n !== this.siteGroup) {
      if (typeof n.userData.groundLayerIdx === 'number') return n
      n = n.parent
    }
    return null
  }

  // 🪨🧱 Hit tầng-ground GẦN NHẤT trong danh sách (resolve Group paving/wall) → {obj mang idx, hit}. null nếu trượt.
  private _pickLayer(
    hits: THREE.Intersection[]
  ): { obj: THREE.Object3D; hit: THREE.Intersection } | null {
    for (const h of hits) {
      const obj = this._layerObjOf(h.object)
      if (obj) return { obj, hit: h }
    }
    return null
  }

  // 🟫 Move trúng 1 TẦNG ground (G1+, mesh có userData.groundLayerIdx) → bắt đầu kéo dời XZ. G0 base KHÔNG có
  // tag → bỏ qua (cố định). Trả false (không trúng tầng nào). Lưu offset gốc + điểm neo cho _layerDragMove.
  private _tryStartLayerDrag(e: PointerEvent): boolean {
    if (!this.site.show || !this.site.groundLayers?.length) return false
    this._ray.setFromCamera(this._ndc(e), this.camera)
    const hits = this._ray.intersectObjects(this.siteGroup.children, true)
    const picked = this._pickLayer(hits) // 🪨🧱 resolve Group paving/wall → object mang idx
    if (!picked) return false
    const idx = picked.obj.userData.groundLayerIdx as number
    const layer = this.site.groundLayers[idx]
    if (!layer) return false
    this._setActiveCut(idx) // 🟫 kéo cut → hiện mảng xám lúc Move (add → ẩn cut); raycaster pick được dù đang ẩn
    this.canvas.setPointerCapture(e.pointerId)
    this._layerDrag = {
      idx,
      mesh: picked.obj,
      startOffX: layer.offsetX,
      startOffZ: layer.offsetZ,
      startPt: picked.hit.point.clone(),
      startMeshPos: picked.obj.position.clone(), // 🪨 path/paving/wall giữ offset+baseY ở position (Group = world transform)
    }
    return true
  }

  // 🟫 Kéo tầng ground LIVE: CHỈ dời mesh.position theo Δ chiếu mặt-phẳng-ngang @điểm-neo — KHÔNG rebuild site
  // (né reflector RTT + recompile NodeMaterial mỗi frame; PERFORMANCE.md). Commit (rebuild) để _commitLayerDrag.
  private _layerDragMove(e: PointerEvent): void {
    const d = this._layerDrag
    if (!d) return
    this._ray.setFromCamera(this._ndc(e), this.camera)
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -d.startPt.y)
    const pt = new THREE.Vector3()
    if (!this._ray.ray.intersectPlane(plane, pt)) return
    // 🪨 vị-trí-gốc + Δ chiếu mặt-phẳng (giữ Y mesh): surface=(0,0,0)+Δ như cũ; path=(offX,baseY,offZ)+Δ (giữ độ cao)
    d.mesh.position.set(
      d.startMeshPos.x + (pt.x - d.startPt.x),
      d.startMeshPos.y,
      d.startMeshPos.z + (pt.z - d.startPt.z)
    ) // 0 rebuild — chỉ transform
  }

  // 🟫 Buông: gập Δ mesh.position vào offsetX/Z state → _applySite(true) rebuild site 1 LẦN (bake offset mới) +
  // autosave. mesh.position về 0 sau rebuild. Site (không undo) → chỉ autosave như cổng/hồ.
  private _commitLayerDrag(): void {
    const d = this._layerDrag
    this._layerDrag = null
    if (!d) return
    const layer = this.site.groundLayers?.[d.idx]
    if (layer) {
      // Δ = vị-trí-hiện − vị-trí-gốc (surface startMeshPos=0 → như cũ; path trừ offset gốc → khỏi cộng đôi)
      layer.offsetX = Math.round(d.startOffX + (d.mesh.position.x - d.startMeshPos.x) * 1000)
      layer.offsetZ = Math.round(d.startOffZ + (d.mesh.position.z - d.startMeshPos.z) * 1000)
    }
    this._applySite(true)
  }

  // Buông cổng: commit (nuốt rAF live → _syncFence stone thật + gate box trở lại + autosave). Tách khỏi
  // _onPointerUp (giữ complexity ≤10). Cổng KHÔNG vào undo (site G0) — chỉ autosave.
  private _commitGateDrag(): void {
    this._gateDrag = null
    if (this._siteRaf) {
      cancelAnimationFrame(this._siteRaf) // nuốt rAF live đang chờ → commit là bản cuối (stone thật, hết :lod)
      this._siteRaf = 0
    }
    this._syncFence()
    this.store.autosave(this.state, this.site)
    if (this.sun) this.sun.shadow.needsUpdate = true
  }
  private readonly _onPointerUp = (e: PointerEvent): void => {
    if (this.sunGizmo?.isDragging()) {
      this.sunGizmo.endDrag() // ☀ thả sun → bật lại orbit
      this._downPos = null
      return
    }
    if (this._mixPainting) {
      this._mixPainting = false
      this._commitMixPaint() // 🖌 buông nét → serialize base64 vào state + autosave (mode vẫn bật, vẽ tiếp được)
      this._downPos = null
      return
    }
    if (this._endSiteDrag()) {
      this._downPos = null // 💧🟫🚪 buông 1 drag site/building (commit trong _endSiteDrag)
      return
    }
    this.picking = false
    this._maybeClickFocus(e)
    this._downPos = null
  }

  // Buông chuột: nếu đang kéo hồ / nắn-ground / cổng / building / tầng-ground → commit cái đó + true. Tách khỏi
  // _onPointerUp (giữ complexity ≤10). Mỗi nhánh return sớm; KHÔNG bao gồm sun (orbit re-enable riêng).
  private _endSiteDrag(): boolean {
    for (const t of this._siteDragTools())
      if (t.isDragging()) {
        t.endDrag() // 💧🟫⛰️ ẩn viền/đĩa + commit (rebuild đặt shape/gò mới + cỏ né lại + autosave)
        return true
      }
    if (this._gateDrag) {
      this._commitGateDrag()
      return true
    }
    if (this.manipulate?.isDragging()) {
      this.manipulate.dragEnd()
      return true
    }
    if (this._layerDrag) {
      this._commitLayerDrag() // 🟫 buông tầng ground → bake offset + rebuild + autosave
      return true
    }
    return false
  }

  // Click (không kéo) ở chế độ thường → trỏ GUI tới đúng panel. Bỏ qua paint/pick. <5px = click.
  // Ưu tiên mặt nước (gần hơn building) → trỏ GUI hồ; else building element (clickFocus).
  private _maybeClickFocus(e: PointerEvent): void {
    if (!this._downPos || this.paintMode || this.pickMode) return
    const dx = e.clientX - this._downPos.x
    const dy = e.clientY - this._downPos.y
    if (dx * dx + dy * dy >= 25) return // kéo/orbit, không phải click
    this._setActiveCut(-1) // 🟫 click = deselect cut (ẩn xám); _tryClickLayer→navTo bật lại nếu trúng cut
    if (this.waterTool?.tryClick(e)) return // 💧 click trúng hồ → trỏ GUI hồ
    if (this._tryClickFence(e)) return // 🧱 click trúng rào → trỏ GUI Fence
    if (this._tryClickLayer(e)) return // 🟫 click trúng tầng ground → trỏ GUI Ground▸Gn
    this.manipulate?.clickFocus(e) // building element → trỏ folder tương ứng
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
    if (on) {
      this._setMoveMode(false) // 3 mode loại trừ
      this._mixPaintOff() // 🖌 đang vẽ mask mix → thoát (UI tự bỏ highlight qua sync)
    }
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
      this._mixPaintOff() // 🖌
    }
    if (this.controls) this.controls.enabled = !on
  }

  // Move tool: bật → tắt paint/pick + tắt orbit; nhấn-giữ element trong 3D để kéo. Loại trừ 3 mode.
  private _setMoveMode(on: boolean): void {
    this.moveMode = on
    this.manipulate?.cancelDrag()
    if (!on) this.shapeSel?.clear() // nhóm chỉ sống trong Move mode — rời mode = xả (ad-hoc, không persist)
    for (const t of this._siteDragTools()) t.cancelDrag() // 💧🟫⛰️ huỷ kéo/nặn tool site đang dở + ẩn viền/đĩa
    this._gateDrag = null // huỷ kéo cổng đang dở
    this._layerDrag = null // 🟫 huỷ kéo tầng ground đang dở
    if (on) {
      this._setPaintMode(false)
      this.palette?.markSwatch(null)
      this._setPickMode(false)
      this._mixPaintOff() // 🖌 đang vẽ mask mix → thoát
    }
    if (this.controls) this.controls.enabled = !on
    this._syncMoveToggle?.(on) // đổi class nút 🤚 (ap-move-on) — text bỏ, chỉ symbol
    for (const t of this._siteDragTools()) t.rebuildHandles() // 💧🟫⛰️ hiện/ẩn handle tool site theo moveMode
    this._renderScene() // bật/tắt Move → dựng lại building để áp/bỏ tường-phẳng + nhuốm xanh "nghệ" ngay
  }

  // ── 💧 Kéo hồ trong 3D (Move tool) — site element, lab tự xử lý (manipulate chỉ lo building) ──

  private _ndc(e: PointerEvent): THREE.Vector2 {
    const r = this.canvas.getBoundingClientRect()
    return new THREE.Vector2(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1
    )
  }

  // Click/kéo trúng 1 hồ trong 3D → MỞ GUI tới tab hồ đó: drawer "Ground" (idx1) → Water → type (Pool/Pond/
  // Puddle) → instance (Pl/Pd/Pe). Tách khỏi setActiveWaterCfg (cái đó còn gọi từ GUI onChange → tránh vòng).
  private _navigateToWater(cfg: WaterConfig): void {
    this.drawerTabs?.select(1, { trusted: false }) // Building|Ground|Lab → Ground (chứa panel sân vườn)
    this._siteNavigate?.(cfg)
  }

  // 🧱 Click trúng RÀO trong 3D → mở GUI: drawer "Ground" (idx1) → sub-tab "Fence" → instance lớp idx.
  private _navigateToFence(idx: number): void {
    this.drawerTabs?.select(1, { trusted: false }) // Building|Ground|Lab → Ground
    this._siteNavigateFence?.(idx)
  }

  // Lớp rào của object trúng (đi ngược parent tới mesh mang userData.fenceIdx). -1 nếu không thuộc rào.
  private _fenceIdxOf(obj: THREE.Object3D | null): number {
    let o = obj
    while (o && o !== this._fenceGroup) {
      if (typeof o.userData.fenceIdx === 'number') return o.userData.fenceIdx
      o = o.parent
    }
    return -1
  }

  // Click thường trúng RÀO (gần hơn building pick) → trỏ GUI Fence (lớp trúng). Trả false → nhường building.
  private _tryClickFence(e: PointerEvent): boolean {
    if (!this.site.show || !this.site.fences.some((f) => f.enabled)) return false
    if (this._fenceGroup.children.length === 0) return false
    this._ray.setFromCamera(this._ndc(e), this.camera)
    const fHit = this._ray.intersectObjects(this._fenceGroup.children, true)[0]
    if (!fHit) return false
    const pHit = this._ray.intersectObjects(this.pickGroup.children, false)[0]
    if (pHit && pHit.distance < fHit.distance) return false // building element gần hơn → nhường
    this._navigateToFence(Math.max(0, this._fenceIdxOf(fHit.object)))
    return true
  }

  // 🟫 Click trúng TẦNG ground (G1+, mesh có groundLayerIdx) GẦN HƠN building pick → trỏ GUI Ground▸Gn. Trả
  // false (không trúng / building gần hơn) → nhường building. G0 base không có tag → bỏ qua.
  private _tryClickLayer(e: PointerEvent): boolean {
    if (!this.site.show || !this.site.groundLayers?.length) return false
    this._ray.setFromCamera(this._ndc(e), this.camera)
    const hits = this._ray.intersectObjects(this.siteGroup.children, true)
    const picked = this._pickLayer(hits) // 🪨🧱 resolve Group paving/wall → object mang idx (code1 focus)
    if (!picked) return false
    const pHit = this._ray.intersectObjects(this.pickGroup.children, false)[0]
    if (pHit && pHit.distance < picked.hit.distance) return false // building element gần hơn → nhường
    this._navigateToLayer(picked.obj.userData.groundLayerIdx as number)
    return true
  }

  // 🟫 Click trúng TẦNG ground → mở GUI: drawer "Ground" (idx1) → sub-tab "Ground" → instance tab Gn.
  private _navigateToLayer(idx: number): void {
    this.drawerTabs?.select(1, { trusted: false }) // Building|Ground|Lab → Ground
    this._siteNavigateLayer?.(idx)
  }

  // 🟫 Đặt layer cut active (idx = layer cut → mảng đó HIỆN XÁM trên editor; -1 hoặc layer add → ẩn hết cut).
  // Gọi từ: GUI focus (setActiveGroundLayer qua navTo: click 3D / ＋ thêm / xoá) + bắt đầu Move-drag cut.
  private _setActiveCut(idx: number): void {
    const layer = this.site.groundLayers?.[idx]
    this._activeCutIdx = layer?.op === 'cut' ? idx : -1
    this._activeLayerIdx = layer ? idx : -1 // 🟫 layer active (add HOẶC cut) cho GroundTool nắn (add → không xám, vẫn nắn)
    this._applyCutVisibility()
    this.groundTool?.rebuildHandles() // 🟫 đổi focus layer → vẽ lại tay-cầm đúng layer free (ẩn nếu không free)
  }

  // 🟫 Toggle .visible mọi mảng cut (userData.isCutPatch): chỉ mảng của _activeCutIdx hiện (xám). Raycaster
  // vẫn pick mọi mảng dù ẩn (THREE bỏ qua .visible) → click/kéo trúng vùng cut được kể cả khi không xám.
  private _applyCutVisibility(): void {
    for (const o of this.siteGroup.children) {
      if (o.userData.isCutPatch) o.visible = o.userData.groundLayerIdx === this._activeCutIdx
    }
  }

  // 🚪 Nhấn Move trúng pick-box CỔNG → bắt đầu kéo trượt cổng dọc cạnh rào. Trả false (không trúng / building
  // gần hơn) → nhường manipulate. Lưu phiên kéo: fenceIdx + trục tiếp tuyến + mặt phẳng ngang @đỉnh-cột.
  private _tryStartGateDrag(e: PointerEvent): boolean {
    if (this._gatePickGroup.children.length === 0) return false
    this._ray.setFromCamera(this._ndc(e), this.camera)
    const gHit = this._ray.intersectObjects(this._gatePickGroup.children, false)[0]
    if (!gHit) return false
    const pHit = this._ray.intersectObjects(this.pickGroup.children, false)[0]
    if (pHit && pHit.distance < gHit.distance) return false // building element gần hơn → nhường
    const idx = gHit.object.userData.gateFenceIdx
    if (typeof idx !== 'number') return false
    const fence = this.site.fences[idx]
    if (!fence) return false
    const gs = gateWorldSpec(fence, this.site)
    if (!gs) return false
    this.canvas.setPointerCapture(e.pointerId)
    this._navigateToFence(idx) // cổng = phần của rào → mở GUI tới lớp đó
    const planeY = gs.top + gs.postH / 2
    this._gateDrag = {
      fenceIdx: idx,
      axis: gs.axis,
      plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY),
    }
    return true
  }

  // Kéo cổng: chiếu ray → mặt phẳng ngang → lấy thành phần tiếp tuyến (x cạnh trước/sau, z cạnh trái/phải) →
  // ghi gatePos (mm). buildSiteFence tự kẹp gap trong cạnh. Path tinh gọn _applyFenceLive (chỉ rào, LOD box).
  private _gateDragMove(e: PointerEvent): void {
    const d = this._gateDrag
    if (!d) return
    const fence = this.site.fences[d.fenceIdx]
    if (!fence) return
    this._ray.setFromCamera(this._ndc(e), this.camera)
    const cur = new THREE.Vector3()
    if (!this._ray.ray.intersectPlane(d.plane, cur)) return
    fence.gatePos = Math.round((d.axis === 'x' ? cur.x : cur.z) * 1000)
    this._applyFenceLive() // i chang slider cổng — rebuild CHỈ rào, throttle rAF
  }

  // 🚪 Pick-box vô hình ôm khoảng-trống cổng của lớp `idx` (visible=false → 0 render, Raycaster vẫn hit). Dày
  // theo trục tiếp tuyến = bề rộng gap; perpendicular nới rộng cho dễ tóm. Dựng trong _syncFence khi không kéo.
  private _addGatePick(fence: FenceConfig, idx: number): void {
    const gs = gateWorldSpec(fence, this.site)
    if (!gs) return
    if (!this._pickMat) this._pickMat = new THREE.MeshBasicMaterial()
    const along = Math.max(0.4, gs.halfSpan * 2)
    const grab = 0.45 // m — bề perpendicular (xuyên mặt tường) cho dễ tóm cổng
    const geo =
      gs.axis === 'x'
        ? new THREE.BoxGeometry(along, gs.postH, grab)
        : new THREE.BoxGeometry(grab, gs.postH, along)
    const mesh = new THREE.Mesh(geo, this._pickMat)
    mesh.position.set(gs.cx, gs.top + gs.postH / 2, gs.cz)
    mesh.visible = false
    mesh.userData = { gateFenceIdx: idx }
    this._gatePickGeos.push(geo)
    this._gatePickGroup.add(mesh)
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
    this.scene.add(this.siteGroup) // 🌳 nền + lô (dưới building)
    this.scene.add(this._grassGroup) // 🌿 cỏ — group BỀN, KHÔNG xoá mỗi rebuild (dirty-check riêng)
    this.scene.add(this._fenceGroup) // 🧱 rào — group BỀN (dirty-check riêng, né rebuild nước khi kéo slider rào)
    this.scene.add(this._gatePickGroup) // 🚪 pick-box cổng vô hình (Move mode kéo trượt cổng)
    this.scene.add(this.buildingGroup)
    this.scene.add(this.pickGroup) // SPIKE: lớp pick vô hình cho brush paint
    this.waterTool = new WaterTool(this._waterHost()) // 💧 kéo hồ/đỉnh/viền (tự add handle group vào scene)
    this.groundTool = new GroundTool(this._groundHost()) // 🟫 nắn đỉnh/tay-cầm ground free (tự add handle group)
    this.moundTool = new MoundTool(this._moundHost()) // ⛰️ nặn gò terrain 3D (tự add handle group vào scene)
    this.manipulate = new ManipulateTool(this._manipulateHost()) // trước _setupGUI: nhận registerFocus
    this.highlight = new HighlightOverlay(this._highlightHost())
    this._initShapeSel() // 🧲 Shape Group (Shift+click chọn nhóm + ghost-drag)
    // 💧 Mặt nước ở WATER_REFLECT_LAYER (set per-rebuild) → camera chính + raycaster phải BẬT layer này (cộng
    // dồn) để vẫn thấy + click/kéo hồ; còn virtual-camera reflector (layer 0) thì né mặt nước → hết đơ-2-hồ.
    this.camera.layers.enable(WATER_REFLECT_LAYER)
    this._ray.layers.enable(WATER_REFLECT_LAYER)
    // Listener ĐĂNG KÝ TRƯỚC _setupGUI/_buildScene: phím tắt (Z move, X palette) + pointer KHÔNG được phụ
    // thuộc scene-build thành công. Nếu _buildScene throw (shader/scene lỗi runtime) mà listener ở SAU thì
    // onInit văng → mất sạch phím tắt. Handler dùng optional-chaining (palette?/manipulate?) nên gọi sớm = no-op an toàn.
    window.addEventListener('keydown', this._onKeyDown)
    window.addEventListener('keyup', this._onKeyUp)
    this.canvas.addEventListener('pointerdown', this._onPointerDown)
    this.canvas.addEventListener('pointermove', this._onPointerMove)
    window.addEventListener('pointerup', this._onPointerUp)
    this.canvas.addEventListener('contextmenu', this._onContextMenu)
    this._setupDrawer() // 🗄️ shell bền — tạo 1 lần trước GUI; gui+panels rebuild bên trong
    this._setupLeftDrawer() // ◀ drawer trái (Tools) — shell bền, ẩn mặc định
    this._setupLabFloat() // 🧪 Lab = phần RIÊNG (float persistent) — tách khỏi drawer, Factory phát triển
    this._setupGUI()
    this._buildScene()
    if (import.meta.env.DEV) {
      this.guard = new RuntimeGuard(this.renderer)
      this.devHud = new DevHud(this.canvas.parentElement ?? document.body) // perf HUD — bấm ` để ẩn
    }
  }

  protected onUpdate(time: number, deltaTime: number): void {
    this._applyWASD()
    this._applyRotate()
    this.controls?.update()
    for (const s of this.siteShaders) s.setTime?.(time) // 🌿 gió lùa cỏ (GrassGround) chạy theo elapsed
    this.css2dRenderer?.render(this.scene, this.camera)
    this.guard?.check()
    this.devHud?.update(this.renderer.info, deltaTime)
    this._updateTexLoadBadge()
  }

  // ⏳ True nếu bất kỳ texture set nào đang load ASYNC (ground/slab/deck/khung-dưới/rào). Vài boolean → rẻ/frame.
  private _anyTexLoading(): boolean {
    return (
      this._slabTexLoading ||
      this._foundWoodLoading ||
      this._underWoodLoading ||
      this._underBarkLoading ||
      Object.values(this._groundTexLoading).some(Boolean) ||
      Object.values(this._fenceTexLoading).some(Boolean)
    )
  }

  // ⏳ Toggle badge theo trạng thái load. Change-detect (_texLoadShown) → chỉ chạm DOM khi đổi (giữ fps-contract).
  private _updateTexLoadBadge(): void {
    const loading = this._anyTexLoading()
    if (loading === this._texLoadShown) return
    this._texLoadShown = loading
    if (loading && !this._texLoadBadge) this._texLoadBadge = this._makeTexLoadBadge()
    if (this._texLoadBadge) this._texLoadBadge.style.display = loading ? 'flex' : 'none'
  }

  private _makeTexLoadBadge(): HTMLDivElement {
    const el = document.createElement('div')
    el.textContent = '⏳ đang tải vật liệu…'
    el.style.cssText =
      'position:absolute;left:50%;bottom:18px;transform:translateX(-50%);z-index:50;display:none;' +
      'align-items:center;gap:8px;padding:7px 14px;border-radius:999px;background:rgba(14,26,22,.86);' +
      'color:#cde7dd;font:600 12px/1 ui-sans-serif,system-ui,sans-serif;border:1px solid rgba(120,200,170,.35);' +
      'box-shadow:0 4px 14px rgba(0,0,0,.3);pointer-events:none;backdrop-filter:blur(4px)'
    this.canvas.parentElement?.appendChild(el)
    return el
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

  // ⟲/⟳ GIỮ Z = xoay camera phải · C = xoay trái (quanh tâm orbit, mặt phẳng ngang/azimuth). Rơi vào _keysDown
  // như WASD → giữ phím là xoay liên tục; controls.update() (onUpdate) orient camera lại về target.
  private _applyRotate(): void {
    if (!this.controls) return
    let dir = 0
    if (this._keysDown.has('KeyZ')) dir += 1 // phải
    if (this._keysDown.has('KeyC')) dir -= 1 // trái
    if (dir === 0) return
    const angle = dir * 0.03 // rad mỗi frame (~1.7°)
    const t = this.controls.target
    const ox = this.camera.position.x - t.x
    const oz = this.camera.position.z - t.z
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    this.camera.position.x = t.x + ox * cos - oz * sin
    this.camera.position.z = t.z + ox * sin + oz * cos
  }

  protected onDispose(): void {
    window.removeEventListener('keydown', this._onKeyDown)
    window.removeEventListener('keyup', this._onKeyUp)
    this.canvas.removeEventListener('pointerdown', this._onPointerDown)
    this.canvas.removeEventListener('pointermove', this._onPointerMove)
    window.removeEventListener('pointerup', this._onPointerUp)
    this.canvas.removeEventListener('contextmenu', this._onContextMenu)
    this._keysDown.clear()
    this._texLoadBadge?.remove()
    this._texLoadBadge = null
    if (this._rafBuild) {
      cancelAnimationFrame(this._rafBuild)
      this._rafBuild = 0
    }
    if (this._siteRaf) {
      cancelAnimationFrame(this._siteRaf)
      this._siteRaf = 0
    }
    this._disposeOverlays()
    this._pickMat?.dispose() // SPIKE brush: material chung của pick layer
    this._pickMat = null
    this.controls?.dispose()
    this.controls = null
    this.palette?.dispose() // gỡ listener doc (mousedown/keydown) của popover palette
    this._teardownPanels() // gui nhà + panel Ground
    this._disposeLabFloat() // 🧪 Lab float persistent (preview + shell + toggle) — dispose ở teardown CUỐI
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
    this._siteGrass?.dispose() // 🌿 cỏ ở group bền (ngoài _clearSite) → dispose tường minh lúc teardown
    this._siteGrass = null
    this._clearFence() // 🧱 rào ở group bền (ngoài _clearSite) → dispose geos/mats/shaders lúc teardown
    this._disposeSurfaceTextures() // 🌱🪵🧱 ground/slab/fence texture-set + PhotoGround sàn (lab sở hữu)
    this._clearDragGroup() // 🚀 split-drag group (nếu dispose giữa phiên kéo)
    this._dragGroup = null
    this.wallMats.dispose() // dispose + clear toàn bộ material cache + brick textures
    this._disposeEnvironment()
    this._disposeGround()
    this._disposeGrid()
    this.heightGridSystem?.dispose()
    this.heightGridSystem = null
    this.css2dEl?.remove()
    this.css2dEl = null
    this.css2dRenderer = null
    this._disposeActors()
  }

  // Dispose nhóm "actor" scene (figure/coordPicker/sun/guard/devHud/waterTool). Tách khỏi
  // _disposeSceneResources (giữ complexity ≤10 — mỗi ?.dispose là 1 nhánh).
  private _disposeActors(): void {
    this.humanFigure?.dispose()
    this.humanFigure = null
    this.coordPicker?.dispose()
    this.coordPicker = null
    this.sunGizmo?.dispose() // ☀ gỡ quả sun + panel CSS2D
    this.sunGizmo = null
    this.sun?.dispose() // dispose shadow map render target
    this.sun = null
    this.scene.backgroundNode = null // 🌅 gỡ sky node nền
    this.sky?.dispose()
    this.sky = null
    this.guard?.dispose()
    this.guard = null
    this.devHud?.dispose()
    this.devHud = null
    for (const t of this._siteDragTools()) t.dispose() // 💧🟫⛰️ handle geo/mat + outline/đĩa + gỡ group khỏi scene
    this.waterTool = null
    this.groundTool = null
    this.moundTool = null
  }

  // ── Scene setup ────────────────────────────────────────────────────────────

  // IBL: RoomEnvironment → PMREM → scene.environment. Cho MeshStandardNodeMaterial phản chiếu
  // specular thật → bề mặt bớt "nhựa". fromSceneAsync vì WebGPU backend init bất đồng bộ.
  private async _setupEnvironment(): Promise<void> {
    const pmrem = new PMREMGenerator(this.renderer)
    const rt = await pmrem.fromSceneAsync(new RoomEnvironment(), 0.04)
    this.envRT = rt // giữ RT để dispose CẢ wrapper (rt.dispose() gồm texture + framebuffer)
    this.scene.environment = rt.texture
    this.scene.environmentIntensity = 0.3 // hạ fill IBL → vùng bóng tối/đậm hơn (bóng chỉ ăn fill)
    pmrem.dispose()
  }

  private _disposeEnvironment(): void {
    this.envRT?.dispose() // dispose CẢ RenderTarget wrapper (gồm texture) — không chỉ riêng texture
    this.scene.environment = null
    this.envRT = null
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
    this.scene.background = new THREE.Color(0x0a0e1a) // fallback; SkyGradient dome phủ tầm nhìn (đặt cuối hàm)
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
    sun.shadow.camera.far = 90 // sun radius 48 (xa gấp đôi) → bump far kẻo light ra ngoài frustum, clip bóng
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
    this.gridHelper = new THREE.LineSegments(this._buildGridGeo([]), this.gridMat) // tự dựng → khoét được
    this.sky = new SkyGradient() // 🌅 sky qua scene.backgroundNode (KHÔNG mesh — luôn phủ, tự theo camera)
    this.scene.backgroundNode = this.sky.getBackgroundNode()
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
    if (t === 'sand') return this._sandGroundMaterial() // 🏖️ rippled_sand photo (PhotoGround async + fallback)
    if (t in GROUND_TEX_SPEC) return this._photoEditorGround(t as GroundMaterialKey) // 🌱🏖️ grass-o/thai sand…
    // mặc định 'stone' (đá lát hoa cương — slab grid). Đất/cỏ tự nhiên sẽ từ Megascans/Gaea sau.
    const e = makeSurfaceMaterial('concrete', 0x9a9890, 1.0)
    return { mat: e.mat, shader: e.shader, bounce: 0x8a8880 }
  }

  // 🌱🏖️ Material nền-editor texture (grass-o/thai sand…): TÁI DÙNG PhotoGround cache site-ground (_groundMatFor,
  // world-XZ UV → share được). shader:null → _setGroundType KHÔNG dispose vật liệu chia sẻ. Chưa load → màu fallback
  // preset, tự re-apply khi _ensureGroundTex xong (groundType khớp key). bounce = màu preset.
  private _photoEditorGround(key: GroundMaterialKey): {
    mat: THREE.Material
    shader: { dispose(): void } | null
    bounce: number
  } {
    const preset = GROUND_PRESETS[key]
    const photo = this._groundMatFor(key) // cached PhotoGround hoặc null (kick async load)
    if (photo) return { mat: photo.getMaterial(), shader: null, bounce: preset.color }
    const f = makeSurfaceMaterial('concrete', preset.color, preset.roughness) // tạm chờ load
    return { mat: f.mat, shader: f.shader, bounce: preset.color }
  }

  // 🏖️ Material nền-editor cát: PhotoGround rippled_sand nếu đã load (Lab-owned → shader null, KHÔNG để
  // _setGroundType dispose vật liệu chia sẻ); chưa load → kick async + tạm màu cát (shader fallback disposable).
  private _sandGroundMaterial(): {
    mat: THREE.Material
    shader: { dispose(): void } | null
    bounce: number
  } {
    if (this._editorSandTex) {
      return { mat: this._editorSandTex.getMaterial(), shader: null, bounce: 0xc2a878 }
    }
    this._ensureEditorSandTex()
    const f = makeSurfaceMaterial('concrete', 0xc2a878, 1.0) // tạm màu cát chờ load
    return { mat: f.mat, shader: f.shader, bounce: 0xc2a878 }
  }

  // 🏖️ Load rippled_sand 1 lần → PhotoGround (world-XZ UV, tile theo manifest 3m). Xong → re-apply nền nếu
  // đang chọn 'sand' (đổi material groundMesh từ fallback → texture). Lab sở hữu maps + PhotoGround → dispose.
  private _ensureEditorSandTex(): void {
    if (this._editorSandTex || this._editorSandLoading) return
    this._editorSandLoading = true
    const spec: SurfaceTextureSpec = {
      baseColor: { url: sandBaseColorUrl, colorSpace: 'srgb' },
      normal: { url: sandNormalUrl, colorSpace: 'linear' },
      roughness: { url: sandRoughnessUrl, colorSpace: 'linear' },
      ao: { url: sandAoUrl, colorSpace: 'linear' },
    }
    loadSurfaceTextureSet(spec, this.renderer)
      .then((maps) => {
        this._editorSandMaps = maps
        this._editorSandTex = new PhotoGround({ maps, tileSizeMeters: sandManifest.tileSizeMeters })
        this._editorSandLoading = false
        if (this.groundType === 'sand') this._setGroundType('sand') // re-apply với texture đã có
      })
      .catch((e: unknown) => {
        this._editorSandLoading = false
        console.warn('[ArchPlanLab] load editor sand texture lỗi — giữ màu cát:', e)
      })
  }

  // Đặt vị trí (cầu az/el, bán kính 24m trong tầm shadow camera) + intensity/màu/on-off của sun từ
  // sunOpts. Cuối hàm sync gizmo (vị trí quả sun bám theo light). Mọi nguồn đổi sun đều qua đây.
  private _applySun(): void {
    if (!this.sun) return
    const az = (this.sunOpts.azimuth * Math.PI) / 180
    const el = (this.sunOpts.elevation * Math.PI) / 180
    const r = 48 // bán kính vòm sun (khớp SunGizmo DOME_R) — gấp đôi để sun không sát mặt đất
    const cosEl = Math.cos(el)
    this.sun.position.set(r * cosEl * Math.cos(az), r * Math.sin(el), r * cosEl * Math.sin(az))
    // Tắt sun = intensity 0 (KHÔNG đổi sun.visible). Đổi tập đèn active (visible on/off) → WebGPU recompile
    // MỌI NodeMaterial (lag 1–3s mỗi toggle). Giữ visible=true + intensity 0 → chỉ ghi uniform, toggle tức thì.
    this.sun.intensity = this.sunOpts.enabled ? this.sunOpts.intensity : 0
    this.sun.color.set(this.sunOpts.color)
    this.sun.shadow.needsUpdate = this.sunOpts.enabled // tắt → khỏi vẽ lại shadow map (đỡ depth-pass thừa)
    this._applySunToGrass() // vệt tiếp đất cỏ đổi hướng/độ dài theo sun (live, không dựng lại)
    this._applySunToWater() // đốm nắng glint trên mặt hồ đổi theo sun (live)
    this._applySunToSky() // 🌅 sky ngày↔đêm + mờ đèn fill/env theo độ-cao sun (live)
    this.sunGizmo?.sync()
  }

  // 🌅 Sun đổi → sky lerp ngày↔đêm + mờ HemisphereLight & environment lúc đêm (fill/IBL tối dần). LIVE
  // (uniform sky + scalar đèn, KHÔNG dựng lại/recompile) → kéo quả sun mượt.
  private _applySunToSky(): void {
    if (!this.sun || !this.sky) return
    const p = this.sun.position
    const day = this.sky.setSun(p.x, p.y, p.z) // [0..1]: 1=trưa, 0=đêm
    if (this.hemiLight) this.hemiLight.intensity = 0.06 + 0.29 * day
    this.scene.environmentIntensity = 0.05 + 0.25 * day
  }

  // Hướng + độ dài vệt tiếp đất của bãi cỏ theo sun (live). Gọi khi sun đổi + sau mỗi lần dựng lại _siteGrass.
  private _applySunToGrass(): void {
    if (this._siteGrass && this.sun) {
      const sp = this.sun.position
      this._siteGrass.setSun(sp.x, sp.y, sp.z)
    }
  }

  // Đốm nắng glint trên MỌI hồ theo sun (live). Gọi khi sun đổi + sau mỗi lần dựng lại _siteWaters.
  private _applySunToWater(): void {
    if (!this.sun) return
    const sp = this.sun.position
    for (const x of this._siteWaters) x.surf.setSun(sp.x, sp.y, sp.z)
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
  // 3 getter nhóm lưới đo (Z/X/CY) — tách spread để _makeGuiCtx gọn (rule-50).
  private _gridGroupCtx(): Pick<APGuiCtx, 'getZGridGroup' | 'getXGridGroup' | 'getCYGridGroup'> {
    return {
      getZGridGroup: () => this.heightGridSystem?.getZGridGroup() ?? null,
      getXGridGroup: () => this.heightGridSystem?.getXGridGroup() ?? null,
      getCYGridGroup: () => this.heightGridSystem?.getCYGridGroup() ?? null,
    }
  }

  // Callback tinh-chỉnh LIVE cỏ/hồ + 🖌 mix-paint — tách spread để _makeGuiCtx gọn (rule-50).
  private _siteTuneGuiCtx(): Pick<
    APGuiCtx,
    | 'tuneGrass'
    | 'tuneWater'
    | 'setActiveWater'
    | 'previewWater'
    | 'tunePathRotLive'
    | 'applyZonesLive'
    | 'setMixPaint'
    | 'getMixPaint'
    | 'getMixBrush'
    | 'setMixBrush'
    | 'clearMixPaint'
    | 'tuneMixLive'
    | 'registerMixPaintSync'
  > {
    return {
      tuneGrass: (apply, persist) => this._tuneGrass(apply, persist),
      tuneWater: (cfg, apply, persist) => this._tuneWater(cfg, apply, persist),
      setActiveWater: (cfg) => this.waterTool?.setActiveCfg(cfg),
      previewWater: (cfg) => this.waterTool?.showOutline(cfg),
      tunePathRotLive: (flatIdx, rotDeg) => this._tunePathRotLive(flatIdx, rotDeg),
      applyZonesLive: () => this._applyZonesLive(),
      ...this._mixPaintGuiCtx(), // 🖌 stage 3 — cọ vẽ mask mix per-zone
    }
  }

  // 🖌 7 callback VẼ MASK MIX (stage 3) — tách spread để _makeGuiCtx gọn (rule-50), cùng pattern _siteTuneGuiCtx.
  private _mixPaintGuiCtx(): Pick<
    APGuiCtx,
    | 'setMixPaint'
    | 'getMixPaint'
    | 'getMixBrush'
    | 'setMixBrush'
    | 'clearMixPaint'
    | 'tuneMixLive'
    | 'registerMixPaintSync'
  > {
    return {
      setMixPaint: (target, slot) => this._setMixPaint(target, slot),
      getMixPaint: () => this._mixPaint,
      getMixBrush: () => ({ ...this._mixBrush }),
      setMixBrush: (sizeM, erase) => {
        this._mixBrush.size = sizeM
        this._mixBrush.erase = erase
      },
      clearMixPaint: (target, slot) => this._clearMixPaint(target, slot),
      tuneMixLive: (target) => this._tuneMixLive(target),
      registerMixPaintSync: (fn) => (this._syncMixPaint = fn),
    }
  }

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
      setActiveGroundLayer: (idx) => this._setActiveCut(idx), // 🟫 focus layer (navTo) → cut hiện xám / add ẩn cut
      applySiteLive: () => this._applySiteLive(),
      applyFenceLive: () => this._applyFenceLive(),
      applyTerrainLive: () => this._applyTerrainLive(),
      applyTerrainDetail: () => this._applyTerrainDetail(),
      siteStats: () => this._siteStats(),
      registerSiteReadout: (fn) => (this._refreshSiteReadout = fn),
      ...this._siteTuneGuiCtx(),
      prefetchGroundTextures: () => this._prefetchGroundTextures(),
      applySun: () => this._applySun(),
      ...this._gridGroupCtx(),
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
      ...this._floorCtx(),
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
      ...this._focusCtx(),
    }
  }

  // Focus (3D→GUI) + tune cánh cửa delegates — tách như _floorCtx giữ _makeGuiCtx ≤50 dòng.
  private _focusCtx(): Pick<APGuiCtx, 'registerFocus' | 'registerFocusAction' | 'tuneLeafLive'> {
    return {
      registerFocus: (k, f) => this.manipulate?.registerFocus(k, f),
      registerFocusAction: (k, fn) => this.manipulate?.registerFocusAction(k, fn),
      tuneLeafLive: (k, p) => this._tuneLeafLive(k, p),
    }
  }

  // 🚪 C2: kéo slider Mở % → xoay pivot cánh TRỰC TIẾP (transform thuần, 0 rebuild/recompile — đúng
  // PERFORMANCE.md). Pivot mang userData {leafKey, leafBase, leafSign} gắn lúc assembleLeaves; buông
  // slider = ctx.build() commit persist (rebuild đặt lại đúng góc từ state).
  private _tuneLeafLive(key: string, openPct: number): void {
    const rad = (Math.min(100, Math.max(0, openPct)) / 100) * LEAF_MAX_RAD
    this.buildingGroup.traverse((o) => {
      if (o.userData.leafKey === key)
        o.rotation.y = (o.userData.leafBase as number) + (o.userData.leafSign as number) * rad
    })
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
    drawer.appendChild(this._buildDrawerFooter()) // hàng nút DÙNG CHUNG đáy drawer (ngoài body cuộn)
    this.canvas.parentElement?.appendChild(drawer)
    this.drawer = drawer
    this.drawerBody = body
  }

  // 🗄️ Hàng nút DÙNG CHUNG đáy drawer (mọi tab Building|Ground|Lab đều thấy): undo/redo + Build/Reset/Save/
  // Load/JSON. Wire THẲNG vào method (KHÔNG qua ctx) → bền qua _rebuildGUI (drawer shell tạo 1 lần).
  private _buildDrawerFooter(): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'ap-drawer-footer'
    const undo = document.createElement('div')
    undo.className = 'ap-undo-row'
    const mkU = (sym: string, fn: () => void): void => {
      const b = document.createElement('button')
      b.className = 'ap-undo-btn'
      b.textContent = sym
      b.addEventListener('click', fn)
      undo.appendChild(b)
    }
    mkU('↶', () => this._undo())
    mkU('↷', () => this._redo())
    const bar = document.createElement('div')
    bar.className = 'ap-footer'
    const mk = (label: string, cls: string, fn: () => void): void => {
      const b = document.createElement('button')
      b.className = `ap-footer-btn ${cls}`
      b.textContent = label
      b.addEventListener('click', fn)
      bar.appendChild(b)
    }
    mk('▶ Build', 'ap-footer-build', () => this._buildScene())
    mk('Reset', 'ap-footer-reset', () => {
      if (window.confirm('Reset toàn bộ về mặc định?')) this._resetState()
    })
    mk('💾 Save', 'ap-footer-save', () => void this.store.saveFile(this.state, this.site))
    mk('📁 Load', 'ap-footer-load', () => void this._loadFile())
    mk('📄 JSON', 'ap-footer-json', () => this.store.exportJSON(this.state, this.site))
    wrap.append(undo, bar)
    return wrap
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

  // 🧪 Lab = PHẦN RIÊNG (float persistent, NGOÀI drawer + GUI chung): bàn thí nghiệm vật thể MỚI, Factory phát
  // triển. Tạo 1 LẦN (không churn _rebuildGUI). Preview ĐỘC LẬP scene (KHÔNG sync _previewRebuild theo edit →
  // né lag): chỉ dựng 1 lần lúc init làm mẫu; xong sandbox → chuyển code sang GUI chung thủ công. Full màn, pin 0/0.
  private _setupLabFloat(): void {
    const wrap = document.createElement('div')
    wrap.className = 'ap-lab-float ap-lab-hidden' // ẩn mặc định — bấm 🧪 để hiện
    this.canvas.parentElement?.appendChild(wrap)
    this.labFloat = wrap
    const bench = setupLabBench(wrap) // 🧪 ⚙ + selector + 2 khung trái (param/doc) + previewHost
    // 🧪 Lab host NHIỀU thí nghiệm qua switcher: 🏛 Mái (slider + SDF) | ✨ Particles (3 mức). Đổi chip →
    // dispose cái cũ, mount cái mới vào cùng khung. (Cỏ đã tốt nghiệp sang Garden ▸ Grass; grass-preview.ts vẫn còn.)
    this.labExp = setupLabExperiments(bench)
    const btn = document.createElement('button')
    btn.className = 'ap-lab-toggle'
    btn.textContent = '🧪'
    btn.title = 'Lab — bàn thí nghiệm vật thể mới (Factory, độc lập scene). Bật/tắt (phím R).'
    btn.addEventListener('click', () => this._toggleLab())
    this.canvas.parentElement?.appendChild(btn)
    this.labToggle = btn
  }

  // 🧪 Bật/tắt Lab float (nút 🧪 hoặc phím R). Đồng bộ viền vàng nút theo trạng thái.
  private _toggleLab(): void {
    if (!this.labFloat || !this.labToggle) return
    const hidden = this.labFloat.classList.toggle('ap-lab-hidden')
    this.labToggle.classList.toggle('ap-lab-toggle-on', !hidden)
    if (!hidden) {
      // Bật lên → luôn snap FULL MÀN HÌNH góc trên-trái (xóa offset đã kéo trước đó).
      this.labFloat.style.left = '0'
      this.labFloat.style.top = '0'
      this.labFloat.style.right = 'auto'
    }
  }

  // Teardown Lab float persistent (chỉ ở dispose CUỐI — KHÔNG mỗi _rebuildGUI).
  private _disposeLabFloat(): void {
    this.labExp?.dispose() // 🔀 dispose thí nghiệm Lab đang active (preview WebGL + slider)
    this.labExp = null
    this.labFloat?.remove()
    this.labFloat = null
    this.labToggle?.remove()
    this.labToggle = null
  }

  // TRONG drawer: 3 panel (Building=gui nhà · Ground=lô+cỏ-cây+nước · Lab=bàn thí nghiệm/preview) là CON
  // TRỰC TIẾP drawerBody → Tabs ngang quản lý (ẩn/hiện). Slider cỏ ở Ground ▸ Garden ▸ Grass. Lab ĐÃ TÁCH
  // RA float riêng (persistent, _setupLabFloat). NGOÀI drawer: float góc trái (Scanner/Sun/Ground/Move/Palette).
  private _buildLeftTools(ctx: APGuiCtx, drawerBody: HTMLElement): void {
    const site = setupSitePanel(ctx, drawerBody) // 🌳 Ground: sub-tab Ground|Fence|Garden|Water → { panel, dispose, navigateToWater }
    this._siteDispose = site.dispose
    this._siteNavigate = site.navigateToWater // refresh mỗi _rebuildGUI (panel dựng lại) → luôn trỏ panel hiện tại
    this._siteNavigateFence = site.navigateToFence // 🧱 click rào 3D → sub-tab Fence
    this._siteNavigateLayer = site.navigateToGroundLayer // 🟫 click tầng ground 3D → sub-tab Ground▸Gn
    this.drawerPanels = [site.panel] // chỉ Ground (Lab ở float riêng); gỡ khi teardown
    this._buildDrawerTabs(drawerBody, site.panel)
    this._buildFloatingTools(ctx)
  }

  // Tab ngang đầu drawer: 🏠 Building | 🌳 Ground (Lab ĐÃ tách ra float 🧪 riêng). Nhớ tab active qua rebuild.
  private _buildDrawerTabs(host: HTMLElement, ground: HTMLElement): void {
    const guiEl = this.gui?.domElement
    if (!guiEl) return
    this.drawerTabs = new Tabs(
      host,
      [
        { label: '🏠 Building', panel: guiEl, title: 'Điều khiển nhà' },
        { label: '🌳 Ground', panel: ground, title: 'Nền / rào / lô / cỏ-cây / nước' },
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

  // Viền flash (highlight) + viền nhóm chọn (shapeSel) — gom 1 chỗ cho gọn complexity onDispose.
  private _disposeOverlays(): void {
    this.highlight?.dispose()
    this.shapeSel?.dispose()
    this.shapeSel = null
  }

  // 🧲 Shape Group — host dùng chung locator với highlight (locateInst trả {inst, fi} + instWallBase).
  private _initShapeSel(): void {
    this.shapeSel = new ShapeSelection({
      scene: this.scene,
      locateInst: (id) => this._locateInst(id),
      instWallBase: (inst, fi) => this._instWallBase(inst, fi),
    })
  }

  // Host cho ManipulateTool: scene refs (stable) + callback locate/rebuild. Lab giữ pick layer + mode.
  private _manipulateHost(): ManipulateHost {
    return {
      canvas: this.canvas,
      camera: this.camera,
      raycaster: this._ray,
      pickGroup: this.pickGroup,
      locateInst: (id) => this._locateInst(id)?.inst ?? null,
      siblingInstances: (id) => this._siblingInstances(id),
      instanceCount: () => this.state.floors.reduce((n, f) => n + f.instances.length, 0),
      buildScene: () => this._buildScene(),
      buildSceneLive: () => this._buildSceneLive(),
      translateBuildingLive: (dx, dz) => this._translateBuildingLive(dx, dz),
      beginInstDragSplit: (id) => this._beginInstDragSplit(id),
      instDragTranslate: (dx, dz) => this._instDragTranslate(dx, dz),
      rebuildDragShape: () => this._rebuildDragShapeLive(),
      endInstDragSplit: () => this._endInstDragSplit(),
      refreshGuiNumbers: () => this.gui?.controllersRecursive().forEach((c) => c.updateDisplay()),
      // 🧲 Shape Group — delegate sang ShapeSelection (selection + ghost sống ở interaction/selection.ts)
      selectedIds: () => this.shapeSel?.ids() ?? [],
      beginGroupGhost: () => this.shapeSel?.beginGhost(),
      moveGroupGhost: (dx, dz) => this.shapeSel?.moveGhost(dx, dz),
      endGroupGhost: () => this.shapeSel?.endGhost(),
    }
  }

  // Host cho WaterTool: scene refs + state hồ (lab giữ _siteWaters/_activeWater) + điều hướng/commit.
  private _waterHost(): WaterToolHost {
    return {
      canvas: this.canvas,
      camera: this.camera,
      raycaster: this._ray,
      scene: this.scene,
      pickGroup: this.pickGroup,
      site: () => this.site,
      moveMode: () => this.moveMode,
      siteWaters: () => this._siteWaters,
      activeWater: () => this._activeWater,
      setActiveWater: (cfg) => {
        this._activeWater = cfg
      },
      navigateToWater: (cfg) => this._navigateToWater(cfg),
      commitSite: () => this._applySite(true),
    }
  }

  // Host cho GroundTool: scene refs + state + layer active (lab giữ _activeLayerIdx) + commit. siteGroup để đọc
  // cao độ mesh layer (đặt overlay tay-cầm đúng mặt). Body-drag (dời layer) KHÔNG qua đây — lab _layerDrag lo.
  private _groundHost(): GroundToolHost {
    return {
      canvas: this.canvas,
      camera: this.camera,
      raycaster: this._ray,
      scene: this.scene,
      siteGroup: this.siteGroup,
      site: () => this.site,
      moveMode: () => this.moveMode,
      activeLayerIdx: () => this._activeLayerIdx,
      commitSite: () => this._applySite(true),
    }
  }

  // Host cho MoundTool: scene refs + state + moveMode + 2 đường commit. Kéo handle gò → applyTerrainLive (swap geo
  // nền base, rẻ — như slider terrain); buông → _applySite(true) full rebuild + autosave (cỏ né lại gò mới).
  private _moundHost(): MoundToolHost {
    return {
      canvas: this.canvas,
      camera: this.camera,
      raycaster: this._ray,
      scene: this.scene,
      site: () => this.site,
      moveMode: () => this.moveMode,
      applyTerrainLive: () => this._applyTerrainLive(),
      commitSite: () => this._applySite(true),
    }
  }

  // 🚀 SPLIT-DRAG (kéo 1 shape khi có NHIỀU shape): dựng 1 lần — shape khác (static) vào buildingGroup +
  // pick; shape ĐANG KÉO vào _dragGroup riêng (visual, KHÔNG pick — không cần raycast giữa drag). Mỗi frame
  // chỉ translate _dragGroup → 0 rebuild shape khác → mượt bất kể số shape. plainWalls=true (LOD phẳng, rẻ).
  private _beginInstDragSplit(instId: string): void {
    if (this._rafBuild) {
      cancelAnimationFrame(this._rafBuild)
      this._rafBuild = 0
    }
    if (!this._dragGroup) {
      this._dragGroup = new THREE.Group()
      this.buildingGroup.parent?.add(this._dragGroup) // sibling buildingGroup (cùng scene)
    }
    this._clearDragGroup()
    this._liveRebuild = true // cỏ hoãn rải lại lúc kéo (chỉ exclude đổi)
    // static: MỌI shape TRỪ shape đang kéo → buildingGroup + pick (1 lần, giữ suốt phiên kéo)
    this._clearBuilding()
    const others = renderBuildingState(
      this.state,
      {
        wallCache: this.wallMats,
        group: this.buildingGroup,
        geos: this.buildingGeos,
        mats: this.buildingMats,
        brick3d: this.brick3dWalls,
        wood: this.woodWalls,
        strip: this.stripWalls,
        slabTexMat: this._slabTexMatForBuild(), // 🪵 sàn walnut (chưa load → undefined = bê tông tạm)
        foundWoodMat: this._foundWoodMatForBuild(), // 🪵 gỗ deck móng + slab planks (Wooden Planks)
        underWoodMat: this._underWoodMatForBuild(), // 🪵 gỗ khung-dưới (Old Plywood, tách deck)
        underBarkMat: this._underBarkMatForBuild(), // 🌳 vỏ cây khung-dưới (Tree Bark, tuỳ chọn 2)
        groundDrops: this._groundDropsForBuild(), // 🌊 nhà static giữ cột-tụt-hồ khi kéo nhà khác
      },
      true, // plainWalls: LOD tường phẳng (rẻ + tintable)
      this._hiddenFloors,
      (id) => id !== instId,
      false // 🪵 nhà static GIỮ cột (dựng 1 lần, rẻ) → mốc định vị khi kéo nhà khác trên hồ
    )
    for (const p of others) this._addPick(p.cx, p.cy, p.cz, p.sx, p.sy, p.sz, p.rotDeg, p.ud)
    this._dragInstId = instId
    this._dragShowFound = true // bắt đầu = kéo NGUYÊN nhà (translate) → giữ cột; element-drag sẽ hạ false
    this._renderDragShape() // dragged shape → _dragGroup (kéo element = rebuild lại cái này, KHÔNG đụng shape khác)
    this._setBuildingTint(this.moveMode) // nhuốm xanh CẢ static (shape kéo giữ màu gốc → nổi bật, dễ canh)
    this._renderSite() // nền/cỏ + đôn buildingGroup lên mặt nền (set buildingGroup.position = (0,lift,0))
    const lift = this.site.show ? this.site.groundThick / 1000 : 0
    this._dragGroup.position.set(0, lift, 0) // ngang buildingGroup; translate cộng (dx,dz) khi kéo
    this._liveRebuild = false
    if (this.sun) this.sun.shadow.needsUpdate = true
  }

  // Render CHỈ shape đang kéo vào _dragGroup (clear cũ trước). Dùng cho begin + rebuild mỗi frame khi kéo
  // ELEMENT (cột/cửa/cầu thang đổi local pos → geometry shape này đổi; shape khác static → KHÔNG đụng).
  // brick3d/wood/strip rỗng vì plainWalls=true. pos giữ (0,lift,0) — element dời TRONG shape, shape không dời.
  private _renderDragShape(): void {
    if (!this._dragGroup || !this._dragInstId) return
    this._clearDragGroup()
    const id = this._dragInstId
    renderBuildingState(
      this.state,
      {
        wallCache: this.wallMats,
        group: this._dragGroup,
        geos: this._dragGeos,
        mats: this._dragMats,
        brick3d: [],
        wood: [],
        strip: [],
        slabTexMat: this._slabTexMatForBuild(), // 🪵 sàn walnut cho shape đang kéo
        foundWoodMat: this._foundWoodMatForBuild(), // 🪵 gỗ deck móng + slab planks cho shape đang kéo
        underWoodMat: this._underWoodMatForBuild(), // 🪵 gỗ khung-dưới (Old Plywood) cho shape đang kéo
        underBarkMat: this._underBarkMatForBuild(), // 🌳 vỏ cây khung-dưới (Tree Bark) cho shape đang kéo
        groundDrops: this._groundDropsForBuild(), // 🌊 cột-tụt-hồ cho shape đang kéo (khi giữ cột)
      },
      true,
      this._hiddenFloors,
      (i) => i === id,
      !this._dragShowFound // kéo NGUYÊN nhà → giữ cột (false); element-drag (rebuild/frame) → concrete (true)
    )
    if (this.sun) this.sun.shadow.needsUpdate = true // bóng theo shape đang kéo (element rebuild)
  }

  // Kéo ELEMENT: rebuild shape đang kéo THROTTLE ≤1/frame (rAF) — né rebuild 120+/giây theo poll chuột.
  // Reuse _rafBuild (split-drag KHÔNG gọi _buildSceneLive; dragEnd→_buildScene cancel raf này). Đây là tín hiệu
  // element-drag (≠ kéo nguyên nhà) → ép móng concrete cho rẻ (lưới cột rebuild/frame rất nặng).
  private _rebuildDragShapeLive(): void {
    this._dragShowFound = false // element-drag: rebuild/frame → bỏ cột deck/trụ (LOD), buông tay _renderScene hiện lại
    if (this._rafBuild) return
    this._rafBuild = requestAnimationFrame(() => {
      this._rafBuild = 0
      this._renderDragShape()
    })
  }

  // Mỗi frame kéo SHAPE: DỜI group shape đang kéo (Δ mét, gồm snap) — 0 rebuild. Bóng update lúc buông (né tụt fps).
  private _instDragTranslate(dx: number, dz: number): void {
    if (!this._dragGroup) return
    const lift = this.site.show ? this.site.groundThick / 1000 : 0
    this._dragGroup.position.set(dx, lift, dz)
    if (this.sun) this.sun.shadow.needsUpdate = true // bóng kéo theo (depth-only LOD, cỏ ko cast → rẻ)
  }

  // Buông/huỷ kéo: dọn _dragGroup + full rebuild merge commit (shape kéo về buildingGroup tại pos mới + pick đủ).
  private _endInstDragSplit(): void {
    this._clearDragGroup()
    this._dragInstId = null
    this._buildScene() // commit: history + autosave + _renderScene full (merge lại, pick đủ)
  }

  // Dispose geometry/material của _dragGroup (KHÔNG dispose wallMats cache — shared). Giữ group rỗng để tái dùng.
  private _clearDragGroup(): void {
    for (const g of this._dragGeos) g.dispose()
    for (const m of this._dragMats) m.dispose()
    this._dragGeos = []
    this._dragMats = []
    this._dragGroup?.clear()
  }

  // Kéo-cả-nhà (1 instance) LIVE: DỜI buildingGroup + pickGroup theo Δ mét — KHÔNG rebuild geometry.
  // Toạ độ posX/posZ bake-vào-vertex nên lúc dựng group ở (0,lift,0); kéo = đặt offset (dx,lift,dz) →
  // nhà trượt trên nền, pick-box theo cùng → pick vẫn khớp. dragEnd → _buildScene bake pos mới + _renderSite
  // reset offset về 0 (toạ độ tuyệt đối). Chi phí = set 3 số/lần → mượt bất kể nhà phức tạp. Tint giữ nguyên
  // (đã nhuốm lúc bật Move); cỏ/lưới/bóng hoãn tới commit (giống live-drag thường). [[KI-005]]
  private _translateBuildingLive(dx: number, dz: number): void {
    const lift = this.site.show ? this.site.groundThick / 1000 : 0
    this.buildingGroup.position.set(dx, lift, dz)
    this.pickGroup.position.set(dx, lift, dz)
    if (this.sun) this.sun.shadow.needsUpdate = true // bóng theo nhà lúc kéo (shadow pass depth-only, rẻ)
  }

  // Host cho HighlightOverlay: scene + 3 locator (dùng chung build/paint, nên ở lại Lab).
  private _highlightHost(): HighlightHost {
    return {
      scene: this.scene,
      locateInst: (id) => this._locateInst(id),
      instWallBase: (inst, fi) => this._instWallBase(inst, fi),
    }
  }

  // Gỡ gui nhà + panel Ground (dùng chung dispose & _rebuildGUI). Drawer SHELL + 🧪 Lab float giữ nguyên
  // (Lab persistent, tách riêng → preview KHÔNG dispose/tạo-lại mỗi rebuild = hết churn + độc lập scene).
  private _teardownPanels(): void {
    this._siteDispose?.() // gỡ tab CON panel Ground: outer (Ground|Fence|Tree|Water) + Water domain (Pl/Pd/Pe)
    this._siteDispose = null
    this._siteNavigate = null // panel cũ gỡ → bỏ ref navigate (gắn lại ở _buildLeftTools kế tiếp)
    this._siteNavigateFence = null
    this._siteNavigateLayer = null
    // tab con cỏ (Lá đơn|Bụi cỏ + Số đo|Độ cong|Bóng đổ) + Garden Tabs do site.dispose() lo; Lab panel = preview-only (no Tabs)
    this.drawerTabs?.dispose() // gỡ tab bar drawer (KHÔNG đụng panel — caller sở hữu)
    this.drawerTabs = null
    for (const p of this.drawerPanels) p.remove() // Ground (con trực tiếp drawerBody; Lab ở float riêng)
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

  // 4 callback quản tầng cho GUI ctx (gom 1 spread → giữ _makeGuiCtx dưới Rule-50, như _gridGroupCtx).
  private _floorCtx(): Pick<
    APGuiCtx,
    'removeFloor' | 'addFloor' | 'isFloorHidden' | 'setFloorHidden'
  > {
    return {
      removeFloor: (id) => this._removeFloor(id),
      addFloor: () => this._addFloor(),
      isFloorHidden: (id) => this._hiddenFloors.has(id),
      setFloorHidden: (id, hidden) => this._setFloorHidden(id, hidden),
    }
  }

  private _addFloor(): void {
    this.state.floors.push(mkFloor())
    this._rebuildGUI()
    this._buildScene()
  }

  private _removeFloor(id: string): void {
    if (this.state.floors.length <= 1) return
    this.state.floors = this.state.floors.filter((f) => f.id !== id)
    this._hiddenFloors.delete(id) // dọn cờ ẩn của tầng đã xoá
    this._rebuildGUI()
    this._buildScene()
  }

  // 🙈 Ẩn/hiện 1 tầng (transient, KHÔNG persist): re-render geometry (tầng ẩn bỏ dựng, giữ stacking) —
  // KHÔNG history, KHÔNG rebuild GUI (giữ trạng thái panel + checkbox tự cập nhật). Để xây tầng dưới khỏi bị che.
  private _setFloorHidden(id: string, hidden: boolean): void {
    if (hidden) this._hiddenFloors.add(id)
    else this._hiddenFloors.delete(id)
    this._renderScene()
  }

  private _onDimChange(inst: ShapeInstance): void {
    if (!inst.shapeKey) return
    const config = SHAPE_CONFIGS[inst.shapeKey]
    const nBefore = inst.segments.length
    inst.segments = config.toSegments(inst.dims, inst.segments)
    // round: slider Sides đổi SỐ tường → tab Walls phải dựng lại (chỉ khi commit — live giữ GUI
    // nguyên kẻo destroy controller đang kéo)
    if (inst.segments.length !== nBefore) this._rebuildGUI()
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

  // Khối shape KHÁC trên CÙNG tầng với `id` (cho Ctrl-snap nam-châm). [] nếu không tìm thấy / 1 mình.
  private _siblingInstances(id: string): ShapeInstance[] {
    const loc = this._locateInst(id)
    if (!loc) return []
    return this.state.floors[loc.fi].instances.filter((i) => i.id !== id)
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
    this.shapeSel?.refresh() // viền nhóm bám theo vị trí mới sau commit (kéo nhóm / chỉnh pos qua GUI)
  }

  // LIVE: kéo slider → dựng lại geometry NGAY để xem trực tiếp, gộp ≤1 lần/frame qua rAF. KHÔNG
  // history/persist (việc đó để _buildScene lúc buông chuột làm 1 lần). _prevState giữ nguyên =
  // trạng thái trước drag → undo sau khi commit revert đúng cả cú kéo.
  private _buildSceneLive(): void {
    if (this._rafBuild) return
    this._rafBuild = requestAnimationFrame(() => {
      this._rafBuild = 0
      this._liveRebuild = true // kéo nhà → cỏ hoãn rải lại (chỉ exclude đổi); buông tay = _buildScene commit
      this._renderScene()
      this._liveRebuild = false
    })
  }

  // Dựng lại geometry tường/structure/mái thuần — KHÔNG đụng history/persist. Tách khỏi _buildScene
  // để live-drag tái dùng (render-only) mà không spam undo/localStorage.
  private _renderScene(): void {
    this._clearBuilding()
    // Dựng walls+structure+roof+paint qua renderer CHUNG ở lõi (building-kit/BuildingFromState). Trả
    // Placement[] (toạ độ pick-box) → editor tự gắn lớp pick vô hình (brush/Move). Renderer headless,
    // KHÔNG đụng pick/chrome/sun.
    const placements = renderBuildingState(
      this.state,
      {
        wallCache: this.wallMats,
        group: this.buildingGroup,
        geos: this.buildingGeos,
        mats: this.buildingMats,
        brick3d: this.brick3dWalls,
        wood: this.woodWalls,
        strip: this.stripWalls,
        slabTexMat: this._slabTexMatForBuild(), // 🪵 sàn walnut (chưa load → undefined = bê tông tạm)
        foundWoodMat: this._foundWoodMatForBuild(), // 🪵 gỗ deck móng + slab planks (Wooden Planks)
        underWoodMat: this._underWoodMatForBuild(), // 🪵 gỗ khung-dưới (Old Plywood, tách deck)
        underBarkMat: this._underBarkMatForBuild(), // 🌳 vỏ cây khung-dưới (Tree Bark, tuỳ chọn 2)
        groundDrops: this._groundDropsForBuild(), // 🌊 lòng hồ → cột chống móng đâm sâu tới đáy
      },
      this.moveMode, // LOD tường phẳng KHI ở Move mode → tintable + rẻ khi kéo (brick là thủ phạm CPU); tắt = gạch
      this._hiddenFloors, // 🙈 tầng ẩn → bỏ dựng mesh/pick (giữ chiều cao stacking)
      undefined, // filter: dựng tất cả
      false // 🪵 GIỮ cột móng dù Move mode (xem tĩnh → định vị nhà trên hồ); chỉ element-drag mới ép concrete
    )
    for (const p of placements) this._addPick(p.cx, p.cy, p.cz, p.sx, p.sy, p.sz, p.rotDeg, p.ud)
    this._setBuildingTint(this.moveMode) // bật Move → nhuốm xanh CẢ NHÀ ngay (nghệ); tắt Move → màu gốc
    this._renderSite() // 🌳 nền + rào lô + đôn building lên mặt nền (theo site.show)
    this._refreshSiteReadout?.() // footprint nhà đổi → cập nhật phủ% trong bảng số liệu
    if (this.sun) this.sun.shadow.needsUpdate = true // geometry đổi → shadow map vẽ lại 1 lần
    this.heightGridSystem?.update(this.buildingGroup)
  }

  // Lúc kéo (live): nhuốm CẢ NHÀ về tông "blueprint" xanh (blend 55% màu gốc → xanh) → mất-vân-gạch (LOD
  // phẳng) hoà vào tông đồng nhất, mắt không bắt được. OPAQUE thuần (chỉ đổi material.color = uniform, KHÔNG
  // transparent-pass → KHÔNG tốn fps như "bóng ma"). LƯU màu gốc rồi KHÔI PHỤC khi buông (mọi part = MeshToon
  // có .color; material tường CACHED nên phải reset đúng gốc). Đổi .color KHÔNG cần needsUpdate/recompile.
  private _setBuildingTint(on: boolean): void {
    const blue = on ? new THREE.Color(0x9ec5e0) : null
    this.buildingGroup.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return
      const mats = Array.isArray(o.material) ? o.material : [o.material]
      for (const m of mats) {
        const c = m as THREE.Material & { color?: THREE.Color; _tintOrig?: number }
        if (!c.color) continue
        if (blue) {
          if (c._tintOrig === undefined) c._tintOrig = c.color.getHex()
          c.color.setHex(c._tintOrig).lerp(blue, 0.55)
        } else if (c._tintOrig !== undefined) {
          c.color.setHex(c._tintOrig) // khôi phục màu gốc khi buông
          c._tintOrig = undefined
        }
      }
    })
  }

  // 🌳 Dựng lại nền + rào lô vào siteGroup; đôn building + pick lên mặt nền khi show (foundation
  // nằm trên nền, không cắm xuyên). show=false → lift 0 (building về y=0). Lõi headless site-kit.
  private _renderSite(): void {
    // SITE (nền/nước/rào) phụ thuộc CHỈ `site`, KHÔNG phụ thuộc nhà → kéo nhà thì `site` KHÔNG đổi → bỏ qua
    // dựng lại (né tái tạo reflector RTT mỗi frame = leak đỏ + tụt fps). Cỏ (phụ thuộc footprint) + lift
    // xử lý MỖI lần (rẻ). grass3d BỎ khỏi sig → kéo slider cỏ không kéo theo rebuild nước.
    const exclude = siteGrassExclude(this.site, this._foundationRects())
    // siteSig BỎ grass3d LẪN fence (cả 2 quản group riêng + dirty-check) → kéo slider cỏ/rào/cổng KHÔNG kéo
    // theo rebuild nước-RTT (đắt + leak). Chỉ đổi nền/nước/lô mới rebuild site nặng.
    const siteSig = this.site.show ? JSON.stringify({ ...this.site, grass3d: 0, fence: 0 }) : 'off'
    if (siteSig !== this._siteSig) {
      this._siteSig = siteSig
      this._rebuildSite() // nặng: nền/nước(reflector) + handle/lưới/nền-editor (rào tách ra _syncFence)
      this._applySunToWater() // surface mới → hướng glint theo sun hiện tại
    }
    this._syncFence() // 🧱 dựng/giữ rào theo _fenceSig (kéo slider rào chỉ dựng lại rào, không đụng nước)
    this._syncGrass(exclude) // dựng/giữ cỏ theo chữ ký structural (defer lúc kéo) → set this._siteGrass
    this._applySunToGrass() // _siteGrass (mới hoặc cũ) → set hướng vệt theo sun hiện tại
    const lift = this.site.show ? this.site.groundThick / 1000 : 0
    // .set(0,lift,0): vừa đôn theo nền VỪA xoá offset .x/.z transient của fast-drag (kéo-cả-nhà dời group).
    // Toạ độ nhà bake-tuyệt-đối → sau rebuild offset PHẢI về 0 kẻo commit cộng dồn dx/dz (nhà nhảy gấp đôi).
    this.buildingGroup.position.set(0, lift, 0)
    this.pickGroup.position.set(0, lift, 0) // giữ pick-box khớp building đã đôn + reset offset fast-drag
  }

  // Dựng lại NỀN/NƯỚC/RÀO + handle/lưới/nền-editor (phần NẶNG: gồm reflector RTT + recompile NodeMaterial).
  // CHỈ gọi khi site state đổi (siteSig) — KHÔNG mỗi frame kéo nhà. Cỏ build riêng (skipGrass) ở _renderSite.
  private _rebuildSite(): void {
    this._clearSite()
    const ctx: SiteRenderCtx = {
      group: this.siteGroup,
      geos: this.siteGeos,
      mats: this.siteMats,
      shaders: this.siteShaders,
    }
    const h = renderSiteState(this.site, ctx, this._siteTexOpts())
    this._siteGroundMesh = h.ground // 🏔️ giữ ref nền base → _applyTerrainLive swap geometry-only (né water-RTT)
    // zip cfg↔surf: h.waters = [hồ LÕM (renderWaters) ... rồi VŨNG phẳng (renderPuddles)] — ĐÚNG thứ tự lõi
    // dựng → ghép lại để drag/tune/handle nhắm đúng instance (gồm cả puddle).
    const wcfgs = [...renderWaters(this.site), ...renderPuddles(this.site)]
    this._siteWaters = h.waters.map((surf, i) => ({ cfg: wcfgs[i], surf }))
    for (const x of this._siteWaters) x.surf.setCamera(this.camera) // dispose() tự free RTT reflector (né leak)
    // 💧 Mặt nước sang layer riêng + reflector LOẠI layer đó khỏi RTT (virtualCamera=camera.clone() copy layers
    // → phải disable mỗi frame trong setTime) → 2+ hồ KHÔNG render-lẫn-nhau → hết đơ gương (_inReflector). KI-012.
    for (const x of this._siteWaters) {
      x.surf.getMesh().layers.set(WATER_REFLECT_LAYER)
      x.surf.excludeReflectionLayer(WATER_REFLECT_LAYER)
    }
    // active = pool tab đang chọn nếu còn render; không thì pool đầu (kể cả tắt, để GUI bind) → null nếu 0 pool.
    if (!this._activeWater || !this.site.waters.includes(this._activeWater)) {
      this._activeWater = this.site.waters.find((w) => w.kind === 'pool') ?? null
    }
    this.waterTool?.rebuildHandles() // 💧 handle đỉnh theo hồ active mới (free + moveMode)
    this._rebuildEditorGround() // 🕳️ khoét lỗ hồ vào nền backdrop editor → không che đáy basin
    this._rebuildGrid() // 🕳️ khoét lưới y=0 theo bbox hồ → hết sọc lưới đè lên lòng hồ
    this._applyCutVisibility() // 🟫 cut mới dựng = ẩn; hiện lại mảng của layer đang active (giữ qua rebuild)
    this.groundTool?.rebuildHandles() // 🟫 tay-cầm theo layer active mới (mesh mới → cao độ đúng) (free + moveMode)
    this.moundTool?.rebuildHandles() // ⛰️ handle gò theo mounds mới (thêm/xoá/đổi qua GUI → vẽ lại) (terrain + moveMode)
  }

  // Gom opts texture cho renderSiteState: ground 'grass-tex' (PhotoGround) + fence wall 'cinder'/'stone'
  // (TexturedSurface). Mỗi loại: maps đã-load đúng → bơm; chưa load (hoặc đổi kind) → kick-off ASYNC + tạm
  // rơi màu phẳng (load xong tự re-render). Tách khỏi _rebuildSite cho gọn (complexity).
  private _siteTexOpts(): SiteRenderOpts {
    const opts: SiteRenderOpts = { skipGrass: true, skipFence: true } // cỏ + rào do _syncGrass/_syncFence quản riêng
    opts.buildingFootprint = this._foundationRects() // 🏔️ terrain giữ PHẲNG pad dưới nhà (= rect cỏ-né, đã +overhang)
    const byKey: NonNullable<SiteRenderOpts['groundMatByKey']> = {}
    for (const key of this._usedGroundTexKeys()) {
      const photo = this._groundMatFor(key) // material cache (build từ maps đã load) hoặc null (đang load)
      if (photo) byKey[key] = photo.getMaterial()
    }
    if (Object.keys(byKey).length > 0) opts.groundMatByKey = byKey
    this._pruneZoneMix() // 🎨 dọn cache mix có params đã rời state (zone xóa / mix tắt / hồ-rào xóa)
    opts.groundMixMat = (layer) => this._groundMixFor(layer) // 🎨 zone bật mix → material PhotoGroundMix
    opts.groundBaseMixMat = () => this._groundMixFor('base') // 🎨 G0 nền lô bật mix (site.groundMix)
    opts.waterMixMat = (w, face) => this._groundMixFor({ water: w, face }) // 🎨 đáy ('xz') / vách ('uv') hồ
    opts.fenceMixMat = (f) => this._groundMixFor({ fence: f }) // 🎨 mặt tường rào (mapping 'wall', không cọ)
    // 🪨 Material đá RÀO/VIỀN hồ (TexturedSurface) theo borderMaterial dùng → inject; chưa load → kick-off async.
    const borderByKey: NonNullable<SiteRenderOpts['borderMatByKey']> = {}
    for (const key of this._usedBorderTexKeys()) {
      const cached = this._borderTex[key]
      if (cached) borderByKey[key] = cached.surf.getMaterial()
      else this._ensureBorderTex(key) // load xong → _siteSig='' + re-render (rào rơi màu phẳng tạm)
    }
    if (Object.keys(borderByKey).length > 0) opts.borderMatByKey = borderByKey
    // Fence material KHÔNG resolve ở đây nữa (đa-lớp → mỗi lớp 1 kind riêng) — _syncFence bơm per-fence.
    return opts
  }

  // 🪨 Key đá đang dùng (unique) = hồ pool/pond borderEnabled + borderMaterial≠none ∪ path-zone material≠none.
  // Path-zone dùng CHUNG cache/texture đá với border hồ (triplanar world-space) → 1 set, 1 material/key.
  private _usedBorderTexKeys(): BorderTexKey[] {
    const keys = new Set<BorderTexKey>()
    for (const w of renderWaters(this.site)) {
      if (w.borderEnabled && w.borderMaterial !== 'none') keys.add(w.borderMaterial)
    }
    this._collectPathTexKeys(keys) // 🪨 path-zone (zoneKind='path') material → cùng cache đá border hồ
    return [...keys]
  }

  // 🪨🧱 Gom key texture đá của path/paving/wall-zone (material≠none) — cùng cache đá border hồ.
  // Tách giữ complexity ≤10 (mỗi loại 1 dòng, helper chung).
  private _collectPathTexKeys(keys: Set<BorderTexKey>): void {
    const add = (m: BorderTexKey | 'none' | undefined): void => {
      if (m && m !== 'none') keys.add(m)
    }
    for (const l of this.site.groundLayers ?? []) {
      if (l.zoneKind === 'path') add(l.path?.material)
      if (l.zoneKind === 'paving') add(l.paving?.material) // 🧱 sân gạch
      if (l.zoneKind === 'wall') add(l.wall?.material) // 🧱 tường cong
    }
  }

  // 🪨 Load texture set đá border theo key 1 lần, ASYNC → build TexturedSurface (triplanar, tile BORDER_TILE) +
  // cache. Xong → invalidate siteSig + re-render (rào hiện đá thay màu phẳng tạm). Lỗi → giữ màu phẳng.
  private _ensureBorderTex(key: BorderTexKey): void {
    if (this._borderTex[key] || this._borderTexLoading[key]) return
    this._borderTexLoading[key] = true
    loadSurfaceTextureSet(BORDER_TEX_SPEC[key], this.renderer)
      .then((maps) => {
        const surf = new TexturedSurface({ maps, tileSizeMeters: BORDER_TILE })
        this._borderTex[key] = { maps, surf }
        this._borderTexLoading[key] = false
        this._siteSig = '' // ép _rebuildSite với material đá mới
        this._renderSite()
      })
      .catch((e: unknown) => {
        this._borderTexLoading[key] = false
        console.warn('[ArchPlanLab] load border rock texture lỗi — giữ màu phẳng:', e)
      })
  }

  // PhotoGround cached cho 1 key: có sẵn → trả; có MAPS (đã load) → build PhotoGround (tile theo GROUND_TEX_SPEC)
  // + cache; chưa load maps → kick-off ASYNC + null (ground rơi màu phẳng tạm, load xong re-render). Sống lab-lifetime.
  private _groundMatFor(key: GroundMaterialKey): PhotoGround | null {
    const existing = this._groundMat[key]
    if (existing) return existing
    const maps = this._groundTex[key]
    if (!maps) {
      this._ensureGroundTex(key) // kick-off load maps → xong: _siteSig='' + re-render
      return null
    }
    const photo = new PhotoGround({
      maps,
      tileSizeMeters: GROUND_TEX_SPEC[key]?.tile ?? 2,
      detail: this.site.terrain?.detail ?? 0, // 🏔️ Phase 4 micro-relief (live qua _applyTerrainDetail)
    })
    this._groundMat[key] = photo
    return photo
  }

  // 🏔️ Phase 4: đẩy terrain.detail vào MỌI PhotoGround site-ground đã cache (uniform live, KHÔNG recompile/
  // rebuild — vượt ranh per-key-cache). Gọi từ slider Detail (live) + sau load. Editor-ground share cùng cache.
  private _applyTerrainDetail(): void {
    const d = this.site.terrain?.detail ?? 0
    for (const photo of Object.values(this._groundMat)) photo?.setDetail(d)
  }

  // 🎨 Gom maps đã-load cho base + slots của 1 mix — key màu phẳng hoặc maps chưa load (kick-off async) → null.
  // Tách khỏi _groundMixFor (complexity ≤10).
  private _mixMapSets(keys: GroundMaterialKey[]): PhotoGroundMaps[] | null {
    const sets: PhotoGroundMaps[] = []
    for (const k of keys) {
      if (!isGroundTexKey(k)) return null // key màu phẳng (soil/gravel…) — mix chỉ nhận texture
      const maps = this._groundTex[k]
      if (!maps) {
        this._ensureGroundTex(k) // load xong: _siteSig='' + re-render → lượt sau đủ maps
        return null
      }
      sets.push(maps)
    }
    return sets
  }

  // 🖌 Params mix của 1 target — zone: layer.mix · 'base': site.groundMix · hồ: floorMix/wallMix · rào: f.mix.
  // undefined = mix tắt.
  private _mixParamsOf(target: MixPaintTarget): GroundMixParams | undefined {
    if (target === 'base') return this.site.groundMix
    if ('water' in target)
      return target.face === 'floor' ? target.water.floorMix : target.water.wallMix
    if ('fence' in target) return target.fence.mix
    return target.mix
  }

  // 🖌 Entry cache mix của target (key = params object). undefined = mix tắt / chưa dựng.
  private _mixHitOf(
    target: MixPaintTarget
  ): { gmix: PhotoGroundMix; sig: string; pm: PaintMask } | undefined {
    const p = this._mixParamsOf(target)
    return p ? this._zoneMix.get(p) : undefined
  }

  // 🎨 Hệ tọa độ trải mix của target: mặt NẰM (zone/'base'/đáy hồ) = 'xz' world; vách hồ = 'uv' (chu-vi×cao
  // mét baked); tường rào = 'wall' (planar đứng theo normal — KHÔNG cọ vẽ).
  private _mixSpaceOf(target: MixPaintTarget): 'xz' | 'uv' | 'wall' {
    if (typeof target === 'string') return 'xz'
    if ('water' in target) return target.face === 'wall' ? 'uv' : 'xz'
    if ('fence' in target) return 'wall'
    return 'xz'
  }

  // 🎨 Material MIX cho 1 target (zone Z1+ · 'base' · đáy/vách hồ · tường rào): maps đủ (base + slots, đều
  // phải key TEXTURE) → PhotoGroundMix cache theo params; thiếu maps → kick-off load + null (rơi material đơn tạm).
  private _groundMixFor(target: MixPaintTarget): THREE.Material | null {
    const mix = this._mixParamsOf(target)
    if (!mix) return null
    const keys = [mix.base, ...mix.slots.map((s) => s.key)]
    const sets = this._mixMapSets(keys)
    if (!sets) return null
    // Stage 3: sig keys texture + 🧱 rule per-slot (rule bake vào graph — đổi = structural như đổi texture);
    // bias/seed/gravity/paint-rect/wall-range = uniform live → kéo slider KHÔNG dựng lại material.
    const sig = JSON.stringify([keys, mix.slots.map((s) => s.rule ?? null)])
    let hit = this._zoneMix.get(mix)
    if (!hit || hit.sig !== sig) hit = this._buildMixEntry(target, mix, sets, sig, hit)
    this._applyMixUniforms(hit.gmix, mix)
    this._applyMixPaintRect(hit.gmix, target)
    this._applyMixWallRange(hit.gmix, target) // 🧱 dải cao tường cho rule trọng lực (mặt đứng)
    return hit.gmix.getMaterial()
  }

  // Dựng entry cache mix mới (texture/slot đổi hoặc lần đầu) — pm SỐNG qua rebuild (đổi texture không mất nét
  // vẽ). Tách khỏi _groundMixFor (complexity ≤10).
  private _buildMixEntry(
    target: MixPaintTarget,
    mix: GroundMixParams,
    sets: PhotoGroundMaps[],
    sig: string,
    old: { gmix: PhotoGroundMix; sig: string; pm: PaintMask } | undefined
  ): { gmix: PhotoGroundMix; sig: string; pm: PaintMask } {
    const pm = old?.pm ?? this._makeZonePaint(mix)
    old?.gmix.dispose()
    const space = this._mixSpaceOf(target)
    const gmix = new PhotoGroundMix({
      base: sets[0],
      slots: mix.slots.map((s, i) => ({
        maps: sets[i + 1],
        bias: s.bias,
        seed: s.seed,
        rule: s.rule, // 🧱 rule trọng lực per-slot (chỉ ăn mặt đứng)
      })),
      paint: pm.texture,
      tileSizeMeters: GROUND_TEX_SPEC[mix.base]?.tile ?? 2,
      mapping: space, // stage 4: 'xz' nằm · 'uv' vách hồ · 'wall' tường rào
    })
    if (space === 'uv') gmix.getMaterial().side = THREE.DoubleSide // vách hồ nhìn cả 2 phía (như basinMaterial)
    const hit = { gmix, sig, pm }
    this._zoneMix.set(mix, hit)
    return hit
  }

  // 🖌 PaintMask 128² cho 1 target mới vào cache — có base64 trong state (load/reload) → nạp lại nét vẽ.
  private _makeZonePaint(mix: GroundMixParams): PaintMask {
    const pm = new PaintMask(128) // 128² đủ vạt/lối mòn per-target, base64 ~87KB (Lab giữ 256² cho sàn 12m)
    if (mix.paint) pm.loadBase64(mix.paint)
    return pm
  }

  // Đẩy bộ uniform LIVE của mix vào material (mỗi lần build site / kéo slider — rẻ, không recompile).
  private _applyMixUniforms(g: PhotoGroundMix, m: NonNullable<GroundLayer['mix']>): void {
    g.set('maskScale', m.maskScale)
    g.set('maskSoft', m.maskSoft)
    g.set('heightK', m.heightK)
    g.set('macro', m.macro)
    g.set('tint', m.tint)
    g.set('bomb', m.bomb)
    g.set('rotFree', m.rotFree)
    g.set('seed', m.seed)
    g.set('scaleJit', m.scaleJit)
    g.set('margin', m.margin)
    g.set('farOn', m.farOn)
    g.set('farRange', m.farRange)
    g.set('gravity', m.gravity) // 🧱 cường độ rule trọng lực (uniform live — mặt nằm không có rule → no-op)
    m.slots.forEach((s, i) => g.setSlot(i, s.bias, s.seed)) // 🖌 stage 3: per-slot uniform (Ngưỡng live)
  }

  // 🧱 Dải cao tường cho rule trọng lực: vách hồ = (yBot, depth) — khớp _mixWaterRect; rào = (mặt nền, height).
  // Mặt nằm ('xz') không có rule → bỏ qua.
  private _applyMixWallRange(g: PhotoGroundMix, target: MixPaintTarget): void {
    if (typeof target === 'string') return
    if ('water' in target && target.face === 'wall') {
      const rimY = this.site.groundThick / 1000
      g.setWallRange(rimY - target.water.depthY / 1000, target.water.depthY / 1000)
    } else if ('fence' in target) {
      g.setWallRange(this.site.groundThick / 1000, target.fence.height / 1000)
    }
  }

  // 🖌 BBox world-XZ của zone (m) — rect uv cho mask vẽ: shader + stamp dùng CÙNG công thức (world−o)/s.
  private _mixZoneRect(layer: GroundLayer): { ox: number; oz: number; sx: number; sz: number } {
    const local = shapeToLocalPolygon({
      shape: layer.shape ?? 'rect',
      width: layer.length,
      depth: layer.width,
      points: layer.points ?? [],
    })
    let minX = Infinity
    let maxX = -Infinity
    let minZ = Infinity
    let maxZ = -Infinity
    for (const p of local) {
      minX = Math.min(minX, p.x)
      maxX = Math.max(maxX, p.x)
      minZ = Math.min(minZ, p.z)
      maxZ = Math.max(maxZ, p.z)
    }
    return {
      ox: layer.offsetX / 1000 + minX,
      oz: layer.offsetZ / 1000 + minZ,
      sx: maxX - minX,
      sz: maxZ - minZ,
    }
  }

  // 🖌 Rect mask của hồ: floor = bbox world-XZ outline; wall = KHÔNG-GIAN UV mét (u: 0..chu-vi, v: yBot..rim —
  // khớp uv baked basinWallsGeometry, stamp dùng isect.uv cùng hệ).
  private _mixWaterRect(t: { water: WaterConfig; face: 'floor' | 'wall' }): {
    ox: number
    oz: number
    sx: number
    sz: number
  } {
    const pts = pondWorldXZ(t.water)
    if (t.face === 'floor') {
      let minX = Infinity
      let maxX = -Infinity
      let minZ = Infinity
      let maxZ = -Infinity
      for (const p of pts) {
        minX = Math.min(minX, p.x)
        maxX = Math.max(maxX, p.x)
        minZ = Math.min(minZ, p.z)
        maxZ = Math.max(maxZ, p.z)
      }
      return { ox: minX, oz: minZ, sx: maxX - minX, sz: maxZ - minZ }
    }
    let perim = 0
    for (let i = 0; i < pts.length; i++) {
      const b = pts[(i + 1) % pts.length]
      perim += Math.hypot(b.x - pts[i].x, b.z - pts[i].z)
    }
    const rimY = this.site.groundThick / 1000 // khớp buildBasin (đỉnh vách = mặt nền)
    const yBot = rimY - t.water.depthY / 1000
    return { ox: 0, oz: yBot, sx: perim, sz: rimY - yBot }
  }

  // 🖌 Rect mask của target: zone = bbox shape; 'base' = NGUYÊN LÔ; hồ = _mixWaterRect; rào = đơn vị (không
  // cọ vẽ — mapping 'wall' bỏ qua paint, rect chỉ để setPaintRect không chia 0).
  private _mixRectOf(target: MixPaintTarget): { ox: number; oz: number; sx: number; sz: number } {
    if (target === 'base') {
      const sx = this.site.lotWidth / 1000
      const sz = this.site.lotDepth / 1000
      return { ox: -sx / 2, oz: -sz / 2, sx, sz }
    }
    if ('water' in target) return this._mixWaterRect(target)
    if ('fence' in target) return { ox: 0, oz: 0, sx: 1, sz: 1 }
    return this._mixZoneRect(target)
  }

  private _applyMixPaintRect(g: PhotoGroundMix, target: MixPaintTarget): void {
    const r = this._mixRectOf(target)
    g.setPaintRect(r.ox, r.oz, r.sx, r.sz) // uniform live — zone dời/resize/lô đổi cỡ chỉ set lại, không recompile
  }

  // 🎨 Tập GroundMixParams đang SỐNG trong state (mọi nguồn: G0 + zones + hồ floor/wall + rào) — chuẩn prune.
  private _liveMixParams(): Set<GroundMixParams> {
    const live = new Set<GroundMixParams>()
    if (this.site.groundMix) live.add(this.site.groundMix)
    for (const l of this.site.groundLayers ?? []) if (l.mix) live.add(l.mix)
    for (const w of this.site.waters) {
      if (w.floorMix) live.add(w.floorMix)
      if (w.wallMix) live.add(w.wallMix)
    }
    for (const f of this.site.fences) if (f.mix) live.add(f.mix)
    return live
  }

  // Dọn cache mix có params đã RỜI state (zone xóa / mix tắt / hồ-rào xóa) — gọi mỗi lần gom opts.
  // Đang vẽ đúng target vừa rời → thoát mode (UI bỏ highlight qua sync).
  private _pruneZoneMix(): void {
    const live = this._liveMixParams()
    for (const k of [...this._zoneMix.keys()]) {
      if (live.has(k)) continue
      const v = this._zoneMix.get(k)
      v?.gmix.dispose()
      v?.pm.dispose() // 🖌 DataTexture mask vẽ của target xóa
      this._zoneMix.delete(k)
    }
    const cur = this._mixPaint && this._mixParamsOf(this._mixPaint.target)
    if (this._mixPaint && (!cur || !live.has(cur))) this._mixPaintOff()
  }

  // ── 🖌 VẼ MASK MIX per-zone + G0 base (stage 3) — mode + cọ + persist ────────────────────────────────

  // Bật/tắt mode vẽ: target ≠ null = vẽ slot đó (orbit khóa, tắt 3 mode kia); null = thoát (orbit lại).
  private _setMixPaint(target: MixPaintTarget | null, slot: number): void {
    if (target) {
      this._setPickMode(false)
      this._setMoveMode(false)
      this._setPaintMode(false) // các setter này bật lại orbit — khóa lại ngay dưới
    }
    this._mixPaint = target ? { target, slot } : null
    this._mixPainting = false
    if (this.controls) this.controls.enabled = !target
  }

  // Thoát mode vẽ từ NGOÀI (Move/Pick/Paint bật, zone xóa) — báo UI bỏ highlight 🖌. Không đụng orbit
  // (caller tự quản controls.enabled theo mode của nó).
  private _mixPaintOff(): void {
    if (!this._mixPaint) return
    this._mixPaint = null
    this._mixPainting = false
    this._syncMixPaint?.()
  }

  // 🖌 Mesh có thuộc target đang vẽ không (raycast filter): 'base' = isBaseGround · zone = groundLayerIdx ·
  // hồ = ref WaterConfig + face (addBasinMesh tag) · rào = false (mapping 'wall' không cọ vẽ).
  private _mixMeshMatch(t: MixPaintTarget, o: THREE.Object3D): boolean {
    if (t === 'base') return o.userData.isBaseGround === true
    if ('water' in t)
      return o.userData.waterMixRef === t.water && o.userData.waterMixFace === t.face
    if ('fence' in t) return false
    const idx = (this.site.groundLayers ?? []).indexOf(t)
    return o.userData.groundLayerIdx === idx
  }

  // 1 dấu cọ: raycast mesh ĐÚNG target đang vẽ → tọa độ theo SPACE ('xz' = world point · 'uv' = isect.uv mét
  // vách hồ) → normalize qua rect → stamp ellipse (bán kính m / size mỗi trục — không méo cọ).
  // Trượt ra ngoài target = không vẽ.
  private _mixStampAt(e: PointerEvent): void {
    const t = this._mixPaint
    const hit = t ? this._mixHitOf(t.target) : undefined
    if (!t || !hit) return
    this._ray.setFromCamera(this._ndc(e), this.camera)
    const isect = this._ray
      .intersectObjects(this.siteGroup.children, true)
      .find((h) => this._mixMeshMatch(t.target, h.object))
    if (!isect) return
    const sp = this._mixSpaceOf(t.target)
    if (sp === 'uv' && !isect.uv) return // vách thiếu uv (không xảy ra — basinWallsGeometry luôn bake)
    const cu = sp === 'uv' ? (isect.uv as THREE.Vector2).x : isect.point.x
    const cv = sp === 'uv' ? (isect.uv as THREE.Vector2).y : isect.point.z
    const r = this._mixRectOf(t.target)
    const b = this._mixBrush
    hit.pm.stamp(
      (cu - r.ox) / Math.max(1e-6, r.sx),
      (cv - r.oz) / Math.max(1e-6, r.sz),
      b.size / Math.max(1e-6, r.sx),
      b.size / Math.max(1e-6, r.sz),
      t.slot,
      b.erase
    )
  }

  // Buông nét cọ → serialize mask vào state (base64, null nếu trắng → bỏ field) + autosave (reload còn nét).
  private _commitMixPaint(): void {
    const t = this._mixPaint
    const hit = t ? this._mixHitOf(t.target) : undefined
    const mix = t ? this._mixParamsOf(t.target) : undefined
    if (!mix || !hit) return
    mix.paint = hit.pm.toBase64() ?? undefined
    this.store.autosave(this.state, this.site)
  }

  // Nút "Xóa nét" của board: xóa kênh slot trong mask target + persist ngay (texture live, không cần rebuild).
  private _clearMixPaint(target: MixPaintTarget, slot: number): void {
    const hit = this._mixHitOf(target)
    const mix = this._mixParamsOf(target)
    if (!hit || !mix) return
    hit.pm.clear(slot)
    mix.paint = hit.pm.toBase64() ?? undefined
    this.store.autosave(this.state, this.site)
  }

  // Kéo slider mix (Ngưỡng/Macro/…) → đẩy thẳng uniform vào material đang sống — KHÔNG rebuild site.
  private _tuneMixLive(target: MixPaintTarget): void {
    const hit = this._mixHitOf(target)
    const mix = this._mixParamsOf(target)
    if (hit && mix) this._applyMixUniforms(hit.gmix, mix)
  }

  // Tập key ground dùng TEXTURE (unique) = base ground + mọi TẦNG layer chồng (lọc isGroundTexKey).
  private _usedGroundTexKeys(): GroundMaterialKey[] {
    const keys = new Set<GroundMaterialKey>()
    if (isGroundTexKey(this.site.ground)) keys.add(this.site.ground)
    for (const l of this.site.groundLayers ?? []) {
      if (isGroundTexKey(l.material)) keys.add(l.material)
    }
    // 💧 Texture đáy/tường hồ (floor/wall = GroundMaterialKey) → load để inject groundMatByKey vào basinMaterial.
    for (const w of renderWaters(this.site)) {
      for (const m of [w.floorMaterial, w.wallMaterial]) {
        if (m !== 'none' && m !== 'tile' && isGroundTexKey(m)) keys.add(m)
      }
    }
    return [...keys]
  }

  // ⏳ Prefetch MỌI texture ground khả dụng (kick-off ASYNC; _ensureGroundTex tự guard trùng/đã-load). Gọi khi
  // user mousedown dropdown Surface → bấm key nào cũng đã sẵn (hoặc đang tải → badge hiện). Bounded: chỉ ground set.
  private _prefetchGroundTextures(): void {
    for (const key of Object.keys(GROUND_TEX_SPEC) as GroundMaterialKey[]) {
      if (key === 'thai-beach-sand-4k') continue // 4K ~27MB → KHÔNG prefetch (chỉ tải khi CHỌN); né kéo nặng lúc mở dropdown
      this._ensureGroundTex(key)
    }
  }

  // 🌱🏜️ Load texture set ground theo KEY (GROUND_TEX_SPEC) 1 lần/key, ASYNC. colorSpace theo PROTOCOL
  // (baseColor=srgb, normal/rough/ao=linear). Xong → cache[key] + invalidate siteSig + re-render (nền hiện
  // texture thay màu phẳng tạm). Guard _groundTexLoading[key] né load chồng. Lỗi → giữ fallback màu phẳng.
  private _ensureGroundTex(key: GroundMaterialKey): void {
    if (this._groundTex[key] || this._groundTexLoading[key]) return
    const entry = GROUND_TEX_SPEC[key]
    if (!entry) return
    this._groundTexLoading[key] = true
    loadSurfaceTextureSet(entry.spec, this.renderer)
      .then((maps) => {
        this._groundTex[key] = maps
        this._groundTexLoading[key] = false
        this._siteSig = '' // ép _rebuildSite chạy lại với texture đã có
        this._fenceSig = '' // 🎨 fence.mix chờ texture này → ép _syncFence dựng lại (mix hết null)
        this._renderSite()
        if (this.groundType === key) this._setGroundType(this.groundType) // 🌱 nền-editor đang dùng key này → re-apply texture
      })
      .catch((e: unknown) => {
        this._groundTexLoading[key] = false
        console.warn('[ArchPlanLab] load ground texture lỗi — giữ màu phẳng:', e)
      })
  }

  // 🪵 Material sàn 'walnut-tex' để bơm ctx.slabTexMat. Nhà KHÔNG dùng walnut → undefined (khỏi load). Dùng
  // nhưng CHƯA load → kick-off ASYNC + tạm undefined (bê tông tạm); load xong _renderScene lại. Material CACHE
  // (PhotoGround sống lab-lifetime) → KHÔNG recompile mỗi build/frame kéo (slab dựng lại mỗi edit).
  private _slabTexMatForBuild(): THREE.Material | undefined {
    if (!this._usesWalnutSlab()) return undefined
    if (this._slabTex) return this._slabTex.getMaterial()
    this._ensureSlabTex()
    return undefined
  }

  private _usesWalnutSlab(): boolean {
    return this.state.floors.some((f) =>
      f.instances.some((i) => i.structure.slabMaterial === 'walnut-tex')
    )
  }

  // 🪵 Load Walnut Veneer 1 lần → tạo PhotoGround (sàn NGANG, world-XZ UV; tile theo manifest ≈1m). KHÔNG có
  // AO map (scan thiếu) → spec bỏ ao. Xong → _renderScene lại (slab hiện texture thay bê tông tạm).
  private _ensureSlabTex(): void {
    if (this._slabTex || this._slabTexLoading) return
    this._slabTexLoading = true
    const spec: SurfaceTextureSpec = {
      baseColor: { url: walnutBaseColorUrl, colorSpace: 'srgb' },
      normal: { url: walnutNormalUrl, colorSpace: 'linear' },
      roughness: { url: walnutRoughnessUrl, colorSpace: 'linear' },
    }
    loadSurfaceTextureSet(spec, this.renderer)
      .then((maps) => {
        this._slabTexMaps = maps
        this._slabTex = new PhotoGround({ maps, tileSizeMeters: walnutManifest.tileSizeMeters })
        this._slabTexLoading = false
        this._renderScene() // rebuild với material sàn đã có
      })
      .catch((e: unknown) => {
        this._slabTexLoading = false
        console.warn('[ArchPlanLab] load slab texture (walnut) lỗi — giữ bê tông:', e)
      })
  }

  // 🌊 Lòng hồ pool/pond (có basin) → GroundDrop[] cho building-kit: cột chống móng (wood-deck post /
  // stone-pillar trụ giữa) nằm trên đâm sâu tới đáy hồ. World mét. CHỈ khi site.show (building được đôn lên
  // rim; tắt → không basin → không tụt). dropY = depthY/1000 + 2cm cắm XUYÊN đáy basin (né z-fight mặt đáy
  // coplanar). pondWorldXZ lo cả rect lẫn free.
  private _groundDropsForBuild(): GroundDrop[] {
    if (!this.site.show) return []
    return renderWaters(this.site).map((w) => ({
      poly: pondWorldXZ(w),
      dropY: w.depthY / 1000 + 0.02,
    }))
  }

  // 🪵 Material gỗ móng 'wood-tex' (Wooden Planks, TexturedSurface triplanar) bơm ctx.foundWoodMat. Không nhà
  // nào dùng → undefined (khỏi load). Dùng nhưng CHƯA load → kick-off + tạm undefined (MeshToon tạm). Cache 1 lần.
  private _foundWoodMatForBuild(): THREE.Material | undefined {
    if (!this._usesFoundWoodTex()) return undefined
    if (this._foundWoodTex) return this._foundWoodTex.getMaterial()
    this._ensureFoundWoodTex()
    return undefined
  }

  // Wooden Planks dùng cho DECK móng ('wood-tex') HOẶC slab ('planks-tex') — gom chung 1 material instance.
  private _usesFoundWoodTex(): boolean {
    return this.state.floors.some((f) =>
      f.instances.some(
        (i) => i.structure.foundMaterial === 'wood-tex' || i.structure.slabMaterial === 'planks-tex'
      )
    )
  }

  // 🪵 Load Wooden Planks 1 lần → TexturedSurface (triplanar, tile theo manifest). Xong → _renderScene (móng
  // gỗ hiện texture thay MeshToon tạm). Guard _foundWoodLoading né load chồng. Lỗi → giữ MeshToon phẳng.
  private _ensureFoundWoodTex(): void {
    if (this._foundWoodTex || this._foundWoodLoading) return
    this._foundWoodLoading = true
    const spec: SurfaceTextureSpec = {
      baseColor: { url: planksBaseColorUrl, colorSpace: 'srgb' },
      normal: { url: planksNormalUrl, colorSpace: 'linear' },
      roughness: { url: planksRoughnessUrl, colorSpace: 'linear' },
      ao: { url: planksAoUrl, colorSpace: 'linear' },
    }
    loadSurfaceTextureSet(spec, this.renderer)
      .then((maps) => {
        this._foundWoodMaps = maps
        this._foundWoodTex = new TexturedSurface({
          maps,
          tileSizeMeters: planksManifest.tileSizeMeters,
        })
        this._foundWoodLoading = false
        this._renderScene() // rebuild với material gỗ móng đã có
      })
      .catch((e: unknown) => {
        this._foundWoodLoading = false
        console.warn('[ArchPlanLab] load foundation wood texture lỗi — giữ MeshToon:', e)
      })
  }

  // 🪵 Material gỗ KHUNG-DƯỚI 'wood-tex' (Old Plywood, TexturedSurface triplanar) bơm ctx.underWoodMat. Tách hẳn
  // deck (Wooden Planks). Không nhà nào dùng → undefined (khỏi load). Dùng nhưng CHƯA load → kick-off + undefined.
  private _underWoodMatForBuild(): THREE.Material | undefined {
    if (!this._usesUnderWoodTex()) return undefined
    if (this._underWoodTex) return this._underWoodTex.getMaterial()
    this._ensureUnderWoodTex()
    return undefined
  }

  private _usesUnderWoodTex(): boolean {
    return this.state.floors.some((f) =>
      f.instances.some((i) => i.structure.understructMaterial === 'wood-tex')
    )
  }

  // 🪵 Load Old Plywood 1 lần → TexturedSurface (triplanar). Xong → _renderScene (khung-dưới hiện texture thay
  // MeshToon tạm). Guard _underWoodLoading né load chồng. Lỗi → giữ MeshToon phẳng.
  private _ensureUnderWoodTex(): void {
    if (this._underWoodTex || this._underWoodLoading) return
    this._underWoodLoading = true
    const spec: SurfaceTextureSpec = {
      baseColor: { url: oldplyBaseColorUrl, colorSpace: 'srgb' },
      normal: { url: oldplyNormalUrl, colorSpace: 'linear' },
      roughness: { url: oldplyRoughnessUrl, colorSpace: 'linear' },
      ao: { url: oldplyAoUrl, colorSpace: 'linear' },
    }
    loadSurfaceTextureSet(spec, this.renderer)
      .then((maps) => {
        this._underWoodMaps = maps
        this._underWoodTex = new TexturedSurface({
          maps,
          tileSizeMeters: oldplyManifest.tileSizeMeters,
        })
        this._underWoodLoading = false
        this._renderScene() // rebuild với material khung-dưới đã có
      })
      .catch((e: unknown) => {
        this._underWoodLoading = false
        console.warn('[ArchPlanLab] load understructure wood texture lỗi — giữ MeshToon:', e)
      })
  }

  // 🌳 Material VỎ CÂY khung-dưới 'bark-tex' (Tree Bark, TexturedSurface triplanar) bơm ctx.underBarkMat. Tuỳ chọn
  // thứ 2 (≠ Old Plywood). Không nhà nào dùng → undefined. Dùng nhưng CHƯA load → kick-off + undefined.
  private _underBarkMatForBuild(): THREE.Material | undefined {
    if (!this._usesUnderBarkTex()) return undefined
    if (this._underBarkTex) return this._underBarkTex.getMaterial()
    this._ensureUnderBarkTex()
    return undefined
  }

  private _usesUnderBarkTex(): boolean {
    return this.state.floors.some((f) =>
      f.instances.some((i) => i.structure.understructMaterial === 'bark-tex')
    )
  }

  // 🌳 Load Tree Bark 1 lần → TexturedSurface (triplanar, tile mịn 1.5m). Xong → _renderScene. Guard né load chồng.
  private _ensureUnderBarkTex(): void {
    if (this._underBarkTex || this._underBarkLoading) return
    this._underBarkLoading = true
    const spec: SurfaceTextureSpec = {
      baseColor: { url: barkBaseColorUrl, colorSpace: 'srgb' },
      normal: { url: barkNormalUrl, colorSpace: 'linear' },
      roughness: { url: barkRoughnessUrl, colorSpace: 'linear' },
      ao: { url: barkAoUrl, colorSpace: 'linear' },
    }
    loadSurfaceTextureSet(spec, this.renderer)
      .then((maps) => {
        this._underBarkMaps = maps
        this._underBarkTex = new TexturedSurface({
          maps,
          tileSizeMeters: barkManifest.tileSizeMeters,
        })
        this._underBarkLoading = false
        this._renderScene() // rebuild với material vỏ cây đã có
      })
      .catch((e: unknown) => {
        this._underBarkLoading = false
        console.warn('[ArchPlanLab] load understructure bark texture lỗi — giữ MeshToon:', e)
      })
  }

  // 🧱 Load texture set tường rào theo kind (cinder/stone) 1 lần. Đổi kind → dispose bộ cũ. Xong → invalidate
  // siteSig + _renderSite (tường rào hiện texture thay màu phẳng tạm). Material do site-kit tạo (ctx.shaders).
  private _ensureFenceTex(kind: 'cinder' | 'stone'): void {
    if (this._fenceTex[kind] || this._fenceTexLoading[kind]) return
    this._fenceTexLoading[kind] = true
    const spec: SurfaceTextureSpec =
      kind === 'cinder'
        ? {
            baseColor: { url: cinderBaseColorUrl, colorSpace: 'srgb' },
            normal: { url: cinderNormalUrl, colorSpace: 'linear' },
            roughness: { url: cinderRoughnessUrl, colorSpace: 'linear' },
            ao: { url: cinderAoUrl, colorSpace: 'linear' },
          }
        : {
            baseColor: { url: stoneBaseColorUrl, colorSpace: 'srgb' },
            normal: { url: stoneNormalUrl, colorSpace: 'linear' },
            roughness: { url: stoneRoughnessUrl, colorSpace: 'linear' },
            ao: { url: stoneAoUrl, colorSpace: 'linear' },
          }
    loadSurfaceTextureSet(spec, this.renderer)
      .then((maps) => {
        const tile =
          kind === 'cinder' ? cinderManifest.tileSizeMeters : stoneManifest.tileSizeMeters
        const surf = new TexturedSurface({ maps, tileSizeMeters: tile }) // CACHE 1 lần/kind → né recompile mỗi rebuild
        this._fenceTex[kind] = { maps, surf }
        this._fenceTexLoading[kind] = false
        this._fenceSig = '' // ép _syncFence dựng lại RÀO với material mới (KHÔNG đụng site nặng)
        this._renderSite()
      })
      .catch((e: unknown) => {
        this._fenceTexLoading[kind] = false
        console.warn('[ArchPlanLab] load fence wall texture lỗi — giữ màu phẳng:', e)
      })
  }

  // Teardown texture lab sở hữu: ground (🌱) + slab walnut PhotoGround+maps (🪵) + fence maps (🧱). Texture-set
  // dispose là CALLER-side (PhotoGround/TexturedSurface.dispose KHÔNG đụng texture). Material fence do site-kit
  // tự dispose qua siteShaders ở _clearSite — ở đây chỉ free texture maps. Gọi từ _disposeSceneResources.
  private _disposeSurfaceTextures(): void {
    for (const k of Object.keys(this._groundMat) as GroundMaterialKey[]) {
      this._groundMat[k]?.dispose() // 🌱 PhotoGround material MỖI key (cache lab-lifetime; KHÔNG đụng maps)
    }
    this._groundMat = {}
    for (const v of this._zoneMix.values()) {
      v.gmix.dispose() // 🎨 mix per-zone
      v.pm.dispose() // 🖌 DataTexture mask vẽ
    }
    this._zoneMix.clear()
    for (const k of Object.keys(this._groundTex) as GroundMaterialKey[]) {
      disposeSurfaceTextureSet(this._groundTex[k] ?? null) // 🌱🏜️ ground texture-set MỖI key (lab sở hữu)
    }
    this._groundTex = {}
    this._slabTex?.dispose() // PhotoGround material sàn (cache lab-lifetime)
    this._slabTex = null
    disposeSurfaceTextureSet(this._slabTexMaps)
    this._slabTexMaps = null
    this._disposeEditorSandTex() // 🏖️ PhotoGround nền cát editor (tách helper — giữ complexity ≤10)
    this._disposeFoundWoodTextures() // 🪵🌳 gỗ deck + khung-dưới (Wooden Planks/Old Plywood/Tree Bark)
    this._disposeFenceBorderTex() // 🧱🪨 TexturedSurface tường rào (cinder/stone) + đá border (3 rock)
  }

  // 🧱🪨 Teardown TexturedSurface tường rào (cinder/stone) + đá border (3 rock). surf = material cache lab-
  // lifetime; maps = texture-set caller-owned. Tách khỏi _disposeSurfaceTextures (giữ complexity ≤10).
  private _disposeFenceBorderTex(): void {
    for (const k of ['cinder', 'stone'] as const) {
      this._fenceTex[k]?.surf.dispose()
      disposeSurfaceTextureSet(this._fenceTex[k]?.maps ?? null)
    }
    this._fenceTex = {}
    for (const k of Object.keys(this._borderTex) as BorderTexKey[]) {
      this._borderTex[k]?.surf.dispose()
      disposeSurfaceTextureSet(this._borderTex[k]?.maps ?? null)
    }
    this._borderTex = {}
  }

  // 🪵🌳 Teardown gỗ móng: deck (Wooden Planks) + khung-dưới (Old Plywood + Tree Bark). TexturedSurface.dispose
  // 🏖️ Dispose PhotoGround nền cát editor + maps (Lab sở hữu). Tách khỏi _disposeSurfaceTextures (complexity ≤10).
  private _disposeEditorSandTex(): void {
    this._editorSandTex?.dispose()
    this._editorSandTex = null
    disposeSurfaceTextureSet(this._editorSandMaps)
    this._editorSandMaps = null
  }

  // chỉ material; maps free riêng (caller-side). Tách khỏi _disposeSurfaceTextures để giữ complexity ≤10.
  private _disposeFoundWoodTextures(): void {
    this._foundWoodTex?.dispose()
    this._foundWoodTex = null
    disposeSurfaceTextureSet(this._foundWoodMaps)
    this._foundWoodMaps = null
    this._underWoodTex?.dispose()
    this._underWoodTex = null
    disposeSurfaceTextureSet(this._underWoodMaps)
    this._underWoodMaps = null
    this._underBarkTex?.dispose()
    this._underBarkTex = null
    disposeSurfaceTextureSet(this._underBarkMaps)
    this._underBarkMaps = null
  }

  // 🌿 Dựng/GIỮ bãi cỏ theo chữ ký structural (grassBuildSig). Sig GIỐNG lần trước → giữ nguyên mesh,
  // KHÔNG rải lại (đây là chỗ trị "sửa 1 thứ, cỏ reload 24000 lá"). Khác → dispose cũ + dựng lại
  // (buildSiteGrass, cỏ TẮT → null). Cỏ ở _grassGroup BỀN nên sống qua _clearSite. exclude = lõi tính
  // (foundation+hồ) phải KHỚP sig ↔ build để footprint/hồ đổi mới rải lại.
  // HOÃN khi đang kéo (_liveRebuild): kéo NHÀ/HỒ chỉ đổi exclude (param cỏ giữ nguyên) → giữ cỏ tới lúc
  // buông (lá có thể ló qua footprint mới trong lúc kéo — chấp nhận, rẻ). Kéo SLIDER CỎ đổi param → rải ngay.
  private _syncGrass(exclude: GrassExcludeRect[]): void {
    const full = grassBuildSig(this.site, exclude)
    if (full === this._grassSig && (full === 'off' ? !this._siteGrass : !!this._siteGrass)) return
    const paramSig = grassBuildSig(this.site, []) // bỏ exclude → chỉ param cỏ + lô (đổi = rải lại dù đang kéo)
    if (this._liveRebuild && paramSig === this._grassParamSig && !!this._siteGrass) return // exclude-only lúc kéo → hoãn
    this._grassSig = full
    this._grassParamSig = paramSig
    this._siteGrass?.dispose() // dispose() tự gỡ mesh (+ vệt con) khỏi _grassGroup
    this._siteGrass = buildSiteGrass(this.site, exclude)
    if (this._siteGrass) this._grassGroup.add(this._siteGrass.getMesh())
  }

  // 🧱 Dựng/GIỮ rào theo chữ ký _fenceSig (= JSON site.fences[]). Giống lần trước → giữ nguyên (rào ở group BỀN
  // sống qua _clearSite). Khác → dispose cũ + dựng lại vào _fenceGroup. Đây là chỗ trị "kéo slider rào/cổng
  // → rebuild cả nước-RTT mỗi frame = tụt fps": rào tách khỏi siteSig nên kéo nó CHỈ dựng lại rào (rẻ).
  private _syncFence(): void {
    // sig nhúng cờ LOD (':lod' khi kéo) → buông tay (cùng fence-state nhưng KHÔNG còn :lod) vẫn rebuild lên
    // STONE thật (nếu không, sig giống frame-live cuối → early-return → kẹt box LOD). ĐA-LỚP: sig = JSON fences[].
    const lod = this._liveRebuild ? ':lod' : ''
    const anyEnabled = this.site.fences.some((f) => f.enabled)
    const sig = this.site.show && anyEnabled ? JSON.stringify(this.site.fences) + lod : 'off'
    if (sig === this._fenceSig) return
    this._fenceSig = sig
    this._clearFence()
    if (sig === 'off') return
    const base = this._siteTexOpts() // skipGrass/skipFence + ground (fence material resolve per-lớp dưới đây)
    const ctx: SiteRenderCtx = {
      group: this._fenceGroup,
      geos: this._fenceGeos,
      mats: this._fenceMats,
      shaders: this._fenceShaders,
    }
    // Dựng MỖI lớp enabled vào group chung; tag userData.fenceIdx (click rào 3D → nhảy GUI đúng lớp).
    this.site.fences.forEach((fence, idx) => {
      if (!fence.enabled) return
      const opts: SiteRenderOpts = { ...base, fenceLodBox: this._liveRebuild }
      const wallTex = fence.type === 'wall' ? (fence.wallTex ?? 'plain') : 'plain'
      if (wallTex !== 'plain') {
        const cached = this._fenceTex[wallTex]
        if (cached)
          opts.fenceWallMat = cached.surf.getMaterial() // CACHED → KHÔNG recompile mỗi rebuild
        else this._ensureFenceTex(wallTex) // kick-off load → xong: _fenceSig='' + re-render
      }
      const before = this._fenceGroup.children.length
      buildSiteFence(fence, this.site, ctx, opts)
      for (let i = before; i < this._fenceGroup.children.length; i++) {
        this._fenceGroup.children[i].userData.fenceIdx = idx
      }
      if (!this._liveRebuild) this._addGatePick(fence, idx) // 🚪 pick-box cổng (bỏ lúc kéo — đỡ churn)
    })
  }

  private _clearFence(): void {
    for (const g of this._fenceGeos) g.dispose()
    for (const m of this._fenceMats) m.dispose()
    for (const s of this._fenceShaders) s.dispose()
    for (const g of this._gatePickGeos) g.dispose() // 🚪 pick-box cổng (geo riêng; _pickMat shared, KHÔNG dispose)
    this._fenceGeos = []
    this._fenceMats = []
    this._fenceShaders = []
    this._gatePickGeos = []
    this._fenceGroup.clear()
    this._gatePickGroup.clear()
  }

  // 🕳️ Nền backdrop editor (Plane 80×80 @ y=0, đặc) sẽ CHE đáy basin (basin chạy xuống dưới y=0). Khi có
  // hồ → thay bằng ShapeGeometry KHOÉT CÙNG lỗ hồ (pondWorldXZ lõi = single source) → nhìn xuyên thấy đáy.
  // Geo ở mặt phẳng XY như PlaneGeometry → mesh.rotation.x=-90° (đặt sẵn) lo hướng; lỗ (q.x,−q.z) khớp lõi.
  private _rebuildEditorGround(): void {
    if (!this.groundMesh) return
    this.groundGeo?.dispose()
    const polys = this.site.show ? waterPolygons(this.site) : []
    if (polys.length > 0) {
      const H = 40 // nửa cạnh 80m
      const s = new THREE.Shape()
      s.moveTo(-H, -H)
      s.lineTo(H, -H)
      s.lineTo(H, H)
      s.lineTo(-H, H)
      s.closePath()
      for (const poly of polys) {
        const hole = new THREE.Path()
        poly.forEach((q, i) => (i === 0 ? hole.moveTo(q.x, -q.z) : hole.lineTo(q.x, -q.z)))
        hole.closePath()
        s.holes.push(hole) // 1 lỗ MỖI pool đang bật → nhìn xuyên thấy mọi đáy basin
      }
      this.groundGeo = new THREE.ShapeGeometry(s)
    } else {
      this.groundGeo = new THREE.PlaneGeometry(80, 80)
    }
    this.groundMesh.geometry = this.groundGeo
  }

  // bbox MỖI pool đang bật (world XZ, mét) để khoét lưới — [] khi không có hồ. Free polygon → bbox bao ngoài.
  private _poolBboxes(): { x0: number; x1: number; z0: number; z1: number }[] {
    if (!this.site.show) return []
    return waterPolygons(this.site).map((poly) => {
      let x0 = Infinity
      let x1 = -Infinity
      let z0 = Infinity
      let z1 = -Infinity
      for (const p of poly) {
        x0 = Math.min(x0, p.x)
        x1 = Math.max(x1, p.x)
        z0 = Math.min(z0, p.z)
        z1 = Math.max(z1, p.z)
      }
      return { x0, x1, z0, z1 }
    })
  }

  // Lưới editor = LineSegments tự dựng (GridHelper KHÔNG khoét lỗ được). Mỗi đường //trục bị CẮT các đoạn
  // nằm trong bbox BẤT KỲ hồ nào (keepSpans interval-subtract) → hết sọc lưới đè lòng MỌI hồ. 80×80, ô 1m.
  private _buildGridGeo(
    holes: { x0: number; x1: number; z0: number; z1: number }[]
  ): THREE.BufferGeometry {
    const H = 40
    const seg: number[] = []
    for (let i = -H; i <= H; i++) {
      const gx = holes
        .filter((h) => i > h.z0 && i < h.z1)
        .map((h) => [h.x0, h.x1] as [number, number])
      for (const [a, b] of keepSpans(-H, H, gx)) seg.push(a, 0, i, b, 0, i) // đường ngang z=i
      const gz = holes
        .filter((h) => i > h.x0 && i < h.x1)
        .map((h) => [h.z0, h.z1] as [number, number])
      for (const [a, b] of keepSpans(-H, H, gz)) seg.push(i, 0, a, i, 0, b) // đường dọc x=i
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3))
    return g
  }

  // Dựng lại lưới theo bbox hồ hiện tại (gọi sau _renderSite). Giữ material, chỉ thay geometry.
  private _rebuildGrid(): void {
    if (!this.gridHelper) return
    this.gridHelper.geometry.dispose()
    this.gridHelper.geometry = this._buildGridGeo(this._poolBboxes())
  }

  // Giải phóng lưới (geometry + material). Tách khỏi _disposeSceneResources cho gọn (Rule complexity).
  private _disposeGrid(): void {
    this.gridHelper?.geometry.dispose()
    this.gridMat?.dispose()
    this.gridHelper = null
    this.gridMat = null
  }

  // 🎛️ Chỉnh uniform LIVE bãi ngoài (_siteGrass). Né recompile. (Preview ĐỘC LẬP scene — KHÔNG sync nữa.)
  private _tuneGrass(apply: (g: GrassBlades) => void, persist: boolean): void {
    if (this._siteGrass) apply(this._siteGrass)
    if (this.sun) this.sun.shadow.needsUpdate = true // refresh shadow map khi đổi (đổ-bóng/hình)
    if (persist) this.store.autosave(this.state, this.site)
  }

  // 🎛️ Chỉnh uniform LIVE trên hồ của ĐÚNG instance cfg (màu/gương/sóng) — KHÔNG dựng lại. No-op nếu hồ
  // đó chưa render (pool tắt / pond/puddle placeholder).
  private _tuneWater(cfg: WaterConfig, apply: (w: WaterSurface) => void, persist: boolean): void {
    const surf = this._siteWaters.find((x) => x.cfg === cfg)?.surf
    if (surf) apply(surf)
    if (persist) this.store.autosave(this.state, this.site)
  }

  private _clearSite(): void {
    for (const g of this.siteGeos) g.dispose()
    for (const m of this.siteMats) m.dispose()
    for (const s of this.siteShaders) s.dispose() // GrassGround… NodeMaterial
    this.siteGeos = []
    this.siteMats = []
    this.siteShaders = []
    // 🌿 KHÔNG đụng _siteGrass ở đây: cỏ sống trong _grassGroup BỀN, dispose/dựng lại do _syncGrass quản
    // theo chữ ký → giữ nguyên scatter qua các rebuild không-liên-quan-cỏ (đây là cốt lõi né lag).
    this._siteWaters = [] // dispose thật do siteShaders lo (mỗi WaterSurface trong đó); _activeWater giữ (cfg ref)
    // 🪨 path-zone StoneScatter cũng trong siteShaders (đã dispose vòng trên) — KHÔNG track riêng (sống trong groundLayers)
    this.siteGroup.clear()
  }

  // Re-render lô (không đụng building geometry — chỉ siteGroup + lift + readout). persist=true →
  // autosave (commit: tick/select/buông slider); false = live drag slider. Site KHÔNG vào undo (G0).
  private _applySite(persist: boolean): void {
    if (this._siteRaf) {
      cancelAnimationFrame(this._siteRaf) // commit nuốt rAF live đang chờ → render cuối là bản này
      this._siteRaf = 0
    }
    if (persist) this.waterTool?.hideOutline() // commit (buông slider/đổi gì) → ẩn viền preview, nước đã đặt vào
    this._renderSite()
    // (Lab preview ĐỘC LẬP scene — KHÔNG _previewRebuild theo edit nữa: né lag + sandbox riêng cho Factory.)
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
      this._liveRebuild = true // kéo size/offset HỒ → hoãn rải cỏ (chỉ exclude); kéo param-CỎ vẫn rải (param-sig đổi)
      this._renderSite()
      this._liveRebuild = false
      this._refreshSiteReadout?.()
      if (this.sun) this.sun.shadow.needsUpdate = true
    })
  }

  // LIVE drag slider RÀO/CỔNG: rebuild CHỈ RÀO (throttle ≤1/frame). Bỏ MỌI thứ thừa của _applySiteLive
  // (preview cỏ mini-WebGPU, readout, _syncGrass, _renderSite/nước) — đó là chỗ tụt fps khi kéo cổng. Stone →
  // box LOD (_liveRebuild). Buông tay → _applySite(true) commit (stone thật + autosave). I CHANG windows: rebuild tối thiểu.
  private _applyFenceLive(): void {
    if (this._siteRaf) return
    this._siteRaf = requestAnimationFrame(() => {
      this._siteRaf = 0
      this._liveRebuild = true
      this._syncFence()
      this._liveRebuild = false
      if (this.sun) this.sun.shadow.needsUpdate = true // bóng rào kéo theo
    })
  }

  // 🏔️ LIVE drag slider TERRAIN: SWAP geometry nền base (G0) — KHÔNG _renderSite/_rebuildSite (= né tái-tạo
  // water reflector RTT + recompile NodeMaterial = chỗ tụt fps). Chỉ build lưới displaced mới + thay
  // mesh.geometry (dispose cũ, cập nhật siteGeos để _clearSite sau dispose đúng). Buông → _applySite(true) commit.
  private _applyTerrainLive(): void {
    if (this._siteRaf) return
    this._siteRaf = requestAnimationFrame(() => {
      this._siteRaf = 0
      const mesh = this._siteGroundMesh
      if (!mesh) {
        this._applySiteLive() // chưa có ref nền (show off / chưa render) → fallback đường cũ
        return
      }
      // clean=false: live-drag bỏ-ô nhanh (răng cưa tạm, né clip Martinez mỗi frame). Buông → applySite(true) clip sạch.
      const geo = groundGeometry(this.site, { buildingFootprint: this._foundationRects() }, false)
      const old = mesh.geometry
      mesh.geometry = geo
      const i = this.siteGeos.indexOf(old)
      if (i >= 0) this.siteGeos[i] = geo // tracking để _clearSite dispose geo MỚI (không phải cũ đã free)
      old.dispose()
      this._rebuildGroundLayersLive() // 🏔️ zones (G1+) bám gò/gò-riêng theo — rebuild zone-only (né water-RTT)
      if (this.sun) this.sun.shadow.needsUpdate = true // bóng nhà đổ trên gò đổi theo
    })
  }

  // 🏔️ LIVE rebuild ZONE meshes (G1+) khi kéo slider terrain G0/zone: gỡ+dispose mesh zone cũ (userData.groundLayerIdx)
  // khỏi siteGroup rồi dựng lại clean=false (cell-drop nhanh). KHÔNG đụng nước(reflector)/cỏ/base → né tụt fps. Material
  // zone = cache (resolveGroundMat, KHÔNG dispose); cut-patch material own → dispose tránh leak. Buông → _applySite clip sạch.
  private _rebuildGroundLayersLive(): void {
    if (!this.site.groundLayers?.length) return
    // surface/cut = Mesh; path = Mesh (StoneScatter); paving/wall = GROUP (BrickPaving/CurvedBrickWall) →
    // KHÔNG lọc instanceof Mesh (kẻo Group lọt → live-rebuild nhân-đôi lúc kéo slider terrain/zone).
    const old = this.siteGroup.children.filter((o) => o.userData.groundLayerIdx !== undefined)
    for (const o of old) {
      this.siteGroup.remove(o)
      if (this._disposeLayerField(o)) continue // 🪨🧱 path/paving/wall = dispose QUA field (geo+mat+siteShaders)
      const m = o as THREE.Mesh // còn lại = surface/cut Mesh thường → dispose geometry như cũ
      const gi = this.siteGeos.indexOf(m.geometry)
      if (gi >= 0) this.siteGeos.splice(gi, 1)
      m.geometry.dispose()
      if (m.userData.isCutPatch) this._disposeSiteMat(m.material as THREE.Material) // cut-patch own mat
    }
    const ctx: SiteRenderCtx = {
      group: this.siteGroup,
      geos: this.siteGeos,
      mats: this.siteMats,
      shaders: this.siteShaders,
    }
    buildGroundLayers(this.site, ctx, this._siteTexOpts(), false) // clean=false (cell-drop, mượt fps)
    this._applyCutVisibility() // cut-patch mới = ẩn; hiện lại mảng của layer active
  }

  // 🪨🧱 Object zone sở hữu field (StoneScatter path · BrickPaving sân · CurvedBrickWall tường) trong siteShaders
  // → dispose QUA field.dispose (né double-dispose geo + leak material) + rút khỏi siteShaders. true = đã xử lý
  // (caller bỏ qua dispose geometry); false = surface/cut Mesh thường.
  private _disposeLayerField(o: THREE.Object3D): boolean {
    const field = (o.userData.stonePath ?? o.userData.brickPaving ?? o.userData.curvedWall) as
      | { dispose(): void; setTime?(s: number): void }
      | undefined
    if (!field) return false
    const si = this.siteShaders.indexOf(field)
    if (si >= 0) this.siteShaders.splice(si, 1)
    field.dispose()
    return true
  }

  // Gỡ 1 material khỏi siteMats + dispose (cut-patch own material lúc live-rebuild zones).
  private _disposeSiteMat(mat: THREE.Material): void {
    const mi = this.siteMats.indexOf(mat)
    if (mi >= 0) this.siteMats.splice(mi, 1)
    mat.dispose()
  }

  // 🪨🧱 Object zone (surface/cut Mesh · path Mesh · paving/wall Group) mang userData.groundLayerIdx=idx trong
  // siteGroup (nhất đầu khớp). null nếu chưa render. KHÔNG lọc instanceof Mesh → rotate-live grab được Group paving/wall.
  private _layerMeshByIdx(idx: number): THREE.Object3D | null {
    for (const o of this.siteGroup.children) {
      if (o.userData.groundLayerIdx === idx) return o
    }
    return null
  }

  // 🪨 XOAY path-zone LIVE: chỉ set mesh.rotation.y (transform thuần, 0 rebuild → né water-RTT). Buông → applySite.
  private _tunePathRotLive(flatIdx: number, rotDeg: number): void {
    const mesh = this._layerMeshByIdx(flatIdx)
    if (mesh) mesh.rotation.y = (rotDeg * Math.PI) / 180
    if (this.sun) this.sun.shadow.needsUpdate = true // bóng đá xoay theo
  }

  // 🪨 LIVE drag slider STRUCTURAL path (frame/R/gap/seed…): rebuild CHỈ zone meshes (throttle ≤1/frame) — KHÔNG
  // đụng nước(reflector)/cỏ/nền → né tụt fps. Buông → applySite(true) commit. Mirror _applyTerrainLive (zone-only).
  private _applyZonesLive(): void {
    if (this._siteRaf) return
    this._siteRaf = requestAnimationFrame(() => {
      this._siteRaf = 0
      this._rebuildGroundLayersLive()
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
