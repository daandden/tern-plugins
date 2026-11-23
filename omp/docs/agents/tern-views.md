# Tern views

Rules shared by the `/btw` and English coach panels in Tern. In terminals that
speak the Tern Surface Protocol, OMP calls `describe(cx)` instead of `render()`.

- A scrolling region is a `scrollBox` (`panel-layout.ts`). It emits a capped
  `list` with the role `omp-tools.panel-body`, because a `col` with `max.h`
  only clips.
- Since omp 19.0.1, Tern's native dock puts `aboveEditor` widgets (the `/btw`
  and English coach panels) above the working row and the tray, not next to
  the composer, and drops the blank spacer row that came before them
  ([oh-my-pi#19767](https://github.com/can1357/oh-my-pi/issues/19767)). The
  panels need no spacing of their own for it: the coach's 13px bottom padding
  balances its text's descent.
- When `cx.feature("styles")` is true, each panel sends its sheet with every
  `describe`: `omp-tools-btw` or `omp-tools-english-coach`. A sheet belongs
  to one surface, and pi-tui opens a new inline surface on `gone` with the
  same describe context, so a once-only send is lost.
- Every sheet goes out through `sheetMessage` (`tern-theme.ts`), which leads
  it with the omp theme rules. The selector matches an `omp.overlay.btw`
  column holding an `omp-tools.*` role. It leaves the composer and native
  `/btw` alone and sets the plugin panel's palette variables (`--t*`,
  `--l*`, `--accent`, `--sf-*`, `--sf-c-*`) and the background from the active
  omp `theme`: `selectedBg` for the surface, `toolDiffAdded` and
  `toolDiffRemoved` for `ins` and `del`. An empty `text` token leaves Tern's
  `--t1`. The rules are rebuilt when the theme instance changes. A doubled
  `.sf-col` outranks Tern 0.9.26's chat-reader rule that washes overlays with
  white. A view's root therefore needs an `omp-tools.*` role in every state.
- Tern scopes a program sheet to strict descendants of its region, so a rule
  on `.sf-region` never applies (Tern 0.9.5).
- Tern's Markdown hangs list markers two cells left of the text, where the
  scroller clips them. `MARKDOWN_LIST_MARKER_GUTTER_CSS` (`tern-theme.ts`) adds
  two cells of left padding to the scroller and cancels it with a negative margin.
- Tern draws with its own CSS engine (stencil), not a browser. `position:
  absolute` with `right` and `bottom` works; the logical `inset-inline-end`
  and `inset-block-end` are ignored (Tern 0.9.26). Prefer physical properties
  in sheets.
