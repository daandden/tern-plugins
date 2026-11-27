# Tern views

Rules shared by the `/btw` and English coach panels in Tern. Since omp 19.2,
a panel is one tree of pi-tui nodes: Tern gets them as Tern Surface Protocol
nodes, and a plain terminal gets the same tree drawn as text rows.

- A scrolling region is a `scrollBox` (`panel-layout.ts`). It emits a capped
  `list` with the role `omp-tools.panel-body`, because a `col` with `max.h`
  only clips.
- The panels mount as `aboveEditor` widgets. In Tern both emit the role
  `omp.btw.note` and the shared `ternNoteHeading`; the native Tern palette
  supplies the frame's color and border. Do not set `selectedBg` on them.
  Native `/btw` mounts in the transcript; the extension uses the same look
  without relying on omp's private transcript presenter.
  The dock stacks the two notes in one `gap-none` column with no space
  between them, so the shared sheet prefix (`NOTE_STACK_CSS`) gives every
  note after the first a 10px top margin (Tern 0.9.36).
- The Ask card and Side question panel share the dock while an `ask` waits.
  While the card has focus, Tern reserves less height for the Side answer.
  The Ask card bounds its scrolling body separately from its action row so
  Submit stays reachable in short panes.
- While `nativeRendering()` is true, each panel sends its sheet each time its
  content draws: `omp-tools-btw` or `omp-tools-english-coach`. A sheet
  belongs to one surface, so a once-only send is lost when omp opens a new
  one. omp 19.2.1 reopens a surface after Tern's `gone` without redrawing
  unchanged content or telling extensions, so the panel stays unstyled until
  it changes ([#46](https://github.com/daandden/tern-plugins/issues/46)). A
  plain terminal gets no sheet.
- `sendSheet` sends the note heading and Markdown list gutter through
  `writeTerminalSequence`. The coach adds rules for its diff spans and
  hover cards. Use Tern's own colors, not the active omp terminal theme.
- Tern scopes a program sheet to strict descendants of its region, so a rule
  on `.sf-region` never applies (Tern 0.9.5).
- Tern's Markdown hangs list markers two cells left of the text, where the
  scroller clips them. `MARKDOWN_LIST_MARKER_GUTTER_CSS` (`tern-theme.ts`) adds
  two cells of left padding to the scroller and cancels it with a negative margin.
- Tern draws with its own CSS engine (stencil), not a browser. `position:
  absolute` with `right` and `bottom` works; the logical `inset-inline-end`
  and `inset-block-end` are ignored (Tern 0.9.26). Prefer physical properties
  in sheets.
- A popup is `ctx.ui.custom(factory, { overlay: true })` whose factory
  returns an `overlay` node (`anchor`, `size`, `modal`, `head`). In Tern,
  omp 19.2.1 uses it as is and focuses its first child, which must hold the
  key handler. In a plain terminal omp draws the same call as a sheet, so
  the factory returns a text tree there. The `/btw` reader and the
  `/english-coach` dashboard are popups. Each calls `holdOverlay()` while it
  is open, so the panels' interrupt handlers leave Esc to the popup.
- A program sheet rule that starts with `:root` never matches; start at the
  role selector and raise specificity by repeating a class
  (`.sf-button.sf-button`) to beat Tern's own rules (Tern 0.9.36).
