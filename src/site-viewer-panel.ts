/**
 * VỊ TRÍ   — archplan/src/site-viewer-panel.ts
 * VAI TRÒ  — Bảng điều khiển DOM NHẸ cho site-viewer production (KHÔNG lil-gui — giữ bundle nhẹ). Pill đáy-giữa:
 *            Thời tiết (Tạnh/Mưa/Tuyết) · slider Giờ (ánh sáng) · toggle Đói bậc 4 · Cho ăn · Tăng đàn · Reset.
 * LIÊN HỆ  — Consumer: site-viewer.ts (truyền callbacks → gọi PondFish/Precipitation/sun của viewer). Thuần UI,
 *            KHÔNG biết Three.js. Style = 1 <style> tự chèn (dispose gỡ). Mirror demo.ts._buildSunSlider.
 *
 * CÁCH DÙNG: const panel = new SiteViewerPanel(host, callbacks)  // host = canvas.parentElement
 * DISPOSE: dispose() — gỡ panel DOM + <style>.
 */

export type WeatherMode = 'none' | 'rain' | 'snow'

export interface SiteViewerPanelCallbacks {
  onWeather(mode: WeatherMode): void
  onSunTime(t: number): void // 0..1 (0=bình minh, 0.5=trưa, 1=hoàng hôn)
  onForageT4(on: boolean): void // bật đói (forage) cho cá bậc 4
  onFeedDrop(on: boolean): void // bật mode THẢ MỒI = click hồ rơi mồi tại chỗ
  onSpawnTier5(): void // tạo 1 đàn cá bậc 5 (mồi cho bậc 4 dí ăn)
  onFeed(): void // rải mồi auto (mọi đàn)
  onGrow(): void
  onReset(): void
}

const CSS = `
.svp { position:absolute; left:50%; bottom:20px; transform:translateX(-50%); z-index:30;
  display:flex; flex-direction:column; gap:8px; padding:10px 14px; border-radius:14px;
  background:rgba(14,22,28,.82); border:1px solid rgba(120,180,200,.3);
  box-shadow:0 6px 20px rgba(0,0,0,.32); backdrop-filter:blur(5px);
  font:600 12px/1 ui-sans-serif,system-ui,sans-serif; color:#d7e2ec; user-select:none; }
.svp-row { display:flex; align-items:center; gap:8px; justify-content:center; }
.svp-btn { cursor:pointer; padding:6px 11px; border-radius:9px; border:1px solid rgba(150,180,200,.28);
  background:rgba(255,255,255,.06); color:#d7e2ec; font:inherit; transition:background .12s,border-color .12s; }
.svp-btn:hover { background:rgba(255,255,255,.14); }
.svp-btn[data-on='1'] { background:#2f6f8f; border-color:#5fb0d0; color:#eaf6ff; }
.svp-lbl { opacity:.85; min-width:46px; }
.svp input[type='range'] { width:200px; cursor:pointer; accent-color:#ffd27a; }
`

export class SiteViewerPanel {
  private readonly root: HTMLDivElement
  private readonly style: HTMLStyleElement
  private readonly wxBtns: Record<WeatherMode, HTMLButtonElement>
  private _forageBtn: HTMLButtonElement | null = null
  private _dropBtn: HTMLButtonElement | null = null
  private _forageOn = false
  private _dropOn = false

  constructor(
    private readonly host: HTMLElement,
    private readonly cb: SiteViewerPanelCallbacks
  ) {
    this.style = document.createElement('style')
    this.style.textContent = CSS
    document.head.appendChild(this.style)
    this.root = document.createElement('div')
    this.root.className = 'svp'
    this.wxBtns = this._weatherRow()
    this.root.appendChild(this._sunRow())
    this.root.appendChild(this._toolRow())
    this.root.appendChild(this._actionRow())
    this.host.appendChild(this.root)
  }

