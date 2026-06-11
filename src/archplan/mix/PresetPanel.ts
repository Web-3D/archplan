/**
 * VỊ TRÍ   — 01-Doraemon/src/sandbox/archplan/mix/PresetPanel.ts
 * VAI TRÒ  — Khay MIX DI ĐỘNG (trung tâm DUY NHẤT thao tác mix — UI inline per-panel đã tháo
 *            2026-06-11): danh sách preset (thumb base + tên, click = cầm active, ✎ = editor
 *            preset + ô preview bên phải khay, dblclick đổi tên, ＋/🗑, ⬇⬆ JSON) + 3 MODE click-3D:
 *            🪣 Áp (REF live trong phiên — chỉnh ✎ thấy trên bề mặt; buông xô = bake clone riêng)
 *            · 🧽 Gỡ · 🎯 Chỉnh (board ĐỐI TƯỢNG hiện trong khay — zone/G0/hồ có cọ vẽ).
 *            Mặc định GÓC TRÊN-TRÁI; KÉO header dời tự do (mirror PalettePanel — NgQuan 2026-06-11).
 * LIÊN HỆ  — Kho: ./presets (archplan.mixPresets.v1). Board: buildMixBoard (gui/site.ts).
 *            Mode/resolve/bake: MixManager (qua APGuiCtx setMixBucket/registerMixEditOpen).
 *            Lab mount như PalettePanel (float trên canvas, instance persist qua _rebuildGUI).
 *
 * CÁCH DÙNG: const p = new MixPresetPanel(); p.build(wrap, ctx) mỗi _rebuildGUI;
 *            p.activePreset() → preset đang cầm (🪣 Mảnh 3). p.dispose() khi Lab dispose.
 * DISPOSE:   DOM do wrap.remove() của Lab dọn; không giữ listener document.
 */

import { makeGroundMixParams } from 'threejs-modules/site/state'

import type { APGuiCtx, MixEditSel, MixPaintTarget } from '../gui/ctx'
import { buildMixBoard } from '../gui/site'
import { texPreviewEl } from '../gui/tex-palette'
import {
  exportMixPresetsJson,
  importMixPresetsJson,
  loadMixPresets,
  type MixPreset,
  newPresetId,
  saveMixPresets,
} from './presets'

