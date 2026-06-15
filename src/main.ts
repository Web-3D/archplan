/**
 * VỊ TRÍ   — archplan/src/main.ts
 * VAI TRÒ  — Entry point app standalone: mount ArchPlanLab full-screen vào canvas #app.
 * LIÊN HỆ  — ArchPlanLab (./archplan/ArchPlanLab) extends BaseWorld (threejs-modules); dùng
 *            building-kit (threejs-modules/building) sinh hình. Khác bản nhúng Doraemon (overlay
 *            #archplan-btn) — đây là app riêng, canvas chiếm trọn viewport.
 */

import { ArchPlanLab } from './archplan/ArchPlanLab'
import { gpuLimits } from './gpu-limits'

const canvas = document.querySelector<HTMLCanvasElement>('#app')
if (!canvas) throw new Error('ArchPlan: không tìm thấy canvas #app')

// antialias:false — cảnh có reflector (hồ nước): MSAA phần cứng xung khắc reflector RTT → mất phản chiếu
// + flood WebGPU validation (KI-007). Khử răng cưa bù bằng FXAA post (bước kế). Default lõi vẫn true.
async function boot(c: HTMLCanvasElement): Promise<void> {
  const lab = new ArchPlanLab(c, { antialias: false, requiredLimits: await gpuLimits() })
  await lab.init()
}

void boot(canvas)
