/**
 * VỊ TRÍ   — archplan/src/gpu-limits.ts
 * VAI TRÒ  — Query adapter WebGPU → requiredLimits nâng sampler/sampled-texture (CLAMP theo adapter; requestDevice
 *            fail-cứng nếu vượt → máy chỉ-16 trả undefined = giữ mặc định, không vỡ). Đèn point-shadow + nhiều
 *            PBR-map + sun-shadow + reflector + IBL ⇒ dễ vượt 16 default ⇒ pipeline VỠ (đen + texture leak).
 * LIÊN HỆ  — Dùng CHUNG main.ts (editor) + site-viewer.ts (production) → 2 entry khởi tạo renderer cùng cấu hình
 *            GPU ⇒ sampler-budget KHỚP nhau khi so HUD. Adapter query = adapter renderer dùng (cùng máy).
 */

export async function gpuLimits(): Promise<Record<string, number> | undefined> {
  const adapter = await navigator.gpu?.requestAdapter()
  if (!adapter) return undefined
  const lim: Record<string, number> = {}
  if (adapter.limits.maxSampledTexturesPerShaderStage > 16)
    lim.maxSampledTexturesPerShaderStage = adapter.limits.maxSampledTexturesPerShaderStage
  if (adapter.limits.maxSamplersPerShaderStage > 16)
    lim.maxSamplersPerShaderStage = adapter.limits.maxSamplersPerShaderStage
  return Object.keys(lim).length > 0 ? lim : undefined
}
