# AGENTS.md — SonarQube MCP Server

## Stack

- **Runtime**: Node.js 18+ (ESM, `"type": "module"`)
- **Framework**: `@modelcontextprotocol/sdk` + `zod` v4
- **Tests**: Node.js native `node:test` + `node:assert`
- **Type checking**: TypeScript `tsc --noEmit` via JSDoc annotations
- **Coverage**: `c8` (aliased as `npm run coverage`)

## Project structure

```
src/
  index.mjs          — entry point, MCP server setup
  handlers.mjs       — all 34 tool definitions
  helpers.mjs        — tool() builder, shared schemas, categories, filtering
  api.mjs            — HTTP client (sonarGet, sonarPost, auth)
  http-server.mjs    — optional HTTP transport
  config.mjs         — constants
test/
  tools.test.mjs     — validates all 34 tools exist
  handlers.test.mjs  — unit tests for handler error paths
  integration.test.mjs — live SonarQube API integration tests
  filtering.test.mjs — toolset filtering + read-only mode
  http-server.test.mjs — HTTP transport tests
  api.test.mjs / api-error.test.mjs / config.test.mjs
```

## Commands

```bash
npm test             # run all unit + integration tests
npm run coverage     # run with c8 coverage
npm run typecheck    # tsc --noEmit JSDoc type check
```

## Conventions

### Tool definitions

Every tool uses the `tool()` builder from `helpers.mjs`:

```js
tool('sonar_tool_name', 'Short description.', {
  paramName: z.string().optional().describe('What it does'),
}, async ({ paramName }) => {
  // handler: call sonarGet/sonarPost, return plain data
})
```

- Tool names are `snake_case` with `sonar_` prefix
- Schemas use Zod `.describe()` for LLM-facing documentation
- Handlers return plain objects/arrays — the MCP wrapper stringifies

### Shared schemas

```js
projectKey    — z.string().optional() with SonarQube_PROJECT fallback
componentKey  — z.string() required, for file-specific queries
maxResults    — z.number().optional() pagination helper
```

### Helper functions

```js
requireKey(key)           — throws if key is falsy
componentParams(k, f, t)  — builds URLSearchParams for source/SCM queries
measureSearch(metricKey, valueKey, defaultThreshold, descend)
                          — returns a handler for threshold-based file searches
encode(v)                 — encodeURIComponent shorthand
```

### API client (api.mjs)

```js
sonarGet(path)         — GET request, throws structured errors
sonarPost(path, body)  — POST with form-urlencoded body
resolveProjectKey()    — resolves param + env var fallback
maybeTruncated(data)   — adds _truncated flag when pagination exceeds page
sonarCheckServer()     — health check with contextual hints
```

## Branch workflow

- `main` — stable releases, tagged (`1.x.x`)
- `feature/*` — new tools/features, branch from `main`
- Version bumps:
  - **patch**: 1-2 small tools or fixes (e.g. `1.3.3` → `1.3.4`)
  - **minor**: 3+ new tools or significant features (e.g. `1.3.3` → `1.4.0`)
  - **major**: breaking changes (e.g. `1.3.3` → `2.0.0`)

## Agent workflow

1. Run `npm run typecheck` before committing
2. Run `npm test` to verify nothing breaks
3. Run `sonar-scanner -Dsonar.token=...` for dogfood analysis
4. Check quality gate via `sonar_quality_gate` tool
5. Bump version in `package.json` + `src/index.mjs` + update `#version` in `README.md`

## Rules (no exceptions)

- NEVER commit `.env`, `sonar-project.properties`, or files with tokens
- NEVER tag releases — the maintainer does this manually
- NEVER use anonymous async functions in tool handlers (rejected by SonarQube S3776)
- NEVER use `t` as a function name (conflicts with i18n conventions)
- ALWAYS add JSDoc `@param` / `@returns` for all exported functions
- ALWAYS add integration tests for new tools (at least one success + one error path)
