/**
 * VỊ TRÍ   — 01-Doraemon/src/sandbox/archplan/mix/presets.ts
 * VAI TRÒ  — Kho PRESET MIX (Mảnh 1 plan mix-palette-bucket): load/save localStorage
 *            `archplan.mixPresets.v1` (cùng họ store lab — như blueprint mái roof-lab) +
 *            export/import JSON (per-origin browser: đổi máy/clear = mất → JSON là đường cứu).
 * LIÊN HỆ  — MixPresetPanel (UI khay) đọc/ghi qua đây. Áp lên đối tượng = CLONE
 *            (structuredClone — quyết định chốt 2026-06-11: file save TỰ CHỨA, mở máy khác
 *            vẫn render đúng) + presetId để sau này "Re-apply preset" đồng bộ (REF-on-demand).
 *
 * CÁCH DÙNG: loadMixPresets() → [...] · saveMixPresets(list) · export/importMixPresetsJson.
 * DISPOSE:   N/A — pure data, không giữ resource.
 */

import {
  type GroundMaterialKey,
  type GroundMixParams,
  isGroundTexKey,
  makeGroundMixParams,
} from 'threejs-modules/site/state'

export interface MixPreset {
  id: string
  name: string
  mix: GroundMixParams
}

const LS_KEY = 'archplan.mixPresets.v1'

export function newPresetId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

// Số hợp lệ trong khoảng — sai kiểu/NaN → default (import JSON tay/file cũ không phá board).
const num = (v: unknown, d: number, lo: number, hi: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d

const RULES = ['foot', 'streak', 'moss'] as const

function sanitizeSlot(raw: unknown): GroundMixParams['slots'][number] | null {
  if (typeof raw !== 'object' || raw === null) return null
  const o = raw as Record<string, unknown>
  if (typeof o.key !== 'string' || !isGroundTexKey(o.key as GroundMaterialKey)) return null
  const rule = RULES.find((r) => r === o.rule)
  return {
    key: o.key as GroundMaterialKey,
    bias: num(o.bias, 0.5, 0, 1),
    seed: num(o.seed, 13.7, -1000, 1000),
    ...(rule ? { rule } : {}),
  }
}

// Mix từ nguồn KHÔNG TIN (localStorage cũ / JSON import): base phải key TEXTURE; field số kẹp
// range slider board; slots ≤4 lọc hỏng; paint chỉ nhận string (base64 mask). null = entry bỏ.
export function sanitizeMix(raw: unknown): GroundMixParams | null {
  if (typeof raw !== 'object' || raw === null) return null
  const o = raw as Record<string, unknown>
  if (typeof o.base !== 'string' || !isGroundTexKey(o.base as GroundMaterialKey)) return null
  const def = makeGroundMixParams(o.base as GroundMaterialKey)
  const slots = Array.isArray(o.slots)
    ? o.slots
        .slice(0, 4)
        .map(sanitizeSlot)
        .filter((s): s is NonNullable<typeof s> => s !== null)
    : []
  return {
    ...def,
    slots,
    maskScale: num(o.maskScale, def.maskScale, 0.05, 5),
    maskSoft: num(o.maskSoft, def.maskSoft, 0, 1),
    heightK: num(o.heightK, def.heightK, 0, 1),
    macro: num(o.macro, def.macro, 0, 1),
    tint: num(o.tint, def.tint, 0, 1),
    bomb: num(o.bomb, def.bomb, 0, 1),
    rotFree: num(o.rotFree, def.rotFree, 0, 1),
    seed: num(o.seed, def.seed, -1000, 1000),
    scaleJit: num(o.scaleJit, def.scaleJit, 0, 1),
    margin: num(o.margin, def.margin, 0, 0.5),
    farOn: num(o.farOn, def.farOn, 0, 1),
    farRange: num(o.farRange, def.farRange, 1, 100),
    gravity: num(o.gravity, def.gravity, 0, 1),
    ...(typeof o.paint === 'string' ? { paint: o.paint } : {}),
  }
}

function sanitizePreset(raw: unknown): MixPreset | null {
  if (typeof raw !== 'object' || raw === null) return null
  const o = raw as Record<string, unknown>
  const mix = sanitizeMix(o.mix)
  if (!mix) return null
  return {
    id: typeof o.id === 'string' && o.id ? o.id : newPresetId(),
    name: typeof o.name === 'string' && o.name.trim() ? o.name.trim() : 'Preset',
    mix,
  }
}

export function loadMixPresets(): MixPreset[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY) ?? '[]') as unknown
    if (!Array.isArray(raw)) return []
    return raw.map(sanitizePreset).filter((p): p is MixPreset => p !== null)
  } catch {
    return [] // localStorage hỏng/bị chặn → khay rỗng, không văng
  }
}

export function saveMixPresets(list: MixPreset[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(list))
  } catch {
    // quota/private-mode → bỏ qua (UI vẫn chạy trong phiên; export JSON là đường bền)
  }
}

// Export file tự mô tả (version + kind) — import phân biệt được file lạ.
export function exportMixPresetsJson(list: MixPreset[]): string {
  return JSON.stringify({ kind: 'archplan.mixPresets', version: 1, presets: list }, null, 2)
}

// Nhận cả 2 dạng: file export chuẩn {kind,presets:[...]} HOẶC array trần. Entry hỏng bị lọc;
// id trùng kho hiện tại → cấp id mới (merge an toàn). Throw Error message tiếng Việt khi JSON vỡ.
export function importMixPresetsJson(json: string, existing: MixPreset[]): MixPreset[] {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    throw new Error('File không phải JSON hợp lệ')
  }
  const arr = Array.isArray(raw) ? raw : ((raw as { presets?: unknown[] } | null)?.presets ?? null)
  if (!Array.isArray(arr)) throw new Error('Không tìm thấy danh sách preset trong file')
  const have = new Set(existing.map((p) => p.id))
  const got = arr.map(sanitizePreset).filter((p): p is MixPreset => p !== null)
  for (const p of got) {
    if (have.has(p.id)) p.id = newPresetId()
    have.add(p.id)
  }
  return got
}
