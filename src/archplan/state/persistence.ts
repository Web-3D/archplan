/**
 * VỊ TRÍ   — archplan/src/archplan/state/persistence.ts
 * VAI TRÒ  — I/O thiết kế: autosave localStorage + Save/Load file (File System Access API + fallback)
 *            + export AP4 JSON. THUẦN I/O — không đụng scene/GUI (caller tự rebuild sau load).
 * LIÊN HỆ  — Tách từ ArchPlanLab. Dùng serializeDesign/parseDesign/buildingStateToJSON ở ./state.
 *            Save = snapshot ĐẦY ĐỦ (nạp lại được); exportJSON = AP4 (1 chiều cho BuildingFromPlan).
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

import { type BuildingState, buildingStateToJSON, parseDesign, serializeDesign } from './state'

const STORAGE_KEY = 'archplan:autosave'
type PickedDesign = { text: string; handle: FileSystemFileHandle | null }

export class DesignStore {
  private fileHandle: FileSystemFileHandle | null = null

  // Autosave snapshot ĐẦY ĐỦ vào localStorage. localStorage đầy/bị chặn (private mode) → bỏ qua.
  autosave(state: BuildingState): void {
    try {
      localStorage.setItem(STORAGE_KEY, serializeDesign(state))
    } catch {
      // bỏ qua — không làm hỏng build
    }
  }

  // Đọc autosave → BuildingState. null nếu trống / hỏng / khác version → caller giữ default.
  loadAutosave(): BuildingState | null {
    try {
      const text = localStorage.getItem(STORAGE_KEY)
      return text ? parseDesign(text) : null
    } catch {
      return null
    }
  }

  // Dự án mới → quên file đang gắn (Save kế tiếp hỏi lại nơi lưu).
  forgetHandle(): void {
    this.fileHandle = null
  }

  // Save: ghi snapshot ĐẦY ĐỦ. FSA picker → nhớ handle (Save sau đè thẳng). Không hỗ trợ → download.
  async saveFile(state: BuildingState): Promise<void> {
    const text = serializeDesign(state)
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
  async loadFile(): Promise<BuildingState | null> {
    const picked = await this._pick()
    if (!picked) return null
    const st = parseDesign(picked.text)
    if (!st) {
      window.alert('File không hợp lệ hoặc khác version — không nạp được.')
      return null
    }
    this.fileHandle = picked.handle // null nếu fallback → Save sẽ hỏi nơi lưu
    return st
  }

  // Export AP4 (1 chiều cho BuildingFromPlan render) → download. KHÁC saveFile (snapshot đầy đủ).
  exportJSON(state: BuildingState): void {
    this._download(JSON.stringify(buildingStateToJSON(state), null, 2), 'archplan.json')
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
