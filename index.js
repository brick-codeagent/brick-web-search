import { createInterface } from "node:readline";

// ─── DuckDuckGo HTML Search ────────────────────────────────────────────────

const DDG_URL = "https://html.duckduckgo.com/html/";
const TIMEOUT_MS = 10_000;

/**
 * Search DuckDuckGo via the HTML endpoint and parse results.
 * @param {string} query
 * @param {number} numResults
 * @returns {Promise<string>}
 */
async function searchDuckDuckGo(query, numResults) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let html;
  try {
    const response = await fetch(DDG_URL, {
      method: "POST",
      body: new URLSearchParams({ q: query }),
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    html = await response.text();
  } finally {
    clearTimeout(timer);
  }

  // Parse result blocks: find result__a links and result__snippet spans
  const resultRegex =
    /<a[^>]*rel="nofollow"[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRegex =
    /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

  const titles = [];
  const urls = [];
  let match;

  while ((match = resultRegex.exec(html)) !== null) {
    if (titles.length >= numResults) break;
    urls.push(match[1]);
    titles.push(stripHtml(match[2]).trim());
  }

  const snippets = [];
  while ((match = snippetRegex.exec(html)) !== null) {
    if (snippets.length >= numResults) break;
    snippets.push(stripHtml(match[1]).trim());
  }

  const parts = [];
  for (let i = 0; i < Math.min(titles.length, numResults); i++) {
    parts.push(
      `Title: ${titles[i] ?? ""}\nURL: ${urls[i] ?? ""}\nSnippet: ${snippets[i] ?? ""}`,
    );
  }

  return parts.join("\n---\n") || "No results found.";
}

/**
 * Strip HTML tags from a string and decode common HTML entities.
 * @param {string} html
 * @returns {string}
 */
function stripHtml(html) {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/");
}

// ─── JSON-RPC 2.0 helpers ──────────────────────────────────────────────────

/**
 * Create a JSON-RPC success response.
 * @param {string|number} id
 * @param {*} result
 * @returns {string}
 */
function success(id, result) {
  return JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n";
}

/**
 * Create a JSON-RPC error response.
 * @param {string|number} id
 * @param {number} code
 * @param {string} message
 * @returns {string}
 */
function error(id, code, message) {
  return JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }) + "\n";
}

// ─── Request handler ───────────────────────────────────────────────────────

/**
 * Handle a parsed JSON-RPC request.
 * @param {{ jsonrpc: string, id: string|number, method: string, params?: * }} request
 */
async function handleRequest(request) {
  const { id, method, params } = request;

  switch (method) {
    case "initialize": {
      const protocolVersion = params?.protocolVersion ?? "2025-03-26";
      process.stdout.write(
        success(id, {
          protocolVersion,
          capabilities: {},
          serverInfo: { name: "web-search", version: "0.1.0" },
        }),
      );
      break;
    }

    case "tools/list": {
      process.stdout.write(
        success(id, {
          tools: [
            {
              name: "web_search",
              description: "Search the web for information",
              inputSchema: {
                type: "object",
                properties: {
                  query: {
                    type: "string",
                    description: "Search query",
                  },
                  numResults: {
                    type: "number",
                    description: "Number of results (default 5, max 10)",
                  },
                },
                required: ["query"],
              },
            },
          ],
        }),
      );
      break;
    }

    case "tools/call": {
      const toolName = params?.name;
      const args = params?.arguments ?? {};

      if (toolName !== "web_search") {
        process.stdout.write(error(id, -32601, `Unknown tool: ${toolName}`));
        break;
      }

      const query = String(args.query ?? "");
      if (!query) {
        process.stdout.write(
          error(id, -32602, "Missing required argument: query"),
        );
        break;
      }

      const numResults = Math.min(
        Math.max(1, Number(args.numResults) || 5),
        10,
      );

      try {
        const text = await searchDuckDuckGo(query, numResults);
        process.stdout.write(
          success(id, { content: [{ type: "text", text }] }),
        );
      } catch (err) {
        process.stdout.write(
          error(id, -32603, `Search failed: ${err.message}`),
        );
      }
      break;
    }

    default:
      process.stdout.write(error(id, -32601, `Method not found: ${method}`));
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────

const rl = createInterface({ input: process.stdin });

let buffer = "";
let pending = 0;

/**
 * Wrap handleRequest with pending-count tracking so we don't
 * exit before async handlers complete.
 */
function handleRequestSafe(request) {
  pending++;
  handleRequest(request)
    .catch((err) => {
      process.stdout.write(
        error(request.id ?? null, -32603, `Internal error: ${err.message}`),
      );
    })
    .finally(() => {
      pending--;
      if (rl.closed && pending === 0) {
        process.exit(0);
      }
    });
}

rl.on("line", (line) => {
  buffer += line;

  try {
    const request = JSON.parse(buffer);
    if (
      request &&
      typeof request === "object" &&
      request.jsonrpc &&
      request.method
    ) {
      buffer = "";
      handleRequestSafe(request);
    }
  } catch {
    // Not complete JSON yet, keep buffering
  }
});

rl.on("close", () => {
  if (pending === 0) {
    process.exit(0);
  }
  // otherwise wait for handleRequestSafe to call process.exit
});