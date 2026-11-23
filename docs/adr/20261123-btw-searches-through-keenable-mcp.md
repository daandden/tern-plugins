# /btw searches through the main session's Keenable MCP tools

The `/btw` Side question offers `mcp__keenable_search_web_pages` and `mcp__keenable_fetch_page_content` instead of native `web_search`, because the user searches through Keenable's MCP server. omp turns MCP off in the restricted mirror session, so the plugin passes the two tools in by name, and each call runs on the main session's existing Keenable connection. A thread offers them when that connection has both as the thread starts; a call after Keenable disconnects fails with a message. The plugin opens no second MCP connection. They run under the mirror's approval rule like `read`, `grep` and `glob`: without asking, unless the user sets a per-tool rule, and a call that would need a prompt fails.

## Considered options

- Native `web_search`, which already searches through Keenable here because the `web` role is `web/keenable`. Rejected for `/btw`: it has no page fetch, and the user asked to stop offering `web_search`.
- Following the main session's approval mode. Rejected: an ask-first main mode would leave `/btw` unable to search, and a prompt must not appear over a waiting native `ask`.

## Consequences

- Native advisors cannot get MCP tools on omp 19.1.0, so they search through a user `WATCHDOG.yml` that grants native `web_search`, outside this repo.
