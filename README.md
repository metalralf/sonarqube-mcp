# sonarqube-mcp

An MCP server that exposes SonarQube data as AI agent tools.

*Dogfooding: this project is checked via its own `sonar_analysis_status` tool.*

Recommended to wire per-project via `.mcp.json` or `opencode.jsonc` in the project root — different projects have different SonarQube project keys, URLs, and tokens.

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
|---|---|
| `sonar_search_projects` | Discover project keys |
| `sonar_quality_gate` | Gate pass/fail + failing conditions |
| `sonar_measures` | Bugs, smells, coverage, ratings, ncloc, dup |
| `sonar_issues` | Open issues sorted by severity |
| `sonar_hotspots` | Security hotspots (needs user token) |
| `sonar_rule` | Explain a rule (why an issue fired) |
| `sonar_source` | View flagged source lines |
| `sonar_analysis_status` | Check if a project has been analyzed, with next steps |
| `sonar_setup_scanner` | Install sonar-scanner as a devDependency (detects pnpm/yarn/npm) |
| `sonar_run_analysis` | Run sonar-scanner analysis on the project |
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

### Token types

| Type | Prefix | Hotspots? |
|---|---|---|
| User token | `squ_` | ✅ |
| Project analysis | `sqp_` | ❌ 403 |
| Global analysis | `sqa_` | ❌ 403 |
