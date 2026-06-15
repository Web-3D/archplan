/**
 * VỊ TRÍ   — archplan/src/archplan/lighting/store.ts
 * VAI TRÒ  — Persist hệ đèn-pha RIÊNG (localStorage 'archplan:lighting') — ĐỘC LẬP design state (state.ts),
 *            mirror cách sun lưu 'archplan:sun'. Né hẳn file state.ts (sân Factory). load có sanitize chống dữ bẩn.
 * LIÊN HỆ  — LightingController gọi load lúc khởi tạo + save khi panel/drag commit.
 *
 * CÁCH DÙNG: const cfgs = loadUplights(); ... saveUplights(cfgs)
 */

import type { UplightConfig } from 'threejs-modules/site/lighting/SiteLightingSystem'

const KEY = 'archplan:lighting'

export function loadUplights(): UplightConfig[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const o = JSON.parse(raw) as { uplights?: unknown }
    if (!Array.isArray(o.uplights)) return []
    return o.uplights.map(sanitize).filter((u): u is UplightConfig => u !== null)
  } catch {
    return []
  }
}

export function saveUplights(cfgs: UplightConfig[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ uplights: cfgs }))
  } catch {
    /* quota/private-mode → bỏ qua, không chặn app */
  }
}

function num(v: unknown, d: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : d
}

function sanitize(raw: unknown): UplightConfig | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  return {
    x: num(r.x, 0),
    z: num(r.z, 0),
    aimX: num(r.aimX, 0),
    aimZ: num(r.aimZ, 0),
    aimY: num(r.aimY, 2.4),
    color: Math.floor(num(r.color, 0xffd9a0)) & 0xffffff,
    intensity: num(r.intensity, 6),
    angle: num(r.angle, 0.5),
    penumbra: num(r.penumbra, 0.4),
    range: num(r.range, 8),
  }
}
