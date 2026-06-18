# SonarQube Tool Feedback

## Server Status
- **Reachable**: ✅ Yes (`pong: true`, health: `GREEN`)
- **Server**: SonarQube (community edition based on features)

## Project: `gyartas_frontend_web`

| Metric | Value |
|---|---|
| Quality Gate | ❌ **ERROR** |
| Lines of Code | 23,224 |
| Coverage | 0.0% |
| Bugs | 0 |
| Vulnerabilities | 0 |
| Code Smells | 3 |
| Duplicated Lines | 0.5% |
| Security Rating | A (1.0) |
| Reliability Rating | A (1.0) |
| Maintainability Rating | A (1.0) |

## Open Issues (3 total, all INFO severity)

| # | File | Rule | Message |
|---|---|---|---|
| 1 | `src/service/production/productionScrapAPI.ts:36` | `typescript:S1135` | Complete TODO comment |
| 2 | `src/hooks/barcode/useBarcodeScanner.hook.ts:10` | `typescript:S1135` | Complete TODO comment |
| 3 | `src/type/common/toast/CustomQueryMeta.ts:5` | `typescript:S1135` | Complete TODO comment |

All 3 issues are `typescript:S1135` — incomplete TODO comments. No bugs or vulnerabilities found.

## Coverage
- **Overall coverage**: 0.0% — no tests are instrumented/measured
- No files found below 80% threshold (because all are at 0%)

## Tool Capabilities Assessed

| Feature | Status |
|---|---|
| Ping / health check | ✅ |
| Project search | ✅ |
| Summary (quality gate, metrics, issues, branches) | ✅ |
| Issues listing with filtering | ✅ |
| Coverage per file | ✅ |
| Rule details | ✅ |
| Security hotspots | ✅ (requires User token) |
| Duplication search | ✅ |
| Branch / PR listing | ✅ |
| Quality gate details | ✅ |
| Source code viewing | ✅ |
| SCM blame info | ✅ |
| Issue status transitions | ✅ |
| Hotspot review transitions | ✅ |
| Webhook listing | ✅ |
| Running analysis | ✅ |

## Observations
- The quality gate is **ERROR** — likely due to the 0% coverage threshold not being met.
- All open issues are low-severity code smells (TODO leftovers).
- No bugs, vulnerabilities, or security hotspots detected.
- The tool exposes a rich API surface: issue management, coverage analysis, duplication detection, SCM info, quality gates, and even running scanner analysis directly.
- Security hotspot features require a User token (`squ_` prefix) — analysis tokens get 403 errors.

## UX Improvement Suggestions

### 1. Redundant prefix
Every function is `sonarqube_sonar_*` — the `sonar_` is unnecessary since the tool group is already `sonarqube`. Renaming to `sonarqube_issues`, `sonarqube_summary`, etc. would be cleaner and reduce typing.

### 2. Overlapping tools
`sonar_summary` returns issues + metrics + quality gate. `sonar_issues_summary` only does issue counts. They partially overlap — `sonar_issues_summary` could be dropped in favor of just using `sonar_summary` with `compact` mode.

### 3. Auth friction for hotspots
`sonar_hotspots` fails with a 403 if the configured token is an analysis token (`sqp_`/`sqa_` prefix) instead of a User token (`squ_`). The tool should detect the token prefix upfront and warn before calling the API.

### 4. Missing trend data
No way to query metric history over time (e.g. coverage trajectory). A `sonar_metrics_history` tool would help track regressions.

### 5. Comma-separated params
`severities` and `types` use comma-separated strings. Arrays would be more idiomatic for the JSON schema tool definition.

### 6. What works well
- `compact` flag on issues — great for token efficiency
- `include_source` on issues — embeds context without extra round-trips
- `sonar_raw` escape hatch — covers any missing API endpoint
- `detail_level`-style brevity in summaries
- `sonar_run_analysis` auto-creating `sonar-project.properties` — thoughtful DX
