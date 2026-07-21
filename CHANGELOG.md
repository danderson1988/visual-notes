# Changelog

All notable user-facing changes to Visual Notes.

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
