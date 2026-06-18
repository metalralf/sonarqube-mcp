# sonarqube-mcp

An MCP server that exposes SonarQube data as AI agent tools. **29 tools** covering projects, issues, quality gates, hotspots, coverage, SCM, webhooks, and more.

*Dogfooding: this project is checked via its own tools.*

> **Works with any SonarQube edition** — Cloud, Developer, Enterprise, and **Community Edition on localhost**. No Docker/JVM needed, starts in ~0.1s.

### Comparison with the official `mcp/sonarqube`

The [official SonarQube MCP Server](https://github.com/SonarSource/sonarqube-mcp-server) (Java/Docker, 579 stars) supports `analyze_code_snippet`, IDE integration, full Context Augmentation, and streamable HTTP transport — but requires Docker, the JVM, and paid editions for many features.

This project is the **lightweight Node.js alternative**: covers the same REST API surface, adds write operations (`sonar_set_issue_status`, `sonar_change_hotspot_status`, `sonar_run_analysis`), compact mode, aggregated summaries, and SCM/blame — all in ~0.1s with no container overhead. If you need local snippet analysis or IDE integration, use the official server. If you want `npx`-based zero-friction for CE on localhost, this is it.

## Quick start

```json
{
  "mcp": {
    "sonarqube": {
      "type": "local",
      "command": ["npx", "-y", "github:metalralf/sonarqube-mcp"],
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

## Tools (29)

### Discovery & Status

| Tool | Purpose |
|---|---|
| `sonar_search_projects` | Discover project keys |
| `sonar_analysis_status` | Check if a project has been analyzed, with next steps |
| `sonar_summary` | Aggregated project health in one call (quality gate + metrics + issues + branches) |
| `sonar_ping` | Ping server health — returns `pong` + status |
| `sonar_raw` | Escape hatch — call any GET endpoint |

### Quality Gates & Measures

| Tool | Purpose |
|---|---|
| `sonar_quality_gate` | Gate pass/fail + failing conditions |
| `sonar_list_quality_gates` | List all quality gates with their conditions |
| `sonar_measures` | Bugs, smells, coverage, ratings, ncloc, dup |

### Issues

| Tool | Purpose |
|---|---|
| `sonar_issues` | Search open issues sorted by severity (`compact`, `statuses`, `include_source`) |
| `sonar_issues_summary` | Aggregated counts by severity, type, and effort |
| `sonar_new_issues` | Issues created since the last analysis (zero-tolerance delta) |
| `sonar_set_issue_status` | Mark issues as confirmed, false positive, wontfix, resolved |

### Security Hotspots

| Tool | Purpose |
|---|---|
| `sonar_hotspots` | Search security hotspots (needs `squ_` user token) |
| `sonar_hotspot_details` | Full hotspot details: rule, code context, flows, comments |
| `sonar_change_hotspot_status` | Review hotspots — set REVIEWED with resolution (FIXED/SAFE/ACKNOWLEDGED) |

### Source & SCM

| Tool | Purpose |
|---|---|
| `sonar_source` | View flagged source lines |
| `sonar_scm_info` | Git blame/commit info per source line (author, date, revision) |
| `sonar_rule` | Explain a rule (why an issue fired) |

### Branches & Pull Requests

| Tool | Purpose |
|---|---|
| `sonar_list_branches` | List branches with analysis dates and quality gate status |
| `sonar_list_pull_requests` | List PRs with branch, title, analysis status (requires Developer Edition+) |

### Coverage

| Tool | Purpose |
|---|---|
| `sonar_coverage_files` | Find files with coverage below a threshold |
| `sonar_file_coverage_details` | Detailed coverage for one file (line/condition %, uncovered lines/conditions) |

### Duplications

| Tool | Purpose |
|---|---|
| `sonar_search_duplicated_files` | Find files with duplication above a threshold |
| `sonar_duplications` | Get duplication blocks for a specific file |

### Administration

| Tool | Purpose |
|---|---|
| `sonar_list_webhooks` | List webhooks configured for a project |
| `sonar_list_languages` | List all 27 supported languages |
| `sonar_search_metrics` | Browse available metric definitions |
| `sonar_setup_scanner` | Install sonar-scanner (auto-detects pnpm/yarn/npm) |
| `sonar_run_analysis` | Run sonar-scanner and push results to SonarQube |

## Configuration

| Env var | Description |
|---|---|
| `SONARQUBE_URL` | SonarQube instance base URL |
| `SONARQUBE_TOKEN` | Auth token |
| `SONARQUBE_PROJECT` | Default project key |
| `SONARQUBE_ORGANIZATION` | SonarCloud org key |
| `SONARQUBE_AUTH_SCHEME` | `basic` (default) or `bearer` |

## Agent usage guidelines

1. **`sonar_analysis_status`** — first, check if the project has been analyzed. If `UNREACHABLE`, guide the user to start SonarQube. If `NOT_FOUND`/`NOT_ANALYZED`, guide them to run `sonar_setup_scanner` + `sonar_run_analysis`.
2. **`sonar_summary`** — get the full picture in one call (quality gate, metrics, issue counts, branches).
3. **`sonar_ping`** — quick health check if tools seem slow.
4. **`sonar_quality_gate`** — check pass/fail. If `ERROR`, inspect failing conditions.
5. **`sonar_list_quality_gates`** — browse available gates if the project uses a non-default one.
6. **`sonar_measures`** — drill into specific metrics (coverage, bugs, smells, ratings, duplication).
7. **`sonar_list_branches`** / **`sonar_list_pull_requests`** — choose the relevant branch/PR.
8. **`sonar_issues`** — search issues. Use `severities=CRITICAL,BLOCKER` first, then widen. Use `compact: true` to save tokens. Use `statuses=OPEN,CONFIRMED` to exclude closed. Use `include_source: true` for inline context.
9. **`sonar_issues_summary`** — quick aggregated counts instead of the full list.
10. **`sonar_new_issues`** — see what was introduced since the last analysis.
11. **`sonar_rule`** — look up any rule you don't understand.
12. **`sonar_source`** / **`sonar_scm_info`** — view flagged source or git blame.
13. **`sonar_hotspots`** — review security hotspots (needs `squ_` token).
14. **`sonar_hotspot_details`** — drill into a specific hotspot.
15. **`sonar_change_hotspot_status`** — mark reviewed hotspots as FIXED/SAFE/ACKNOWLEDGED.
16. **`sonar_coverage_files`** — find under-tested files.
17. **`sonar_file_coverage_details`** — examine coverage for a specific file.
18. **`sonar_search_duplicated_files`** / **`sonar_duplications`** — find and fix duplication.
19. **`sonar_list_webhooks`** — verify CI/CD integration.
20. **`sonar_set_issue_status`** / **`sonar_change_hotspot_status`** — after fixing, mark as resolved/reviewed.
21. **`sonar_run_analysis`** — run a new analysis to confirm fixes.

### Token types

| Type | Prefix | Hotspots? |
|---|---|---|
| User token | `squ_` | ✅ |
| Project analysis | `sqp_` | ❌ 403 |
| Global analysis | `sqa_` | ❌ 403 |

## Local development setup

This project uses a **develop → main** branching model with versioned releases.

```bash
# Clone and set up
git clone <repo>
cd sonarqube-mcp
git checkout develop
pnpm install

# Local MCP config (.mcp.json) — already points to node src/index.mjs
# The local checkout (develop branch) is used automatically
```

### Branch workflow

| Branch | Purpose | Version |
|---|---|---|
| `main` | Stable releases | Tagged (`v1.0.0`) |
| `develop` | Daily development | `1.x.0-dev` |
| `feature/*` | New tools/features | — |

### Version bumps

| Change scope | Bump | Example |
|---|---|---|
| 1-2 small tools, fixes | `patch` | `v1.0.0` → `v1.0.1` |
| 3+ new tools, features | `minor` | `v1.0.0` → `v1.1.0` |
| Breaking changes | `major` | `v1.0.0` → `v2.0.0` |

The agent proposes the version when merging `develop` → `main`.

## Setting up SonarQube locally

```bash
docker run -d --name sonarqube -p 9000:9000 sonarqube:community
```

Open `http://localhost:9000`, log in with `admin`/`admin`, change the password, and generate a user token (`squ_...`).

Create `sonar-project.properties`:

```properties
sonar.host.url=http://localhost:9000
sonar.projectKey=my_project
sonar.projectName=My Project
sonar.sources=src
sonar.javascript.lcov.reportPaths=coverage/lcov.info
```

Run analysis:

```bash
pnpm exec sonar-scanner -Dsonar.token=squ_...
```

## Compatibility

Works with all SonarQube editions (Community, Developer, Enterprise) and SonarCloud. Most tools work with any edition; `sonar_list_pull_requests` requires Developer Edition or higher.
