# archplan/ — ArchPlan Lab

Sandbox thiết kế mặt bằng kiến trúc multi-floor, render 3D real-time.  
Mở bằng nút 📐 trong main UI → `#archplan-overlay` → lazy-load `ArchPlanLab`.

---

## Files

| File                                                 | Vai trò                                                                            |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------- |
| [ArchPlanLab.ts](ArchPlanLab.ts)                     | Main class (extends BaseWorld) — orchestrate build, GUI, undo/redo                 |
| [archplan-state.ts](archplan-state.ts)               | Types, constants, factory functions, JSON export (AP4 format)                      |
| [archplan-build.ts](archplan-build.ts)               | Pure math: turtle walk → WallConfig[], bbox — không import Three.js                |
| [archplan-gui.ts](archplan-gui.ts)                   | Root GUI: setupGUI, grid scanner panel, floor/instance/actions folders             |
| [archplan-gui-ctx.ts](archplan-gui-ctx.ts)           | APGuiCtx interface — context object truyền state + callbacks vào GUI               |
| [archplan-gui-sections.ts](archplan-gui-sections.ts) | Section builders: structure, roof, walls, dims, segments, openings                 |
| [archplan-scene.ts](archplan-scene.ts)               | HeightGridSystem (laser grids + measure labels), HumanFigure (scale ref)           |
| [archplan-lab.css](archplan-lab.css)                 | Custom CSS — dark panel, pill buttons, shape row, undo row, tab bar, transform row |

---

## Kiến trúc

```
ArchPlanLab (extends BaseWorld)
  │
  ├── state: BuildingState        ← floors[] → instances[] → segments[]
  │
  ├── GUI (lil-gui)
  │     ├── Floor folders (floorH + shape row + instance folders)
  │     │     └── Instance folder (undo/redo + position/structure/roof/dims/walls)
  │     └── Actions folder (+ Floor | Build | Reset | JSON)
  │
  ├── Left tools (.ap-left-tools) ← cột dọc: Scanner panel + ☀ Sun panel
  │     ├── Scanner               ← laser grid X/Y/Z + Pick XZ
  │     └── ☀ Sun                 ← Azimuth / Elevation / Intensity → DirectionalLight
  │
  └── Undo/Redo stacks            ← JSON snapshot trước mỗi build, max 50
```

---

## Shapes

| Key         | Label     | Segments   | Dims                                   |
| ----------- | --------- | ---------- | -------------------------------------- |
| `rectangle` | Rectangle | 4          | `totalW`, `totalD`                     |
| `l-shape`   | L-Shape   | 6          | `totalW`, `totalD`, `notchW`, `notchH` |
| `t-shape`   | T-Shape   | 8          | `totalW`, `topD`, `stemW`, `stemD`     |
| `u-shape`   | U-Shape   | 8          | `totalW`, `totalD`, `wingW`, `notchD`  |
| `null`      | Custom    | N (turtle) | —                                      |

---

## Materials (AP5)

Mỗi mặt tường (`SegmentState.material`) chọn vật liệu surface shader từ
`threejs-modules/shaders/fragment/`. Màu lấy từ `colorIndex` (dùng chung), kích thước pattern
từ `matScale` (0.3–3, cao = pattern to).

| material   | shader         | màu chính ← colorIndex | matScale map       |
| ---------- | -------------- | ---------------------- | ------------------ |
| `none`     | MeshToon phẳng | `color`                | — (giữ như trước)  |
| `brick`    | BrickWall      | `brickColor`           | `brickW/H × scale` |
| `concrete` | ConcretePanel  | `baseColor`            | `panelW/H × scale` |
| `wood`     | WoodPlank      | `woodColor`            | `scale = 1/scale`  |
| `metal`    | MetalPanel     | `metalColor`           | `scale = 1/scale`  |

**Brick — chỉnh rãnh vữa:** khi `material === 'brick'`, GUI hiện thêm 2 control:
- **Mortar color** (`SegmentState.mortarColor`, hex) → `BrickWall.uMortarColor` — màu rãnh vữa.
- **Mortar relief** (`SegmentState.brickRelief`, 0–1) → `uBumpScale = relief × 1.5` — độ lõm rãnh
  (normal-relief: ánh sáng tạo cảm giác lõm, geometry vẫn phẳng; lõm-displacement-thật → deferred).
- Cả 2 vào `_matKey` (`brick:${ci}:${scale}:${mortarColor}:${relief}`) → đổi = material mới, merge đúng.

- **Lit:** surface shader (unlit `colorNode`) được bọc trong `MeshStandardNodeMaterial` (reuse
  `.colorNode`) → tường vật liệu **nhận sáng + shadow** như MeshToon.
