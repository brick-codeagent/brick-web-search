# Brick Web Search Extension

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![CI](https://github.com/brick-codeagent/brick-web-search/actions/workflows/ci.yml/badge.svg)](https://github.com/brick-codeagent/brick-web-search/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](package.json)

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