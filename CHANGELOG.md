# Changelog

## 1.7.0 (2026-07-07)

- **`sonar_call_multiple`** — batch meta-tool: execute tools in linear order, capped at 25, consecutive dedup, recursion guard (in `READ_ONLY_TOOLS`)
- **`sonar_file_review`** — one-call file review (issues + source + coverage + duplications)
- **`sonar_scan_workflow`** — detect config → run analysis → project report (full happy path)
- **`sonar_detect_project_config`** — filesystem introspection → suggested sources/tests/exclusions/coverage/build-tool
- **Branch / PR parameters** on 16 tools (`sonar_measures`, `sonar_issues`, `sonar_hotspots`, etc.) + auto-detect current git branch
- **Usage examples** in all 43 tool descriptions for better LLM agent usability
- **Static edition/permission notes** on 8 tools (token type requirements, permission levels)
- **C# .NET test directory detection** (`*.Tests/` convention) in `detectTestsDir`
- **Supported Languages table** in README highlighting C# as differentiator
- **Leveled logging** with `SONARQUBE_LOG_LEVEL` env var (debug/info/warn/error)
- **Dockerfile** (multi-stage, non-root, HEALTHCHECK), **docker-compose.yml**, **Helm chart**
- **Scanner fixes**: `sonar.sources` always forwarded, hardcoded `sonar.tests=test` removed (now optional), scanner stderr surfaced, CE task polling, Docker image pinned to `:11.1`
- **AGENTS.md**: lessons learned gotchas section, composite/meta-tool patterns, READ_ONLY_TOOLS, scanner command construction
- **43 total tools** (was 39)

## 1.6.1 (2026-07-07)

- Fix S2871: add compare function to `sort()` in `detectSourceLanguages` (use `localeCompare`)
- Fix S3776: extract `executeCall()` helper from `sonar_call_multiple` — cognitive complexity 19→8
- Fix S7735: swap negated ternary in `sonar_scan_workflow` (`tests === undefined ? ... : ...`)
- Fix S3358: replace nested ternary with `localeCompare` in sort comparator
- Security hotspot S4036: reviewed as SAFE (`command -v git` resolves to absolute path)
- Add AGENTS.md "Lessons learned (gotchas)" section (10 gotchas from 1.6.0 development)
- Quality Gate now passing: coverage 98.9%, duplications 2.51%, hotspots 100% reviewed, 0 violations

## 1.6.0 (2026-07-06)

- **`sonar_detect_project_config`**: inspect a project directory and return a suggested SonarQube analysis configuration (sources, tests, exclusions, coverage report, build tool, detected languages). Cross-references the connected server's `list_languages` API. 10 detection helpers added to `helpers.mjs` (gitignore parsing, extension→language map, coverage/build-tool detection).
- **`sonar_file_review`**: one-call file review combining issues + source context + coverage + duplications (saves 3-4 calls).
- **`sonar_scan_workflow`**: full scan happy path — detect config → run analysis → project report. Detected config fills defaults; explicit params override.
- **`sonar_call_multiple`**: batch meta-tool — execute multiple tools in linear order in a single round-trip. Consecutive exact duplicates collapsed; non-adjacent repeats kept (state may change). Capped at 25 calls. Recursion guard. Added to `READ_ONLY_TOOLS`.
- Scanner fixes (from 1.5.1 dev): `sonar.sources` always forwarded, hardcoded `sonar.tests=test` removed (now optional), scanner stderr surfaced on failure, CE task polling, Docker image pinned to `sonarsource/sonar-scanner-cli:11.1`.
- **43 total tools** (was 39)

## 1.5.1 (2026-06-24)

- Fix S6594: use RegExp.exec() instead of String.match() in detectJavaVersion
- Fix S4036: resolve git path via command -v git for detectGitBranch
- Review security hotspot: S4036 on git command resolved as SAFE

## 1.5.0 (2026-06-24)

- **4 composite tools**: `sonar_project_report`, `sonar_analyze_and_report`, `sonar_file_issues`, `sonar_new_issues_since` — saves 6+ API calls into 1
- **`sonar_fix_and_verify`**: fix → rebuild → re-analyze → verify issue resolved — closes the dev loop
- **39 total tools** (was 34)
- **7 opencode agent definitions**: commit-pusher, version-manager, changelog-maker, coverage-gap-finder, info-gatherer, test-writer, refactor-agent
- `.opencode/agents/*.md` — auto-discovered by opencode, works for all users
- `opencode.jsonc.example` updated with full agent JSON config
- `AGENTS.md` updated with generic agent delegation guidance
- All pre-existing 1.4.x fixes included: Java/Kotlin builds, error wrapping, auto-build, config scaffolding

