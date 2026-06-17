# sonarqube-mcp

A lightweight, zero-Docker MCP server that exposes SonarQube data as AI agent tools. Starts in ~0.1s — no JVM, no analyzer downloads.

## Quick start

```json
{
  "mcp": {
    "sonarqube": {
      "type": "local",
      "command": ["npx", "-y", "github:<your>/sonarqube-mcp"],
      "enabled": true,
      "environment": {
        "SONARQUBE_URL": "http://localhost:9000",
        "SONARQUBE_TOKEN": "squ_...",
        "SONARQUBE_PROJECT": "my_project"
      }
    }
  }
}
```

Or from a local clone: `"command": ["node", "/path/to/src/index.mjs"]`

## Tools

| Tool | Purpose |
|---|---|
| `sonar_search_projects` | Discover project keys |
| `sonar_quality_gate` | Gate pass/fail + failing conditions |
| `sonar_measures` | Bugs, smells, coverage, ratings, ncloc, dup |
| `sonar_issues` | Open issues sorted by severity |
| `sonar_hotspots` | Security hotspots (needs user token) |
| `sonar_rule` | Explain a rule (why an issue fired) |
| `sonar_source` | View flagged source lines |
| `sonar_raw` | Escape hatch — any GET endpoint |

## Configuration

| Env var | Required | Default | Description |
|---|---|---|---|
| `SONARQUBE_URL` | ✅ | `http://localhost:9000` | SonarQube instance base URL |
| `SONARQUBE_TOKEN` | ✅ | — | Auth token |
| `SONARQUBE_PROJECT` | ❌ | — | Default project key |
| `SONARQUBE_ORGANIZATION` | ❌ | — | SonarCloud org key |
| `SONARQUBE_AUTH_SCHEME` | ❌ | `basic` | `basic` or `bearer` |

### Token types

| Type | Prefix | Hotspots? |
|---|---|---|
| User token | `squ_` | ✅ |
| Project analysis | `sqp_` | ❌ 403 |
| Global analysis | `sqa_` | ❌ 403 |

## Local dev

```bash
git clone <url>
cd sonarqube-mcp
npm install

# Smoke test
SONARQUBE_URL=http://localhost:9000 \
SONARQUBE_TOKEN=squ_... \
SONARQUBE_PROJECT=my_key \
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"t","version":"1"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
| node src/index.mjs
```

## Design

- Uses `@modelcontextprotocol/sdk` with low-level `Server` API — no zod dependency, no peer-dep clashes
- All logging goes to stderr (stdout is the JSON-RPC channel)
- Tool errors return `{ content, isError: true }` so the LLM sees them
- Token is never logged or leaked in error messages