function ensurePresetCss(): void {
  if (document.getElementById('ap-mixpre-css')) return
  const s = document.createElement('style')
  s.id = 'ap-mixpre-css'
  s.textContent =
    // góc trên-trái (drawer Tools đã dời xuống đáy); z 155 > palette 150 — ô preview mở bên phải không chìm.
    // 🎨 Palette OKLCH NgQuan 2026-06-11 (Atelier): bg-1 nền · bg-2..4 surface · bg-5 highlight · accent · text
    // — khai báo --mp-* tại float root (khay + ô preview cùng ăn); đổi palette sau = sửa 1 dòng vars.
    `.ap-mixpre-float{position:absolute;top:6px;left:6px;z-index:155;` +
    `--mp-bg-1:#3a1e0c;--mp-bg-2:#5e3110;--mp-bg-3:#924c16;--mp-bg-4:#c8741f;` +
    `--mp-bg-5:#f2a93b;--mp-accent:#e8c547;--mp-text:#fbebcf}` +
    // board buildMixBoard BÊN TRONG khay (.ap-mix-host khai --gr-* trên chính nó) → đè scoped cùng palette
    `.ap-mixpre-float .ap-mix-host{--gr-bg-1:#3a1e0c;--gr-bg-2:#5e3110;--gr-bg-3:#924c16;` +
    `--gr-bg-4:#c8741f;--gr-bg-5:#f2a93b;--gr-accent:#e8c547;--gr-text:#fbebcf}` +
    `.ap-mixpre{width:196px;background:var(--mp-bg-1);border:1px solid var(--mp-bg-4);border-radius:6px;` +
    `color:var(--mp-text);font:10px/1.3 'Segoe UI',system-ui,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,.45)}` +
    `.ap-mixpre-hd{display:flex;align-items:center;gap:4px;padding:3px 6px;cursor:pointer;font-weight:600}` +
    `.ap-mixpre-body{padding:2px 6px 4px;display:flex;flex-direction:column;gap:2px;` +
    `max-height:46vh;overflow-y:auto}` +
    `.ap-mixpre-row{display:flex;align-items:center;gap:5px;padding:2px 3px;border:1px solid transparent;` +
    `border-radius:4px;cursor:pointer}` +
    `.ap-mixpre-row.on{border-color:var(--mp-accent);background:rgba(232,197,71,.14)}` +
    `.ap-mixpre-row img,.ap-mixpre-row .ap-texpal-color{width:18px;height:18px;border-radius:3px;flex-shrink:0}` +
    `.ap-mixpre-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}` +
    `.ap-mixpre-name input{width:100%;font:inherit;background:var(--mp-bg-2);color:inherit;` +
    `border:1px solid var(--mp-bg-4);border-radius:2px}` +
    `.ap-mixpre-ic{flex-shrink:0;background:none;border:none;color:var(--mp-bg-5);cursor:pointer;` +
    `font:inherit;padding:0 2px}` +
    `.ap-mixpre-ic:hover{color:#fff}` +
    `.ap-mixpre-ft{display:flex;gap:4px;padding:0 6px 6px}` +
    `.ap-mixpre-btn{flex:1;background:var(--mp-bg-2);border:1px solid var(--mp-bg-4);color:var(--mp-text);` +
    `border-radius:4px;cursor:pointer;font:inherit;padding:2px 0}` +
    `.ap-mixpre-btn:hover{background:var(--mp-bg-3)}` +
    `.ap-mixpre-btn.on{background:var(--mp-bg-4);border-color:var(--mp-accent)}` +
    `.ap-mixpre-status{padding:0 6px 4px;font-size:8px;opacity:.75;min-height:10px}` +
    `.ap-mixpre-board{margin:2px 0 4px;padding:3px 4px;border:1px solid var(--mp-bg-3);border-radius:4px;` +
    `background:rgba(0,0,0,.14)}` +
    `.ap-mixpre-empty{opacity:.6;font-style:italic;padding:2px 3px}` +
    // 🎯 board ĐỐI TƯỢNG (mode edit chọn từ 3D) — khung highlight cam (bg-5) phân biệt row.on accent vàng
    `.ap-mixpre-edit{margin:2px 6px 4px;padding:3px 4px;border:1px solid var(--mp-bg-5);border-radius:4px;` +
    `background:rgba(242,169,59,.10)}` +
    `.ap-mixpre-edithd{display:flex;align-items:center;gap:4px;font-weight:600;margin-bottom:2px}` +
    `.ap-mixpre-edithd span{flex:1}`
  document.head.appendChild(s)
}

// Vị trí khay ĐÃ KÉO (px, theo offset-parent) — MODULE-LEVEL vì instance panel bị dispose/new mỗi
// _rebuildGUI (teardown Lab); biến module sống trọn session. null = chưa kéo (CSS góc trên-trái).
// UI-only, reset khi reload — mirror ngữ nghĩa _palPos của PalettePanel.
let floatPos: { left: number; top: number } | null = null

// Target có cọ vẽ mask không (mirror _meshMatch manager): base/zone/đáy-vách hồ = có;
// fence/tường-building/sàn generic ({wallMix}/{flatMix}) = không (chưa bake uv chu-vi).
function paintableTarget(t: MixPaintTarget): boolean {
  if (typeof t === 'string') return true
  if ('water' in t) return true
  return !('fence' in t || 'wallMix' in t || 'flatMix' in t)
}

export class MixPresetPanel {
  private presets: MixPreset[] = loadMixPresets()
  private activeId: string | null = null
  private editId: string | null = null // preset đang mở bảng trộn ✎ (giữ qua render list)
  private collapsed = false
  private ctx: APGuiCtx | null = null
  private listEl: HTMLElement | null = null
  private statusEl: HTMLElement | null = null
  private fileInput: HTMLInputElement | null = null
  // 🪣🧽🎯 — 3 nút mode, sync class .on theo getMixBucketMode (tắt từ ngoài cũng cập nhật)
  private modeBtns: Partial<Record<'apply' | 'erase' | 'edit', HTMLButtonElement>> = {}
  private editSel: MixEditSel | null = null // 🎯 đối tượng đang chỉnh trong khay (board target thật)
  private editHost: HTMLElement | null = null
  // 🖐 Kéo khay bằng header (mirror PalettePanel): phiên kéo + cờ chặn click thu/mở ngay sau kéo.
  private drag: { sx: number; sy: number; px: number; py: number; moved: boolean } | null = null
  private dragMoved = false

