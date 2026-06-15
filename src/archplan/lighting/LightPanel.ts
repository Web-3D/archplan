/**
 * VỊ TRÍ   — archplan/src/archplan/lighting/LightPanel.ts
 * VAI TRÒ  — Panel GUI hệ đèn — MẶT RIÊNG (float, KHÔNG nhét drawer Ground). Render N MỤC fixture
 *            (🔦 đèn pha · 🟡 bollard · 🎏 đèn dây), mỗi mục = header(＋) + card slider + màu + xoá.
 *            Dumb-renderer: nhận PanelSection[] (controller dựng, đóng kín config typed theo INDEX → 0 `any`).
 * LIÊN HỆ  — host = LightingController. focus(s,i) ← click 3D (Focus) trỏ đúng card mục s.
 *
 * CÁCH DÙNG: const p = new LightPanel(container, sections); p.rebuild(); p.focus(s, i)
 * DISPOSE: dispose() — gỡ wrap khỏi DOM (không GPU resource).
 */

import { sliderRow } from '../gui/tweak'

// 1 hàng slider: [nhãn, min, max, step, get, set]. get/set đóng kín config typed (controller dựng).
export type LightRow = [string, number, number, number, () => number, (v: number) => void]

// 1 MỤC fixture — mọi truy cập theo INDEX (không lộ generic ra array) → trộn 3 loại config trong 1 panel.
export interface PanelSection {
  icon: string
  name: string // số ít, vd 'Đèn pha' → card 'Đèn pha 1'
  hint: string // gợi ý khi rỗng
  focusColor: string // viền nháy lúc Focus
  liveDrag: boolean // false = chỉ cập nhật lúc buông (string rebuild geometry)
  count: () => number
  rows: (i: number) => LightRow[]
  colorOf: (i: number) => number
  setColor: (i: number, hex: number, commit: boolean) => void
  add: () => void // push 1 config mặc định + sync hệ + persist
  remove: (i: number) => void // splice + sync hệ + persist
  changed: (commit: boolean) => void // slider/màu sửa: false=live, true=commit
}

export class LightPanel {
  private readonly wrap: HTMLElement
  private readonly lists: HTMLElement[] = [] // 1 list/mục
  private readonly cards: HTMLElement[][] = [] // cards[s][i]
  private isDisposed = false

  constructor(
    container: Element,
    private readonly sections: PanelSection[]
  ) {
    this.wrap = document.createElement('div')
    this.wrap.className = 'ap-light-float'
    this.wrap.style.cssText =
      'position:absolute;top:64px;right:8px;width:240px;max-height:78vh;overflow:auto;' +
      'background:rgba(20,22,28,.92);color:#dfe3ea;font:11px system-ui,sans-serif;' +
      'padding:8px 10px;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.5);z-index:20'
    this.sections.forEach((s, si) => {
      this.wrap.appendChild(this._sectionHead(s, si))
      const list = document.createElement('div')
      this.lists.push(list)
      this.cards.push([])
      this.wrap.appendChild(list)
    })
    container.appendChild(this.wrap)
    this.rebuild()
  }

  /** Dựng lại toàn bộ card (gọi sau add/remove bất kỳ mục). */
  rebuild(): void {
    if (this.isDisposed) return
    this.sections.forEach((s, si) => this._rebuildSection(s, si))
  }

  /** Cuộn tới + nháy viền card i của mục s (👆 Focus từ click 3D). */
  focus(s: number, i: number): void {
    const card = this.cards[s]?.[i]
    if (!card) return
    card.scrollIntoView({ block: 'nearest' })
    card.style.outline = `2px solid ${this.sections[s].focusColor}`
    window.setTimeout(() => (card.style.outline = 'none'), 900)
  }

  dispose(): void {
    if (this.isDisposed) return
    this.isDisposed = true
    this.wrap.remove()
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private _rebuildSection(s: PanelSection, si: number): void {
    const list = this.lists[si]
    list.innerHTML = ''
    this.cards[si] = []
    const n = s.count()
    for (let i = 0; i < n; i++) {
      const card = this._card(s, i)
      this.cards[si].push(card)
      list.appendChild(card)
    }
    if (n === 0) list.appendChild(this._emptyHint(s))
  }

  private _sectionHead(s: PanelSection, si: number): HTMLElement {
    const head = document.createElement('div')
    head.style.cssText =
      'display:flex;align-items:center;justify-content:space-between;font-weight:600;' +
      (si === 0
        ? 'margin-bottom:6px'
        : 'margin:10px 0 6px;border-top:1px solid #353b47;padding-top:8px')
    const title = document.createElement('span')
    title.textContent = `${s.icon} ${s.name}`
    const add = document.createElement('button')
    add.textContent = '＋'
    add.title = `Thêm 1 ${s.name.toLowerCase()}`
    add.style.cssText =
      'cursor:pointer;background:#3a4150;color:#fff;border:none;border-radius:4px;width:22px;height:20px'
    add.addEventListener('click', () => {
      s.add()
      this.rebuild()
    })
    head.append(title, add)
    return head
  }

  private _emptyHint(s: PanelSection): HTMLElement {
    const hint = document.createElement('div')
    hint.style.cssText = 'opacity:.6;line-height:1.4;padding:2px 0 4px'
    hint.textContent = s.hint
    return hint
  }

  private _card(s: PanelSection, i: number): HTMLElement {
    const card = document.createElement('div')
    card.style.cssText = 'border-top:1px solid #2c313c;padding:6px 0;margin-top:4px'
    card.appendChild(this._cardHead(s, i))
    for (const [label, min, max, step, get, set] of s.rows(i)) {
      card.appendChild(
        sliderRow(
          label,
          min,
          max,
          step,
          get(),
          (v, commit) => {
            set(v)
            s.changed(commit)
          },
          s.liveDrag
        )
      )
    }
    card.appendChild(this._colorRow(s.colorOf(i), (hex, commit) => s.setColor(i, hex, commit)))
    return card
  }

  private _cardHead(s: PanelSection, i: number): HTMLElement {
    const head = document.createElement('div')
    head.style.cssText =
      'display:flex;align-items:center;justify-content:space-between;margin-bottom:3px;font-weight:600'
    const name = document.createElement('span')
    name.textContent = `${s.name} ${i + 1}`
    const del = document.createElement('button')
    del.textContent = '✕'
    del.title = 'Xoá đèn này'
    del.style.cssText = 'cursor:pointer;background:none;color:#e08a8a;border:none;font-size:13px'
    del.addEventListener('click', () => {
      s.remove(i)
      this.rebuild()
    })
    head.append(name, del)
    return head
  }

  private _colorRow(
    initial: number,
    onChange: (hex: number, commit: boolean) => void
  ): HTMLElement {
    const row = document.createElement('div')
    row.style.cssText = 'display:flex;align-items:center;gap:4px;margin-bottom:3px'
    const lbl = document.createElement('span')
    lbl.textContent = 'Màu'
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
