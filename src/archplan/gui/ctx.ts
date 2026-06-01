/**
 * VỊ TRÍ   — 01-Doraemon/src/sandbox/archplan/gui/ctx.ts
 * VAI TRÒ  — APGuiCtx interface — context object truyền state + callbacks vào GUI builders.
 * LIÊN HỆ  — Import bởi gui/gui.ts, gui/sections.ts, ArchPlanLab.ts.
 */

import type GUI from 'lil-gui'
import type * as THREE from 'three'
import type { CoverageStats, SiteState } from 'threejs-modules/site/state'

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
  siteStats(): CoverageStats // đối chiếu nhà/lô (lotArea/coveragePct/gardenArea) cho bảng số liệu
  registerSiteReadout(fn: () => void): void // panel đăng ký refresh → Lab gọi khi build nhà (footprint đổi)
  applySun(): void
  getZGridGroup(): THREE.Group | null
  getXGridGroup(): THREE.Group | null
  getCYGridGroup(): THREE.Group | null
  setPickMode(on: boolean): void
  registerPickToggle(setChecked: (on: boolean) => void): void
  build(): void // commit: history + persist + render (select/nút/buông slider)
  buildLive(): void // live drag: chỉ render geometry, throttle rAF (kéo slider)
  rebuild(): void
  addInstance(floorId: string, key: string | null): void
  removeInstance(floorId: string, id: string): void
  resetInstance(floorId: string, id: string): void
  removeFloor(id: string): void
  addFloor(): void
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
}
