# sonarqube-mcp

An MCP server that exposes SonarQube data as AI agent tools.

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
| `sonar_raw` | Escape hatch — any GET endpoint |

For **opencode**, copy `opencode.jsonc.example` to `opencode.jsonc` in your project root:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "sonarqube": {
      "type": "local",
      "command": ["npx", "-y", "github:metalralf/sonarqube-mcp"],
      "enabled": true,
      "environment": {
        "SONARQUBE_URL": "${SONARQUBE_URL}",
        "SONARQUBE_TOKEN": "${SONARQUBE_TOKEN}",
        "SONARQUBE_PROJECT": "${SONARQUBE_PROJECT}"
      }
    }
  }
}
```

For **Claude Code** or other MCP clients, copy `.mcp.json.example` to `.mcp.json` in your project root:

```json
{
  "mcp": {
    "sonarqube": {
      "type": "local",
      "command": ["npx", "-y", "github:metalralf/sonarqube-mcp"],
      "enabled": true,
      "environment": {
        "SONARQUBE_URL": "${SONARQUBE_URL}",
        "SONARQUBE_TOKEN": "${SONARQUBE_TOKEN}",
        "SONARQUBE_PROJECT": "${SONARQUBE_PROJECT}"
      }
    }
  }
}
```

## Configuration

| Env var | Description |
|---|---|
| `SONARQUBE_URL` | SonarQube instance base URL |
| `SONARQUBE_TOKEN` | Auth token |
| `SONARQUBE_PROJECT` | Default project key |
| `SONARQUBE_ORGANIZATION` | SonarCloud org key |
| `SONARQUBE_AUTH_SCHEME` | `basic` (default) or `bearer` |

### Token types

| Type | Prefix | Hotspots? |
|---|---|---|
| User token | `squ_` | ✅ |
| Project analysis | `sqp_` | ❌ 403 |
| Global analysis | `sqa_` | ❌ 403 |
