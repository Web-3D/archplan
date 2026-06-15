/**
 * VỊ TRÍ   — archplan/src/archplan/lighting/LightPanel.ts
 * VAI TRÒ  — Panel GUI hệ đèn — MẶT RIÊNG (float, KHÔNG nhét drawer Ground). Liệt kê đèn-pha + slider
 *            (X/Z/ngắm/sáng/góc/mềm/tầm) + màu + thêm/xoá. Tái dùng sliderRow (gui/tweak) → đồng bộ style.
 * LIÊN HỆ  — host = LightingController (configs + callback sync/persist/structural). focus(i) ← click 3D (Focus).
 *
 * CÁCH DÙNG: const p = new LightPanel(container, host); p.rebuild(); p.focus(i)
 * DISPOSE: dispose() — gỡ wrap khỏi DOM (không GPU resource).
 */

import type { UplightConfig } from 'threejs-modules/site/lighting/SiteLightingSystem'

import { sliderRow } from '../gui/tweak'

export interface LightPanelHost {
  configs: UplightConfig[]
  changed: (commit: boolean) => void // slider sửa: false=live (sync), true=commit (sync+persist)
  structural: () => void // thêm/xoá đèn: sync+persist (panel tự rebuild sau)
  add: () => void // push 1 đèn mặc định vào configs
}

const DEG = 180 / Math.PI

export class LightPanel {
  private readonly wrap: HTMLElement
  private readonly list: HTMLElement
  private readonly cards: HTMLElement[] = []
  private isDisposed = false

  constructor(
    container: Element,
    private readonly host: LightPanelHost
  ) {
    this.wrap = document.createElement('div')
    this.wrap.className = 'ap-light-float'
    this.wrap.style.cssText =
      'position:absolute;top:64px;right:8px;width:236px;max-height:70vh;overflow:auto;' +
      'background:rgba(20,22,28,.92);color:#dfe3ea;font:11px system-ui,sans-serif;' +
      'padding:8px 10px;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.5);z-index:20'
    this.wrap.appendChild(this._header())
    this.list = document.createElement('div')
    this.wrap.appendChild(this.list)
    container.appendChild(this.wrap)
    this.rebuild()
  }

  /** Dựng lại danh sách card (gọi sau add/remove). */
  rebuild(): void {
    if (this.isDisposed) return
    this.list.innerHTML = ''
    this.cards.length = 0
    this.host.configs.forEach((_, i) => {
      const card = this._card(i)
      this.cards.push(card)
      this.list.appendChild(card)
    })
    if (this.host.configs.length === 0) this.list.appendChild(this._emptyHint())
  }

  /** Cuộn tới + nháy viền card đèn i (👆 Focus từ click 3D). */
  focus(i: number): void {
    const card = this.cards[i]
    if (!card) return
    card.scrollIntoView({ block: 'nearest' })
    card.style.outline = '2px solid #ffd9a0'
    window.setTimeout(() => (card.style.outline = 'none'), 900)
  }

  dispose(): void {
    if (this.isDisposed) return
    this.isDisposed = true
    this.wrap.remove()
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private _header(): HTMLElement {
    const head = document.createElement('div')
    head.style.cssText =
      'display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;font-weight:600'
    const title = document.createElement('span')
    title.textContent = '🔦 Đèn pha (uplight)'
    const add = document.createElement('button')
    add.textContent = '＋'
    add.title = 'Thêm 1 đèn pha'
    add.style.cssText =
      'cursor:pointer;background:#3a4150;color:#fff;border:none;border-radius:4px;width:22px;height:20px'
    add.addEventListener('click', () => {
      this.host.add()
      this.host.structural()
      this.rebuild()
    })
    head.append(title, add)
    return head
  }

  private _emptyHint(): HTMLElement {
    const hint = document.createElement('div')
    hint.style.cssText = 'opacity:.6;line-height:1.4;padding:4px 0'
    hint.textContent = 'Chưa có đèn pha. Bấm ＋ để thêm — rọi gốc cây / tường / tượng.'
    return hint
  }

  private _card(i: number): HTMLElement {
    const c = this.host.configs[i]
    const card = document.createElement('div')
    card.style.cssText = 'border-top:1px solid #2c313c;padding:6px 0;margin-top:4px'
    card.appendChild(this._cardHead(i))
    for (const [label, min, max, step, get, set] of this._rows(c)) {
      card.appendChild(
        sliderRow(label, min, max, step, get(), (v, commit) => {
          set(v)
          this.host.changed(commit)
        })
      )
    }
    card.appendChild(
      this._colorRow('Màu', c.color, (hex, commit) => {
        c.color = hex
        this.host.changed(commit)
      })
    )
    return card
  }

  private _cardHead(i: number): HTMLElement {
    const head = document.createElement('div')
    head.style.cssText =
      'display:flex;align-items:center;justify-content:space-between;margin-bottom:3px;font-weight:600'
    const name = document.createElement('span')
    name.textContent = `Đèn pha ${i + 1}`
    const del = document.createElement('button')
    del.textContent = '✕'
    del.title = 'Xoá đèn này'
    del.style.cssText = 'cursor:pointer;background:none;color:#e08a8a;border:none;font-size:13px'
    del.addEventListener('click', () => {
      this.host.configs.splice(i, 1)
      this.host.structural()
      this.rebuild()
    })
    head.append(name, del)
    return head
  }

  // Bảng slider 1 đèn: [nhãn, min, max, step, get, set] — góc lưu rad (UI = độ); mềm 0..1 (UI = %).
  private _rows(
    c: UplightConfig
  ): [string, number, number, number, () => number, (v: number) => void][] {
    return [
      ['X m', -20, 20, 0.1, () => c.x, (v) => (c.x = v)],
      ['Z m', -20, 20, 0.1, () => c.z, (v) => (c.z = v)],
      ['Ngắm X', -20, 20, 0.1, () => c.aimX, (v) => (c.aimX = v)],
      ['Ngắm Z', -20, 20, 0.1, () => c.aimZ, (v) => (c.aimZ = v)],
      ['Cao chiếu', 0, 6, 0.1, () => c.aimY, (v) => (c.aimY = v)],
      ['Sáng', 0, 30, 0.5, () => c.intensity, (v) => (c.intensity = v)],
      ['Góc °', 5, 80, 1, () => c.angle * DEG, (v) => (c.angle = v / DEG)],
      ['Mềm %', 0, 100, 5, () => c.penumbra * 100, (v) => (c.penumbra = v / 100)],
      ['Tầm m', 0, 30, 0.5, () => c.range, (v) => (c.range = v)],
    ]
  }

  private _colorRow(
    label: string,
    initial: number,
    onChange: (hex: number, commit: boolean) => void
  ): HTMLElement {
    const row = document.createElement('div')
    row.style.cssText = 'display:flex;align-items:center;gap:4px;margin-bottom:3px'
    const lbl = document.createElement('span')
    lbl.textContent = label
    lbl.style.cssText = 'width:60px;flex-shrink:0'
    const inp = document.createElement('input')
    inp.type = 'color'
    inp.value = '#' + (initial & 0xffffff).toString(16).padStart(6, '0')
    inp.style.cssText = 'flex:1;min-width:0;height:16px;border:none;background:none;cursor:pointer'
    const read = (): number => parseInt(inp.value.slice(1), 16)
    inp.addEventListener('input', () => onChange(read(), false))
    inp.addEventListener('change', () => onChange(read(), true))
    row.append(lbl, inp)
    return row
  }
}
