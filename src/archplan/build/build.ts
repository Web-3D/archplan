/**
 * VỊ TRÍ   — archplan/src/archplan/build/build.ts
 * VAI TRÒ  — SHIM: re-export build math từ building-kit/build (nguồn sự thật chung editor + headless).
 * LIÊN HỆ  — Thật: building-kit/build.ts (Phase 1a thin-out archplan→lõi, 2026-06-01).
 *            Importer cũ (ArchPlanLab, interaction/highlight) giữ nguyên đường './build/build'.
 */

export * from 'building-kit/build'