  /** Preset đang CẦM (active) — nguồn CLONE cho 🪣 áp (Mảnh 3). */
  activePreset(): MixPreset | null {
    return this.presets.find((p) => p.id === this.activeId) ?? null
  }

  // Dựng DOM vào wrap (Lab gọi mỗi _rebuildGUI — wrap mới, instance + kho GIỮ).
  build(wrap: HTMLElement, ctx: APGuiCtx): void {
    ensurePresetCss()
    this.ctx = ctx
    wrap.replaceChildren()
    const panel = document.createElement('div')
    panel.className = 'ap-mixpre'
    const hd = document.createElement('div')
    hd.className = 'ap-mixpre-hd'
    const caret = document.createElement('span')
    const ttl = document.createElement('span')
    ttl.textContent = '🧪 Mix presets'
    hd.append(caret, ttl)
    const body = document.createElement('div')
    body.className = 'ap-mixpre-body'
    const syncCollapse = (): void => {
      caret.textContent = this.collapsed ? '▸' : '▾'
      body.style.display = this.collapsed ? 'none' : ''
      editHost.style.display = this.collapsed ? 'none' : ''
      ft.style.display = this.collapsed ? 'none' : ''
      st.style.display = this.collapsed ? 'none' : ''
    }
    hd.addEventListener('click', () => {
      if (this.dragMoved) {
        this.dragMoved = false // vừa kéo xong → bỏ qua toggle thu/mở lần này
        return
      }
      this.collapsed = !this.collapsed
      syncCollapse()
    })
    this._wireDrag(hd, wrap)
    if (floatPos) {
      wrap.style.left = `${floatPos.left}px` // khôi phục vị trí đã kéo (instance new mỗi rebuild)
      wrap.style.top = `${floatPos.top}px`
    }
    this.listEl = body
    const editHost = document.createElement('div')
    this.editHost = editHost // 🎯 board đối tượng (mode edit) — giữa list và status
    const st = document.createElement('div')
    st.className = 'ap-mixpre-status'
    this.statusEl = st
    const ft = this._footer()
    panel.append(hd, body, editHost, st, ft)
    wrap.appendChild(panel)
    syncCollapse()
    ctx.registerMixBucketSync?.(() => this._syncModeBtns()) // mode tắt từ ngoài (Move/Pick/ESC) → bỏ highlight
    ctx.registerMixEditOpen?.((sel) => this._openEditSel(sel)) // 🎯 click đích có mix → board vào khay
    this._renderList()
    this._renderEdit() // _rebuildGUI giữ board đối tượng đang mở
    this._syncPreview() // 🧪 _rebuildGUI giữ editor preset mở → dựng lại tấm preview
  }

  dispose(): void {
    this.ctx?.setMixPreview?.(null) // 🧪 gỡ tấm preview trước khi buông ctx
    this.fileInput?.remove()
    this.fileInput = null
    this.listEl = null
    this.statusEl = null
    this.editHost = null
    this.editSel = null
    this.ctx = null
  }

  private _flash(msg: string): void {
    if (this.statusEl) this.statusEl.textContent = msg
  }

  // ── 🖐 Kéo khay (header) — dời WRAP float (ô preview bên phải đi theo); <4px = click thu/mở ──────
  private _wireDrag(hd: HTMLElement, wrap: HTMLElement): void {
    hd.title = 'Kéo để dời khay · click thu/mở'
    hd.addEventListener('pointerdown', (e) => this._dragStart(e, wrap, hd))
    hd.addEventListener('pointermove', (e) => this._dragMove(e, wrap))
    hd.addEventListener('pointerup', (e) => this._dragEnd(e, hd))
  }

  private _dragStart(e: PointerEvent, wrap: HTMLElement, hd: HTMLElement): void {
    if (e.button !== 0) return
    const host = wrap.offsetParent?.getBoundingClientRect() ?? { left: 0, top: 0 }
    const wr = wrap.getBoundingClientRect()
    this.drag = {
      sx: e.clientX,
      sy: e.clientY,
      px: wr.left - host.left,
      py: wr.top - host.top,
      moved: false,
    }
    hd.setPointerCapture(e.pointerId)
  }

