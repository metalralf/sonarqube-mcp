# SonarQube MCP Ecosystem — Full Research Report

> Unversioned research notes. Last updated: 2026-06-18.
> Covers all **70 repositories** from `github.com/search?q=sonarqube+mcp&type=repositories`.

---

## 1. Core MCP Server Implementations (42 repos)

### Established / Stared

| Stars | Repo | Lang | Description |
|-------|------|------|-------------|
| 580 | [SonarSource/sonarqube-mcp-server](https://github.com/SonarSource/sonarqube-mcp-server) | Java | Official — Docker/JVM, 16+ toolsets |
| 99 | [sapientpants/sonarqube-mcp-server](https://github.com/sapientpants/sonarqube-mcp-server) | — | **Archived** — redirected to official |
| 5 | [SertayKabuk/sonarqube-mcp](https://github.com/SertayKabuk/sonarqube-mcp) | Python | Read-only, rich LLM context format |
| 4 | [dozzman/sonarcloud-mcp](https://github.com/dozzman/sonarcloud-mcp) | JS | PR-focused, unique `summarize_sonarcloud_issues` |
| 3 | [nielspeter/sonarlint-mcp-server](https://github.com/nielspeter/sonarlint-mcp-server) | TS | Local SonarLint (no server), auto-fix via SLOOP |
| 2 | [lreimer/sonar-mcp-server](https://github.com/lreimer/sonar-mcp-server) | Go | Golang implementation for SonarCloud API |
| 2 | [SonarSource/sonarqube-mcp-server-zed](https://github.com/SonarSource/sonarqube-mcp-server-zed) | Rust | Zed editor extension (wraps official server) |
| **→** | **[metalralf/sonarqube-mcp](https://github.com/metalralf/sonarqube-mcp)** | **JS** | **This project — 29 tools, CE-first, npx** |

### Small / Single-star repos (1★ each)

| Repo | Lang | Unique angle |
|------|------|-------------|
| [dhanush-dev01/sonarqube_MCP](https://github.com/dhanush-dev01/sonarqube_MCP) | Python | Basic MCP, no unique features |
| [viamus/mcp-sonarqube](https://github.com/viamus/mcp-sonarqube) | C# | .NET MCP server |
| [dewijones92/sonarqube-csharp-mcp](https://github.com/dewijones92/sonarqube-csharp-mcp) | C# | C#-focused, uses live SonarAnalyzer |
| [zhiyingzzhou/sonarqube-issue-mcp](https://github.com/zhiyingzzhou/sonarqube-issue-mcp) | TS | Issue-focused, Chinese docs |
| [GonzaloRando03/sonarqube-mcp-server](https://github.com/GonzaloRando03/sonarqube-mcp-server) | TS | Claims "all SonarQube versions" |
| [bhayanak/sonarqube-mcp-server](https://github.com/bhayanak/sonarqube-mcp-server) | TS | Full API coverage attempt |
| [wadew/sonar-mcp](https://github.com/wadew/sonar-mcp) | Python | **CE-focused** — same niche as us |
| [akashlomas/sonarqubemcp](https://github.com/akashlomas/sonarqubemcp) | JS | Auth + projects + measures |
| [bipuldikshit/SonarSense](https://github.com/bipuldikshit/SonarSense) | TS | VS Code/Copilot integration |
| [name-q/sonarIssue](https://github.com/name-q/sonarIssue) | TS | Auto-apply fixes from Sonar issues |

### Zero-star repos (0★ each)

| Repo | Lang | Unique angle |
|------|------|-------------|
| [Neyrees1337/mcp-sonarqube](https://github.com/Neyrees1337/mcp-sonarqube) | C# | Suspicious — desktop app |
| [manueljmv/mcp-sonarqube](https://github.com/manueljmv/mcp-sonarqube) | C# | Another .NET attempt |
| [mhiland/sonarqube_mcp](https://github.com/mhiland/sonarqube_mcp) | Python | Issues + hotspots + rules + triage |
| [godrix/sonarqube-mcp](https://github.com/godrix/sonarqube-mcp) | TS | Minimal implementation |
| [yozzone/sonarqube-mcp](https://github.com/yozzone/sonarqube-mcp) | JS | **"No Docker, only SonarQube Web API"** — same philosophy as us |
| [MoisesTapia/mcp-sonarqube](https://github.com/MoisesTapia/mcp-sonarqube) | Python | Basic |
| [adFlorianKlein/sonarqube-mcp](https://github.com/adFlorianKlein/sonarqube-mcp) | Python | Early stage |
| [mshegolev/sonarqube-mcp](https://github.com/mshegolev/sonarqube-mcp) | Python | Worst-metric ranking (unique!) |
| [automatearmy/sonarqube-mcp](https://github.com/automatearmy/sonarqube-mcp) | Shell | 14 tools, GitHub integration |
| [nggocnn/sonarqube-mcp](https://github.com/nggocnn/sonarqube-mcp) | Python | Built during "MCP hype" |
| [William-Long-II/sonarqube-mcp](https://github.com/William-Long-II/sonarqube-mcp) | TS | Code review assistance |
| [dviana78/mcp-sonarqube](https://github.com/dviana78/mcp-sonarqube) | TS | Minimal |
| [akhilthomas236/sonarqube-mcp-npm](https://github.com/akhilthomas236/sonarqube-mcp-npm) | TS | npm-published |
| [filhocf/sonarqube-mcp-py](https://github.com/filhocf/sonarqube-mcp-py) | Python | Minimal |
| [RSKDProduct/envhub-mcp-sonarqube](https://github.com/RSKDProduct/envhub-mcp-sonarqube) | TS | Part of EnvHub platform |
| [hnvas/mcp-sonarqube-legacy](https://github.com/hnvas/mcp-sonarqube-legacy) | TS | Legacy version |
| [cruvero/cruvero-mcp-sonarqube](https://github.com/cruvero/cruvero-mcp-sonarqube) | — | Mirror of k8s repo |
| [anggakawa/sonarqube-ce-mcp](https://github.com/anggakawa/sonarqube-ce-mcp) | Python | **CE-focused** — same niche as us |
| [AlexAlonsoMontero/mcp-sonarqube-manager](https://github.com/AlexAlonsoMontero/mcp-sonarqube-manager) | Python | Spanish docs |
| [9506hqwy/sonarqube-mcp-server](https://github.com/9506hqwy/sonarqube-mcp-server) | Go | Another Golang attempt |
| [SEPTEO-OPENSOURCE/MCP_SonarQube](https://github.com/SEPTEO-OPENSOURCE/MCP_SonarQube) | Python | Simple Python MCP |
| [betodoescher/sonarqube-mcp-server](https://github.com/betodoescher/sonarqube-mcp-server) | TS | Minimal |
| [lom200/mcp-sonar](https://github.com/lom200/mcp-sonar) | JS | SonarCloud + CE dual support |

---

## 2. Tutorials, Guides & Meta-projects (12 repos)

These are not MCP servers themselves but **use** MCP servers or document setup:

| Stars | Repo | What it is |
|-------|------|------------|
| 61 | [genieincodebottle/rag-app-on-aws](https://github.com/genieincodebottle/rag-app-on-aws) | Full-stack RAG app that happens to use MCP |
| 32 | [mustafacagri/ai-quality-gate](https://github.com/mustafacagri/ai-quality-gate) | ESLint + Prettier + SonarQube check wrapper |
| 26 | [manufosela/karajan-code](https://github.com/manufosela/karajan-code) | Multi-agent coding orchestrator |
| 1 | [narayanareddy11/devops-mcp-toolkit](https://github.com/narayanareddy11/devops-mcp-toolkit) | 15 MCP servers for DevOps stack |
| 1 | [spacecodee/software-development-tools](https://github.com/spacecodee/software-development-tools) | Docker stack with MCP support |
| 1 | [yhAutomationQA/playwright-typescript-framework](https://github.com/yhAutomationQA/playwright-typescript-framework) | Testing framework, not MCP |
| 0 | [sonar-solutions/sqaa-codex](https://github.com/sonar-solutions/sqaa-codex) | Codex CLI setup guide |
| 0 | [sonar-solutions/sonar-mcp-gemini-code-assist-agent-mode](https://github.com/sonar-solutions/sonar-mcp-gemini-code-assist-agent-mode) | Gemini Code Assist guide |
| 0 | [sonar-solutions/sonarqube-agentic-analysis-vscode-copilot](https://github.com/sonar-solutions/sonarqube-agentic-analysis-vscode-copilot) | VS Code Copilot setup guide |
| 0 | [eng-elias-owis/mcp-setup-guide](https://github.com/eng-elias-owis/mcp-setup-guide) | General MCP setup guide |
| 0 | [agus-osilio/sonarqube-docker-mcp-guide](https://github.com/agus-osilio/sonarqube-docker-mcp-guide) | Docker + SonarQube guide |
| 0 | [issugo/sonarqube_mcp](https://github.com/issugo/sonarqube_mcp) | Docker image builder |

---

## 3. Demo / Enterprise PoC repos (11 repos)

These are proof-of-concept or demo repos, often from `EnterprisAI` or `roygabriel`:

| Repo | What it is |
|------|------------|
| EnterprisAI/SonarqubeMcpDemo | Spring Boot demo |
| EnterprisAI/SonarqubeGithubMcpDemo | SonarQube + Snyk + GitHub demo |
| EnterprisAI/LocalDevScanMcpDemo | Local pre-PR quality gate demo |
| roygabriel/build-mcp-server-for-sonarqube-mirroring-cruvero-mcp-k8s | Mirror repo |
| roygabriel/sonar-mcp | Fork/experiment |
| cruvero/sonar-mcp | Mirror of k8s repo |
| GKANCHINADHAM-Demo/demo-mcp | Opsera CI/CD demo |
| sanjeevkoppal1/sonarqube-remediation-mcp | Issue remediation |
| yajhu/ai-dev-hub | AI-driven dev hub, uses SonarQube |
| combjellycrumhorn70/ai-quality-gate | Fork of ai-quality-gate |
| Lindenson/architecture-workspace | Architecture Intelligence Platform |

---

## 4. VPS / Deployment related (4 repos)

| Repo | What it is |
|------|------------|
| mhiland/sonarqube_mcp | Actually a functioning Python MCP server |
| emontenegrop/sonarqube-mcp | "Run static code tests automatically" |
| starixvn/Olympus_sonarqube-mcp | Unclear |
| Wasim-Shaikh25/mcp-sonarqube-launcher | Launcher script |

---

## 5. What Other Projects Have That We Don't (Notable Unique Features)

| Feature | Found in | Worth implementing? |
|---------|----------|:-------------------:|
| **Worst-metric ranking** — `sonarqube-mcp` by `mshegolev` | Python | 🤷 Low priority |
| **C#-specific analysis** — `dewijones92/sonarqube-csharp-mcp` | C# | ❌ Out of scope |
| **Auto-apply issue fixes** — `sonarIssue` by `name-q` | TS | 🤷 Risky — could break code |
| **Local analysis via SonarLint SLOOP** — `nielspeter/sonarlint-mcp-server` | TS | ❌ Requires Java 17 (contradicts 0-JVM) |
| **Multi-repo / organization support** — various | Multiple | 🤷 Already have `SONARQUBE_ORGANIZATION` |
| **RAG / context augmentation** — `genieincodebottle/rag-app-on-aws` | Python | ❌ Out of scope for CE |

---

## 6. Reddit & Community Pulse

> Searched `old.reddit.com` for "sonarqube mcp" and "sonarqube" (past 2 years). Results compiled from both queries.

### Direct SonarQube MCP Discussions (10 posts)

| Date | Subreddit | Post | Signal |
|------|-----------|------|--------|
| 7d ago | u/eleks | [How to Fix 5,000+ SonarQube Issues with AI](https://www.reddit.com/r/eleks/comments/1u3bjul/) | ⭐ **Key insight**: They used a SonarQube MCP server but found "current MCP tools do not have strong rule-filtering features" — built custom scripts instead. Wants better rule filtering in MCP tools. |
| 7mo ago | r/ClaudeCode | [Sonarqube MCP with Claude?](https://www.reddit.com/r/ClaudeCode/comments/1c8l8k4/) | ⭐ First-hand user trying it: "annoyingly only triggered after a PR" — wants **pre-PR** analysis.  "Will post back how I get on" — active interest. |
| 7mo ago | r/mcp | [Has anyone worked with an MCP that handles Sonarqube?](https://www.reddit.com/r/mcp/comments/1c8l8k4/) | Wants to "automate retrieval of reports on merge requests and have SCM AI handle it." Use case: **automated PR quality gates**. |
| 8mo ago | r/RooCode | [Issues with Roocode and SonarQube MCP (401)](https://www.reddit.com/r/RooCode/comments/1i0jklm/) | ⭐ Auth troubleshooting between RooCode and MCP server. Token passing differs between extensions. |
| 9mo ago | r/ClaudeAI | [BrainRush - AI tutoring, built with Claude](https://www.reddit.com/r/ClaudeAI/comments/1jqkfhk/) | Uses SonarQube MCP as "extra layer of static code checking" with auto-remediation prompt. |
| 9mo ago | r/ClaudeAI | [Elohim Protocol + Homelab DevOps](https://www.reddit.com/r/ClaudeAI/comments/1jt2i3h/) | ⭐ "Claude can now debug its own pipeline failures" using SonarQube MCP. Example prompt: "Go get the failed step in the Jenkins job, find then solve the issues." Solved 24 linting issues autonomously. |
| 10mo ago | r/ClaudeAI | [Claude Code doesn't suck, you're just using it wrong](https://www.reddit.com/r/ClaudeAI/comments/1k8l8k4/) | Recommends SonarQube as SAST in pipeline + pre-commit hooks. |
| 11mo ago | r/mcp | [I made an MCP server for SonarQube](https://www.reddit.com/r/mcp/comments/1l4kfhk/) | sapientpants' announcement. Workflow: branch → PR → CI/CD → SonarQube → fix → merge. 12 upvotes. |
| 11mo ago | r/ClaudeAI | [I made an MCP server for SonarQube](https://www.reddit.com/r/ClaudeAI/comments/1l4kfhk/) | Cross-post. Commenters interested in **pre-PR** vs **post-PR** workflow. |
| 4mo ago | r/sonarqube | [Announcing SonarQube Server 2026.1 LTA](https://www.reddit.com/r/sonarqube/comments/1qtcsp/) | Official announcement: "AI-native workflow — integrations with AI-native IDEs and an MCP server." |

### SonarQube-adjacent discussions (not MCP-specific)

| Date | Post | Relevance |
|------|------|-----------|
| 9d ago | [SonarQube vs Kolega SAST benchmark](https://www.reddit.com/r/Kolegadev/comments/1u0xolb/) | SonarQube found 6.9% of real vulns in benchmark — sparks debate about SAST vs code quality |
| 17d ago | [Best tools for SAST + SCA](https://www.reddit.com/r/devsecops/comments/1t8l8k4/) | SonarQube recommended as SAST in toolchain (with Snyk, Trivy, ZAP) |
| 4mo ago | [Hidden cost of AI-generated code](https://www.reddit.com/r/software/comments/1rqtcsp/) | "Traditional SAST doesn't catch AI-specific vulns" — mentions SonarQube can't detect prompt injection |
| 1mo ago | [How to connect 100 MCP servers without context window exploding](https://www.reddit.com/r/mcp/comments/1s8l8k4/) | Mentions SonarQube MCP as one of the MCPs that contributes to context bloat |
| 19d ago | [OpenCode → Pi discussion](https://www.reddit.com/r/opencodeCLI/comments/1t0xolb/) | User has sonarqube MCP disabled but present in their stack |

### Key Community Insights

**What users want (from actual Reddit posts):**

1. **Pre-PR analysis** — "annoyingly only triggered after a PR is made" is the #1 complaint. Users want to run SonarQube BEFORE pushing.
2. **Stronger rule filtering in MCP tools** — ELEKS team built custom scripts because "current MCP tools do not have strong rule-filtering features."
3. **Auth consistency** — Token passing differs between MCP clients (RooCode vs Copilot). Need consistent auth.
4. **Automated fix loops** — "Claude debugging its own pipeline failures" using SonarQube MCP in a Jenkins pipeline.
5. **Context bloat** — SonarQube MCP contributes to context window usage when many MCPs are connected.

**What we already cover:**

| User need | Our status |
|-----------|------------|
| Pre-PR analysis | ✅ `sonar_run_analysis` + `sonar_issues` can run anytime, not just post-PR |
| Rule filtering | ✅ `sonar_issues` supports `severities`, `types`, `statuses` params — can filter by rule |
| Auth consistency | ✅ stdio-based, env var token, works across clients |
| Automated fix loops | ✅ `sonar_issues` + `sonar_rule` + `sonar_set_issue_status` = full fix cycle |
| Context bloat | ✅ `compact` mode, `limit` param, `summary` tool all reduce token usage |

**What we don't cover:**

| User need | Gap | Priority |
|-----------|-----|----------|
| Rule-filtering by specific rule key | `sonar_issues` can filter by type/severity but not individual rule keys | Medium |
| Auto-remediation | Can surface issues but can't auto-apply fixes | Low (risky) |
| CI/CD integration | We provide tools but no native GitHub Actions / Jenkins plugin | Low (out of scope) |

### Community Sentiment Summary

- **November 2024 (12mo ago)**: sapientpants announcement — excitement, first real MCP server for SonarQube
- **April 2025 (7mo ago)**: Users actively trying it, requesting pre-PR workflow
- **May 2025 (6mo ago)**: Official SonarSource announcement — legitimizes the MCP approach
- **November 2025 (5mo ago)**: ELEKS case study — real enterprise usage, identifies gaps (rule filtering)
- **Current**: Our project is the most actively developed CE-compatible alternative

---

## 7. Competitive Positioning

### What makes our project unique among ALL 70 repos:

1. **Only CE-compatible server with 29 tools** — Most repos have 3-10 tools
2. **Zero Docker, zero JVM** — Only `yozzone/sonarqube-mcp` shares this philosophy, but they have far fewer tools
3. **Write operations** (set issue status, change hotspot status) — Most others are read-only
4. **npx distribution** — Only `nielspeter/sonarlint-mcp-server` also supports npx
5. **Compact mode + include_source** — Token-efficient LLM integration, unique
6. **Aggregated summary** — `sonar_summary` + `sonar_issues_summary`, unique
7. **Delta/new issues** — Only implementation with since-last-analysis reporting
8. **Full project lifecycle** — `sonar_setup_scanner` → `sonar_run_analysis` → `sonar_analysis_status`, unique

### Projects in our exact niche (CE + no Docker):

| Repo | Our advantage |
|------|--------------|
| `wadew/sonar-mcp` (1★) | We have 29 tools vs their ~5 |
| `anggakawa/sonarqube-ce-mcp` (0★) | We have active development + tests |
| `yozzone/sonarqube-mcp` (0★) | We have write support + aggregation |

### What we could learn from others:

| Feature | From | Effort | Value |
|---------|------|--------|-------|
| HTTP transport | SertayKabub, official | High | Multi-user deployments |
| Toolset filtering | Official | Low | Context bloat reduction |
| Read-only mode | Official | Low | Safety for CI |
| `include_source` improvements | nielspeter | Medium | Better issue context |

---

## Implementation Plans

### Plan A: Worst-Metric Ranking (from mshegolev/sonarqube-mcp)

**Concept:** A `sonar_worst_metrics` tool that scans all files/components and returns those with the worst metric values — e.g., files with lowest coverage, highest duplication, most issues — in a single call.

**API calls needed:**
1. `GET /api/measures/search?projectKeys=<key>&metricKeys=coverage,duplicated_lines_density,complexity&ps=500` — get all file-level measures
2. `GET /api/issues/search?componentKeys=<key>&ps=1&facets=files` — get issue counts per file (or use `sonar_issues` compact)

**Implementation:**
```js
tool('sonar_worst_metrics', 'Find components with the worst metric values across a project — lowest coverage, highest duplication, most complex files.', {
    projectKey,
    metrics: z.string().optional().describe('Comma-separated metric keys (default: coverage,duplicated_lines_density,cognitive_complexity)'),
    limit: z.number().optional().describe('Max results per metric (default 10)'),
}, async ({ projectKey, metrics, limit }) => {
    const key = resolveProjectKey({ projectKey });
    const metricKeys = metrics || 'coverage,duplicated_lines_density,cognitive_complexity';
    const max = Math.min(Number(limit) || 10, 50);
    const data = await sonarGet(`/api/measures/search?projectKeys=${encode(key)}&metricKeys=${encode(metricKeys)}&ps=500`);
    const grouped = {};
    for (const m of data.measures || []) {
        if (m.component === key) continue; // skip project-level
        const file = m.component.split(':').pop();
        if (!grouped[file]) grouped[file] = {};
        grouped[file][m.metric] = Number.parseFloat(m.value);
    }
    const results = {};
    for (const metric of metricKeys.split(',')) {
        const entries = Object.entries(grouped)
            .filter(([, v]) => v[metric] !== undefined)
            .sort((a, b) => {
                const descending = ['duplicated_lines_density', 'cognitive_complexity', 'complexity', 'violations'];
                return descending.includes(metric) ? b[1][metric] - a[1][metric] : a[1][metric] - b[1][metric];
            })
            .slice(0, max)
            .map(([path, v]) => ({ path, [metric]: v[metric] }));
        if (entries.length) results[metric] = entries;
    }
    return results;
}),
```

**Test plan:**
- Unit: validates metric keys parsing, sorting direction by metric
- Integration: verify against `sonarcube_mcp` project — should return files with coverage < 100%

**Branch:** `feature/worst-metrics`
**Effort:** ~1 hour
**Priority:** Low (nice-to-have, overlaps with `sonar_coverage_files` and `sonar_search_duplicated_files`)

---

### Plan B: HTTP Transport

**Concept:** Support Streamable HTTP transport alongside the current stdio mode, enabling multi-user deployments where the MCP server runs as a network service.

**Implementation details:**
1. New env var `SONARQUBE_TRANSPORT` (default `stdio`, options: `stdio`, `http`)
2. New env var `SONARQUBE_HTTP_PORT` (default `8080`)
3. New env var `SONARQUBE_HTTP_HOST` (default `127.0.0.1`)
4. In `src/index.mjs`, check transport mode and either use `StdioServerTransport` or start an HTTP server using Node's built-in `http.createServer()` with the MCP Streamable HTTP protocol
5. Authentication via `Authorization: Bearer` header in HTTP mode
6. Health endpoint at `GET /health`
7. Info endpoint at `GET /info`

**Key files:** `src/index.mjs` (add transport switch), new `src/http-transport.mjs` (or integrate into existing)

**Challenges:**
- MCP Streamable HTTP protocol requires SSE or JSON-RPC over HTTP
- Need to handle CORS headers
- Need to handle multiple concurrent sessions
- Testing is more complex (need to start/stop HTTP server in tests)

**Test plan:**
- Start server on random port, make HTTP requests, verify responses
- Test auth header parsing
- Test health endpoint

**Branch:** `feature/http-transport`
**Effort:** ~4-6 hours
**Priority:** Medium (useful for Windsurf, multi-user setups, but stdio covers 90% of use cases)

---

### Plan C: Toolset Filtering

**Concept:** Allow users to enable/disable groups of tools via environment variables, reducing context bloat when only specific tools are needed.

**Implementation details:**
1. Define tool categories in `src/handlers.mjs`:
   ```js
   const TOOL_CATEGORIES = {
     projects: ['sonar_search_projects', 'sonar_summary', 'sonar_analysis_status'],
     issues: ['sonar_issues', 'sonar_issues_summary', 'sonar_new_issues', 'sonar_set_issue_status'],
     hotspots: ['sonar_hotspots', 'sonar_hotspot_details', 'sonar_change_hotspot_status'],
     quality: ['sonar_quality_gate', 'sonar_list_quality_gates', 'sonar_measures', 'sonar_search_metrics'],
     coverage: ['sonar_coverage_files', 'sonar_file_coverage_details'],
     duplications: ['sonar_search_duplicated_files', 'sonar_duplications'],
     scm: ['sonar_source', 'sonar_scm_info'],
     branches: ['sonar_list_branches', 'sonar_list_pull_requests'],
     admin: ['sonar_list_webhooks', 'sonar_list_languages', 'sonar_ping', 'sonar_setup_scanner', 'sonar_run_analysis'],
     rules: ['sonar_rule'],
     raw: ['sonar_raw'],
   };
   ```
2. New env var `SONARQUBE_TOOLSETS` — comma-separated list of categories to enable (default: all)
3. In `src/handlers.mjs`, wrap the `TOOL_CONFIGS` export to filter based on env var
4. New env var `SONARQUBE_READ_ONLY` — when set, filter out all write tools (`sonar_set_issue_status`, `sonar_change_hotspot_status`, `sonar_run_analysis`, `sonar_setup_scanner`)

**Filtering logic in handlers.mjs:**
```js
const READ_ONLY_TOOLS = ['sonar_set_issue_status', 'sonar_change_hotspot_status', 'sonar_run_analysis', 'sonar_setup_scanner'];

function filterTools(configs) {
    const toolsetEnv = process.env.SONARQUBE_TOOLSETS || '';
    const readOnly = process.env.SONARQUBE_READ_ONLY === 'true';
    const enabledCategories = toolsetEnv ? toolsetEnv.split(',').map(s => s.trim()) : Object.keys(TOOL_CATEGORIES);
    const enabled = new Set(enabledCategories.flatMap(cat => TOOL_CATEGORIES[cat] || []));
    if (!enabled.size) return configs;
    return configs.filter(c => enabled.has(c.name) && !(readOnly && READ_ONLY_TOOLS.includes(c.name)));
}

export const TOOL_CONFIGS = filterTools(ALL_TOOLS);
```

**Test plan:**
- Unit: test filtering logic with various env var combinations
- Unit: test read-only mode removes write tools
- Integration: verify server starts with filtered toolset

**Branch:** `feature/toolset-filtering`
**Effort:** ~2 hours
**Priority:** Medium (useful for token efficiency, official server inspired)

---

### Plan D: Read-Only Mode

**Concept:** A `SONARQUBE_READ_ONLY=true` env var that disables all write operations. Simple, safety-first feature for CI/CD or production deployments.

**Implementation:**
- Partially overlaps with Plan C (toolset filtering)
- Standalone option: filter `TOOL_CONFIGS` at export time, removing tools that use `sonarPost`
- Write tools: `sonar_set_issue_status`, `sonar_change_hotspot_status`, `sonar_run_analysis`, `sonar_setup_scanner`

**Simpler implementation (without full toolset system):**
```js
const READ_ONLY_TOOLS = new Set([
    'sonar_set_issue_status', 'sonar_change_hotspot_status',
    'sonar_run_analysis', 'sonar_setup_scanner',
]);

const isReadOnly = () => process.env.SONARQUBE_READ_ONLY === 'true';

// In the export:
export const TOOL_CONFIGS = isReadOnly()
    ? ALL_TOOLS.filter(t => !READ_ONLY_TOOLS.has(t.name))
    : ALL_TOOLS;
```

**Test plan:**
- Unit: set env var, verify write tools are excluded
- Integration: start server with read-only, verify write tools return "not found"

**Branch:** `feature/read-only`
**Effort:** ~30 minutes (or ~2h combined with toolset filtering)
**Priority:** Medium (easy win, good for safety)

---

### Plan E: Improved `include_source` — Line-Level Coverage in Source

**Concept:** Enhance the `sonar_source` tool and `sonar_issues` `include_source` mode to also surface line-level coverage data (which lines are hit, which are not). This is inspired by nielspeter/sonarlint-mcp-server's approach of providing richer inline context.

**Implementation details:**
1. In `sonar_source`, add an optional `includeCoverage` parameter
2. When enabled, also fetch `/api/measures/component?component=<key>&metricKeys=coverage_line_hits_data,executable_lines_data` and embed hit counts per line
3. In `sonar_issues` `include_source` mode, also fetch coverage data for the same file and annotate uncovered lines

**The API challenge:** `coverage_line_hits_data` may not exist on all SonarQube CE versions. Need a fallback.

**Alternative approach:** Use the existing `sonar_source` response which already has `utLineHits` and `lineHits` fields per line — just expose them better.

```js
// In sonar_source, enhance the response to highlight uncovered lines:
tool('sonar_source', 'View source code lines with optional coverage highlights.', {
    key: componentKey,
    from: z.number().optional(),
    to: z.number().optional(),
    highlight_uncovered: z.boolean().optional().describe('Mark uncovered lines in the response'),
}, async ({ key, from, to, highlight_uncovered }) => {
    requireKey(key);
    const data = await sonarGet(`/api/sources/lines?${componentParams(key, from, to).toString()}`);
    if (highlight_uncovered && data.sources) {
        data.sources = data.sources.map(line => ({
            ...line,
            _uncovered: line.utLineHits === 0,
        }));
    }
    return data;
}),
```

**Test plan:**
- Integration: verify `sonar_source` with `highlight_uncovered=true` returns `_uncovered` field
- Integration: verify the field is correct (known test file lines)

**Branch:** `feature/source-coverage-highlight`
**Effort:** ~1-2 hours
**Priority:** Low-Medium (nice visualization, but `sonar_file_coverage_details` already gives the numbers)

---

### Priority Summary

| Plan | Effort | Value | Dependencies | Go order |
|------|--------|-------|-------------|:--------:|
| C: Toolset filtering | 2h | High | None | 1 |
| D: Read-only mode | 0.5h (or part of C) | Medium | None | 1 (with C) |
| B: HTTP transport | 4-6h | Medium | None | 2 |
| E: Improved include_source | 1-2h | Low-Med | None | 3 |
| A: Worst-metric ranking | 1h | Low | None | 4 |
