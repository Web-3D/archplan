/**
 * VỊ TRÍ   — archplan/src/main.ts
 * VAI TRÒ  — Entry point app standalone: mount ArchPlanLab full-screen vào canvas #app.
 * LIÊN HỆ  — ArchPlanLab (./archplan/ArchPlanLab) extends BaseWorld (threejs-modules); dùng
 *            building-kit (threejs-modules/building) sinh hình. Khác bản nhúng Doraemon (overlay
 *            #archplan-btn) — đây là app riêng, canvas chiếm trọn viewport.
 */

import { ArchPlanLab } from './archplan/ArchPlanLab'

const canvas = document.querySelector<HTMLCanvasElement>('#app')
if (!canvas) throw new Error('ArchPlan: không tìm thấy canvas #app')

const lab = new ArchPlanLab(canvas)
void lab.init()