  private _dragMove(e: PointerEvent, wrap: HTMLElement): void {
    const d = this.drag
    if (!d) return
    const dx = e.clientX - d.sx
    const dy = e.clientY - d.sy
    if (!d.moved && dx * dx + dy * dy < 16) return // <4px = chưa coi là kéo
    d.moved = true
    floatPos = { left: d.px + dx, top: d.py + dy } // module-level — giữ qua _rebuildGUI
    wrap.style.left = `${floatPos.left}px`
    wrap.style.top = `${floatPos.top}px`
  }

  private _dragEnd(e: PointerEvent, hd: HTMLElement): void {
    if (!this.drag) return
    if (this.drag.moved) this.dragMoved = true // chặn click thu/mở ngay sau kéo
    this.drag = null
    if (hd.hasPointerCapture(e.pointerId)) hd.releasePointerCapture(e.pointerId)
  }

  private _save(): void {
    saveMixPresets(this.presets)
  }

  // 🔎 Đồng bộ Ô PREVIEW (canvas bên phải khay) theo editor đang mở (✎): mở = preview CHÍNH preset.mix
  // (slider live); đóng/xóa = ẩn ô. Gọi lại sau commit board (đổi texture/rule = structural → rebuild material).
  private _syncPreview(): void {
    const p = this.presets.find((q) => q.id === this.editId) ?? null
    this.ctx?.setMixPreview?.(p ? p.mix : null)
  }

  private _renderList(): void {
    const list = this.listEl
    if (!list) return
    list.replaceChildren()
    if (this.presets.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'ap-mixpre-empty'
      empty.textContent = 'Chưa có preset — bấm ＋'
      list.appendChild(empty)
      return
    }
    for (const p of this.presets) {
      list.appendChild(this._row(p))
      if (this.editId === p.id) list.appendChild(this._editBoard(p))
    }
  }

  // 1 hàng preset: [thumb base][tên (dblclick = đổi)][✎][🗑]. Click hàng = CẦM (active).
  private _row(p: MixPreset): HTMLElement {
    const row = document.createElement('div')
    row.className = p.id === this.activeId ? 'ap-mixpre-row on' : 'ap-mixpre-row'
    row.addEventListener('click', () => {
      this.activeId = p.id
      // đang cầm 🪣 → đổi "đạn" sang preset mới (manager tự bake phiên ref của preset cũ)
      if (this.ctx?.getMixBucketMode?.() === 'apply')
        this.ctx.setMixBucket?.({ mode: 'apply', src: p.mix })
      this._renderList()
    })
    const name = document.createElement('span')
    name.className = 'ap-mixpre-name'
    name.textContent = p.name
    name.title = `${p.name} — dblclick đổi tên`
    name.addEventListener('dblclick', (e) => {
      e.stopPropagation()
      this._renameInline(p, name)
    })
    const edit = this._icon(
      '✎',
      'Sửa preset (bảng trộn — ô preview hiện bên phải khay, lưu thẳng kho)',
      () => {
        this.editId = this.editId === p.id ? null : p.id
        this._renderList()
        this._syncPreview() // 🧪 mở = dựng tấm, đóng = gỡ
      }
    )
    const del = this._icon('🗑', 'Xóa preset (đối tượng đã áp giữ nguyên — CLONE)', () => {
      if (!window.confirm(`Xóa preset "${p.name}"? (bề mặt đã áp giữ nguyên — clone riêng)`)) return
      // đang cầm 🪣 chính preset này → buông xô trước (manager bake refs về clone — không mồ côi)
      if (this.activeId === p.id && this.ctx?.getMixBucketMode?.() === 'apply')
        this.ctx.setMixBucket?.(null)
      this.presets = this.presets.filter((q) => q.id !== p.id)
      if (this.activeId === p.id) this.activeId = null
      if (this.editId === p.id) this.editId = null
      this._save()
      this._renderList()
      this._syncPreview() // 🧪 xóa preset đang ✎ → gỡ tấm
    })
    row.append(texPreviewEl(p.mix.base), name, edit, del)
    return row
  }

  private _icon(sym: string, title: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'ap-mixpre-ic'
    b.textContent = sym
    b.title = title
    b.addEventListener('click', (e) => {
      e.stopPropagation()
      onClick()
    })
    return b
  }

