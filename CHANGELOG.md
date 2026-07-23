# Changelog

All notable user-facing changes to Visual Notes.

## 1.0.41

### Fixed
- Notes and sticky notes now auto-contrast their text against their own background color, instead of using a single app-wide text color regardless of the card's actual color — this was the cause of white-on-white notes and barely-readable text on the default pastel sticky colors.
- Blank Notes now default to a theme-following background instead of a hardcoded near-white color, so they no longer look washed out on a dark theme.
- The Pen tool's default ink color now follows your theme (light ink on dark, dark ink on light) instead of one fixed dark color that could blend into a dark canvas.

### Changed
- Internal: the Settings page's sticky-color palette now shares its color list with the in-canvas picker instead of keeping its own separate copy, so the two can't drift out of sync.

## 1.0.40

### Fixed
- CSS build warning: a duplicate `transform` declaration in the phone context-bar rule (introduced in 1.0.39).
- The mobile "+" button overlapped the minimap/zoom/snap controls, and both overlapped the bottom context bar when a card was selected. The minimap/zoom/snap stack now shifts to whichever bottom corner the "+" button isn't using, and hides outright while the context bar is showing (it becomes a full-width bar that would otherwise sit on top of them either way).

### Added
- Canvas navigation on touch devices: pan with one finger, pinch with two to zoom — previously one finger only rubber-band-selected, with no way to pan without a mouse.
- Settings → Freeform canvas → "Mobile '+' button position": choose which corner (bottom right/left, top right/left) the phone add-card button sits in, in case the default still overlaps something on your device.

## 1.0.39

### Fixed
- Major mobile/touch UX overhaul, aimed at iPhone in particular (iPad was largely fine already):
  - The rich-text formatting popover no longer appears on phones at all — it had no phone-specific sizing or positioning and was very likely the cause of editing taking over the whole screen with a large white popup. It's unaffected on iPad/desktop.
  - Long-press now opens a proper bottom action sheet with your card's actions, instead of feeding a synthetic touch event into a desktop-style context menu — the likely reason menus weren't appearing at all on iPhone.
  - The bottom toolbar no longer crams 9+ tool buttons into a tiny horizontally-scrolling strip on phone widths. It now collapses to a single "+" button (bottom-right, thumb-reachable); tapping it opens a full labeled tool sheet.
  - Bottom-anchored UI now avoids the iPhone's home-indicator safe area, and shifts up out of the way of the on-screen keyboard while you're editing.

### Added
- Sticky notes, callouts, group labels, calendar titles, and column titles can now be edited with a single tap: select the card, then tap "Edit"/"Rename"/"Title" in the bottom bar — no more relying on double-tap, which is unreliable on touch. Kanban items open their editor on a single tap on phones too.

## 1.0.38

### Fixed
- A tile could link to the board it lives on, creating a "dead end" tile that appeared to do nothing when clicked — most likely to happen in a fresh vault, where the current board was often the only entry in the target picker. The picker now excludes the current board, saving a self-linked tile is refused with an explanation, and clicking an already-saved self-linked tile (from before this fix) now explains the problem instead of silently doing nothing.

### Changed
- The New Board dialog now labels the two layouts "Canvas" and "Tile grid" (previously "Freeform"/"Grid") with clearer descriptions, and defaults to Canvas — the grid default was contributing to users ending up with a tile-launcher page when they expected a canvas.
- Every open board now shows a small "Canvas" or "Tile grid" badge next to its name in the header, since the two look identical otherwise (same file extension, same icon).

## 1.0.37

### Changed
- Internal: board export now creates its download-trigger/canvas elements via Obsidian's `createEl` helper instead of `document.createElement`, and uses `window.setTimeout` for popout-window compatibility (plugin-review compliance). No behaviour change.

## 1.0.36

### Added
- Export the board as a PNG or PDF — right-click empty canvas space and choose "Export as PNG…" or "Export as PDF…". Captures the whole board (not just the current view), including connections and pen drawings. Known limitation: bookmark/map cards with live embeds export as an empty gap rather than a thumbnail.

## 1.0.35

