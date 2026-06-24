# sonarqube-mcp

An MCP server that exposes SonarQube data as AI agent tools. **34 tools** — the most comprehensive SonarQube MCP implementation available. Covers projects, issues, quality gates, hotspots, coverage, SCM, webhooks, metrics history, worst-metric ranking, and more.

*Dogfooding: this project is checked via its own tools.*

> **Works with any SonarQube edition** — Cloud, Developer, Enterprise, and **Community Edition on localhost**. No Docker/JVM needed, starts in ~0.1s.

## Quick start

> Pin to a specific version: `["npx", "-y", "github:metalralf/sonarqube-mcp#1.5.0"]`  
> Omit `#1.5.0` for the latest (unstable) development version.

### Minimum config (3 required env vars)

**Claude Desktop / VS Code MCP / Cursor / any MCP client:**
```json
{
  "mcpServers": {
    "sonarqube": {
      "command": "npx",
      "args": ["-y", "github:metalralf/sonarqube-mcp#1.5.0"],
      "env": {
        "SONARQUBE_URL": "http://localhost:9000",
        "SONARQUBE_TOKEN": "squ_...",
        "SONARQUBE_PROJECT": "my_project"
      }
    }
  }
}
```

**opencode** (uses `mcp` key instead of `mcpServers`):
```json
{
  "mcp": {
    "sonarqube": {
      "type": "local",
      "command": ["npx", "-y", "github:metalralf/sonarqube-mcp#1.5.0"],
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

### Full config (all options)

```json
{
  "mcpServers": {
    "sonarqube": {
      "command": "npx",
      "args": ["-y", "github:metalralf/sonarqube-mcp"],
      "env": {
        "SONARQUBE_URL": "http://localhost:9000",
        "SONARQUBE_TOKEN": "squ_...",
        "SONARQUBE_PROJECT": "my_project",
        "SONARQUBE_TOOLSETS": "issues,quality",
        "SONARQUBE_READ_ONLY": "false",
        "SONARQUBE_TRANSPORT": "stdio",
        "SONARQUBE_AUTH_SCHEME": "basic",
        "SONARQUBE_ORGANIZATION": "",
        "SONARQUBE_HTTP_HOST": "127.0.0.1",
        "SONARQUBE_HTTP_PORT": "8080",
        "SONARQUBE_HTTP_ALLOWED_ORIGINS": "*",
        "SONARQUBE_DISABLE_DOCKER": "false",
        "SONARQUBE_DOCKER_IMAGE": "sonarsource/sonar-scanner-cli",
        "SONARQUBE_DOCKER_FLAGS": "--network=host",
        "SONARQUBE_DOCKER_MOUNT_PATH": "/usr/src",
        "SONARQUBE_SCANNER_TIMEOUT": "300000",
        "SONARQUBE_API_TIMEOUT": "5000",
        "SONARQUBE_SOURCE_CONTEXT": "2"
      }
    }
  }
}
```

## Tools (34)

### Discovery & Status (7 tools)

| Tool | Purpose |
|---|---|
| `sonar_search_projects` | Discover all project keys |
| `sonar_project_details` | Deep-dive: name, description, URL, analysis date |
| `sonar_projects_create` | Create a new project via MCP |
| `sonar_analysis_status` | Full lifecycle check (reachable → exists → analyzed) |
| `sonar_summary` | One-call: QG + metrics + issues + branches |
| `sonar_ping` | Server health → `pong` + status |
| `sonar_raw` | Escape hatch with 4xx hints |

### Quality Gates & Measures (4 tools)

| Tool | Purpose |
|---|---|
| `sonar_quality_gate` | Pass/fail + each failing condition |
| `sonar_list_quality_gates` | All gates with conditions |
| `sonar_measures` | Bugs, smells, coverage, ratings, ncloc, dup |
| `sonar_search_metrics` | Browse all 155 metric definitions |

### Issues (5 tools)

| Tool | Purpose |
|---|---|
| `sonar_issues` | Full search with `compact`, `statuses`, `include_source` |
| `sonar_issues_summary` | Aggregated counts by severity/type/effort |
| `sonar_new_issues` | Zero-tolerance delta since last analysis |
| `sonar_set_issue_status` | confirm / falsepositive / wontfix / resolve |
| `sonar_issues_bulk_transition` | Transition many issues at once |

### Security Hotspots (3 tools)

| Tool | Purpose |
|---|---|
| `sonar_hotspots` | Search with automatic token-type check |
| `sonar_hotspot_details` | Rule, code context, flows, comments |
| `sonar_change_hotspot_status` | REVIEWED with FIXED/SAFE/ACKNOWLEDGED |

### Source & SCM (3 tools)

| Tool | Purpose |
|---|---|
| `sonar_source` | Source lines with optional `highlight_uncovered` |
| `sonar_scm_info` | Git blame per line (author, date, revision) |
| `sonar_rule` | Rule explanation with remediation |

### Branches & Pull Requests (2 tools)

| Tool | Purpose |
|---|---|
| `sonar_list_branches` | Branches with dates and QG status |
| `sonar_list_pull_requests` | PR listing (requires Developer Edition+) |

### Coverage (2 tools)

| Tool | Purpose |
|---|---|
| `sonar_coverage_files` | Files below coverage threshold |
| `sonar_file_coverage_details` | Per-file: line%, condition%, uncovered lines |

### Duplications (2 tools)

| Tool | Purpose |
|---|---|
| `sonar_search_duplicated_files` | Files above duplication threshold |
| `sonar_duplications` | Duplicate blocks grouped by file |

### Analysis & Metrics (3 tools)

| Tool | Purpose |
|---|---|
| `sonar_metrics_history` | Coverage/code-smell trend over time (1-365 days) |
| `sonar_worst_metrics` | Rank files by worst coverage, dup, complexity |
| `sonar_search_metrics` | Metric definitions with domain, type, direction |

### Administration (4 tools)

| Tool | Purpose |
|---|---|
| `sonar_list_webhooks` | Verify CI/CD integration |
| `sonar_list_languages` | All 27 supported languages |
| `sonar_setup_scanner` | Auto-install sonar-scanner (pnpm/yarn/npm) |
| `sonar_run_analysis` | Full scan from the agent |

## Configuration

### Environment variables

All configuration is via env vars. None are required at module scope — they're read lazily at call time.

#### Connection

| Env var | Default | Description |
|---|---|---|
| `SONARQUBE_URL` | `http://localhost:9000` | SonarQube server base URL |
| `SONARQUBE_TOKEN` | — | Auth token. Hotspots need `squ_` prefix |
| `SONARQUBE_PROJECT` | — | Default project key for tools that accept `projectKey` |
| `SONARQUBE_ORGANIZATION` | — | SonarCloud organization key |
| `SONARQUBE_AUTH_SCHEME` | `basic` | `basic` (Base64 password) or `bearer` (raw token) |