## 1.4.2 (2026-06-23)

- **Auto-build Java/Kotlin**: detects missing `build/classes/` and runs `./gradlew build -x test` or `./mvnw compile -DskipTests` before analysis
- **CE task URL**: `ceTaskUrl` returned in response — agent can poll via `sonar_raw`
- Updated `AGENTS.md` with new test files, helpers, 18 env vars, LANG_CONFIGS rule

## 1.4.1 (2026-06-23)

- **Java/Kotlin fixes**: sources=src/main, binaries auto-set, jacoco XML reports
- `buildSonarProps` uses language-specific `coverageProperty` instead of hardcoded `sonar.javascript.lcov.reportPaths`
- Validate overlapping sources/tests paths before analysis
- Wrap common scanner errors into actionable messages:
  - "can't be indexed twice" → suggest splitting sources/tests
  - "No files nor directories matching" → suggest building first
- Coverage hint returned when coverage report is missing
- LANG_CONFIGS extended with `sources`, `binaries`, `coverageProperty` fields
- Add edge case coverage tests (missing measures/issues keys)
- Update AGENTS.md with new files, helpers, 18 env vars, LANG_CONFIGS rule

## 1.4.0 (2026-06-23)

- **Minor bump**: cross-stack language auto-detection, Docker scanner, env var configurability
- Language auto-detection for 7 languages (Python, JS, TS, Java, Kotlin, Go, C#)
- Docker-based scanner (`sonarsource/sonar-scanner-cli`) — zero Java/npm dependency
- Language-specific `sonar-project.properties` defaults
- All configuration via env vars (18 vars): `SONARQUBE_URL`, `SONARQUBE_TOKEN`, `SONARQUBE_PROJECT`, `SONARQUBE_ORGANIZATION`, `SONARQUBE_AUTH_SCHEME`, `SONARQUBE_TOOLSETS`, `SONARQUBE_READ_ONLY`, `SONARQUBE_TRANSPORT`, `SONARQUBE_HTTP_HOST`, `SONARQUBE_HTTP_PORT`, `SONARQUBE_HTTP_ALLOWED_ORIGINS`, `SONARQUBE_DISABLE_DOCKER`, `SONARQUBE_DOCKER_IMAGE`, `SONARQUBE_DOCKER_FLAGS`, `SONARQUBE_DOCKER_MOUNT_PATH`, `SONARQUBE_SCANNER_TIMEOUT`, `SONARQUBE_API_TIMEOUT`, `SONARQUBE_SOURCE_CONTEXT`
- CORS origin configurable via `SONARQUBE_HTTP_ALLOWED_ORIGINS`
- README: basic + full config examples for both MCP standard (`mcpServers`) and opencode (`mcp`) formats
- `.mcp.json.example` now uses standard MCP format
- Scanner timeout, API timeout, source context lines, Docker mount path all configurable
- Tool descriptions document full fallback chain (Docker → npm → PATH)
- Docker-enabled test for sonar_run_analysis
- Port 8080 fallback test for HTTP server
- Coverage: 99.59% lines (c8), 97.7% overall (SQ), 181 tests
- Quality gate OK, 0 issues, CayC compliant

## 1.3.6 (2026-06-23)

- Cross-stack: language auto-detection for 7 languages (Python, JS, TS, Java, Kotlin, Go, C#)
- Docker-based scanner (`sonarsource/sonar-scanner-cli`) — zero Java/npm dependency
- Language-specific `sonar-project.properties` defaults (coverage paths, exclusions, test dirs)
- `sonar_run_analysis` accepts `language` and `scanner` params to override auto-detection
- `sonar_setup_scanner` detects Docker availability first
- `SONARQUBE_DISABLE_DOCKER=true` env var for deterministic CI tests
- `buildSonarProps()`, `detectLanguage()`, `hasDocker()`, `LANG_CONFIGS` helpers

## 1.3.5 (2026-06-22)

- Remove `SESSION-2026-06-19.md` and `feedback.md` from repo

## 1.3.4 (2026-06-22)

- Coverage: 98.7% overall, 100% lines, 95.7% branches, 0 issues
- 161 tests (was 148)
- `handlers-success.test.mjs` — 70+ handler success paths via `globalThis.fetch` mock
- `index-http.test.mjs` — HTTP transport + stderr output tests
- `api.test.mjs` — full rewrite: sonarGet, sonarPost, sonarCheckServer, authHeader, instanceHint
- `helpers.test.mjs` — componentParams, requireKey, encode, measureSearch, tool builder
- `http-server.test.mjs` — default host/port + token MISSING scenarios
- `filtering.test.mjs` — invalid category, no-match, readOnly-with-toolsets
- `handlers.test.mjs` — run_analysis defaults + scanner fallback tests
- `helpers.mjs` — JSDoc type annotations for `parseIssueFacets`
- `http-server.mjs` — log actual listening port, c8 ignore for unreachable string-result branch
- `index.mjs` — c8 ignore block for HTTP transport (subprocess-only)
- `.c8rc` — `skip-full` + include/exclude patterns
- `AGENTS.md` — testing pattern, `coverage:check` command, rules
- `package.json` — `coverage:check` script (100% lines, 100% functions, 85% branches on src/)
- `COVERAGE-RESEARCH.md` — full analysis of 13 remaining unreachable branches

## 1.3.3 (2026-06-19)

- README: simplify comparison tables, move to bottom, add vs-official comparison
- Bump version to 1.3.3

## 1.3.2 (2026-06-19)

- Fix S7763: use `export…from` for pure re-exports in helpers.mjs
- 88 JSDoc type annotations across all source files (up from 24)
- Split handlers.mjs: extract helpers.mjs with shared schemas, builder, categories, filtering

## 1.3.1 (2026-06-18)

- Fix sonar_worst_metrics empty edge case
- Tagged retroactively (was never released as a separate build)

## 1.3.0 (2026-06-18)

- Coverage tests for handlers
- Feedback fixes: sonar_raw usage hints, sonar_projects_create, sonar_project_details, sonar_issues_bulk_transition
- Fix npx command syntax (`#` for git tag ref)
- Fix unnecessary projectKey rename in hotspot handler
- Remove `v` prefix from version numbers

## 1.2.0 (2026-06-18)

- Token prefix check for hotspots (`squ_` requirement)
- Array support for severities/types params
- sonar_metrics_history tool — metric trend data over time
- Mock env vars in filtering tests via cache-busting dynamic imports
- README: all 30 tools, toolset filtering, read-only mode, HTTP transport, worst-metrics, highlight_uncovered

## 1.1.1 (2026-06-18)

- 30 tools complete
- HTTP transport mode (`SONARQUBE_TRANSPORT=http`) with REST API
- Toolset filtering (`SONARQUBE_TOOLSETS`) with 13 categories
- Read-only mode (`SONARQUBE_READ_ONLY`)
- sonar_worst_metrics tool — file-level metric ranking
- highlight_uncovered option for sonar_source
- `t()` → `tool()` rename (avoids i18n `t` conflict)
- `requireKey`, `componentParams`, `measureSearch` extracted
- SonarQube S3776/S6582 fixes

## 1.0.0 (2026-06-17)

First tagged release. 30 tools:

**Projects:** sonar_search_projects, sonar_summary, sonar_analysis_status, sonar_project_details, sonar_projects_create
**Issues:** sonar_issues, sonar_issues_summary, sonar_new_issues, sonar_set_issue_status, sonar_issues_bulk_transition
**Hotspots:** sonar_hotspots, sonar_hotspot_details, sonar_change_hotspot_status
**Quality:** sonar_quality_gate, sonar_list_quality_gates, sonar_measures, sonar_search_metrics
**Coverage:** sonar_coverage_files, sonar_file_coverage_details
**Duplications:** sonar_search_duplicated_files, sonar_duplications
**History:** sonar_metrics_history
**Worst:** sonar_worst_metrics
**SCM:** sonar_source, sonar_scm_info
**Branches:** sonar_list_branches, sonar_list_pull_requests
**Admin:** sonar_list_webhooks, sonar_list_languages, sonar_ping
**Rules:** sonar_rule
**Raw:** sonar_raw

## Pre-release (2026-06-17)

- Initial commit: `39cefd3` — SonarQube MCP server with ~15 core tools
- Stack: Node.js ES modules, `@modelcontextprotocol/sdk`, Zod
- SonarScanner setup and run tools
- Server health check with contextual hints
- Integration test framework with auto-cleanup
- Compact mode for sonar_issues
- include_source for sonar_issues
- Per-project config via .mcp.json
