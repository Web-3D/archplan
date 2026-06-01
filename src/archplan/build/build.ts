/**
 * VỊ TRÍ   — 01-Doraemon/src/sandbox/archplan/build/build.ts
 * VAI TRÒ  — Pure build math: turtle walk → WallConfig[], bbox. Không có Three.js.
 * LIÊN HỆ  — Import bởi ArchPlanLab.ts.
 */

import type { ShapeInstance, WallConfig } from '../state/state'

// Turtle walk dùng chung: trả về các đỉnh polygon + heading (deg) của mỗi segment.
// pts[i] = điểm BẮT ĐẦU segment i; pts.length = segments.length + 1 (gồm gốc [0,0]).
// headings[i] = heading sau khi áp turnBefore của segment i.
function walkTurtle(inst: ShapeInstance): { pts: [number, number][]; headings: number[] } {
  let heading = 0
  let curX = 0
  let curZ = 0
  const pts: [number, number][] = [[0, 0]]
  const headings: number[] = []
  for (const seg of inst.segments) {
    heading = (((heading + seg.turnBefore) % 360) + 360) % 360
    headings.push(heading)
    const len = seg.length / 1000
    const rad = (heading * Math.PI) / 180
    curX += Math.cos(rad) * len
    curZ += -Math.sin(rad) * len
    pts.push([curX, curZ])
  }
  return { pts, headings }
}

export function computeWallConfigs(inst: ShapeInstance, wallBase: number): WallConfig[] {
  const d = inst.wallDepth / 1000
  const { pts, headings } = walkTurtle(inst)
  const cfgs: WallConfig[] = []
  for (let i = 0; i < inst.segments.length; i++) {
    const seg = inst.segments[i]
    const heading = headings[i]
    const lenM = seg.length / 1000
    const rad = (heading * Math.PI) / 180
    const dx = Math.cos(rad)
    const dz = -Math.sin(rad)
    const [startX, startZ] = pts[i]
    cfgs.push({
      w: lenM,
      h: seg.wallH / 1000,
      depth: d,
      rotationY: heading,
      xOffset: startX + (dx * lenM) / 2,
      zOffset: startZ + (dz * lenM) / 2,
      yBase: wallBase,
      seg,
    })
  }
  centerAndRotate(cfgs, pts, inst)
  return cfgs
}

export function computeLocalBbox(inst: ShapeInstance): { w: number; d: number } {
  const { pts } = walkTurtle(inst)
  const allX = pts.map((p) => p[0])
  const allZ = pts.map((p) => p[1])
  return { w: Math.max(...allX) - Math.min(...allX), d: Math.max(...allZ) - Math.min(...allZ) }
}

function centerAndRotate(cfgs: WallConfig[], pts: [number, number][], inst: ShapeInstance): void {
  const allX = pts.map((p) => p[0])
  const allZ = pts.map((p) => p[1])
  const cx = (Math.min(...allX) + Math.max(...allX)) / 2
  const cz = (Math.min(...allZ) + Math.max(...allZ)) / 2
  const rotRad = (inst.rotY * Math.PI) / 180
  const cosR = Math.cos(rotRad)
  const sinR = Math.sin(rotRad)
  const px = inst.posX / 1000
  const pz = inst.posZ / 1000
  for (const c of cfgs) {
    c.xOffset -= cx
    c.zOffset -= cz
    const rx = c.xOffset * cosR - c.zOffset * sinR
    const rz = c.xOffset * sinR + c.zOffset * cosR
    c.xOffset = rx + px
    c.zOffset = rz + pz
    c.rotationY = (c.rotationY + inst.rotY + 360) % 360
  }
}

// ── Cầu thang: footprint world (AABB) + map sang lỗ slab tầng trên ───────────
// rotY ∈ {0,90,180,270} → footprint & slab luôn axis-aligned trong world.
// Dùng Three Ry (khớp với rotation.y của slab/stairs Group) để footprint, lỗ và
// slab tầng trên nhất quán world-position với nhau.

export interface WorldRect {
  cx: number // m — tâm world
  cz: number
  w: number // m — dim dọc trục +X cục bộ cầu thang (runL)
  d: number // m — dim vuông góc (width)
  rot: number // độ — xoay world quanh Y = inst.rotY + stair.rotDeg
}

export function stairFootprintWorld(inst: ShapeInstance): WorldRect | null {
  const s = inst.structure.stairs
  if (!s.show) return null
  // Tâm footprint chỉ xoay theo shape (rotDeg xoay quanh tâm, không dời tâm).
  // Three Ry(rotY): wx = lx*cos + lz*sin; wz = -lx*sin + lz*cos
  const th = (inst.rotY * Math.PI) / 180
  const lx = s.x / 1000
  const lz = s.z / 1000
  const cx = lx * Math.cos(th) + lz * Math.sin(th) + inst.posX / 1000
  const cz = -lx * Math.sin(th) + lz * Math.cos(th) + inst.posZ / 1000
  return { cx, cz, w: s.runL / 1000, d: s.width / 1000, rot: inst.rotY + s.rotDeg }
}

// World rect → SlabOpening (local frame của slab, trước rotation.y). Giữ góc xoay.
export function worldRectToSlabOpening(
  r: WorldRect,
  slabWX: number,
  slabWZ: number,
  slabRotY: number
): { x: number; z: number; w: number; d: number; rot: number } {
  const th = (slabRotY * Math.PI) / 180
  const dx = r.cx - slabWX
  const dz = r.cz - slabWZ
  // world→local (inverse Three Ry): lx = dx*cos − dz*sin; lz = dx*sin + dz*cos
  const lx = dx * Math.cos(th) - dz * Math.sin(th)
  const lz = dx * Math.sin(th) + dz * Math.cos(th)
  return { x: lx, z: lz, w: r.w, d: r.d, rot: r.rot - slabRotY }
}
