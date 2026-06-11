/**
 * VỊ TRÍ   — 01-Doraemon/src/sandbox/archplan/interaction/palette.ts
 * VAI TRÒ  — Panel 🎨 Palette: nút "khay đang chọn" → popover browser (search + group + preview),
 *            bảng pha màu oval (swatch dab) + cọ sơn. Tách từ ArchPlanLab (giảm monolith).
 * LIÊN HỆ  — Tạo bởi ArchPlanLab._setupGUI qua PaletteHost (state/persist/brush/paintMode/parent).
 *            Khay màu: ../palettes.generated (atelier, KHÔNG sửa tay).
 *
 * CÁCH DÙNG:
 *   const palette = new PalettePanel(host)
 *   palette.build(leftTools)   // dựng DOM — gọi lại mỗi _rebuildGUI (panel bị destroy/recreate)
 *   palette.markSwatch(null)   // bỏ chọn swatch (khi thoát paint/move bằng chuột phải / bật Move)
 *   palette.closeBrowser()     // gỡ popover + listener document trước khi rebuild
 *   palette.dispose()          // onDispose
 * DISPOSE: gỡ listener document (mousedown/keydown) của popover. DOM panel do leftTools.remove() dọn.
 */

import { type Palette, type PaletteColor, PALETTES } from '../palettes.generated'
import type { BuildingState } from '../state/state'

// Host: ArchPlanLab cấp state + bridge brush/paint. Brush color & paintMode DÙNG CHUNG với paint
// subsystem (vẫn ở lab) nên palette chỉ set/đọc qua đây. parent = leftTools (đổi mỗi _rebuildGUI).
export interface PaletteHost {
  parent(): HTMLElement | null
  getState(): BuildingState
  persist(): void
  getBrush(): number | null
  setBrush(color: number | null): void
  isPainting(): boolean
  setPaintMode(on: boolean): void
}

export class PalettePanel {
  private _palCurrentBtn: HTMLElement | null = null
  private _palPop: HTMLElement | null = null
  private _palListEl: HTMLElement | null = null
  private _palOutside: ((e: MouseEvent) => void) | null = null
  private _palKey: ((e: KeyboardEvent) => void) | null = null
  private _palSearchInput: HTMLInputElement | null = null
  private _swatchGrid: HTMLElement | null = null
  private _panelBody: HTMLElement | null = null // body panel (cur + lưới swatch) — toggle thả xuống (phím X)
  private _panelTtl: HTMLButtonElement | null = null // nút tiêu đề ▸/▾ 🎨 Palette
  private _palMix: HTMLElement | null = null // giếng pha ở tâm bảng — hiển thị màu cọ đang cầm
  private _palMoved = false
  private _palDrag: {
    sx: number
    sy: number
    px: number
    py: number
    moved: boolean
    panel: HTMLElement
  } | null = null
  // Vị trí đã kéo (relative leftTools) — GIỮ qua _rebuildGUI để panel không nhảy về chỗ cũ khi
  // sửa element trong GUI. null = chưa kéo (in-flow dưới Move). Reset khi reload (UI-only).
  private _palPos: { left: number; top: number } | null = null

  constructor(private readonly host: PaletteHost) {}

  // Ủy quyền về host — để body method giữ NGUYÊN VĂN (this.state / this._brushColor / this.paintMode…).
  private get state(): BuildingState {
    return this.host.getState()
  }
  private get leftTools(): HTMLElement | null {
    return this.host.parent()
  }
  private get _brushColor(): number | null {
    return this.host.getBrush()
  }
  private set _brushColor(color: number | null) {
    this.host.setBrush(color)
  }
  private get paintMode(): boolean {
    return this.host.isPainting()
  }
  private _setPaintMode(on: boolean): void {
    this.host.setPaintMode(on)
  }
  private _persist(): void {
    this.host.persist()
  }

  dispose(): void {
    this.closeBrowser()
  }