### Fixed
- Picking a "Top strip" color for a Note had no visible effect (bug #8) — the note's background fill layer sat in its own stacking context that always painted above the strip, regardless of DOM order. The strip is now visible as soon as you pick a color.

### Added
- Notes now get the same selection-triggered formatting popup as checklist/kanban item text (Bold/Italic/Underline/Strikethrough plus, new, a font Color and Highlight option) — select some text in a Note to see it (bug #8).

## 1.0.34

### Fixed
- Comments stayed visually faded (0.6 opacity) even after un-marking them "Resolved" (bug #9) — the resolved styling was applied with a one-way toggle that added the class but never removed it. Un-resolving a comment now restores full opacity immediately.

## 1.0.33

### Fixed
- Deleting a selected card left the floating format bar (Bold/Italic/etc.) showing stale options for the just-deleted card until you clicked the canvas (bug #5) — the delete action cleared the selection but skipped the refresh step that tells the bar to hide, unlike Archive/Duplicate. The bar now resets immediately.

## 1.0.32

### Fixed
- Removed the "Oval" shape option from a blank Note card's right-click menu — it was a dead duplicate of "Circle" (both set the exact same underlying shape), and only Oval showed a checkmark for it, so neither item reflected the current shape correctly. Circle now shows the checkmark itself.

## 1.0.31

### Fixed
- Connection arrowheads no longer let the line's shaft poke out past the tip (bug #6). Arrowheads are now drawn as directly-computed triangles anchored to the connection's true endpoint, and the visible line is trimmed to an exact sub-segment of the true path so it stops cleanly at the arrowhead's base — for straight, bent, and elbow-routed connections alike. (An interim build had a regression on bent connections where the trimmed line could visibly separate from the selection outline and made clicking the middle of a hard bend unreliable; that's fixed here too.)

## 1.0.30

### Fixed
- Checklist checkbox: fixed a double checkmark caused by the plugin forcing native OS checkbox rendering on top of Obsidian's own theme-drawn checkmark (bug #4) — visible on themes where the two didn't happen to match colour. Also centred the checkmark within the box.

## 1.0.29

### Fixed
- Multiple toolbar tools (e.g. Pen and Line, or Pen and a placement tool like Column) could show as selected at the same time, with the earlier one stuck active underneath the new one (thanks for the bug report!). Activating any tool now correctly exits the other two first, so only one is ever highlighted.

## 1.0.28

### Fixed
- Dragging a card, releasing the mouse just off the card without moving far enough to count as a real drag, and later just hovering back over it could start moving the card again with no button held ("stuck" drag). Pointer capture is now acquired immediately on press (matching every other drag/resize in the app) instead of only after the drag threshold was crossed, so a release is always delivered correctly no matter where the cursor ends up.

## 1.0.27

### Changed
- Internal: the overflow menu's positioning now uses Obsidian's `setCssStyles` API (plugin-review compliance). No behaviour change.

## 1.0.26

### Fixed
- The toolbar's "…" overflow menu could be cut off at the screen edge on smaller windows, leaving items unreachable (thanks to the first community bug report! 🎉). The menu now repositions itself to stay fully on screen for every toolbar position, and scrolls internally when the window is shorter than the menu.

## 1.0.25

### Fixed
- Restored compatibility with Obsidian 1.12 and earlier — versions 1.0.20–1.0.24 required a not-yet-released Obsidian 1.13 and could not be installed; the settings tab also rendered blank on 1.12. Minimum Obsidian version is back to 1.7.2.

## 1.0.24

### Added
- Image cards can now be created **from a web URL** (alongside vault and disk upload) — the image is hot-linked, nothing is stored in the vault.

## 1.0.23

### Fixed
- Group frame names were clipped by the frame's top edge; the name tab now renders fully visible straddling the border.

## 1.0.22

### Added
- New starter template: **Creative Studio Hub** — a film-production kanban, animation reference corner, and study desk showcasing every card type.

## 1.0.21

### Added
- New starter template: **Project Ideas** — a Milanote-style creative project moodboard.

## 1.0.12

### Added
- Right-click a checklist task to **delete** it.

## 1.0.11

### Added
- Checklist subtasks can now be created by **right-click → Make subtask** or by **dragging a task to the right** over its new parent, alongside the existing Tab / Shift+Tab shortcut.

## 1.0.1 – 1.0.19

- Plugin-review compliance work: Obsidian API modernisation (createEl helpers, setCssStyles, popout-window-safe timers, declarative settings), CSS compatibility fixes, release workflow with auto-generated notes, and the "Starfleet Technical Manual" starter template rework.

## 1.0.0

- Initial release.
