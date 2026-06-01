/**
 * VỊ TRÍ   — archplan/src/archplan/gui/devhud.ts
 * VAI TRÒ  — Dev perf HUD (chỉ dev): 3 dòng — fps/ms · budget(draw/tri/geo/tex) · leak watch.
 *            Đọc renderer.info mỗi frame, hiện SỐ (RuntimeGuard chỉ warn khi vượt budget).
 * LIÊN HỆ  — Tách từ ArchPlanLab. Host truyền container + gọi update(info, dt) mỗi frame, toggle()
 *            khi bấm phím `. CSS: class .ap-perf-hud / .ap-perf-leak + dataset.state (ok/warn/bad).
 *
 * CÁCH DÙNG:
 *   const hud = new DevHud(canvas.parentElement)   // chỉ tạo ở import.meta.env.DEV
 *   hud.update(renderer.info, deltaTime)            // trong onUpdate
 *   hud.toggle()                                    // phím `
 *   hud.dispose()                                   // onDispose
 *
 * DISPOSE: gỡ phần tử DOM khỏi container. Không giữ GPU resource.
 */

// Subset renderer.info — decouple khỏi WebGPURenderer type (structural match).
export interface RenderInfo {
  render: { drawCalls: number; triangles: number }
  memory: { geometries: number; textures: number }
}

export class DevHud {
  private el: HTMLElement | null = null
  private perfEl: HTMLElement | null = null
  private budgetEl: HTMLElement | null = null
  private leakEl: HTMLElement | null = null
  private on = true
  private fps = 0 // EMA fps — làm mượt jitter mỗi frame
  // Leak watch: geo/tex tăng liên tục ≥10 frame = nghi leak (sweep hỏng). Cùng heuristic RuntimeGuard.
  private prevGeo = 0
  private prevTex = 0
  private riseGeo = 0
  private riseTex = 0
  private isDisposed = false

  constructor(private readonly host: HTMLElement) {
    this._sync()
  }

  // Bật/tắt HUD bằng phím ` (Backquote). Mặc định hiện.
  toggle(): void {
    this.on = !this.on
    this._sync()
  }

  // Gọi mỗi frame. info = renderer.info; dt giây (deltaTime từ loop).
  update(info: RenderInfo, dt: number): void {
    if (dt > 0) this.fps = this.fps > 0 ? this.fps * 0.9 + 0.1 / dt : 1 / dt
    if (this.on) this._render(info)
  }

  dispose(): void {
    if (this.isDisposed) return
    this.el?.remove()
    this.el = null
    this.perfEl = null
    this.budgetEl = null
    this.leakEl = null
    this.isDisposed = true
  }

  // Tạo (lazy) hoặc gỡ HUD theo `on`. 1 panel 3 dòng.
  private _sync(): void {
    if (!this.on) {
      this.el?.remove()
      this.el = null
      this.perfEl = null
      this.budgetEl = null
      this.leakEl = null
      return
    }
    if (!this.el) {
      const el = document.createElement('div')
      el.className = 'ap-perf-hud'
      this.perfEl = document.createElement('div')
      this.budgetEl = document.createElement('div')
      this.leakEl = document.createElement('div')
      this.leakEl.className = 'ap-perf-leak'
      el.append(this.perfEl, this.budgetEl, this.leakEl)
      this.host.appendChild(el)
      this.el = el
    }
  }

  // Phân hạng giá trị → state màu (ok ≥ hi · warn ≥ lo · else bad). Tránh nested ternary (eslint).
  private _band(v: number, hi: number, lo: number): string {
    if (v >= hi) return 'ok'
    if (v >= lo) return 'warn'
    return 'bad'
  }

  // Dòng 1 fps/ms (mượt = tín hiệu LAG). Dòng 2 budget (ĐỎ nếu draw>100 hoặc tri>500k). Dòng 3 leak.
  private _render(info: RenderInfo): void {
    if (!this.perfEl || !this.budgetEl) return
    const { render, memory } = info
    const fps = Math.round(this.fps)
    const ms = this.fps > 0 ? (1000 / this.fps).toFixed(1) : '—'
    this.perfEl.textContent = `${fps} fps · ${ms} ms`
    this.perfEl.dataset.state = this._band(fps, 50, 30)
    const tri = render.triangles
    this.budgetEl.textContent = `draw ${render.drawCalls}/100 · tri ${Math.round(tri / 1000)}k/500k · geo ${memory.geometries} · tex ${memory.textures}`
    this.budgetEl.dataset.state = render.drawCalls > 100 || tri > 500_000 ? 'bad' : 'ok'
    this._leak(memory.geometries, memory.textures)
  }

  // Bảng leak: geo/tex tăng liên tục ≥10 frame → đỏ "nghi leak"; đang tăng → vàng; đứng yên → xanh.
  private _leak(geo: number, tex: number): void {
    if (!this.leakEl) return
    this.riseGeo = geo > this.prevGeo ? this.riseGeo + 1 : 0
    this.riseTex = tex > this.prevTex ? this.riseTex + 1 : 0
    this.prevGeo = geo
    this.prevTex = tex
    const rise = Math.max(this.riseGeo, this.riseTex)
    let state = 'ok'
    let msg = '✓ ổn định — không leak'
    if (this.riseGeo >= 10 || this.riseTex >= 10) {
      state = 'bad'
      msg = `⚠ NGHI LEAK — geo/tex tăng ${rise} frame`
    } else if (rise > 0) {
      state = 'warn'
      msg = `↑ tăng ${rise}f (rebuild)`
    }
    this.leakEl.textContent = msg
    this.leakEl.dataset.state = state
  }
}