  // 🎨 Palette panel: nút "khay đang chọn" (strip+tên) → bấm mở POPOVER browser (search + group +
  // preview, scale hàng trăm khay) thay <select> phẳng. Dưới là lưới swatch của khay đang chọn.
  build(tools: HTMLElement): void {
    const p = document.createElement('div')
    p.className = 'ap-scan-panel ap-palette-panel'
    const ttl = document.createElement('button')
    ttl.className = 'ap-scan-title'
    ttl.textContent = '▸ 🎨' // symbol-only (bỏ tên — khay tiện ích 🧰 2026-06-11); mặc định ĐÓNG
    ttl.title = 'Palette màu — click thả/thu (X) · kéo để dời · nút 🎨 khay tiện ích = hiện/ẩn'
    const body = document.createElement('div')
    body.style.display = 'none'
    const cur = document.createElement('button')
    cur.className = 'ap-pal-current'
    cur.addEventListener('click', () => this._togglePaletteBrowser())
    this._palCurrentBtn = cur
    this._panelBody = body
    this._panelTtl = ttl
    ttl.addEventListener('click', () => {
      if (this._palMoved) {
        this._palMoved = false // vừa kéo xong → bỏ qua toggle thu/mở lần này
        return
      }
      this.togglePanel()
    })
    ttl.addEventListener('pointerdown', (e) => this._palDragStart(e, p, ttl))
    ttl.addEventListener('pointermove', (e) => this._palDragMove(e))
    ttl.addEventListener('pointerup', (e) => this._palDragEnd(e, ttl))
    const grid = document.createElement('div')
    grid.className = 'ap-swatch-palette'
    this._swatchGrid = grid
    body.append(cur, grid)
    p.append(ttl, body)
    tools.appendChild(p)
    if (this._palPos) {
      // khôi phục vị trí đã kéo (qua _rebuildGUI) — panel cuối nên absolute không xô panel khác
      p.style.position = 'absolute'
      p.style.left = `${this._palPos.left}px`
      p.style.top = `${this._palPos.top}px`
      p.style.zIndex = '5'
    }
    this.state.paletteId = this.state.paletteId ?? PALETTES[0]?.id ?? ''
    this._updatePalCurrent()
    this._renderSwatches()
  }

  // Strip preview 1 khay = gradient cứng-cạnh chia đều theo số màu (1 div, nhẹ kể cả trăm khay).
  private _paletteStripCss(pal: Palette): string {
    const n = pal.colors.length
    if (n === 0) return 'transparent'
    const seg = 100 / n
    const stops = pal.colors.map((c, i) => `${c.hex} ${i * seg}% ${(i + 1) * seg}%`)
    return `linear-gradient(90deg, ${stops.join(', ')})`
  }

  // Cập nhật nút "khay đang chọn": strip + tên khay hiện hành.
  private _updatePalCurrent(): void {
    const btn = this._palCurrentBtn
    if (!btn) return
    const pal = PALETTES.find((p) => p.id === this.state.paletteId)
    const strip = document.createElement('span')
    strip.className = 'ap-pal-strip'
    if (pal) strip.style.background = this._paletteStripCss(pal)
    const name = document.createElement('span')
    name.className = 'ap-pal-name'
    name.textContent = pal ? pal.name : '— chọn khay —'
    const caret = document.createElement('span')
    caret.className = 'ap-pal-caret'
    caret.textContent = '▸'
    btn.replaceChildren(strip, name, caret)
  }

  private _togglePaletteBrowser(): void {
    if (this._palPop) this.closeBrowser()
    else this._openPaletteBrowser()
  }

  /** Thả/thu MENU panel 🎨 Palette (body = lưới swatch) — gọi từ nút tiêu đề HOẶC phím tắt X (ArchPlanLab).
   *  KHÁC _togglePaletteBrowser (popover tìm-kiếm-màu) — X mở menu thả xuống, không phải search. */
  togglePanel(): void {
    const body = this._panelBody
    const ttl = this._panelTtl
    if (!body || !ttl) return
    const open = body.style.display !== 'none'
    body.style.display = open ? 'none' : ''
    ttl.textContent = `${open ? '▸' : '▾'} 🎨` // symbol-only như build()
    if (open) this.closeBrowser() // thu menu → đóng luôn popover search nếu đang mở
  }

