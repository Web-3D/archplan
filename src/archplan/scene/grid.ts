/**
 * VỊ TRÍ   — src/archplan/scene/grid.ts
 * VAI TRÒ  — LƯỚI EDITOR y=0 (LineSegments tự dựng 80×80m, ô 1m) KHOÉT LỖ theo bbox hồ.
 *            GridHelper three KHÔNG khoét được → tự phát từng đường //trục, cắt bỏ các đoạn nằm
 *            trong bbox BẤT KỲ hồ nào (keepSpans interval-subtract) — hết sọc lưới đè lòng hồ.
 * LIÊN HỆ  — Tách từ ArchPlanLab 2026-06-11 (chẻ subsystem — pattern waterDrag). Host giữ 1 field:
 *            scene.add(getObject()) lúc setup · rebuild(poolBboxes(site)) sau _renderSite ·
 *            setVisible(groundType==='none') · dispose() lúc teardown.
 * DISPOSE: dispose() giải phóng geometry + material (KHÔNG remove khỏi scene — scene teardown riêng).
 */

import * as THREE from 'three'
import { waterPolygons } from 'threejs-modules/site/render/fromState'
import type { SiteState } from 'threejs-modules/site/state'

interface GridHole {
  x0: number
  x1: number
  z0: number
  z1: number
}

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

// Mỗi đường //trục bị CẮT các đoạn nằm trong bbox bất kỳ hồ nào. 80×80, ô 1m.
function buildGridGeo(holes: GridHole[]): THREE.BufferGeometry {
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

// bbox MỖI pool đang bật (world XZ, mét) để khoét lưới — [] khi site tắt. Free polygon → bbox bao ngoài.
export function poolBboxes(site: SiteState): GridHole[] {
  if (!site.show) return []
  return waterPolygons(site).map((poly) => {
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

export class EditorGrid {
  private helper: THREE.LineSegments | null
  private mat: THREE.LineBasicMaterial | null

  constructor() {
    this.mat = new THREE.LineBasicMaterial({ color: 0x1a2240 })
    this.helper = new THREE.LineSegments(buildGridGeo([]), this.mat) // tự dựng → khoét được
  }

  getObject(): THREE.LineSegments {
    if (!this.helper) throw new Error('EditorGrid: đã dispose')
    return this.helper
  }

  setVisible(on: boolean): void {
    if (this.helper) this.helper.visible = on
  }

  // Dựng lại lưới theo bbox hồ hiện tại (gọi sau _renderSite). Giữ material, chỉ thay geometry.
  rebuild(holes: GridHole[]): void {
    if (!this.helper) return
    this.helper.geometry.dispose()
    this.helper.geometry = buildGridGeo(holes)
  }

  dispose(): void {
    this.helper?.geometry.dispose()
    this.mat?.dispose()
    this.helper = null
    this.mat = null
  }
}
