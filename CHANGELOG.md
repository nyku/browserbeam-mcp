# Changelog

All notable changes to the `@browserbeam/mcp-server` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.4.0] - 2026-03-30

### Added

- **`mode` parameter** on `browserbeam_observe`: set `mode: "full"` to receive content from all page sections (nav, aside, main, footer) organized by `## [section]` headers. Default `mode: "main"` returns only the main content area (existing behavior). Default `max_text_length` for `full` mode is 20,000 characters.
- **`include_page_map` parameter** on `browserbeam_observe`: request a lightweight structural outline of page sections. The `map` is auto-included on the first observe of each session; set `include_page_map: true` to request it again on subsequent calls.
- **Page map rendering**: `formatPageState` now prints a `--- Page Map ---` section when the API returns `page.map`, showing each section's name, CSS selector, and content hint.

### Changed

- `ApiResponse` type extended with `page.map` array.
- `browserbeam_observe` tool description updated with guidance on `mode` and `map` usage.

## [0.3.0] - 2026-03-27

### Added

- **Page state**: `formatPageState` now prints optional context on each interactive element when the API provides it: `in` (landmark), `near` (nearest heading text), and `form` (parent form ref).
- **Page state**: dedicated `--- Forms ---` section listing each form with method, action, and `fields` as element refs (`f1`, `f2`, …).

### Changed

- `ApiResponse` types extended so `page.interactive_elements` and `page.forms` match the Browserbeam API’s context-enriched shape.

## [0.2.0] - 2026-03-25

### Added

- **New tools**: `browserbeam_type`, `browserbeam_select`, `browserbeam_check`, `browserbeam_scroll`, `browserbeam_scroll_collect`, `browserbeam_wait`, `browserbeam_execute_js`, `browserbeam_pdf`, `browserbeam_upload`, `browserbeam_list_sessions`, `browserbeam_get_session`
- `browserbeam_create_session`: `user_agent`, `locale`, `timezone`, `block_resources`, `cookies` parameters
- `browserbeam_navigate`: `wait_for`, `wait_until`, `wait_timeout` parameters
- `browserbeam_observe`: `format` (markdown/html) and `max_text_length` parameters
- Content truncation indicator when page content exceeds `max_text_length`
- HTML content support alongside markdown in page state formatting

### Changed

- Improved tool descriptions with usage guidance to reduce unnecessary observe calls
- `browserbeam_extract` schema description now documents `>> attribute` syntax, `_parent`, and `_limit`
- `browserbeam_fill`: fixed value assignment to use `!== undefined` check instead of truthy check

## [0.1.0] - 2026-03-24

### Added

- Initial release
- 8 MCP tools: `browserbeam_create_session`, `browserbeam_navigate`, `browserbeam_observe`, `browserbeam_click`, `browserbeam_fill`, `browserbeam_extract`, `browserbeam_screenshot`, `browserbeam_close`
- Automatic page state formatting with markdown content, interactive elements, scroll position, and extraction results
- Environment-based configuration via `BROWSERBEAM_API_KEY` and `BROWSERBEAM_BASE_URL`

[0.4.0]: https://github.com/nyku/browserbeam-mcp/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/nyku/browserbeam-mcp/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/nyku/browserbeam-mcp/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/nyku/browserbeam-mcp/releases/tag/v0.1.0