  // Mở popover browser bên phải panel: header + search + danh sách nhóm theo style.
  private _openPaletteBrowser(): void {
    const panel = this._palCurrentBtn?.closest('.ap-palette-panel')
    if (!panel) return
    const pop = document.createElement('div')
    pop.className = 'ap-pal-pop'
    const head = document.createElement('div')
    head.className = 'ap-pal-pop-head'
    const ht = document.createElement('span')
    ht.textContent = `Chọn khay (${PALETTES.length})`
    const x = document.createElement('button')
    x.className = 'ap-pal-x'
    x.textContent = '✕'
    x.addEventListener('click', () => this.closeBrowser())
    head.append(ht, x)
    const search = document.createElement('input')
    search.className = 'ap-pal-search'
    search.type = 'text'
    search.placeholder = '🔎 tìm tên / style…'
    search.addEventListener('input', () => this._renderPaletteList(search.value))
    this._palSearchInput = search
    const list = document.createElement('div')
    list.className = 'ap-pal-list'
    this._palListEl = list
    pop.append(head, search, list)
    panel.appendChild(pop)
    this._palPop = pop
    this._renderPaletteList('')
    search.focus()
    this._wireBrowserClose()
  }

  // Đóng popover khi click ra ngoài / Esc. Defer add (tránh chính click mở lại đóng ngay).
  private _wireBrowserClose(): void {
    this._palOutside = (e): void => {
      const t = e.target
      if (!(t instanceof Element)) return // Element không bị shadow bởi `import type Node` (TSL)
      if (this._palPop && !this._palPop.contains(t) && !this._palCurrentBtn?.contains(t)) {
        this.closeBrowser()
      }
    }
    this._palKey = (e): void => {
      if (e.key === 'Escape') this.closeBrowser()
    }
    const outside = this._palOutside
    setTimeout(() => document.addEventListener('mousedown', outside), 0)
    document.addEventListener('keydown', this._palKey)
  }

  closeBrowser(): void {
    if (this._palOutside) document.removeEventListener('mousedown', this._palOutside)
    if (this._palKey) document.removeEventListener('keydown', this._palKey)
    this._palOutside = null
    this._palKey = null
    this._palPop?.remove()
    this._palPop = null
    this._palListEl = null
    this._palSearchInput = null
  }

  // Vẽ danh sách khay (nhóm theo style). Khay đã THÁO (✕) chỉ hiện khi ĐANG gõ search (để tìm +
  // thêm lại); search rỗng → chỉ khay còn trong palette. KHÔNG còn mục "Đã ẩn".
  private _renderPaletteList(filter: string): void {
    const list = this._palListEl
    if (!list) return
    const q = filter.trim().toLowerCase()
    const hid = new Set(this.state.hiddenPalettes ?? [])
    const match = (p: Palette): boolean =>
      !q || p.name.toLowerCase().includes(q) || p.style.toLowerCase().includes(q)
    // search rỗng: bỏ khay đã tháo. Có search: hiện cả khay đã tháo (tìm để thêm lại / chọn).
    const pals = PALETTES.filter((p) => match(p) && (q !== '' || !hid.has(p.id)))
    list.replaceChildren()
    this._renderPalGroups(list, pals)
    if (pals.length === 0) {
      const e = document.createElement('div')
      e.className = 'ap-pal-empty'
      e.textContent =
        q === '' && hid.size > 0 ? 'Đã tháo hết — gõ tên để tìm lại' : 'Không khớp khay nào'
      list.appendChild(e)
    }
  }

