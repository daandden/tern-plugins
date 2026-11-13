-- Tern draws a browser block's page in a native view above its own UI, so the part of a toast
-- (`body > .toast`, centred at the bottom of the window) that overlaps the page is hidden. Tern
-- hides the page behind a snapshot for the palette and other modals, but not for a toast. While
-- the visible tab shows a browser block (`.tn-pane.web` without `.off`, tiled or floating), this
-- sheet moves the toast to the top of the window, over the title bar, which no page covers. It
-- then slides in from above. These are Tern's internal classes, not an API.
tern.css("toast-above-browser", [[
:root body:has(.tn-stage > .tn-pane.web:not(.off)) > .toast {
	top: 0;
	bottom: auto;
	&:not(.swap) {
		animation-name: toastAboveBrowserIn;
	}
}
@keyframes toastAboveBrowserIn {
	from {
		opacity: 0;
		transform: translate(-50%, -10px);
	}
}
]])
