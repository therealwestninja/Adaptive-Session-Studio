# 19 — Import & Export

---

## Session files (.assp)

Sessions save as `.assp` files — these are plain JSON. The extension stands for "Adaptive Session Studio Package."

**Export:** Press **Ctrl+S** or click the download icon in the toolbar. The file is downloaded to your computer.

**Import:** Click the upload icon or drag a `.assp` file onto the app window.

Size limit: 20 MB. Sessions with large embedded media can be significant.

---

## FunScript files

**Import:** In the FunScript tab, click **+ Add track** and select a `.funscript` file. Size limit: 5 MB.

**Export:** Click the export button on any FunScript track to download it as a `.funscript` file.

---

## Audio and video

Audio and video files are embedded in the session as base64 data URLs. This means the `.assp` file is self-contained — all media travels with it.

Size limit per media file: 100 MB. Total embedded media: 500 MB.

To add audio: drag files onto the Audio section in the sidebar, or click **+**.
Supported formats: MP3, WAV, OGG, M4A, OPUS (audio), MP4, WebM, MOV (video), PNG, JPG, GIF, WebP (images).

---

## Subtitle files

Import `.ass` or `.ssa` subtitle files via the Subtitles tab. Size limit: 5 MB.

Subtitles render as styled overlays synchronized to the timeline, independent of other blocks.

---

## Macro files

Macros can be exported individually as `.funscript` files and imported later. Manage in the Macros tab.

---

## Metrics export

Open the profile panel → click **⬆ Import** in the metrics chart section to import historical metrics from JSON or CSV. Size limit: 2 MB, max 1,000 records.

---

## Auto-save

The current session auto-saves continuously to IndexedDB (browser storage). This is independent of the `.assp` file. If you close the browser without exporting, your changes are still there next time you open the app.

---

→ [20 — Settings Reference](20-settings.md)
