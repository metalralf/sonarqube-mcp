# AGENTS.md — SonarQube MCP Server

## ⚠️ CRITICAL RULES — READ BEFORE ANY WORK

**I WILL FORGET THESE. YOU MUST ENFORCE THEM.**

### Every handler → must have a test
- **Inline fetch-mock test** in the same pass as the handler (no exceptions)
- **Integration test** (at least one success + one error path)

### Every commit → must pass these FIRST
```bash
npm run typecheck        # mandatory — NO EXCEPTIONS
npm test                 # mandatory — NO EXCEPTIONS
npm run coverage:check   # mandatory — src/ thresholds: 100% lines, 100% funcs, 85% branches
```

### Every new language scan → must update LANG_CONFIGS
`src/helpers.mjs` — sources, tests, exclusions, binaries, coverageProperty

### Never do these
- Commit `.env`, `sonar-project.properties`, or tokens
- Tag releases (maintainer does this)
- Anonymous async functions in handlers (S3776)
- Function name `t` (i18n conflict)
- Write a handler without a success-path test

---

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
  handlers.mjs       — all 43 tool definitions
  helpers.mjs        — tool() builder, schemas, filtering, language detection, project introspection, Docker/scanner helpers
  api.mjs            — HTTP client (sonarGet, sonarPost, auth)
  http-server.mjs    — optional HTTP transport
  config.mjs         — constants
test/
  tools.test.mjs     — validates all 43 tools exist
  handlers.test.mjs  — unit tests for handler error + scanner paths
  handlers-success.test.mjs — 90+ handler success paths via fetch mock
  integration.test.mjs — live SonarQube API integration tests
  filtering.test.mjs — toolset filtering + read-only mode
  http-server.test.mjs — HTTP transport tests
  index-http.test.mjs — HTTP entry point tests
  api.test.mjs / api-error.test.mjs / config.test.mjs / helpers.test.mjs
```

## Commands

```bash
npm test                  # run all unit + integration tests
npm run coverage          # run with c8 coverage
npm run coverage:check    # enforce thresholds: 100% lines, 100% functions, 85% branches on src/
npm run typecheck         # tsc --noEmit JSDoc type check
```

## Pre-commit checklist (run this BEFORE committing)

```
typecheck → test → coverage:check
```

Every push must be green on all three. If coverage drops, fix it before pushing.

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

Every handler calls `sonarGet`/`sonarPost` which call `fetch()`. Mock `globalThis.fetch`:

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
buildScannerArgs({auth,projectKey,sonarSources,sonarTests}) — builds sonar-scanner -D args
runScanner(dir,useDocker,baseArgs)     — runs Docker or local scanner, returns output
pollCeTask(ceTaskUrl,timeout,interval) — polls /api/ce/task until SUCCESS/FAILED/CANCELED
mapScannerError(msg)      — maps scanner errors to actionable hints
detectProjectConfig(dir)  — filesystem introspection → suggested analysis config
detectSourceLanguages(dir,sources)     — walk src, inventory SonarQube language keys
detectTestsDir(dir)       — first existing of test/tests/spec/__tests__/e2e/integration-test
detectExclusions(dir)     — merges .gitignore patterns with known artifact dirs
detectCoverageReport(dir) — finds lcov/jacoco/cobertura report + property
detectBuildTool(dir)      — pnpm/npm/yarn/Maven/Gradle/pip/Go/Cargo/.sln
```

### Composite / meta-tool patterns

Composite tools call other handlers in-process via `ALL_TOOLS.find((t) => t.name === X).handler(args)`:
- `sonar_analyze_and_report`, `sonar_scan_workflow`, `sonar_call_multiple` all compose this way.
- Scanner-invoking composites (`analyze_and_report`, `scan_workflow`, `fix_and_verify`) wrap the execSync parts in `/* c8 ignore */` — the scanner can't be fetch-mocked, so the success path is untestable in unit tests. The detect/failure paths ARE tested.
- `sonar_call_multiple` is a meta-tool: batch-execute tools in linear order, capped at 25, consecutive exact dupes collapsed, recursion guard. It uses `ALL_TOOLS` (unfiltered), so it's in `READ_ONLY_TOOLS` to stay hidden in read-only deployments.

### READ_ONLY_TOOLS

```js
new Set(['sonar_set_issue_status', 'sonar_change_hotspot_status', 'sonar_run_analysis', 'sonar_setup_scanner', 'sonar_call_multiple'])
```
Tools excluded when `SONARQUBE_READ_ONLY=true`. `sonar_call_multiple` is included because it can invoke any write tool via `ALL_TOOLS`.

### Scanner command construction (1.6.0 fixes)

- `sonar.sources` is ALWAYS forwarded (via `buildScannerArgs`).
- `sonar.tests` is optional — omitted by default, pass empty string to disable.
- Scanner stderr is surfaced: on unmapped failure returns `{ success: false, output: msg }`; mapped errors still throw.
- Docker image pinned to `sonarsource/sonar-scanner-cli:11.1` (override via `SONARQUBE_DOCKER_IMAGE`).

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

- `main` — **unstable development** (can be broken). All work lands here.
- `release/vX.Y.Z` — stabilization branches. Cut from main when ready to ship. Run full release checklist, then tag.
- Tags (`v1.x.x`) — the only source of truth for end users. Never install from main.

## Release workflow

When the maintainer decides to ship:

1. **Cut `release/vX.Y.Z`** from main
2. **Run gate**: `typecheck → test → coverage:check`
3. **Update CHANGELOG.md** with all changes since last tag
4. **Bump version** in `package.json`, `src/index.mjs`, `README.md`
5. **Commit** as `chore: bump to vX.Y.Z`
6. **Tag and push**: `git tag vX.Y.Z && git push origin vX.Y.Z`
7. **Create GitHub Release** — maintainer does this
8. **Merge release branch back** to main if any fixes were made

See `RELEASE.md` for the full step-by-step.

## Agent workflow (daily development)

1. Work directly on `main` — no branch ceremony needed
2. Run `npm run typecheck` before committing
3. Run `npm test` to verify nothing breaks
4. Run `npm run coverage:check` to enforce src/ thresholds (100% lines, 100% functions, 85% branches)
5. Run `sonar-scanner -Dsonar.token=...` for dogfood analysis
6. Check quality gate via `sonar_quality_gate` tool
7. **Never tag or push a version bump on main** — that only happens on release branches