- **Merge + cache:** registry `wallMatCache` theo key `${material}:${colorIndex}:${matScale}`
  (none → `n:${colorIndex}`). Walls cùng key → merge 1 mesh. Cuối mỗi build `_sweepWallMats`
  dispose entry không dùng (tránh rò khi đổi param liên tục); `onDispose` dispose toàn bộ.
- **World-space triplanar** → geometry bake-to-world rồi merge vẫn đúng.
- Deferred: weathering overlay, BuildingFromPlan áp material, advanced per-material params →
  `deferred/systems/archplan-ap5-extensions.md`.

---

## Decor panels (task A)

Mỗi tường có `SegmentState.panels: DecorPanel[]` — tấm trang trí khắc trên mặt NGOÀI tường
(+Z local). Geometry THẬT (BoxGeometry) → đổ bóng thật. Mỗi panel có vật liệu riêng.

| field        | ý nghĩa                                                          |
| ------------ | --------------------------------------------------------------- |
| `x` / `y`    | mép trái / mép dưới panel (mm, từ đầu trái + chân tường)         |
| `w` / `h`    | bề rộng / cao panel (mm)                                         |
| `depth`      | độ nhô (raised) / bề dày khung gờ (recessed) (mm)               |
| `mode`       | `raised` = ô nhô; `recessed` = khung gờ molding nổi quanh ô     |
| `material`   | vật liệu riêng (`none`/`brick`/`concrete`/`wood`/`metal`/`brick-tex`) |
| `colorIndex` | màu chính panel ← WALL_COLORS                                    |

- **Geometry:** `makePositionedWall({ panels })` → `_buildDecorPanels` (WallSingle.ts). raised =
  1 box; recessed = 4 thanh khung gờ nổi (tâm phẳng → nhìn như lõm; lõm-khoét-THẬT bằng CSG →
  `deferred/rendering/decor-panel-true-recess-csg.md`).
- **Material riêng + merge:** mỗi decor mesh gắn `userData.matKey`; `_bakeToBucket` (ArchPlanLab)
  route geometry về đúng bucket vật liệu → panel cùng material/màu **merge chung** mesh với tường
  cùng key (ít draw call). Cache material dùng chung `_matKey`/`_ensureMat`/`_createMat`.
- **GUI:** nút `＋ Decor panel` trong mỗi folder tường/segment → mỗi panel 1 sub-folder
  (mode/material/color/x/y/w/h/depth + Remove). Dropdown `Style` cũ (reveal/panel placeholder) ĐÃ GỠ.

---

## Undo / Redo

- `_prevState`: JSON snapshot trạng thái **trước** mỗi `_buildScene()`
- `_undoStack` / `_redoStack`: mảng JSON string, max 50 entries
- `_historyLock`: ngăn push trùng khi đang restore undo/redo
- Reset → clear cả hai stack

---

## Lưu / Khôi phục thiết kế

Round-trip **đầy đủ** `BuildingState` (lossless) — KHÁC JSON export AP4 bên dưới.

- **Autosave (localStorage):** mỗi lần `_buildScene` ghi `serializeDesign(state)` vào key
  `archplan:autosave`. `onInit` gọi `_loadAutosave()` → reload/mở lại app là ra nguyên
  thiết kế. 1 thiết kế / trình duyệt. Nút **Reset** ghi đè autosave về mặc định.
- **💾 Save / 📁 Load (file):** ưu tiên **File System Access API** (`showSaveFilePicker` /
  `showOpenFilePicker`) → **chọn thư mục** + **nhớ handle**: Save lần đầu hỏi nơi lưu, các
  lần sau **đè thẳng** file đó không hỏi lại; Load cũng gắn handle để Save ghi đè đúng file
  vừa mở. **Reset** xóa handle (dự án mới). Trình duyệt không hỗ trợ (non-Chromium) →
  fallback: Save tải `archplan-<timestamp>.json` vào Downloads, Load mở `<input file>`.
  Ambient types cho 2 picker khai báo trong `ArchPlanLab.ts` (lib.dom TS 5.9 còn thiếu).
- **Versioned:** `DESIGN_SCHEMA_V`. Đổi schema → tăng version; file/autosave version cũ bị
  `parseDesign` bỏ qua (trả null) → fallback default, **không crash** (đánh đổi: mất autosave cũ
  khi bump version — migration để dành `deferred/` nếu cần).

## JSON export (AP4)

Nút **📄 JSON** — xuất **1 chiều** cho `BuildingFromPlan.ts` render trong World scene.
Lossy: kích thước mm→**mét**, chỉ một phần field. **Không nạp lại** được vào editor.  
Format: `{ name, floors: [{ index, floorH, instances: [...] }] }`
