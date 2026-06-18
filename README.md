# sonarqube-mcp

An MCP server that exposes SonarQube data as AI agent tools.

*Dogfooding: this project is checked via its own `sonar_analysis_status` tool.*

Recommended to wire per-project via `.mcp.json` or `opencode.jsonc` in the project root — different projects have different SonarQube project keys, URLs, and tokens.

### Notes on the official `mcp/sonarqube`

The [official SonarQube MCP Server](https://github.com/SonarSource/sonarqube-mcp-server) by SonarSource is the reference implementation and supports the full SonarQube ecosystem (Cloud, Developer, Enterprise). It integrates deeply with SonarQube for IDE and includes `analyze_code_snippet` for inline code analysis.

This project works with **any SonarQube edition** — Cloud, Developer, Enterprise, and Community. The main motivation was filling a gap: the official server runs on Docker + JVM and targets paid editions, while **Community Edition on localhost** had no lightweight MCP option. This Node.js alternative starts in ~0.1s with no Docker dependency, covers the same API surface, and adds helpers (`sonar_setup_scanner`, `sonar_run_analysis`, `sonar_set_issue_status`, compact mode) that the official read-only API doesn't offer. If you're on Cloud or Enterprise and need `analyze_code_snippet` or SonarQube for IDE integration, the official server is a great fit. For CE on localhost — or if you prefer a fast `npx`-based setup — this project fills the gap.

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

## Tools

| Tool | Purpose |
|---|---|---|
| `sonar_search_projects` | Discover project keys |
| `sonar_quality_gate` | Gate pass/fail + failing conditions |
| `sonar_measures` | Bugs, smells, coverage, ratings, ncloc, dup |
| `sonar_issues` | Open issues sorted by severity (`compact`, `statuses`, `include_source`) |
| `sonar_issues_summary` | Aggregated counts by severity, type, and effort |
| `sonar_new_issues` | Issues created since the last analysis |
| `sonar_hotspots` | Security hotspots (needs user token) |
| `sonar_rule` | Explain a rule (why an issue fired) |
| `sonar_source` | View flagged source lines |
| `sonar_analysis_status` | Check if a project has been analyzed, with next steps |
| `sonar_list_branches` | List branches with analysis dates and quality gate status |
| `sonar_setup_scanner` | Install sonar-scanner (detects pnpm/yarn/npm) |
| `sonar_run_analysis` | Run sonar-scanner analysis on the project |
| `sonar_coverage_files` | Find files with coverage below a threshold |
| `sonar_search_duplicated_files` | Find files with duplication above a threshold |
| `sonar_duplications` | Get duplication blocks for a specific file |
| `sonar_set_issue_status` | Mark issues as confirmed, false positive, wontfix, resolved |
| `sonar_raw` | Escape hatch — any GET endpoint |

For **Claude Code** or other MCP clients, copy `.mcp.json.example` to `.mcp.json` in your project root:

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

For **opencode**, copy `opencode.jsonc.example` to `opencode.jsonc` in your project root:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
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

## Setting up SonarQube locally

Spin up with Docker:

```bash
docker run -d --name sonarqube -p 9000:9000 sonarqube:community
```

Open `http://localhost:9000`, log in with `admin`/`admin`, change the password, and generate a user token (`squ_...`).

Install the scanner (one-time):

```bash
pnpm add -D sonar-scanner
```

Create a `sonar-project.properties` in your project root with at minimum:

```properties
sonar.host.url=http://localhost:9000
sonar.projectKey=my_project
sonar.projectName=My Project
sonar.sources=src
sonar.javascript.lcov.reportPaths=coverage/lcov.info
```

Then run:

```bash
sonar-scanner -Dsonar.token=squ_...
```

For inline IDE feedback, install **SonarLint** in your editor and bind it to your local SonarQube instance.

## Configuration

| Env var | Description |
|---|---|
| `SONARQUBE_URL` | SonarQube instance base URL |
| `SONARQUBE_TOKEN` | Auth token |
| `SONARQUBE_PROJECT` | Default project key |
| `SONARQUBE_ORGANIZATION` | SonarCloud org key |
| `SONARQUBE_AUTH_SCHEME` | `basic` (default) or `bearer` |

## Agent-driven analysis

The MCP tools can handle the full analysis flow. Ask your agent to:

1. **`sonar_setup_scanner`** — Installs sonar-scanner in your project
2. **Generate coverage** — Run `npm run coverage` (requires c8 or similar)
3. **`sonar_run_analysis`** — Runs the scanner and pushes results to SonarQube

Or manually, copy `sonar-project.properties.example` to `sonar-project.properties` and run:

```bash
pnpm exec sonar-scanner -Dsonar.token=squ_...
```

## Agent usage guidelines

When acting as an AI agent with these tools available, follow this order:

1. **`sonar_analysis_status`** — first, check if the project has ever been analyzed. If `UNREACHABLE`, guide the user to start SonarQube. If `NOT_FOUND` or `NOT_ANALYZED`, guide them to run `sonar_setup_scanner` + `sonar_run_analysis`.
2. **`sonar_quality_gate`** — check if the project passes its quality gate. If `ERROR`, inspect failing conditions.
3. **`sonar_measures`** — get the high-level metrics (coverage, bugs, smells, ratings, duplication).
4. **`sonar_list_branches`** — list available branches and pick the relevant one before drilling into issues.
5. **`sonar_issues`** — drill into specific issues. Use `severities=CRITICAL,BLOCKER` first, then widen. Use `compact: true` to save tokens. Use `statuses: 'OPEN,CONFIRMED'` to exclude already-closed issues. Use `include_source: true` to see surrounding code inline.
6. **`sonar_issues_summary`** — get quick aggregated counts instead of the full issue list.
7. **`sonar_new_issues`** — see what was introduced since the last analysis (zero-tolerance delta).
8. **`sonar_rule`** — when you find an issue you don't understand, look up the rule.
9. **`sonar_source`** — view the flagged source code around an issue.
10. **`sonar_coverage_files`** — find specific files with low test coverage to improve.
11. **`sonar_search_duplicated_files`** — find files with high duplication.
12. **`sonar_duplications`** — drill into specific duplication blocks to fix them.
13. **`sonar_hotspots`** — review security hotspots (only works with `squ_` user tokens).
14. **`sonar_set_issue_status`** — after fixing, mark issues as `resolve` or `falsepositive`/`wontfix` for intentional non-fixes.

If analysis data is missing or the project isn't even on the server, prompt the user to run:

```bash
# Install scanner
npx sonar_setup_scanner or use the tool

# Generate coverage
npx c8 node --test

# Run analysis
npx sonar_run_analysis
```

Or if the tools are available, let the agent orchestrate the whole flow automatically.

**Token tip**: If `sonar_hotspots` returns a 403, tell the user they need a **user token** (`squ_...`), not an analysis token. The user token can do everything the analysis token can plus hotspots.

**Server unreachable?** If tools return connection errors, `sonar_analysis_status` checks server health first and gives contextual guidance — start Docker for localhost, check network for remote URLs.

### Token types

| Type | Prefix | Hotspots? |
|---|---|---|
| User token | `squ_` | ✅ |
| Project analysis | `sqp_` | ❌ 403 |
| Global analysis | `sqa_` | ❌ 403 |

## Compatibility

Works with all SonarQube editions (Community, Developer, Enterprise) and SonarCloud. The same REST API is used across all editions. Most tools work with any edition; some advanced features may require Developer Edition or higher.