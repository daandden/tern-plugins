# Ask card

omp-tools overrides `ask` in the interactive TUI. Native `ask` still handles noninteractive calls, `/tree` re-answer, and other host dialogs. See [the Ask card ADR](../../../docs/adr/20261126-omp-tools-owns-ask-again.md).

- Keep the native HTML input and validation contract. Use `recoverAskHtml` for legacy inputs. Treat the form as data, including question names, labels, and instructions. Keep the original HTML when notifying vstack about a Flow question.
- At TUI session start, register the card only if omp has already registered native `ask`. This preserves the launch-time tool list and leaves print, RPC, and ACP unchanged. Restart the session after changing Ask availability to rebuild the tool registration.
- The card takes the composer through `ui.custom`. It owns the form, saved Notes, the General note, and their pictures. The waiting-status hold ends on submit, cancel, expiry, or abort. Timed-out answers are not consent.
- Render against omp 19.2.1's native form in both clients. The terminal painter and Tern roles are distinct contracts. Use the Ask verification recipe when either host changes.
- Only Notes on picked options accompany the answer. The General note is separate from form values. Preserve line breaks and number image markers in result order across both Note types.
- The clipboard image key and pasted paths target the Note editor. On omp 19.2.1, `ui.custom` does not register a Tern enhanced-paste target. The host can send that image to its own form or composer, but not to the Ask card.
- `Shift+N` opens the General note when the focused control takes no typed text; `Alt+U` opens it from any form control, so a text field, dropdown, or Other field still types `N`.
- `?` opens the Side question editor when the focused control takes no typed text; `Alt+/` opens it from anywhere, Note editors included. The editor takes the plain question (a typed `/btw <question>` also works). It uses the same session-owned thread as composer `/btw`. Draft values and Notes are attached to that request only. They are never sent to the main agent.
- The Flow panel needs [vstack's dialog hook](https://github.com/daandden/vstack/issues/629). The optional `Symbol.for("vstack.flow-page.ask-dialog")` hook on the UI host receives the exact HTML, call ID, and signal, and returns a disposer. The card does not wrap `formDialog` or depend on which plugin loads first. The Flow control-name check remains on vstack's `tool_call` handler.
