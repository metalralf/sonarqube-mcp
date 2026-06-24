# AGENTS.md — SonarQube MCP Server

## Stack

- **Runtime**: Node.js 18+ (ESM, `"type": "module"`)
- **Framework**: `@modelcontextprotocol/sdk` + `zod` v4
- **Tests**: Node.js native `node:test` + `node:assert`
- **Type checking**: TypeScript `tsc --noEmit` via JSDoc annotations
- **Coverage**: `c8` (aliased as `npm run coverage`)
- **Scanner**: Docker (`sonarsource/sonar-scanner-cli`), fallback to npm/PATH `sonar-scanner`

## Project structure

```
src/
  index.mjs          — entry point, MCP server setup
  handlers.mjs       — all 34 tool definitions
  helpers.mjs        — tool() builder, schemas, filtering, language detection, Docker helpers
  api.mjs            — HTTP client (sonarGet, sonarPost, auth)
  http-server.mjs    — optional HTTP transport
  config.mjs         — constants
test/
  tools.test.mjs     — validates all 34 tools exist
  handlers.test.mjs  — unit tests for handler error + scanner paths
  handlers-success.test.mjs — 70+ handler success paths via fetch mock
  integration.test.mjs — live SonarQube API integration tests
  filtering.test.mjs — toolset filtering + read-only mode
  http-server.test.mjs — HTTP transport tests
  index-http.test.mjs — HTTP entry point tests
  api.test.mjs / api-error.test.mjs / config.test.mjs / helpers.test.mjs
```

## Agents

Agent definitions for commit/push, version management, changelog generation, test writing, refactoring, coverage analysis, and deep research live alongside the project. If you have access to tools/agents for similar tasks, delegate specialized tasks to them instead of doing everything in the main thread.

## Commands

```bash
npm test                  # run all unit + integration tests
npm run coverage          # run with c8 coverage
npm run coverage:check    # enforce thresholds: 100% lines, 100% functions, 85% branches on src/
npm run typecheck         # tsc --noEmit JSDoc type check
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

### Testing — success paths with fetch mock

Every handler calls `sonarGet`/`sonarPost` which call `fetch()`. Mock `globalThis.fetch` to test the handler logic without infrastructure:

```js
const mockFetch = (responses) => {
  let idx = 0;
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, opts) => responses[idx++](url, opts);
  return () => { globalThis.fetch = orig; };
};

const jsonOk = (data) => ({
  ok: true, status: 200,
  text: async () => JSON.stringify(data),
  json: async () => data,
});
```

Usage pattern — write alongside every new handler:

```js
it('sonar_foo returns correct result', async () => {
  const restore = mockFetch([() => jsonOk({ key: 'value' })]);
  const res = await h('sonar_foo')({ projectKey: 'test' });
  assert.equal(res.key, 'value');
  restore();
});
```

- **Must** test every new tool handler (not just error paths)
- **Must** add before/after for env vars (SONARQUBE_URL, SONARQUBE_TOKEN, SONARQUBE_PROJECT)
- **Must** restore `globalThis.fetch` after each test

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
detectLanguage(dir)       — sniffs package.json/pom.xml/requirements.txt etc.
buildSonarProps(key,host,sources,lang) — generates language-specific properties
hasDocker()               — checks Docker availability (disable with env var)
```

### API client (api.mjs)

```js
sonarGet(path)            — GET request, throws structured errors
sonarPost(path, body)     — POST with form-urlencoded body
resolveProjectKey()       — resolves param + env var fallback
maybeTruncated(data)      — adds _truncated flag when pagination exceeds page
sonarCheckServer()        — health check with contextual hints
```

### Environment variables (18 total)

All configurable — see full table in README. Key ones:
- `SONARQUBE_URL`, `SONARQUBE_TOKEN`, `SONARQUBE_PROJECT` — required
- `SONARQUBE_DISABLE_DOCKER`, `SONARQUBE_DOCKER_IMAGE`, `SONARQUBE_DOCKER_FLAGS` — scanner
- `SONARQUBE_HTTP_ALLOWED_ORIGINS`, `SONARQUBE_SCANNER_TIMEOUT`, `SONARQUBE_SOURCE_CONTEXT` — config
- `SONARQUBE_TOOLSETS`, `SONARQUBE_READ_ONLY`, `SONARQUBE_TRANSPORT` — behavior

## Branch workflow

- `main` — stable releases, tagged (`1.x.x`)
- `feature/*` — new tools/features, branch from `main`
- Version bumps:
  - **patch**: 1-2 small tools or fixes (e.g. `1.4.0` → `1.4.1`)
  - **minor**: 3+ new tools or significant features (e.g. `1.3.6` → `1.4.0`)
  - **major**: breaking changes (e.g. `1.4.0` → `2.0.0`)

## Agent workflow

1. Run `npm run typecheck` before committing
2. Run `npm test` to verify nothing breaks
3. Run `npm run coverage:check` to enforce src/ thresholds (100% lines, 100% functions, 85% branches)
4. Run `sonar-scanner -Dsonar.token=...` for dogfood analysis
5. Check quality gate via `sonar_quality_gate` tool
6. Bump version in `package.json` + `src/index.mjs` + `CHANGELOG.md` + update `#version` in `README.md`

## Rules (no exceptions)

- NEVER commit `.env`, `sonar-project.properties`, or files with tokens
- NEVER tag releases — the maintainer does this manually
- NEVER use anonymous async functions in tool handlers (rejected by SonarQube S3776)
- NEVER use `t` as a function name (conflicts with i18n conventions)
- NEVER leave a handler without a success-path test — write the fetch mock alongside the handler in the same pass
- ALWAYS add JSDoc `@param` / `@returns` for all exported functions
- ALWAYS add integration tests for new tools (at least one success + one error path)
- ALWAYS add mock-based unit tests for new tool handlers (every handler branches)
- ALWAYS update `LANG_CONFIGS` in helpers.mjs when adding scan support for a new language (sources, tests, coverage, exclusions, binaries, coverageProperty)
