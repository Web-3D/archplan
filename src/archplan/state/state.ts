/**
 * VỊ TRÍ   — archplan/src/archplan/state/state.ts
 * VAI TRÒ  — SHIM: re-export BuildingState schema từ building-kit (nguồn sự thật duy nhất).
 *            Giữ TURN_OPTIONS/ROT_OPTIONS (GUI dropdown label→value — chỉ gui/ dùng) tại vỏ.
 * LIÊN HỆ  — Schema thật: building-kit/state.ts (Phase 0 thin-out archplan→lõi, 2026-06-01).
 *            Mọi importer cũ (ArchPlanLab, gui/, interaction/, persistence) giữ nguyên đường './state'.
 */

export * from 'building-kit/state'

// GUI dropdown label→value — chỉ gui/gui.ts + gui/sections.ts dùng. Giữ ở vỏ: lõi headless không
// chứa string trình bày GUI.
export const TURN_OPTIONS = {
  'Straight (0°)': 0,
  'Left +90°': 90,
  'Right −90°': -90,
  'U-turn 180°': 180,
}

export const ROT_OPTIONS = { '0°': 0, '90°': 90, '180°': 180, '270°': 270 }
