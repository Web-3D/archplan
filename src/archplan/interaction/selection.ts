/**
 * VỊ TRÍ   — archplan/src/archplan/interaction/selection.ts
 * VAI TRÒ  — Shape Group (P1+P2a): selection AD-HOC nhiều khối shape (Shift+click trong Move mode) —
 *            viền cyan ỔN ĐỊNH quanh khối đang chọn + GHOST bbox cả nhóm bay theo chuột khi kéo
 *            (commit-khi-buông — KHÔNG đụng split-render KI-009).
 * LIÊN HỆ  — ArchPlanLab giữ instance + wire Shift+click/Escape/mode-off; ManipulateTool đọc
 *            selectedIds() + lái ghost qua ManipulateHost (beginGroupGhost/moveGroupGhost/endGroupGhost).
 *            KHÔNG vào BuildingState (ad-hoc — zero schema risk, không bump DESIGN_SCHEMA_V);
 *            group bền có tên = P3 sau khi v1 dùng thật.
 *
 * CÁCH DÙNG:
 *   const sel = new ShapeSelection(host)
 *   sel.toggle(instId) · sel.clear() · sel.ids() · sel.size()
 *   sel.beginGhost() / sel.moveGhost(dx, dz) / sel.endGhost()   // P2a — host delegate
 *   sel.refresh()   // sau commit rebuild (pos/size khối đổi) — vẽ lại viền theo state mới
 * DISPOSE: dispose() — gỡ viền + ghost (dispose geometry) + 2 material.
 */

import * as THREE from 'three'

import type { ShapeInstance } from '../state/state'
import { instAABB } from './snap'

export interface SelectionHost {
  readonly scene: THREE.Scene
  locateInst(instId: string): { inst: ShapeInstance; fi: number } | null
  instWallBase(inst: ShapeInstance, fi: number): number
}

export class ShapeSelection {
  private readonly sel = new Set<string>()
  private group: THREE.Group | null = null // viền các khối đang chọn (đứng yên tại chỗ)
  private ghost: THREE.Group | null = null // bbox nhóm bay theo chuột khi ghost-drag (P2a)
  private selMat: THREE.LineBasicMaterial | null = null
  private ghostMat: THREE.LineBasicMaterial | null = null
  private isDisposed = false

  constructor(private readonly host: SelectionHost) {}

  /** Shift+click: thêm/bỏ 1 khối khỏi nhóm. Khối không còn trong state → bỏ qua. */
  toggle(instId: string): void {
    if (this.sel.has(instId)) this.sel.delete(instId)
    else if (this.host.locateInst(instId)) this.sel.add(instId)
    this.refresh()
  }

  has(id: string): boolean {
    return this.sel.has(id)
  }

  ids(): string[] {
    return [...this.sel]
  }

  size(): number {
    return this.sel.size
  }

  clear(): void {
    this.sel.clear()
    this.refresh()
  }

  /** Vẽ lại viền theo state HIỆN TẠI (gọi sau commit rebuild). Khối đã bị xoá → tự rớt khỏi nhóm. */
  refresh(): void {
    this._dropGroup()
    if (this.isDisposed || this.sel.size === 0) return
    const group = new THREE.Group()
    for (const id of [...this.sel]) {
      const box = this._instBox(id, this._selMaterial())
      if (box) group.add(box)
      else this.sel.delete(id)
    }
    if (group.children.length === 0) return
    this.host.scene.add(group)
    this.group = group
  }

  // ── Ghost (P2a): bbox cả nhóm bay theo chuột — viền gốc ĐỨNG YÊN (thấy cả nguồn lẫn đích) ──

  beginGhost(): void {
    this.endGhost()
    if (this.isDisposed || this.sel.size < 2) return
    const g = new THREE.Group()
    for (const id of this.ids()) {
      const box = this._instBox(id, this._ghostMaterial())
      if (box) g.add(box)
    }
    this.host.scene.add(g)
    this.ghost = g
  }

  moveGhost(dx: number, dz: number): void {
    this.ghost?.position.set(dx, 0, dz)
  }

  /** Idempotent — cancelDrag/dragEnd/đổi mode gọi thoải mái. */
  endGhost(): void {
    if (!this.ghost) return
    this.host.scene.remove(this.ghost)
    this.ghost.traverse((o) => {
      if (o instanceof THREE.LineSegments) o.geometry.dispose()
    })
    this.ghost = null
  }

  // Gỡ + dispose toàn bộ viền chọn hiện có (geometry; material dùng chung giữ lại tới dispose()).
  private _dropGroup(): void {
    if (!this.group) return
    this.host.scene.remove(this.group)
    this.group.traverse((o) => {
      if (o instanceof THREE.LineSegments) o.geometry.dispose()
    })
    this.group = null
  }

  dispose(): void {
    if (this.isDisposed) return
    this.sel.clear()
    this._dropGroup()
    this.endGhost()
    this.selMat?.dispose()
    this.ghostMat?.dispose()
    this.selMat = null
    this.ghostMat = null
    this.isDisposed = true
  }

  // Viền 1 khối: box AABB (rotY bội 90° → axis-aligned chuẩn) từ instAABB lõi + cao = tường cao nhất.
  private _instBox(id: string, mat: THREE.LineBasicMaterial): THREE.LineSegments | null {
    const loc = this.host.locateInst(id)
    if (!loc) return null
    const a = instAABB(loc.inst)
    const base = this.host.instWallBase(loc.inst, loc.fi)
    const h = loc.inst.segments.length
      ? Math.max(...loc.inst.segments.map((s) => s.wallH)) / 1000
      : 3
    const box = new THREE.BoxGeometry(a.maxX - a.minX + 0.06, h + 0.06, a.maxZ - a.minZ + 0.06)
    const edges = new THREE.EdgesGeometry(box)
    box.dispose()
    const line = new THREE.LineSegments(edges, mat)
    line.position.set((a.minX + a.maxX) / 2, base + h / 2, (a.minZ + a.maxZ) / 2)
    line.renderOrder = 998 // dưới highlight-flash (999) — flash vàng vẫn nổi lên trên viền chọn
    return line
  }

  // Cyan ổn định (KHÔNG nhấp nháy — khác highlight-flash vàng 0.6s) + depthTest off (thấy sau tường).
  private _selMaterial(): THREE.LineBasicMaterial {
    if (!this.selMat) {
      this.selMat = new THREE.LineBasicMaterial({
        color: 0x4fd2ff,
        depthTest: false,
        transparent: true,
        opacity: 0.85,
      })
    }
    return this.selMat
  }

  private _ghostMaterial(): THREE.LineBasicMaterial {
    if (!this.ghostMat) {
      this.ghostMat = new THREE.LineBasicMaterial({
        color: 0x4fd2ff,
        depthTest: false,
        transparent: true,
        opacity: 0.35, // mờ hơn viền gốc — đọc ngay "đây là đích sẽ đáp"
      })
    }
    return this.ghostMat
  }
}