  // Đổi tên tại chỗ: span → input; Enter/blur = lưu, Esc = hủy.
  private _renameInline(p: MixPreset, name: HTMLElement): void {
    const inp = document.createElement('input')
    inp.value = p.name
    inp.addEventListener('click', (e) => e.stopPropagation())
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') inp.blur()
      if (e.key === 'Escape') {
        inp.value = p.name
        inp.blur()
      }
    })
    inp.addEventListener('blur', () => {
      p.name = inp.value.trim() || p.name
      this._save()
      this._renderList()
    })
    name.replaceChildren(inp)
    inp.focus()
    inp.select()
  }

  // Bảng trộn sửa preset — target {wallMix} để hiện CẢ Quy luật/Trọng lực (preset mang rule sẵn;
  // mặt nằm tự bỏ qua rule khi render). paintable=false (preset không có mặt 3D để cọ).
  // commit = save kho + vẽ lại hàng (thumb base đổi) — KHÔNG đụng scene (CLONE: đối tượng đã áp giữ nguyên).
  private _editBoard(p: MixPreset): HTMLElement {
    const box = document.createElement('div')
    box.className = 'ap-mixpre-board'
    if (this.ctx)
      buildMixBoard(box, this.ctx, { wallMix: p.mix }, p.mix, false, () => {
        this._save()
        this._renderList()
        this._syncPreview() // 🧪 structural (đổi texture/rule) → tấm rebuild material; slider thường = live sẵn
      })
    return box
  }

  private _footer(): HTMLElement {
    const ft = document.createElement('div')
    ft.className = 'ap-mixpre-ft'
    const add = this._btn('＋ Mới', 'Tạo preset mới (sửa bằng ✎)', () => {
      const p: MixPreset = {
        id: newPresetId(),
        name: `Preset ${this.presets.length + 1}`,
        mix: makeGroundMixParams('grass-o'),
      }
      this.presets.push(p)
      this.activeId = p.id
      this.editId = p.id
      this._save()
      this._renderList()
      this._syncPreview() // 🧪 preset mới mở editor luôn → tấm hiện ngay
    })
    const exp = this._btn(
      '⬇',
      'Export JSON (localStorage per-origin — file là đường chuyển máy)',
      () => this._export()
    )
    const imp = this._btn('⬆', 'Import JSON (merge vào kho — id trùng tự cấp mới)', () =>
      this._ensureFileInput().click()
    )
    ft.append(add, exp, imp)
    const wrap = document.createElement('div')
    wrap.append(ft, this._modesRow())
    return wrap
  }

  // Hàng 3 mode click-3D + ✨ toggle viền sáng hover. Tách khỏi _footer (rule-50).
  private _modesRow(): HTMLElement {
    const modes = document.createElement('div')
    modes.className = 'ap-mixpre-ft'
    const ap = this._btn(
      '🪣 Áp',
      'Cầm preset đang chọn — click đích 3D để áp (REF live trong phiên; buông xô = chốt clone riêng). ESC/chuột phải thoát',
      () => this._setMode('apply')
    )
    const er = this._btn('🧽 Gỡ', 'Click đích CÓ mix trong 3D để gỡ (về material thường)', () =>
      this._setMode('erase')
    )
    const ed = this._btn(
      '🎯 Chỉnh',
      'Click đích CÓ mix trong 3D → board của ĐỐI TƯỢNG hiện ở khay',
      () => this._setMode('edit')
    )
    this.modeBtns = { apply: ap, erase: er, edit: ed }
    this._syncModeBtns()
    // ✨ viền mờ sáng đích dưới con trỏ khi cầm xô (NgQuan: "trỏ vào đâu không biết") — mặc định BẬT
    const hov = this._btn('✨', 'Viền sáng vật thể dưới con trỏ khi cầm 🪣/🧽/🎯 — bật/tắt', () => {
      const on = !(this.ctx?.getMixHover?.() ?? true)
      this.ctx?.setMixHover?.(on)
      hov.classList.toggle('on', on)
    })
    hov.style.flex = '0 0 24px' // nút vuông nhỏ — 3 nút mode giữ bề ngang
    hov.classList.toggle('on', this.ctx?.getMixHover?.() ?? true)
    modes.append(ap, er, ed, hov)
    return modes
  }

  // 🪣🧽🎯 Bật/tắt 1 mode (bấm lại nút đang on = tắt). 'apply' cần preset active; manager tự bake
  // phiên apply cũ khi đổi mode (REF → clone riêng từng bề mặt).
  private _setMode(mode: 'apply' | 'erase' | 'edit'): void {
    if (this.ctx?.getMixBucketMode?.() === mode) {
      this.ctx.setMixBucket?.(null)
    } else if (mode === 'apply') {
      this._armApply()
    } else {
      this.ctx?.setMixBucket?.(mode === 'erase' ? { mode: 'erase' } : { mode: 'edit' })
      this._flash(mode === 'erase' ? '🧽 click đích có mix để gỡ' : '🎯 click đích có mix để chỉnh')
    }
    this._syncModeBtns()
  }

  // Cầm 🪣 với preset active — thiếu thì nhắc. Tách khỏi _setMode (complexity ≤10).
  private _armApply(): void {
    const p = this.activePreset()
    if (!p) {
      this._flash('Chọn 1 preset trước (click hàng) rồi mới 🪣')
      return
    }
    this.ctx?.setMixBucket?.({ mode: 'apply', src: p.mix })
    this._flash(`🪣 ${p.name} — click đích 3D (✎ chỉnh = live trên bề mặt; buông xô = chốt)`)
  }

  private _syncModeBtns(): void {
    const cur = this.ctx?.getMixBucketMode?.() ?? null
    for (const [m, b] of Object.entries(this.modeBtns)) b.classList.toggle('on', m === cur)
  }

  // 🎯 Click đích có mix (mode edit) → board ĐỐI TƯỢNG vào khay: target thật (zone/G0/hồ = CÓ cọ vẽ),
  // commit đúng hệ (build = ctx.build / site = applySite). ✕ đóng tay; chọn đích khác = board chuyển.
  private _openEditSel(sel: MixEditSel): void {
    this.editSel = sel
    this._renderEdit()
  }

  private _renderEdit(): void {
    const host = this.editHost
    if (!host) return
    host.replaceChildren()
    const sel = this.editSel
    const ctx = this.ctx
    if (!sel || !ctx) return
    const box = document.createElement('div')
    box.className = 'ap-mixpre-edit'
    const hd = document.createElement('div')
    hd.className = 'ap-mixpre-edithd'
    const ttl = document.createElement('span')
    ttl.textContent = `🎯 ${sel.label}`
    hd.append(
      ttl,
      this._icon('✕', 'Đóng board đối tượng', () => {
        this.editSel = null
        this._renderEdit()
      })
    )
    box.appendChild(hd)
    buildMixBoard(box, ctx, sel.target, sel.params, paintableTarget(sel.target), () =>
      sel.kind === 'build' ? ctx.build() : ctx.applySite(true)
    )
    host.appendChild(box)
  }

  private _btn(text: string, title: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'ap-mixpre-btn'
    b.textContent = text
    b.title = title
    b.addEventListener('click', onClick)
    return b
  }

  private _export(): void {
    const blob = new Blob([exportMixPresetsJson(this.presets)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'archplan-mix-presets.json'
    a.click()
    URL.revokeObjectURL(a.href)
    this._flash(`Đã export ${this.presets.length} preset`)
  }

  // <input file> ẨN tạo lazy 1 lần (sống ngoài wrap — không bị _rebuildGUI dọn giữa chừng chọn file).
  private _ensureFileInput(): HTMLInputElement {
    if (this.fileInput) return this.fileInput
    const inp = document.createElement('input')
    inp.type = 'file'
    inp.accept = '.json,application/json'
    inp.style.display = 'none'
    inp.addEventListener('change', () => {
      const f = inp.files?.[0]
      inp.value = '' // chọn lại cùng file lần sau vẫn bắn change
      if (f) void this._import(f)
    })
    document.body.appendChild(inp)
    this.fileInput = inp
    return inp
  }

  private async _import(f: File): Promise<void> {
    try {
      const got = importMixPresetsJson(await f.text(), this.presets)
      this.presets.push(...got)
      this._save()
      this._renderList()
      this._flash(`Import ${got.length} preset từ ${f.name}`)
    } catch (e) {
      this._flash(`Import lỗi: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
}
