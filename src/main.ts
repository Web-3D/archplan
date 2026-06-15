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

// 💡 Đèn point-shadow = +1 sampled-texture +1 sampler / đèn trong fragment stage. Mặc định WebGPU chỉ cho 16
// → nhiều PBR-map + sun-shadow + reflector + IBL + shadow đèn ⇒ vượt 16 ⇒ pipeline VỠ (đen + texture leak).
// Query adapter → request đúng MAX nó hỗ trợ (CLAMP: requestDevice fail-cứng nếu vượt; máy chỉ-16 → undefined
// = giữ mặc định, không vỡ). Adapter của query = adapter renderer dùng (cùng máy) → limit khớp.
async function gpuLimits(): Promise<Record<string, number> | undefined> {
  const adapter = await navigator.gpu?.requestAdapter()
  if (!adapter) return undefined
  const lim: Record<string, number> = {}
  if (adapter.limits.maxSampledTexturesPerShaderStage > 16)
    lim.maxSampledTexturesPerShaderStage = adapter.limits.maxSampledTexturesPerShaderStage
  if (adapter.limits.maxSamplersPerShaderStage > 16)
    lim.maxSamplersPerShaderStage = adapter.limits.maxSamplersPerShaderStage
  return Object.keys(lim).length > 0 ? lim : undefined
}

// antialias:false — cảnh có reflector (hồ nước): MSAA phần cứng xung khắc reflector RTT → mất phản chiếu
// + flood WebGPU validation (KI-007). Khử răng cưa bù bằng FXAA post (bước kế). Default lõi vẫn true.
async function boot(c: HTMLCanvasElement): Promise<void> {
  const lab = new ArchPlanLab(c, { antialias: false, requiredLimits: await gpuLimits() })
  await lab.init()
}

void boot(canvas)
