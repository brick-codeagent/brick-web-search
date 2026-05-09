# Brick Web Search Extension

A Brick extension that adds web search capability via DuckDuckGo.

## Installation

```bash
brick install ./extension-web-search
```

## Tools

| Tool | Description |
|------|-------------|
| `web_search(query, numResults?)` | Search the web. Returns title, URL, snippet per result. |

## How it works

- Zero external dependencies (uses Node.js 20+ built-in `fetch`)
- 10-second timeout with AbortController
- MCP stdio protocol — spawned as subprocess by Brick