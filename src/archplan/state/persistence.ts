/**
 * VỊ TRÍ   — archplan/src/archplan/state/persistence.ts
 * VAI TRÒ  — I/O thiết kế: autosave localStorage + Save/Load file (File System Access API + fallback)
 *            + download 1 bản copy (lossless). THUẦN I/O — không đụng scene/GUI (caller tự rebuild sau load).
 * LIÊN HỆ  — Tách từ ArchPlanLab. Dùng serializeDesign/parseDesign ở ./state.
 *            Save = ghi vào file-handle (đè); exportJSON = download bản copy (CÙNG format lossless, load lại được).
 *
 * CÁCH DÙNG:
 *   const store = new DesignStore()
 *   const st = store.loadAutosave()        // onInit — null nếu chưa có / hỏng
 *   store.autosave(state)                  // mỗi build
 *   const st = await store.loadFile()      // null nếu cancel/invalid; caller rebuild nếu có
 *   await store.saveFile(state)
 *   store.exportJSON(state)
 *   store.forgetHandle()                   // dự án mới → quên file đang gắn
 *
 * DISPOSE: không giữ GPU/listener — chỉ 1 FileSystemFileHandle (GC tự lo).
 */

import { defaultSiteState, parseSite, type SiteState } from 'threejs-modules/site/state'

import { type BuildingState, parseDesign, serializeDesign } from './state'

const STORAGE_KEY = 'archplan:autosave'
type PickedDesign = { text: string; handle: FileSystemFileHandle | null }

// Lô hoàn chỉnh trên đĩa = building (designFile v10) + site (key optional). Composition ở VỎ này →
// building/state.ts giữ thuần (không biết SiteState). File building-only cũ (thiếu site) → default.
export type LoadedDesign = { state: BuildingState; site: SiteState }

export class DesignStore {
  private fileHandle: FileSystemFileHandle | null = null

  // Autosave snapshot ĐẦY ĐỦ (building + site) vào localStorage. Đầy/bị chặn (private mode) → bỏ qua.
  autosave(state: BuildingState, site: SiteState): void {
    try {
      localStorage.setItem(STORAGE_KEY, this._compose(state, site))
    } catch {
      // bỏ qua — không làm hỏng build
    }
  }

  // Đọc autosave → { state, site }. null nếu trống / hỏng / khác version building → caller giữ default.
  loadAutosave(): LoadedDesign | null {
    try {
      const text = localStorage.getItem(STORAGE_KEY)
      if (!text) return null
      const state = parseDesign(text)
      return state ? { state, site: this._extractSite(text) } : null
    } catch {
      return null
    }
  }

  // Dự án mới → quên file đang gắn (Save kế tiếp hỏi lại nơi lưu).
  forgetHandle(): void {
    this.fileHandle = null
  }

  // Save: ghi snapshot ĐẦY ĐỦ (building + site). FSA picker → nhớ handle (Save sau đè). Không hỗ trợ → download.
  async saveFile(state: BuildingState, site: SiteState): Promise<void> {
    const text = this._compose(state, site)
    const picker = window.showSaveFilePicker
    if (!picker) {
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
      this._download(text, `archplan-${stamp}.json`)
      return
    }
    try {
      if (!this.fileHandle) {
        this.fileHandle = await picker({
          suggestedName: 'archplan-design.json',
          types: [{ description: 'ArchPlan design', accept: { 'application/json': ['.json'] } }],
        })
      }
      const w = await this.fileHandle.createWritable()
      await w.write(text)
      await w.close()
    } catch (e) {
      if (!(e instanceof DOMException) || e.name !== 'AbortError') window.alert('Lưu file lỗi.')
    }
  }

  // Load: chọn file → nhớ handle (Save sau đè đúng file) → trả state. null nếu cancel/invalid
  // (alert khi invalid). Caller tự reset undo + rebuild scene khi nhận state.
  async loadFile(): Promise<LoadedDesign | null> {
    const picked = await this._pick()
    if (!picked) return null
    const state = parseDesign(picked.text)
    if (!state) {
      window.alert('File không hợp lệ hoặc khác version — không nạp được.')
      return null
    }
    this.fileHandle = picked.handle // null nếu fallback → Save sẽ hỏi nơi lưu
    return { state, site: this._extractSite(picked.text) }
  }

  // Download 1 bản copy LOSSLESS (building + site) — khác saveFile ở chỗ KHÔNG gắn/đè file-handle.
  // Format = đúng cái Load đọc được + headless dùng. AP4 lossy đã bỏ.
  exportJSON(state: BuildingState, site: SiteState): void {
    this._download(this._compose(state, site), 'archplan.json')
  }

  // Compose file đĩa: designFile building (serializeDesign v10) + key `site` (additive, optional).
  // building/state.ts giữ thuần → composition ở đây. Parse cũ (chỉ đọc v/state) bỏ qua `site` an toàn.
  private _compose(state: BuildingState, site: SiteState): string {
    const obj = JSON.parse(serializeDesign(state)) as Record<string, unknown>
    obj.site = site
    return JSON.stringify(obj)
  }

  // Rút site từ text đĩa (tolerant): thiếu/hỏng `site` → default. File building-only cũ vẫn mở được.
  private _extractSite(text: string): SiteState {
    try {
      return parseSite((JSON.parse(text) as { site?: unknown }).site)
    } catch {
      return defaultSiteState()
    }
  }

  // { text, handle } hoặc null (cancel/lỗi). FSA → có handle; fallback input → handle null.
  private async _pick(): Promise<PickedDesign | null> {
    const picker = window.showOpenFilePicker
    if (picker) {
      try {
        const [h] = await picker({
          types: [{ description: 'ArchPlan design', accept: { 'application/json': ['.json'] } }],
          multiple: false,
        })
        return { text: await (await h.getFile()).text(), handle: h }
      } catch (e) {
        if (!(e instanceof DOMException) || e.name !== 'AbortError') window.alert('Mở file lỗi.')
        return null
      }
    }
    const text = await this._pickFallback()
    return text === null ? null : { text, handle: null }
  }

  private _pickFallback(): Promise<string | null> {
    return new Promise((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'application/json'
      input.addEventListener('change', () => {
        const file = input.files?.[0]
        if (file) void file.text().then(resolve)
        else resolve(null)
      })
      input.addEventListener('cancel', () => resolve(null))
      input.click()
    })
  }

  private _download(text: string, name: string): void {
    const blob = new Blob([text], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    URL.revokeObjectURL(url)
  }
}