  // Nhóm khay theo style → header + các dòng.
  private _renderPalGroups(container: HTMLElement, pals: Palette[]): void {
    const groups = new Map<string, Palette[]>()
    for (const pal of pals) {
      const arr = groups.get(pal.style) ?? []
      arr.push(pal)
      groups.set(pal.style, arr)
    }
    for (const [style, group] of groups) {
      const h = document.createElement('div')
      h.className = 'ap-pal-group'
      h.textContent = style
      container.appendChild(h)
      for (const pal of group) container.appendChild(this._paletteRow(pal))
    }
  }

  // 1 dòng khay: strip + tên + nút ✕ (tháo) hoặc + (thêm lại — khi khay đang ở kết quả search).
  // Click dòng → chọn khay (nếu đã tháo thì tự thêm lại trong _selectPalette).
  private _paletteRow(pal: Palette): HTMLElement {
    const hidden = (this.state.hiddenPalettes ?? []).includes(pal.id)
    const row = document.createElement('button')
    row.className = hidden ? 'ap-pal-item ap-pal-hidden' : 'ap-pal-item'
    if (pal.id === this.state.paletteId) row.classList.add('ap-pal-on')
    row.title = `${pal.style} · ${pal.name} (${pal.colors.length} màu)`
    const strip = document.createElement('span')
    strip.className = 'ap-pal-strip'
    strip.style.background = this._paletteStripCss(pal)
    const name = document.createElement('span')
    name.className = 'ap-pal-iname'
    name.textContent = pal.name
    const act = document.createElement('span')
    act.className = 'ap-pal-act'
    act.textContent = hidden ? '+' : '✕'
    act.title = hidden ? 'Thêm lại vào palette' : 'Tháo khỏi palette (gõ search để lấy lại)'
    act.addEventListener('click', (e) => {
      e.stopPropagation() // không kích chọn khay
      if (hidden) this._unhidePalette(pal.id)
      else this._hidePalette(pal.id)
    })
    row.append(strip, name, act)
    row.addEventListener('click', () => this._selectPalette(pal.id))
    return row
  }

  private _hidePalette(id: string): void {
    if (!this.state.hiddenPalettes) this.state.hiddenPalettes = []
    if (!this.state.hiddenPalettes.includes(id)) this.state.hiddenPalettes.push(id)
    this._persist() // ẩn bền qua reload (curation chủ động)
    this._renderPaletteList(this._palSearchInput?.value ?? '')
  }

  private _unhidePalette(id: string): void {
    this.state.hiddenPalettes = (this.state.hiddenPalettes ?? []).filter((x) => x !== id)
    this._persist()
    this._renderPaletteList(this._palSearchInput?.value ?? '')
  }

  // ── Kéo panel Palette (tiêu đề) ─────────────────────────────────────────────
  private _palDragStart(e: PointerEvent, panel: HTMLElement, title: HTMLElement): void {
    if (e.button !== 0 || !this.leftTools) return
    const lt = this.leftTools.getBoundingClientRect()
    const pr = panel.getBoundingClientRect()
    this._palDrag = {
      sx: e.clientX,
      sy: e.clientY,
      px: pr.left - lt.left,
      py: pr.top - lt.top,
      moved: false,
      panel,
    }
    title.setPointerCapture(e.pointerId)
  }

  private _palDragMove(e: PointerEvent): void {
    const d = this._palDrag
    if (!d) return
    const dx = e.clientX - d.sx
    const dy = e.clientY - d.sy
    if (!d.moved && dx * dx + dy * dy < 16) return // <4px = chưa coi là kéo
    if (!d.moved) {
      d.moved = true
      d.panel.style.position = 'absolute' // panel cuối → tách flow không xô panel khác
      d.panel.style.zIndex = '5'
    }
    d.panel.style.left = `${d.px + dx}px`
    d.panel.style.top = `${d.py + dy}px`
    this._palPos = { left: d.px + dx, top: d.py + dy } // nhớ để giữ qua rebuild
  }

