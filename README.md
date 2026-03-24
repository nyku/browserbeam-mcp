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
| `browserbeam_observe` | Get page content as markdown with interactive element refs |
| `browserbeam_click` | Click an element by ref, text, or label |
| `browserbeam_fill` | Fill form fields or an entire form at once |
| `browserbeam_extract` | Extract structured data using a declarative schema |
| `browserbeam_screenshot` | Take a screenshot of the current page |
| `browserbeam_close` | Close a session and release resources |

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