  // Hàng Thời tiết: 3 nút toggle độc quyền (1 active). Trả map để set highlight.
  private _weatherRow(): Record<WeatherMode, HTMLButtonElement> {
    const row = document.createElement('div')
    row.className = 'svp-row'
    const lbl = this._label('Thời tiết')
    const btns = {
      none: this._btn('☀️ Tạnh', () => this._pickWeather('none')),
      rain: this._btn('🌧️ Mưa', () => this._pickWeather('rain')),
      snow: this._btn('❄️ Tuyết', () => this._pickWeather('snow')),
    }
    btns.none.dataset.on = '1'
    row.append(lbl, btns.none, btns.rain, btns.snow)
    this.root.appendChild(row)
    return btns
  }

  private _pickWeather(mode: WeatherMode): void {
    for (const m of ['none', 'rain', 'snow'] as WeatherMode[])
      this.wxBtns[m].dataset.on = m === mode ? '1' : '0'
    this.cb.onWeather(mode)
  }

  // Hàng Ánh sáng: slider Giờ 0..1.
  private _sunRow(): HTMLDivElement {
    const row = document.createElement('div')
    row.className = 'svp-row'
    const slider = document.createElement('input')
    slider.type = 'range'
    slider.min = '0'
    slider.max = '1'
    slider.step = '0.01'
    slider.value = '0.5'
    slider.addEventListener('input', () => this.cb.onSunTime(parseFloat(slider.value)))
    row.append(this._label('☀️ Giờ'), slider)
    return row
  }

  // Hàng hành động: Đói bậc 4 (toggle) · Cho ăn · Tăng đàn · Reset.
  // Hàng công cụ cá: Đói bậc 4 (toggle) · Thả mồi (toggle) · Tạo bậc 5 (button).
  private _toolRow(): HTMLDivElement {
    const row = document.createElement('div')
    row.className = 'svp-row'
    this._forageBtn = this._btn('🍴 Đói bậc 4', () => this._toggleForage())
    this._dropBtn = this._btn('🖱 Thả mồi', () => this._toggleDrop())
    row.append(
      this._forageBtn,
      this._dropBtn,
      this._btn('🐟＋ Tạo bậc 5', () => this.cb.onSpawnTier5())
    )
    return row
  }

  // Hàng hành động: Cho ăn (rải auto) · Tăng đàn · Reset.
  private _actionRow(): HTMLDivElement {
    const row = document.createElement('div')
    row.className = 'svp-row'
    row.append(
      this._btn('🍽 Cho ăn', () => this.cb.onFeed()),
      this._btn('🐟 Tăng đàn', () => this.cb.onGrow()),
      this._btn('↺ Reset', () => this._reset())
    )
    return row
  }

  private _toggleForage(): void {
    this._forageOn = !this._forageOn
    if (this._forageBtn) this._forageBtn.dataset.on = this._forageOn ? '1' : '0'
    this.cb.onForageT4(this._forageOn)
  }

  private _toggleDrop(): void {
    this._dropOn = !this._dropOn
    if (this._dropBtn) this._dropBtn.dataset.on = this._dropOn ? '1' : '0'
    this.cb.onFeedDrop(this._dropOn)
  }

  // Reset: trả UI panel về mặc định (Tạnh + đói off + thả-mồi off) rồi gọi callback reset cảnh.
  private _reset(): void {
    this._pickWeather('none')
    if (this._forageOn) this._toggleForage()
    if (this._dropOn) this._toggleDrop()
    this.cb.onReset()
  }

  private _btn(text: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button')
    b.className = 'svp-btn'
    b.type = 'button'
    b.textContent = text
    b.dataset.on = '0'
    b.addEventListener('click', onClick)
    return b
  }

  private _label(text: string): HTMLSpanElement {
    const s = document.createElement('span')
    s.className = 'svp-lbl'
    s.textContent = text
    return s
  }

  dispose(): void {
    this.root.remove()
    this.style.remove()
  }
}
