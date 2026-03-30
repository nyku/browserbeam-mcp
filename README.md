# Browserbeam MCP Server

[MCP (Model Context Protocol)](https://modelcontextprotocol.io) server for [Browserbeam](https://browserbeam.com) — use real browser automation as tools in Cursor, Claude Desktop, Windsurf, and any MCP-compatible client.

## Setup

### Cursor

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "browserbeam": {
      "command": "npx",
      "args": ["-y", "@browserbeam/mcp-server"],
      "env": {
        "BROWSERBEAM_API_KEY": "sk_live_your_key_here"
      }
    }
  }
}
```

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "browserbeam": {
      "command": "npx",
      "args": ["-y", "@browserbeam/mcp-server"],
      "env": {
        "BROWSERBEAM_API_KEY": "sk_live_your_key_here"
      }
    }
  }
}
```

### Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "browserbeam": {
      "command": "npx",
      "args": ["-y", "@browserbeam/mcp-server"],
      "env": {
        "BROWSERBEAM_API_KEY": "sk_live_your_key_here"
      }
    }
  }
}
```

## Available Tools

| Tool | Description |
|------|-------------|
| `browserbeam_create_session` | Create a browser session, optionally navigate to a URL |
| `browserbeam_navigate` | Navigate to a new URL in an existing session |
| `browserbeam_observe` | Get page content as markdown or HTML with interactive element refs. Supports `mode: "full"` for all sections and `include_page_map` for a structural map |
| `browserbeam_click` | Click an element by ref, text, or label |
| `browserbeam_fill` | Fill form fields or an entire form at once |
| `browserbeam_type` | Type text character-by-character with real keyboard events |
| `browserbeam_select` | Select an option from a dropdown |
| `browserbeam_check` | Check or uncheck a checkbox or radio button |
| `browserbeam_scroll` | Scroll the page or scroll an element into view |
| `browserbeam_scroll_collect` | Scroll the entire page to load lazy content, then observe |
| `browserbeam_wait` | Wait for a selector, text, JS expression, or fixed delay |
| `browserbeam_extract` | Extract structured data using a declarative schema |
| `browserbeam_execute_js` | Run custom JavaScript in the browser page context |
| `browserbeam_screenshot` | Take a screenshot of the current page |
| `browserbeam_pdf` | Generate a PDF of the current page |
| `browserbeam_upload` | Upload files to a file input element |
| `browserbeam_list_sessions` | List your active browser sessions |
| `browserbeam_get_session` | Get the status and metadata of a session |
| `browserbeam_close` | Close a session and release resources |

## Page Map & Full Mode

The first `observe` in every session auto-includes a **page map** — a lightweight outline of page sections (nav, header, main, aside, footer) with CSS selectors and content hints. This lets agents discover what's on the page beyond the main content area without spending tokens.

To get content from **all** page sections instead of just the main area, use `mode: "full"`:

```json
{
  "tool": "browserbeam_observe",
  "params": {
    "session_id": "ses_abc123",
    "mode": "full",
    "max_text_length": 20000
  }
}
```

The response organizes content by section:

```markdown
## [nav]
Home | Products | About | Contact

## [main]
# Welcome to Our Site
...main content...

## [aside]
Related links, sidebar widgets...

## [footer]
© 2026 Company | Privacy | Terms
```

Use `include_page_map: true` to re-request the page map on subsequent observations.

## Agent guidelines (for AI clients)

- **Close sessions:** Agents should call `browserbeam_close` when finished with a session so resources are released and runtime billing stops. Only keep a session open if the user explicitly needs continued work on the same browser.
- **Page discovery:** The first observe auto-includes a `map`. Check it before using `mode: "full"` — if the info you need is in the main content, default mode is more token-efficient.
- **Full mode:** Use `mode: "full"` when you need sidebar content, footer links, or navigation items that aren't in the main area. Default `max_text_length` for full mode is 20,000 characters.
- **Truncation:** Page markdown is capped by default at **12,000** characters (`browserbeam_observe` and the page payload from `browserbeam_create_session` / `browserbeam_navigate`). If output is truncated, use `browserbeam_observe` with a higher `max_text_length` or `browserbeam_scroll_collect` (default **100,000** characters) for long or lazy-loaded pages.

## How It Works

The MCP server translates tool calls into Browserbeam API requests. Your AI agent sees structured page data (markdown content, interactive element refs, change diffs) instead of raw HTML.

```
AI Agent → MCP Tool Call → Browserbeam API → Real Browser → Structured Response → AI Agent
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BROWSERBEAM_API_KEY` | Yes | Your Browserbeam API key (`sk_live_...`) |
| `BROWSERBEAM_BASE_URL` | No | API base URL (default: `https://api.browserbeam.com`) |

## Get an API Key

Sign up at [browserbeam.com](https://browserbeam.com) — 1 hour of free runtime, no credit card required.

## License

MIT
