/**
 * VỊ TRÍ   — archplan/src/archplan/lighting/store.ts
 * VAI TRÒ  — Persist hệ đèn fixture RIÊNG (localStorage 'archplan:lighting') — ĐỘC LẬP design state (state.ts),
 *            mirror cách sun lưu 'archplan:sun'. Né hẳn file state.ts (sân Factory). 3 nhóm: uplight/bollard/dây.
 *            load có sanitize chống dữ bẩn + back-compat (file cũ chỉ có uplights vẫn đọc được).
 * LIÊN HỆ  — LightingController gọi loadLighting lúc khởi tạo + saveLighting khi panel/drag commit.
 *
 * CÁCH DÙNG: const cfg = loadLighting(); ... saveLighting(cfg)
 */

import type { BollardConfig } from 'threejs-modules/site/lighting/BollardLights'
import type { UplightConfig } from 'threejs-modules/site/lighting/SiteLightingSystem'
import type { StringConfig } from 'threejs-modules/site/lighting/StringLights'

const KEY = 'archplan:lighting'

export interface LightingConfigs {
  uplights: UplightConfig[]
  bollards: BollardConfig[]
  strings: StringConfig[]
}

export function loadLighting(): LightingConfigs {
  const empty: LightingConfigs = { uplights: [], bollards: [], strings: [] }
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return empty
    const o = JSON.parse(raw) as Record<string, unknown>
    return {
      uplights: arr(o.uplights).map(sanitizeUp).filter(nn),
      bollards: arr(o.bollards).map(sanitizeBo).filter(nn),
      strings: arr(o.strings).map(sanitizeSt).filter(nn),
    }
  } catch {
    return empty
  }
}

export function saveLighting(cfg: LightingConfigs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(cfg))
  } catch {
    /* quota/private-mode → bỏ qua, không chặn app */
  }
}

// ── helpers ────────────────────────────────────────────────────────────────

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}
function nn<T>(v: T | null): v is T {
  return v !== null
}
function num(v: unknown, d: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : d
}
function col(v: unknown, d: number): number {
  return Math.floor(num(v, d)) & 0xffffff
}
function obj(raw: unknown): Record<string, unknown> | null {
  return typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : null
}

function sanitizeUp(raw: unknown): UplightConfig | null {
  const r = obj(raw)
  if (!r) return null
  return {
    x: num(r.x, 0),
    z: num(r.z, 0),
    aimX: num(r.aimX, 0),
    aimZ: num(r.aimZ, 0),
    aimY: num(r.aimY, 2.4),
    color: col(r.color, 0xffd9a0),
    intensity: num(r.intensity, 6),
    angle: num(r.angle, 0.5),
    penumbra: num(r.penumbra, 0.4),
    range: num(r.range, 8),
  }
}

function sanitizeBo(raw: unknown): BollardConfig | null {
  const r = obj(raw)
  if (!r) return null
  return {
    x: num(r.x, 0),
    z: num(r.z, 0),
    color: col(r.color, 0xfff0d0),
    intensity: num(r.intensity, 8),
    height: num(r.height, 0.8),
    angle: num(r.angle, 1.0),
    range: num(r.range, 4),
  }
}

function sanitizeSt(raw: unknown): StringConfig | null {
  const r = obj(raw)
  if (!r) return null
  return {
    ax: num(r.ax, -2),
    ay: num(r.ay, 2.4),
    az: num(r.az, 0),
    bx: num(r.bx, 2),
    by: num(r.by, 2.4),
    bz: num(r.bz, 0),
    color: col(r.color, 0xffd27a),
    intensity: num(r.intensity, 3),
    sag: num(r.sag, 0.5),
    bulbs: num(r.bulbs, 10),
  }
}