  private _palDragEnd(e: PointerEvent, title: HTMLElement): void {
    if (!this._palDrag) return
    if (this._palDrag.moved) this._palMoved = true // chặn click thu/mở ngay sau kéo
    this._palDrag = null
    if (title.hasPointerCapture(e.pointerId)) title.releasePointerCapture(e.pointerId)
  }

  private _selectPalette(id: string): void {
    // chọn khay đã tháo (tìm qua search) → tự thêm lại vào palette
    if (this.state.hiddenPalettes?.includes(id)) {
      this.state.hiddenPalettes = this.state.hiddenPalettes.filter((x) => x !== id)
      this._persist()
    }
    this.state.paletteId = id
    this._updatePalCurrent()
    this._renderSwatches()
    this.closeBrowser()
  }

  // Palette dẹt: dab tròn xếp CỤM SÁT NHAU theo CUNG NỬA TRÊN, neo góc trái-trên (200°) quạt qua
  // đỉnh sang phải, không chạm lỗ ngón cái (đáy-phải). Board oval nâu gỗ + giếng pha (màu cọ).
  private _renderSwatches(): void {
    const grid = this._swatchGrid
    if (!grid) return
    grid.replaceChildren()
    this._palMix = null
    const pal = PALETTES.find((p) => p.id === this.state.paletteId)
    if (!pal) return
    const W = 170
    const H = 124
    grid.style.width = `${W}px`
    grid.style.height = `${H}px`
    const cx = W / 2
    const cy = H / 2
    const rx = W / 2 - 14
    const ry = H / 2 - 14
    const n = pal.colors.length
    const start = (200 * Math.PI) / 180 // dab đầu = góc trái-trên
    const maxEnd = (350 * Math.PI) / 180 // dab cuối tối đa = phải-trên (trên lỗ ngón cái)
    const tight = (20 + 2) / ((rx + ry) / 2) // bước "sát nhau" (dab 20px + 2px khe)
    const step = n > 1 ? Math.min(tight, (maxEnd - start) / (n - 1)) : 0
    pal.colors.forEach((c, i) => {
      const a = n > 1 ? start + i * step : (start + maxEnd) / 2
      grid.appendChild(this._makeDab(c, cx + rx * Math.cos(a), cy + ry * Math.sin(a)))
    })
    const mix = document.createElement('div')
    mix.className = 'ap-pal-mix'
    grid.appendChild(mix)
    this._palMix = mix
    this.markSwatch(null) // cập nhật giếng pha theo brush hiện tại
  }

  // 1 dab màu tròn (nút) đặt tại tâm (px, py) — trừ nửa kích thước (20/2) để canh giữa.
  private _makeDab(c: PaletteColor, px: number, py: number): HTMLElement {
    const sw = document.createElement('button')
    sw.className = 'ap-swatch'
    sw.style.background = c.hex
    sw.style.left = `${px - 10}px`
    sw.style.top = `${py - 10}px`
    sw.title = c.role ? `${c.name} · ${c.role}` : c.name
    const colorInt = parseInt(c.hex.slice(1), 16)
    sw.addEventListener('click', () => this._pickSwatch(sw, colorInt))
    return sw
  }

  // Click swatch: đang cầm đúng màu này + đang sơn → thoát (orbit lại); else nạp màu cọ + bật sơn.
  private _pickSwatch(sw: HTMLElement, color: number): void {
    if (this.paintMode && this._brushColor === color) {
      this._setPaintMode(false)
      this.markSwatch(null)
      return
    }
    this._brushColor = color
    this._setPaintMode(true)
    this.markSwatch(sw)
  }

  markSwatch(active: HTMLElement | null): void {
    const grid = this._swatchGrid
    if (!grid) return
    for (const ch of Array.from(grid.children)) {
      if (ch.classList.contains('ap-swatch')) ch.classList.toggle('ap-swatch-on', ch === active)
    }
    if (this._palMix) {
      this._palMix.style.background =
        this._brushColor !== null
          ? `#${this._brushColor.toString(16).padStart(6, '0')}`
          : 'transparent'
    }
  }
}
