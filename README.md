# Visual Notes

A visual workspace for [Obsidian](https://obsidian.md) — Milanote/Notion/Trello-style boards with icon tiles, a freeform canvas, kanban, tables, sticky notes, checklists, callouts, maps, colour swatches, and more. Everything is stored in a real, spec-compliant `.canvas` file in your vault, and boards nest inside each other and inside Obsidian's own native Canvas files too.

---

## Features

### Grid Mode
- **Tiles** that open folders, notes, canvases, kanban files, or nested boards
- Customise each tile's Lucide icon or emoji, background colour, label, and subtitle
- Optionally replace the icon with a cover image (Milanote-style tile thumbnail) from your vault or a URL
- Drag to reorder; right-click to edit

### Templates
- **15 bundled starter templates** (Brainstorm, Project Roadmap, Weekly Planner, Study Hub, Travel Planner, Fitness & Habits, and more) — pick one from **New board from template** to start with a populated board instead of a blank one
- **Save any board as your own template** via the toolbar's "···" menu or the **Save current board as template** command, then reuse it the same way as a bundled one
- Your own templates live in `_Templates/` in the vault, as plain `.canvas` files you can inspect or edit directly

### Freeform Canvas
- Edge-to-edge canvas, same as Obsidian's native Canvas — no wasted border, with the board-name/back-navigation bar floating as a small pill over the canvas instead of a full-width header
- A right-click "Add" menu and a left-hand toolbar cover every card type below, grouped into Write / Media & links / Organize
- A **slash-command quick-add** (`/`) drops a new card of any type at the cursor without leaving the keyboard
- **Connections** between any two cards — straight or elbow-routed, with colour, thickness, line style, arrowhead, and inline label
- **Multi-select** via marquee or Shift-click; group drag, alignment bar, and even distribution
- **Group frames** — select 2+ cards and press **⌘/Ctrl G** to wrap them in a native-Canvas-style labelled frame. Purely spatial (no membership list, exactly like Obsidian's own Canvas groups): drag the frame to move everything inside it, resize or delete the frame without ever touching its contents
- **Resize** any card by dragging any of its four corners
- **Pan** with middle-click (or Space + drag), **zoom** with the scroll wheel
- **Minimap** with click-to-jump and zoom-to-fit, collapsible to a floating widget
- **Board-level search** and a **tag/type filter** panel to narrow a busy board down
- **Archive** cards you're not using instead of deleting them, and browse/restore from the archive any time
- Drag notes, canvases, and folders straight from the file explorer onto the canvas to create tiles — dragging another Visual Notes file in creates a nested board, exactly like nesting boards in Milanote

### Locking
Kanban boards, kanban columns, and generic Columns each have a padlock toggle: a locked container can't have items dragged into or out of it, but its own cards can still be freely dragged and repositioned.

### Kanban
- **Multi-column boards** (drag items between columns, per-column WIP limits) and legacy single-column cards
- Rich-text formatting in items (bold, italic, strikethrough, colour, highlight)
- **Due dates** — an amber badge when due soon, red when overdue, muted once done
- **Sub-checklists** inside any item
- Link items to vault notes or an external URL (a YouTube link gets an inline video-thumbnail preview); add tag pills
- Optional per-item icon/emoji badge or cover thumbnail, and a per-item background colour (Trello-label style)
- Drop images or audio files directly into a column
- Toggle the column title; set background and accent-strip colours

### Tables
- Insert rows/columns anywhere; drag to reorder
- **Typed columns**, Notion-style: text, number, checkbox, date, or select (with coloured options)
- Column alignment and click-to-sort
- **Paste from a spreadsheet** — either merge into the existing grid, or use the footer's Paste button to replace the table outright (first row becomes headers, so headers never misalign)
- Google-Sheets-style cell interaction: click/drag to select a range, double-click to edit, right-click to colour a cell or range
- A zoom slider that scales cell content without resizing the card itself
- Sticky header row and virtualized rows so large pasted tables stay smooth

### Sticky Notes, Checklists & Comments
- Inline rich-text editing with **⌘ B / I / U** and **⌘ ⇧ S** shortcuts
- Checklists support header rows to group items into sections
- Background colour and top-strip accent via the context bar colour picker

### Callouts
Notion/Obsidian-style callout cards with a full emoji picker (or free-text emoji) for the icon, plus title and body text.

### Columns
A generic, lockable container card for freeform grouping of tiles, sticky notes, checklists, tables, images, audio, note links, bookmarks, swatches, files, and callouts — distinct from a Group frame in that it holds an explicit list of children rather than being purely spatial.

### Images, Audio & Files
- Paste images from the clipboard; drag from the file explorer or OS onto the canvas or into a kanban column
- Add from the vault or upload from disk via the toolbar
- Images display at their natural aspect ratio; toggle captions with **⌘ ⇧ C** / **Ctrl ⇧ C**
- A generic **File card** for PDFs and other vault documents
- All imported files are automatically sorted into `_Assets/` subfolders (see Asset Management below)

### Bookmarks
Paste any URL for a link-preview card (title, description, favicon, image) fetched automatically. YouTube links get a native-style embed with a working inline play button instead of a plain preview.

### Maps
Paste a Google Maps link to get a live, fully interactive embed that matches the exact view you copied — including satellite/hybrid layer and zoom level derived from the link's altitude.

### Swatches
A colour swatch card showing the hex value and a nearest named-colour label. Double-click (or use the pipette button) to open the native colour picker, or right-click for a menu of approximate named palettes (Muted, Vivid, Pastel, Earth Tones, Grayscale) to generate a grid from. A reroll button in the name bar picks a new random colour.

### Text Formatting
Select any text in a sticky note, checklist, kanban item, or image caption to reveal a floating toolbar: bold, italic, underline, strikethrough, text colour (preset + colour picker), and highlight colour.

### Drawing
- Freehand **pen** and **highlighter** strokes directly on the canvas, layered above cards
- Pen strokes are rendered with [perfect-freehand](https://github.com/steveruizok/perfect-freehand), giving genuine pressure-sensitive tapering on a stylus/tablet (simulated from drawing speed for mouse input)
- Nearby strokes drawn in the same session are grouped into one sketch automatically; a doodle started elsewhere on the canvas gets its own group instead of merging in
- **Multi-select** strokes via marquee or Shift/Ctrl-click, then move, resize, recolor, or delete them as a group
- **Eraser** detects your swipe crossing a stroke's actual line, not just proximity to its sample points — works cleanly on straight lines, not just wobbly ones
- Full **undo/redo** support for every drawing action

### Asset Management
- **Auto-sort:** every image, audio clip, video, or document imported into a board is automatically moved to the correct subfolder in the vault root:
  - `_Assets/Images/` — jpg, png, gif, webp, svg, …
  - `_Assets/Audio/` — mp3, wav, ogg, flac, …
  - `_Assets/Video/` — mp4, mov, mkv, …
  - `_Assets/Documents/` — pdf
- **Auto-relink:** scan all boards and fix broken file paths when a unique filename match is found in the vault. Three ways to run it:
  - **On open** — toggle *Auto-relink on board open* in Settings to fix links silently every time a board loads
  - **Settings button** — Settings → Assets → *Relink now*
  - **Command palette** — `Visual Notes: Relink all board assets`

### Keyboard Shortcuts
| Action | Shortcut |
|---|---|
| Delete selected | Delete / Backspace |
| Select all | ⌘ A |
| Duplicate | ⌘ D |
| Group selection | ⌘ G / Ctrl G |
| Undo | ⌘ Z |
| Redo | ⌘ ⇧ Z |
| Toggle image caption | ⌘ ⇧ C |
| Bold (sticky editor) | ⌘ B |
| Italic (sticky editor) | ⌘ I |
| Underline (sticky editor) | ⌘ U |
| Strikethrough (sticky editor) | ⌘ ⇧ S |
| Quick-add card | / |

---

## Installation

### Community Plugin Browser *(once listed)*
1. Open **Settings → Community plugins → Browse**
2. Search for **Visual Notes**
3. Click **Install**, then **Enable**

### Manual Installation *(for beta testers)*
1. Download `main.js`, `manifest.json`, and `styles.css` from this plugin's latest release
2. In your vault, create the folder `.obsidian/plugins/visual-notes/`
3. Copy the three files into that folder
4. Open Obsidian, go to **Settings → Community plugins**, and enable **Visual Notes**

---

## Usage

### Opening a board
- Run **Visual Notes: Open** from the command palette
- Or click the layout-dashboard icon in the left ribbon

### Creating your first board
1. Run **Visual Notes: Create new board** (or click **+ New board** on the empty home screen)
2. A `.canvas` file is created in your vault root (you can move it later)
3. The board opens in grid mode — click the **+** button to add your first icon tile

### Grid mode
- **Click** a tile to open its target
- **Right-click** a tile to edit, change icon, change colour, or delete
- **Drag** tiles to reorder them

### Freeform canvas
- Switch to canvas mode with the toggle in the top-right corner of any board
- **Right-click** the canvas background to add a card, grouped into Write / Media & links / Organize
- Type **/** to quick-add a card at the cursor
- **Pan** by dragging the background, middle-clicking anywhere, or holding Space and dragging; **zoom** with the scroll wheel
- **Right-click** a card for options (edit, style, connect, lock, archive, delete)
- The **toolbar** on the left has one button per card type; click it or drag it onto the canvas
- Use the **search** and **filter** widgets to jump to or narrow down cards on a busy board
- Toggle the **minimap** to see and jump around the whole board at a glance

### Connections
- Right-click a card → **Connect** to enter connection mode, then click a second card
- Click a connection to select it; right-click for colour, thickness, and style options

### Fixing broken asset links
If you move files in the vault and board assets stop loading, run **Visual Notes: Relink all board assets** from the command palette. For automatic fixing every time you open a board, enable *Auto-relink on board open* in Settings.

### Saving
Boards save automatically as you work. All data lives in the `.canvas` file — no external database or sync service is required.

---

## Permissions & data access

Visual Notes only reads and writes files inside your own vault — it makes no network requests and sends no data anywhere. Two vault-wide capabilities it uses, and why:

- **Vault file listing** (`vault.getFiles`, `getMarkdownFiles`): needed to power the note/image/audio/file pickers (e.g. linking a note to a kanban item, choosing a cover image, auto-relinking moved assets). Nothing is read or transmitted beyond the file list itself until you pick a specific file.
- **Clipboard access**: used to paste images directly onto a board (Ctrl/Cmd+V) and to copy/paste cards between boards. It only reads the clipboard when you trigger a paste action inside the plugin.

---

## Compatibility

| Platform | Status |
|---|---|
| Obsidian desktop (Mac, Windows, Linux) | ✅ Supported |
| Obsidian mobile (iOS, iPadOS) | ✅ Supported |
| Minimum Obsidian version | 1.7.2 |

---

## Development

```bash
git clone https://github.com/danderson1988/visual-notes.git
cd visual-notes
npm install
npm run dev        # watch mode — rebuilds on save
npm run build      # production build
```

Copy or symlink the folder into `<vault>/.obsidian/plugins/visual-notes/`, then enable the plugin in Obsidian.

---

## License

[MIT](LICENSE) — © Daniel Anderson

Pen strokes are rendered with [perfect-freehand](https://github.com/steveruizok/perfect-freehand) by Steve Ruiz (MIT license).