#### Transport

| Env var | Default | Description |
|---|---|---|
| `SONARQUBE_TRANSPORT` | `stdio` | `stdio` (MCP stdio) or `http` (REST API) |
| `SONARQUBE_HTTP_HOST` | `127.0.0.1` | HTTP bind address (transport=http only) |
| `SONARQUBE_HTTP_PORT` | `8080` | HTTP port (transport=http only) |

#### Scanner

| Env var | Default | Description |
|---|---|---|
| `SONARQUBE_DISABLE_DOCKER` | `false` | `true` forces local npm/node scanner |
| `SONARQUBE_DOCKER_IMAGE` | `sonarsource/sonar-scanner-cli` | Scanner Docker image (air-gapped registries) |
| `SONARQUBE_DOCKER_FLAGS` | `--network=host` | Extra Docker run flags. Set `""` for none |
| `SONARQUBE_SCANNER_TIMEOUT` | `300000` | Scanner timeout in ms |
| `SONARQUBE_API_TIMEOUT` | `5000` | Health check fetch timeout in ms |
| `SONARQUBE_SOURCE_CONTEXT` | `2` | Lines of source context around issues |
| `SONARQUBE_DOCKER_MOUNT_PATH` | `/usr/src` | Container mount target for project dir |

#### Toolset

| Env var | Default | Description |
|---|---|---|
| `SONARQUBE_TOOLSETS` | all | Comma-separated categories: `projects,issues,hotspots,quality,coverage,duplications,history,worst,scm,branches,admin,rules,raw` |
| `SONARQUBE_READ_ONLY` | `false` | `true` disables `sonar_set_issue_status`, `sonar_change_hotspot_status`, `sonar_run_analysis`, `sonar_setup_scanner` |

### Toolset filtering

| Category | Tools included |
|---|---|
| `projects` | `search_projects`, `summary`, `analysis_status`, `project_details`, `projects_create` |
| `issues` | `issues`, `issues_summary`, `new_issues`, `set_issue_status`, `issues_bulk_transition` |
| `hotspots` | `hotspots`, `hotspot_details`, `change_hotspot_status` |
| `quality` | `quality_gate`, `list_quality_gates`, `measures`, `search_metrics` |
| `coverage` | `coverage_files`, `file_coverage_details` |
| `duplications` | `search_duplicated_files`, `duplications` |
| `history` | `metrics_history` |
| `worst` | `worst_metrics` |
| `scm` | `source`, `scm_info` |
| `branches` | `list_branches`, `list_pull_requests` |
| `admin` | `list_webhooks`, `list_languages`, `ping`, `setup_scanner`, `run_analysis` |
| `rules` | `rule` |
| `raw` | `raw` |

```json
"environment": { "SONARQUBE_TOOLSETS": "issues,quality" }
```

### Read-only mode

`SONARQUBE_READ_ONLY=true` disables: `sonar_set_issue_status`, `sonar_change_hotspot_status`, `sonar_run_analysis`, `sonar_setup_scanner`.

### HTTP transport

Set `SONARQUBE_TRANSPORT=http` for REST API access:

```json
"environment": { "SONARQUBE_TRANSPORT": "http", "SONARQUBE_HTTP_PORT": "8080" }
```

