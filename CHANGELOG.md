# Changelog

## 1.2.0

- Added a shortest directed import-path finder with autocomplete, endpoint swapping, full text export, and an isolated route view with arrows.
- Recalculate active routes when the type-import filter changes; show when a route becomes unavailable.
- Added an Islands view for files without mapped incoming or outgoing links, plus isolated-file and active-route sections in Markdown reports.
- Added Explorer sorting by name, connection count, and source byte size without moving graph nodes.
- Extended the sample graph with an illustrative disconnected file and updated desktop/light screenshots.
- Added tests for directional paths, cycles, unreachable files, long routes, type-filter changes, sort order, and responsive path controls; retained drag-crash regressions.

## 1.1.1

- Fixed a crash when releasing or cancelling a drag while React still had queued pointer-move updates. Pending updates now use captured coordinates rather than reading a cleared gesture ref.
- Track the active pointer and end gestures when pointer capture is lost, without letting another pointer interrupt the drag.
- Ignore pointer/wheel positions when the SVG has no usable screen transform.
- Added browser regressions for fast release, cancellation, lost capture, multiple pointers, and repeated wheel gestures in both appearances.

## 1.1.0

- Added complete light and dark appearances, plus automatic system appearance.
- Persisted the appearance preference, with storage-restricted fallback and cross-tab updates.
- Applied the preferred theme before React starts to avoid a flash of the wrong appearance.
- Tuned graph colors for light backgrounds and made SVG exports retain the current theme and text outlines.
- Added focused exploration of immediate connections and transitive change impact, with cycle-safe reachability.
- Added one-click copying of the selected file's relative path.
- Extended browser coverage for appearance, system changes, persistence, unavailable storage, impact filtering, responsive layouts, and exported SVG colors.

## 1.0.0

- Initial local-first dependency explorer for JavaScript and TypeScript.
- AST scanning, circular groups, hotspots, folder filters, browser folder import, and CLI.
- JSON, SVG, and Markdown exports, bilingual documentation, and GitHub Pages demo.
