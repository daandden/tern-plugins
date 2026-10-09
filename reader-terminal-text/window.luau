-- Tern's Reader chat style gives omp's text its own sizes and line heights (prose 14px/1.65,
-- composer 14px/22px). These rules put that text on the terminal's font size and row height
-- instead (--sf-fs and --sf-lh, which follow font_size and adjust_cell_height). Single-line
-- chrome (tool titles, chips, status) and sized headings keep Reader's values. `:root` makes each
-- rule outrank Reader's own.
--
-- The composer also gets the UI font: Reader sets it to `Geist, 'Berkeley Mono', var(--sans)`,
-- so Geist wins over `ui_font` (which Tern puts at the front of --sans).
tern.css("reader-terminal-text", [[
/* The terminal's size and row height, taken here before the composer redefines --sf-lh. */
:root .sf-chat-reader {
	--term-fs: var(--sf-fs, 13px);
	--term-lh: var(--sf-lh, 17px);
}

/* Message text at the terminal's size: user and assistant prose, body-size (annotated)
   headings, questions from `ask`, and the composer draft. */
:root .sf-chat-reader .sf-card[data-role='omp.user'] .sf-md .md,
:root .sf-chat-reader [data-role^='omp.assistant'] > .sf-md,
:root .sf-chat-reader.sf-h-annotated [data-role^='omp.assistant'] > .sf-md .md h1,
:root .sf-chat-reader.sf-h-annotated [data-role^='omp.assistant'] > .sf-md .md h2,
:root .sf-chat-reader.sf-h-annotated [data-role^='omp.assistant'] > .sf-md .md h3,
:root .sf-chat-reader.sf-h-annotated [data-role^='omp.assistant'] > .sf-md .md h4,
:root .sf-chat-reader .sf-md[data-role='omp.ask.question'],
:root .sf-chat-reader .sf-col[data-role^='omp.editor'] .sf-editor:not(.code) {
	font-size: var(--term-fs);
}

:root .sf-chat-reader .sf-card[data-role='omp.user'] .sf-md .md,
:root .sf-chat-reader [data-role^='omp.assistant'] > .sf-md,
:root .sf-chat-reader.sf-h-annotated [data-role^='omp.assistant'] > .sf-md .md h1,
:root .sf-chat-reader.sf-h-annotated [data-role^='omp.assistant'] > .sf-md .md h2,
:root .sf-chat-reader.sf-h-annotated [data-role^='omp.assistant'] > .sf-md .md h3,
:root .sf-chat-reader.sf-h-annotated [data-role^='omp.assistant'] > .sf-md .md h4,
:root .sf-chat-reader .sf-md .md .code pre,
:root .sf-chat-reader .sf-md .md .mfig-body .mmd-fallback,
:root .sf-chat-reader .sf-md .md .mfig-src,
:root .sf-chat-reader .sf-section[data-role^='omp.thinking'] > .sf-section-body,
:root .sf-chat-reader .sf-row[data-role='omp.recap'],
:root .sf-chat-reader .sf-tool-body > .sf-md,
:root .sf-chat-reader .sf-md[data-role='omp.ask.question'] {
	line-height: var(--term-lh);
}

:root .sf-chat-reader .sf-col[data-role^='omp.editor'] .sf-editor,
:root .sf-chat-reader .sf-col[data-role^='omp.editor'] .sf-editor.code {
	--sf-lh: var(--term-lh);
	line-height: var(--term-lh);
}

:root .sf-chat-reader .sf-col[data-role^='omp.editor'] .sf-editor:not(.code) {
	font-family: var(--sans);
	letter-spacing: normal;
}

/* Markdown on the terminal grid. Every line is one row, one blank row separates blocks, and boxes
   (code, callouts, raw HTML, the user bubble) take half a row of padding on each side, so they
   span whole rows. `:root:root` outranks Reader's longest selectors. */
:root:root .sf-chat-reader [data-role^='omp.assistant'],
:root:root .sf-chat-reader .sf-md {
	gap: var(--term-lh);
}

/* A link reference definition leaves an empty chunk, which would add a second blank row. */
:root:root .sf-chat-reader .sf-md > .md:empty {
	display: none;
}

:root:root .sf-chat-reader .sf-md .md :is(p, ul, ol, blockquote, .callout, .code, .mfig, .tbl, .md-html, .math-display) {
	margin: 0 0 var(--term-lh);
}

:root:root .sf-chat-reader .sf-md .md :is(h1, h2, h3, h4) {
	margin: var(--term-lh) 0 0;
	line-height: var(--term-lh);
}

:root:root .sf-chat-reader:not(.sf-h-annotated) .sf-md .md h1 {
	line-height: calc(2 * var(--term-lh));
}

:root:root .sf-chat-reader .sf-md .md > :first-child {
	margin-top: 0;
}

:root:root .sf-chat-reader .sf-md .md > :last-child,
:root:root .sf-chat-reader .sf-md .md :is(blockquote, .co-body) > :last-child,
:root:root .sf-chat-reader .sf-md .md li:last-child > .li-t > :last-child {
	margin-bottom: 0;
}

/* A rule is a one-row block, the line in the middle of the row. */
:root:root .sf-chat-reader .sf-md .md hr {
	height: var(--term-lh);
	margin: 0 0 var(--term-lh);
	border: 0;
	background: linear-gradient(var(--sf-p-mdHr, var(--l2)), var(--sf-p-mdHr, var(--l2))) center / 100% 1px no-repeat;
}

:root:root .sf-chat-reader .sf-md .md li {
	margin: 0;
}

:root:root .sf-chat-reader .sf-md .md li :is(ul, ol) {
	margin: 0;
}

/* Task checkboxes are 16px with a 4px top margin: centre them in the row instead. */
:root:root .sf-chat-reader .sf-md .md ul.tasks .cb {
	margin-top: calc((var(--term-lh) - 16px) / 2);
}

:root:root .sf-chat-reader .sf-md .md .code-head,
:root:root .sf-chat-reader .sf-md .md .mfig-head,
:root:root .sf-chat-reader .sf-md .md .code-out-foot {
	height: calc(2 * var(--term-lh));
}

:root:root .sf-chat-reader .sf-md .md .code pre,
:root:root .sf-chat-reader .sf-md .md .code-out,
:root:root .sf-chat-reader .sf-md .md .md-html {
	padding: calc(0.5 * var(--term-lh)) 14px;
}

:root:root .sf-chat-reader .sf-md .md .md-html {
	line-height: var(--term-lh);
}

:root:root .sf-chat-reader .sf-md .md .callout {
	padding: calc(0.5 * var(--term-lh)) 16px;
	font-size: inherit;
	line-height: var(--term-lh);
}

:root:root .sf-chat-reader .sf-md .md .callout .co-ic {
	height: var(--term-lh);
	margin-top: 0;
}

/* A display formula is at least two rows, centred in them. */
:root:root .sf-chat-reader .sf-md .md .math-display {
	display: flex;
	align-items: center;
	justify-content: center;
	min-height: calc(2 * var(--term-lh));
	padding: 0;
}

/* Table rows one row tall: the row rules are inset shadows, which take no height. */
:root:root .sf-chat-reader .sf-md .md :is(th, td) {
	padding: 0 16px 0 0;
	border-bottom: 0;
	box-shadow: inset 0 -1px 0 var(--l1);
	font-size: inherit;
	line-height: var(--term-lh);
}

:root:root .sf-chat-reader .sf-md .md th {
	box-shadow: inset 0 -1px 0 var(--l2);
}

:root:root .sf-chat-reader .sf-md .md tr:last-child td {
	box-shadow: none;
}

:root:root .sf-chat-reader .sf-card[data-role='omp.user'] > .sf-card-body {
	padding: calc(0.5 * var(--term-lh)) 16px;
}
]])

-- omp's empty composer shows the session title (or "What are we cooking?") as a placeholder.
-- Hidden, not removed, so the empty line keeps its height.
tern.css("composer-placeholder", [[
:root:root .sf-col[data-role^='omp.editor'] .sf-ed-ph {
	visibility: hidden;
}
]])