| Endpoint | Method | Description |
|---|---|---|
| `/health` | GET | Health check |
| `/tools` | GET | List tools |
| `/tools/:name` | POST | Execute a tool |

```bash
curl -X POST http://localhost:8080/tools/sonar_ping -H 'Content-Type: application/json' -d '{}'
curl -X POST http://localhost:8080/tools/sonar_issues -H 'Content-Type: application/json' -d '{"projectKey":"my_project","compact":true}'
```

## Agent usage guidelines

1. **`sonar_analysis_status`** — check project state first
2. **`sonar_summary`** — full picture in one call
3. **`sonar_ping`** — quick health check
4. **`sonar_quality_gate`** — pass/fail + failing conditions
5. **`sonar_list_quality_gates`** — browse available gates
6. **`sonar_measures`** — drill into metrics
7. **`sonar_worst_metrics`** — find problematic files
8. **`sonar_list_branches`** / **`sonar_list_pull_requests`** — pick branch/PR
9. **`sonar_issues`** — search with filters, compact mode
10. **`sonar_issues_summary`** — quick counts
11. **`sonar_new_issues`** — delta since last analysis
12. **`sonar_metrics_history`** — coverage/code-smell trends
13. **`sonar_rule`** — explain any rule
14. **`sonar_source`** / **`sonar_scm_info`** — source + git blame
15. **`sonar_hotspots`** — security review
16. **`sonar_hotspot_details`** — drill into hotspot
17. **`sonar_change_hotspot_status`** — mark reviewed
18. **`sonar_coverage_files`** — find under-tested files
19. **`sonar_file_coverage_details`** — per-file coverage
20. **`sonar_search_duplicated_files`** / **`sonar_duplications`** — find/fix dup
21. **`sonar_issues_bulk_transition`** — batch status changes
22. **`sonar_set_issue_status`** — mark resolved
23. **`sonar_run_analysis`** — confirm fixes

### Token types

| Type | Prefix | Hotspots? |
|---|---|---|
| User token | `squ_` | ✅ |
| Project analysis | `sqp_` | ❌ 403 |
| Global analysis | `sqa_` | ❌ 403 |

## Local development setup

```bash
git clone <repo>
cd sonarqube-mcp
pnpm install

# Run from local checkout:
node src/index.mjs
```

### Branch workflow

| Branch | Purpose | Version |
|---|---|---|
| `main` | Stable releases | Tagged (`1.5.0`) |
| `develop` | Daily development | `1.x.0-dev` |
| `feature/*` | New tools/features | — |

### Version bumps

| Change | Bump | Example |
|---|---|---|
| 1-2 small tools, fixes | `patch` | `1.5.0` → `1.4.3` |
| 3+ new tools, features | `minor` | `1.5.0` → `1.6.0` |
| Breaking changes | `major` | `1.5.0` → `2.0.0` |

## Setting up SonarQube locally

```bash
docker run -d --name sonarqube -p 9000:9000 sonarqube:community
```

Open `http://localhost:9000`, log in with `admin`/`admin`, generate a token.

Create `sonar-project.properties`:
```properties
sonar.host.url=http://localhost:9000
sonar.projectKey=my_project
sonar.sources=src
sonar.javascript.lcov.reportPaths=coverage/lcov.info
```

Run:
```bash
pnpm exec sonar-scanner -Dsonar.token=squ_...
```

## Ecosystem Comparison

### What makes this project unique

Features no other SonarQube MCP implementation has:
- **Compact mode** — strips verbose fields for LLM token efficiency
- **Issue delta** — `sonar_new_issues` since last analysis
- **Metric history / trends** — coverage and code-smell trajectory
- **Worst-metric ranking** — find files with worst coverage, highest duplication
- **Bulk issue transitions** — transition many issues at once
- **Project creation** — create SonarQube projects via MCP
- **Run scanner from agent** — `sonar_run_analysis` without leaving the chat
- **Source coverage highlights** — mark untested lines in source view
- **Aggregated summary** — single-call project health
- **Array parameter support** — pass severities/types as arrays or strings
- **Zero Docker, zero JVM** — Node.js, starts in ~0.1s

### vs Official mcp/sonarqube

| Aspect | Official (SonarSource) | Ours |
|--------|----------------------|------|
| **Runtime** | Java + Docker (~500MB image) | Node.js (~0.1s start, no Docker) |
| **Edition support** | Cloud / Developer / Enterprise | **All** including Community |
| **Distribution** | Docker Hub | `npx` / GitHub |
| **Unique to us** | — | compact mode, delta issues, trend data, worst-metrics, bulk transitions, project creation, coverage highlights, array params |
| **Unique to official** | `analyze_code_snippet`, IDE integration, Context Augmentation | — |

Choose official if you need inline code analysis, IDE integration, or run on Cloud/Enterprise. Choose ours if you're on Community Edition, want zero-overhead startup, or need the unique tools above.

## Compatibility

Works with all SonarQube editions. `sonar_list_pull_requests` requires Developer Edition+.
