// @ts-check
import { z } from 'zod';
import { execSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sonarGet, sonarPost, sonarCheckServer, orgQuery, resolveProjectKey, maybeTruncated, getHostUrl } from './api.mjs';

const encode = (/** @type {string} */ v) => encodeURIComponent(v);

const tool = (name, description, schema, handler) => ({ name, description, schema, handler });
const projectKey = z.string().optional().describe('Project key (defaults to SONARQUBE_PROJECT)');
const componentKey = z.string().describe('Full component key (e.g. my-project:src/file.ts)');
const maxResults = z.number().optional().describe('Max results (default 50, max 500)');

const requireKey = (key) => { if (!key) throw new Error('key (component key) is required'); };

const componentParams = (key, from, to) => {
  const params = new URLSearchParams({ key });
  if (from) params.set('from', String(from));
  if (to) params.set('to', String(to));
  return params;
};

const measureSearch = (metricKey, valueKey, defaultThresh, descend) => async ({ projectKey, threshold }) => {
  const key = resolveProjectKey({ projectKey });
  const t = threshold ?? defaultThresh;
  const data = await sonarGet(`/api/measures/search?projectKeys=${encode(key)}&metricKeys=${metricKey}&ps=500`);
  const extract = (m) => ({ path: m.component.split(':').pop(), [valueKey]: Number.parseFloat(m.value) });
  const items = (data.measures || []).filter((m) => m.value !== undefined && m.component !== key && m.component);
  const sorted = items.map(extract).filter((f) => (descend ? f[valueKey] > t : f[valueKey] < t)).sort((a, b) => descend ? b[valueKey] - a[valueKey] : a[valueKey] - b[valueKey]);
  return { total: items.length, threshold: t, files: sorted };
};

/**
 * @callback ToolHandler
 * @param {Object} params
 * @returns {Promise<any>}
 */

const TOOL_CATEGORIES = {
  projects: ['sonar_search_projects', 'sonar_summary', 'sonar_analysis_status'],
  issues: ['sonar_issues', 'sonar_issues_summary', 'sonar_new_issues', 'sonar_set_issue_status'],
  hotspots: ['sonar_hotspots', 'sonar_hotspot_details', 'sonar_change_hotspot_status'],
  quality: ['sonar_quality_gate', 'sonar_list_quality_gates', 'sonar_measures', 'sonar_search_metrics'],
  coverage: ['sonar_coverage_files', 'sonar_file_coverage_details'],
  duplications: ['sonar_search_duplicated_files', 'sonar_duplications'],
  history: ['sonar_metrics_history'],
  worst: ['sonar_worst_metrics'],
  scm: ['sonar_source', 'sonar_scm_info'],
  branches: ['sonar_list_branches', 'sonar_list_pull_requests'],
  admin: ['sonar_list_webhooks', 'sonar_list_languages', 'sonar_ping', 'sonar_setup_scanner', 'sonar_run_analysis'],
  rules: ['sonar_rule'],
  raw: ['sonar_raw'],
};

const READ_ONLY_TOOLS = new Set(['sonar_set_issue_status', 'sonar_change_hotspot_status', 'sonar_run_analysis', 'sonar_setup_scanner']);

const filterTools = (/** @type {Array<any>} */ all) => {
  const envToolsets = process.env.SONARQUBE_TOOLSETS || '';
  const readOnly = process.env.SONARQUBE_READ_ONLY === 'true';
  if (!envToolsets && !readOnly) return all;
  if (envToolsets) {
    const cats = envToolsets.split(',').map((s) => s.trim());
    const enabled = new Set(cats.flatMap((c) => TOOL_CATEGORIES[c] || []));
    if (enabled.size) return all.filter((t) => enabled.has(t.name) && !(readOnly && READ_ONLY_TOOLS.has(t.name)));
  }
  return readOnly ? all.filter((t) => !READ_ONLY_TOOLS.has(t.name)) : all;
};

const ALL_TOOLS = [
  tool('sonar_search_projects', 'Search/find SonarQube project keys. Use when no project is configured or to discover available projects.', {
    query: z.string().optional().describe('Optional search query to filter projects by name/key'),
    limit: maxResults,
  }, async ({ query, limit }) => {
    const params = new URLSearchParams({ ps: String(Math.min(Number(limit) || 50, 500)) });
    if (query) params.set('q', query);
    return maybeTruncated(await sonarGet(`/api/projects/search?${params.toString()}${orgQuery()}`));
  }),

  tool('sonar_summary', 'Get an aggregated project health summary in a single call: quality gate, key metrics (bugs, vulnerabilities, code smells, coverage, duplication), issue counts by severity/type, branch info, and coverage.', {
    projectKey,
  }, async ({ projectKey }) => {
    const key = resolveProjectKey({ projectKey });
    const [quality, measures, issues, branches] = await Promise.all([
      sonarGet(`/api/qualitygates/project_status?projectKey=${encode(key)}`).catch(() => null),
      sonarGet(`/api/measures/component?component=${encode(key)}&metricKeys=bugs,vulnerabilities,code_smells,coverage,duplicated_lines_density,ncloc,reliability_rating,security_rating,sqale_rating`).catch(() => null),
      sonarGet(`/api/issues/search?componentKeys=${encode(key)}&ps=1&resolved=false`).catch(() => null),
      sonarGet(`/api/project_branches/list?project=${encode(key)}`).catch(() => null),
    ]);
    const metricMap = {};
    for (const m of measures?.component?.measures || []) metricMap[m.metric] = m.value;
    const severityCounts = {};
    const typeCounts = {};
    for (const issue of issues?.issues || []) {
      severityCounts[issue.severity] = (severityCounts[issue.severity] || 0) + 1;
      typeCounts[issue.type] = (typeCounts[issue.type] || 0) + 1;
    }
    return {
      projectKey: key,
      qualityGate: quality?.projectStatus?.status || 'NONE',
      metrics: metricMap,
      issues: { total: issues?.total || 0, by_severity: severityCounts, by_type: typeCounts },
      branches: (branches?.branches || []).map((b) => ({ name: b.name, isMain: b.isMain, analysisDate: b.analysisDate, qg: b.status?.qualityGateStatus })),
    };
  }),

  tool('sonar_list_languages', 'List all programming languages supported by SonarQube with their keys and names.', {
  }, async () => {
    const data = await sonarGet('/api/languages/list');
    return data.languages || [];
  }),

  tool('sonar_ping', 'Ping the SonarQube server to check if it is reachable and responsive. Returns "pong" and the server health status (GREEN/YELLOW/RED).', {
  }, async () => {
    const health = await sonarCheckServer();
    if (!health.reachable) {
      return { status: 'UNREACHABLE', message: `Cannot reach SonarQube at ${getHostUrl()}`, hint: health.hint };
    }
    return { pong: true, health: health.health || 'unknown' };
  }),

  tool('sonar_quality_gate', 'Get the SonarQube quality gate status (OK/ERROR) for a project, including each failing condition with metric, actual value, and threshold.', {
    projectKey,
  }, async ({ projectKey }) => {
    return sonarGet(`/api/qualitygates/project_status?projectKey=${encode(resolveProjectKey({ projectKey }))}`);
  }),

  tool('sonar_list_quality_gates', 'List all quality gates defined in SonarQube, with their conditions and metrics.', {
  }, async () => {
    return sonarGet('/api/qualitygates/list');
  }),

  tool('sonar_measures', 'Get SonarQube metrics for a project: bugs, vulnerabilities, code smells, coverage, duplication, lines of code, and maintainability/security ratings.', {
    projectKey,
    metricKeys: z.string().optional().describe('Comma-separated metric keys (default: bugs,vulnerabilities,code_smells,security_hotspots,coverage,duplicated_lines_density,ncloc,reliability_rating,security_rating,sqale_rating)'),
  }, async ({ projectKey, metricKeys }) => {
    const key = resolveProjectKey({ projectKey });
    const keys = metricKeys || 'bugs,vulnerabilities,code_smells,security_hotspots,coverage,duplicated_lines_density,ncloc,reliability_rating,security_rating,sqale_rating';
    return sonarGet(`/api/measures/component?component=${encode(key)}&metricKeys=${encode(keys)}`);
  }),

  tool('sonar_issues', 'Search SonarQube issues for a project. Returns issues sorted by severity (most severe first). Supports filtering by severity, type, resolution, compact mode, and source embedding.', {
    projectKey,
    severities: z.union([z.string(), z.array(z.string())]).optional().describe('Comma-separated or array: INFO,MINOR,MAJOR,CRITICAL,BLOCKER'),
    types: z.union([z.string(), z.array(z.string())]).optional().describe('Comma-separated or array: CODE_SMELL,BUG,VULNERABILITY,SECURITY_HOTSPOT'),
    resolved: z.boolean().optional().describe('Include resolved issues (default false)'),
    statuses: z.string().optional().describe('Comma-separated issue statuses: OPEN,CONFIRMED,REOPENED,RESOLVED,CLOSED (default OPEN,CONFIRMED,REOPENED)'),
    limit: maxResults,
    compact: z.boolean().optional().describe('Strip verbose fields (flows, textRange, messageFormattings) for token efficiency'),
    include_source: z.boolean().optional().describe('Embed source lines for each issue (requires extra API calls)'),
  }, async ({ projectKey, severities, types, resolved, statuses, limit, compact, include_source }) => {
    const key = resolveProjectKey({ projectKey });
    const params = new URLSearchParams({
      componentKeys: key,
      ps: String(Math.min(Number(limit) || 30, 500)),
      s: 'SEVERITY',
      asc: 'false',
    });

    if (statuses) {
      params.set('statuses', statuses);
    } else if (!resolved) {
      params.set('resolved', 'false');
    }

    if (severities) params.set('severities', Array.isArray(severities) ? severities.join(',') : severities);
    if (types) params.set('types', Array.isArray(types) ? types.join(',') : types);

    const data = await sonarGet(`/api/issues/search?${params.toString()}`);
    maybeTruncated(data);

    if (compact && data.issues) {
      data.issues = data.issues.map(({ flows, textRange, messageFormattings, codeVariants, internalTags, ...rest }) => rest);
    }

    if (include_source && data.issues) {
      data.issues = await Promise.all(data.issues.map(async (issue) => {
        if (!issue.component || !issue.line) return issue;
        try {
          const src = await sonarGet(`/api/sources/lines?key=${encode(issue.component)}&from=${Math.max(1, issue.line - 2)}&to=${issue.line + 2}`);
          return { ...issue, _source: src };
        } catch {
          return issue;
        }
      }));
    }

    return data;
  }),

  tool('sonar_issues_summary', 'Get aggregated counts of issues by severity and type. Lightweight alternative to sonar_issues — returns only summary stats.', {
    projectKey,
    resolved: z.boolean().optional().describe('Include resolved issues in summary (default false)'),
  }, async ({ projectKey, resolved }) => {
    const key = resolveProjectKey({ projectKey });
    const data = await sonarGet(`/api/issues/search?componentKeys=${encode(key)}&ps=500&resolved=${String(Boolean(resolved))}`);
    const bySeverity = {};
    const byType = {};
    let effortTotal = 0;

    for (const issue of data.issues || []) {
      bySeverity[issue.severity] = (bySeverity[issue.severity] || 0) + 1;
      byType[issue.type] = (byType[issue.type] || 0) + 1;
      effortTotal += Number(issue.effort?.replace('min', '')) || 0;
    }

    return { total: data.total, by_severity: bySeverity, by_type: byType, effortTotal };
  }),

  tool('sonar_new_issues', 'Get issues created since the last analysis. Useful for seeing what changed after a scan.', {
    projectKey,
    severities: z.union([z.string(), z.array(z.string())]).optional().describe('Comma-separated or array: INFO,MINOR,MAJOR,CRITICAL,BLOCKER'),
    types: z.union([z.string(), z.array(z.string())]).optional().describe('Comma-separated or array: CODE_SMELL,BUG,VULNERABILITY,SECURITY_HOTSPOT'),
    limit: maxResults,
    compact: z.boolean().optional().describe('Strip verbose fields for token efficiency'),
  }, async ({ projectKey, severities, types, limit, compact }) => {
    const key = resolveProjectKey({ projectKey });
    const analyses = await sonarGet(`/api/project_analyses/search?project=${encode(key)}&ps=2`).catch(() => null);
    const createdAfter = analyses?.analyses?.[1]?.date || analyses?.analyses?.[0]?.date;

    if (!createdAfter) {
      return { total: 0, issues: [], message: 'No previous analysis found to compare against.' };
    }

    const params = new URLSearchParams({
      componentKeys: key,
      ps: String(Math.min(Number(limit) || 30, 500)),
      s: 'SEVERITY',
      asc: 'false',
      createdAfter,
    });
    if (severities) params.set('severities', Array.isArray(severities) ? severities.join(',') : severities);
    if (types) params.set('types', Array.isArray(types) ? types.join(',') : types);

    const data = await sonarGet(`/api/issues/search?${params.toString()}`);
    maybeTruncated(data);

    if (compact && data.issues) {
      data.issues = data.issues.map(({ flows, textRange, messageFormattings, codeVariants, internalTags, ...rest }) => rest);
    }

    return data;
  }),

  tool('sonar_hotspots', 'Search SonarQube security hotspots for a project. Requires a User token (squ_ prefix) with Browse permission — analysis tokens (sqp_/sqa_) will get a 403 error.', {
    projectKey,
    status: z.string().optional().describe('TO_REVIEW or REVIEWED (default TO_REVIEW)'),
    limit: z.number().optional().describe('Max results (default 30, max 500)'),
  }, async ({ projectKey, status, limit }) => {
    const token = process.env.SONARQUBE_TOKEN || '';
    if (token && !token.startsWith('squ_')) {
      throw new Error('Hotspots require a User token (squ_ prefix). Current token starts with "' + token.slice(0, 4) + '...". Generate a user token at SonarQube > My Account > Security.');
    }
    const key = resolveProjectKey({ projectKey });
    const params = new URLSearchParams({
      projectKey: key,
      status: status || 'TO_REVIEW',
      ps: String(Math.min(Number(limit) || 30, 500)),
    });
    return maybeTruncated(await sonarGet(`/api/hotspots/search?${params.toString()}`));
  }),

  tool('sonar_hotspot_details', 'Get detailed information about a specific security hotspot: rule description, code context, review flows, and comments. Requires a User token (squ_ prefix).', {
    hotspotKey: z.string().describe('Hotspot key (e.g. the "key" field from sonar_hotspots)'),
  }, async ({ hotspotKey }) => {
    if (!hotspotKey) throw new Error('hotspotKey is required');
    return sonarGet(`/api/hotspots/show?hotspot=${encode(hotspotKey)}`);
  }),

  tool('sonar_change_hotspot_status', 'Review a security hotspot: change its status to REVIEWED (with resolution) or back to TO_REVIEW. Requires a User token (squ_ prefix).', {
    hotspotKey: z.string().describe('Hotspot key (e.g. the "key" field from sonar_hotspots)'),
    status: z.enum(['TO_REVIEW', 'REVIEWED']).describe('New status: TO_REVIEW to reopen, REVIEWED to mark as reviewed'),
    resolution: z.enum(['FIXED', 'SAFE', 'ACKNOWLEDGED']).optional().describe('Required when status=REVIEWED: FIXED, SAFE, or ACKNOWLEDGED'),
    comment: z.string().optional().describe('Optional comment to attach to the review'),
  }, async ({ hotspotKey, status, resolution, comment }) => {
    if (!hotspotKey) throw new Error('hotspotKey is required');
    const body = new URLSearchParams({ hotspot: hotspotKey, status });
    if (resolution) body.set('resolution', resolution);
    if (comment) body.set('comment', comment);
    return sonarPost('/api/hotspots/change_status', body.toString());
  }),

  tool('sonar_rule', 'Get detailed information about a specific SonarQube rule: description, severity, type, and remediation guidance.', {
    ruleKey: z.string().describe('Rule key (e.g. typescript:S6544, java:S123)'),
  }, async ({ ruleKey }) => {
    if (!ruleKey) throw new Error('ruleKey is required');
    return sonarGet(`/api/rules/show?key=${encode(ruleKey)}`);
  }),

  tool('sonar_scm_info', 'Get SCM (Git) blame/commit information for source file lines: author, date, and revision per line.', {
    key: componentKey,
    from: z.number().optional().describe('Starting line number (1-indexed)'),
    to: z.number().optional().describe('Ending line number (inclusive)'),
  }, async ({ key, from, to }) => {
    requireKey(key);
    return sonarGet(`/api/sources/scm?${componentParams(key, from, to).toString()}`);
  }),

  tool('sonar_search_metrics', 'Search/browse available SonarQube metric definitions, their types, domains, and descriptions.', {
    query: z.string().optional().describe('Optional search query to filter metrics by name or domain'),
    limit: maxResults,
  }, async ({ query, limit }) => {
    const params = new URLSearchParams({ ps: String(Math.min(Number(limit) || 50, 500)) });
    if (query) params.set('q', query);
    return sonarGet(`/api/metrics/search?${params.toString()}`);
  }),

  tool('sonar_source', 'View source code lines for a SonarQube file component. Useful to see context around a flagged issue or hotspot. Optionally highlight uncovered lines.', {
    key: componentKey,
    from: z.number().optional().describe('Starting line number (1-indexed)'),
    to: z.number().optional().describe('Ending line number (inclusive)'),
    highlight_uncovered: z.boolean().optional().describe('When true, each line gets a _uncovered boolean field indicating if it has 0 test hits'),
  }, async ({ key, from, to, highlight_uncovered }) => {
    requireKey(key);
    const data = await sonarGet(`/api/sources/lines?${componentParams(key, from, to).toString()}`);
    if (highlight_uncovered && data.sources) {
      data.sources = data.sources.map((l) => ({ ...l, _uncovered: l.utLineHits === 0 }));
    }
    return data;
  }),

  tool('sonar_list_webhooks', 'List webhooks configured for a project or globally. Useful to verify CI/CD integration with SonarQube.', {
    projectKey: z.string().optional().describe('Project key (defaults to SONARQUBE_PROJECT). Omit for global webhooks.'),
  }, async ({ projectKey }) => {
    const params = new URLSearchParams();
    if (projectKey) params.set('project', projectKey);
    else {
      const def = resolveProjectKey({});
      if (def) params.set('project', def);
    }
    return sonarGet(`/api/webhooks/list?${params.toString()}`);
  }),

  tool('sonar_analysis_status', 'Check if a project has been analyzed on SonarQube. Returns whether analysis data exists and guidance if not.', {
    projectKey,
  }, async ({ projectKey }) => {
    const key = resolveProjectKey({ projectKey });

    const health = await sonarCheckServer();
    if (!health.reachable) {
      return { status: 'UNREACHABLE', message: `Cannot reach SonarQube at ${getHostUrl()}.`, hint: health.hint };
    }

    const proj = await sonarGet(`/api/projects/search?q=${encode(key)}&ps=1`).catch(() => null);
    if (!proj?.components?.length) {
      return { status: 'NOT_FOUND', message: `Project "${key}" does not exist on ${getHostUrl()}. Run sonar-scanner first:\n\n  sonar-scanner -Dsonar.login=squ_...\n\nOr create it via the SonarQube UI, then run analysis.` };
    }
    const analyses = await sonarGet(`/api/project_analyses/search?project=${encode(key)}&ps=1`).catch(() => null);
    if (!analyses?.analyses?.length) {
      return { status: 'NOT_ANALYZED', message: `Project "${key}" exists but has no analysis data. Run sonar-scanner:\n\n  sonar-scanner -Dsonar.login=squ_...` };
    }
    const last = analyses.analyses[0];
    return { status: 'ANALYZED', lastAnalysis: last.date, projectUrl: `${getHostUrl()}/dashboard?id=${encode(key)}`, message: `Project "${key}" was last analyzed on ${last.date}.` };
  }),

  tool('sonar_set_issue_status', 'Transition a SonarQube issue status: mark as confirmed, false positive, wontfix, or resolved. Use after reviewing an issue to track intentional decisions.', {
    issueKey: z.string().describe('Issue key (e.g. the "key" field from sonar_issues)'),
    transition: z.enum(['confirm', 'unconfirm', 'reopen', 'resolve', 'falsepositive', 'wontfix']).describe('Transition to apply'),
  }, async ({ issueKey, transition }) => {
    if (!issueKey) throw new Error('issueKey is required');
    const body = new URLSearchParams({ issue: issueKey, transition }).toString();
    return sonarPost('/api/issues/do_transition', body);
  }),

  tool('sonar_raw', 'Escape hatch — call any SonarQube Web API GET endpoint directly. Path must start with /api/. Returns the raw JSON response.', {
    path: z.string().describe('API path starting with /api/ (e.g. /api/system/health)'),
  }, async ({ path }) => {
    if (!path?.startsWith('/')) throw new Error('path must start with /');
    return sonarGet(path);
  }),

  tool('sonar_setup_scanner', 'Install sonar-scanner as a devDependency in the project. Detects pnpm, yarn, or npm from lock files.', {
    cwd: z.string().optional().describe('Project root directory (defaults to current working directory)'),
  }, async ({ cwd }) => {
    const dir = cwd || process.cwd();
    const hasPnpm = existsSync(join(dir, 'pnpm-lock.yaml'));
    const hasYarn = existsSync(join(dir, 'yarn.lock'));

    let cmd, args;
    if (hasPnpm) {
      cmd = 'pnpm';
      args = ['add', '-D', 'sonar-scanner'];
    } else if (hasYarn) {
      cmd = 'yarn';
      args = ['add', '-D', 'sonar-scanner'];
    } else {
      cmd = 'npm';
      args = ['install', '--save-dev', 'sonar-scanner'];
    }

    const result = execSync(`${cmd} ${args.join(' ')}`, { cwd: dir, encoding: 'utf8', timeout: 120000 });
    return { installed: true, packageManager: cmd, output: result };
  }),

  tool('sonar_run_analysis', 'Run sonar-scanner analysis on the project. Auto-creates sonar-project.properties if missing using provided or default values.', {
    cwd: z.string().optional().describe('Project root directory (defaults to current working directory)'),
    token: z.string().optional().describe('SonarQube token (defaults to SONARQUBE_TOKEN env var)'),
    projectKey: z.string().optional().describe('Project key (overrides sonar.projectKey in properties, or creates one)'),
    host: z.string().optional().describe('SonarQube server URL (defaults to SONARQUBE_URL env var)'),
    sources: z.string().optional().describe('Source directories (default: src)'),
  }, async ({ cwd, token, projectKey, host, sources }) => {
    const dir = cwd || process.cwd();
    const propsPath = join(dir, 'sonar-project.properties');

    const auth = token || process.env.SONARQUBE_TOKEN || '';
    if (!auth) {
      throw new Error('No token provided. Pass token argument or set SONARQUBE_TOKEN env var.');
    }

    if (!existsSync(propsPath)) {
      const pk = projectKey || process.env.SONARQUBE_PROJECT || 'my_project';
      const h = host || process.env.SONARQUBE_URL || 'http://localhost:9000';
      const src = sources || 'src';
      writeFileSync(propsPath, `sonar.host.url=${h}\nsonar.projectKey=${pk}\nsonar.sources=${src}\n`);
    }

    const scannerPath = join(dir, 'node_modules', '.bin', 'sonar-scanner');
    const scanner = existsSync(scannerPath) ? scannerPath : 'sonar-scanner';

    const args = [`-Dsonar.token=${auth}`];
    if (projectKey) args.push(`-Dsonar.projectKey=${projectKey}`);

    const result = execSync(`${scanner} ${args.join(' ')}`, { cwd: dir, encoding: 'utf8', timeout: 300000 });
    return { success: true, output: result };
  }),

  tool('sonar_list_pull_requests', 'List pull requests for a project with their branch, title, analysis status, and quality gate status. Note: requires SonarQube Developer Edition or above.', {
    projectKey,
  }, async ({ projectKey }) => {
    const key = resolveProjectKey({ projectKey });
    const data = await sonarGet(`/api/project_pull_requests/list?project=${encode(key)}`);
    if (!data.pullRequests) return [];
    return data.pullRequests.map(({ key: k, branch, title, analysisDate, status, url }) => ({
      key: k, branch, title, analysisDate, status: status?.qualityGateStatus, url,
    }));
  }),

  tool('sonar_file_coverage_details', 'Get detailed coverage info for a specific file: line/condition coverage %, uncovered lines and conditions, and total lines/conditions to cover.', {
    key: componentKey,
  }, async ({ key }) => {
    requireKey(key);
    return sonarGet(`/api/measures/component?component=${encode(key)}&metricKeys=coverage,uncovered_lines,uncovered_conditions,lines_to_cover,conditions_to_cover,branch_coverage`);
  }),

  tool('sonar_list_branches', 'List branches for a project with their analysis dates and quality gate status.', {
    projectKey,
  }, async ({ projectKey }) => {
    const key = resolveProjectKey({ projectKey });
    const data = await sonarGet(`/api/project_branches/list?project=${encode(key)}`);
    return (data.branches || []).map(({ name, isMain, analysisDate, status }) => ({
      name, isMain, analysisDate, status: status?.qualityGateStatus,
    }));
  }),

  tool('sonar_coverage_files', 'List files in a project with coverage below a threshold. Useful to find under-tested files.', {
    projectKey,
    threshold: z.number().optional().describe('Coverage % threshold (default 80). Files below this value are returned.'),
  }, measureSearch('coverage', 'coverage', 80, false)),

  tool('sonar_search_duplicated_files', 'Find files in a project with duplication density above a threshold. Complements sonar_measures duplication metric.', {
    projectKey,
    threshold: z.number().optional().describe('Duplication density % threshold (default 3). Files above this value are returned.'),
  }, measureSearch('duplicated_lines_density', 'duplicatedLinesDensity', 3, true)),

  tool('sonar_metrics_history', 'Get metric history over time for a project (e.g. coverage trajectory). Useful for tracking regressions and trends.', {
    projectKey,
    metric: z.string().describe('Metric key (e.g. coverage, bugs, code_smells). Use sonar_search_metrics to list available metrics.'),
    days: z.number().optional().describe('Number of days of history to fetch (default 30)'),
  }, async ({ projectKey, metric, days }) => {
    const key = resolveProjectKey({ projectKey });
    const d = Math.min(Math.max(Number(days) || 30, 1), 365);
    const from = new Date(Date.now() - d * 86400000).toISOString().split('T')[0];
    return sonarGet(`/api/measures/search_history?component=${encode(key)}&metrics=${encode(metric)}&from=${from}`);
  }),

  tool('sonar_worst_metrics', 'Find files with the worst metric values across a project — lowest coverage, most duplicated lines, highest complexity. Helps identify hotspots that need attention.', {
    projectKey,
    metrics: z.string().optional().describe('Comma-separated metric keys (default: coverage,duplicated_lines_density,cognitive_complexity)'),
    limit: z.number().optional().describe('Max results per metric (default 10, max 50)'),
  }, async ({ projectKey, metrics, limit }) => {
    const key = resolveProjectKey({ projectKey });
    const metricKeys = metrics || 'coverage,duplicated_lines_density,cognitive_complexity';
    const max = Math.min(Number(limit) || 10, 50);
    const data = await sonarGet(`/api/measures/search?projectKeys=${encode(key)}&metricKeys=${encode(metricKeys)}&ps=500`);
    const grouped = {};
    for (const m of data.measures || []) {
      if (m.component === key) continue;
      const file = m.component.split(':').pop();
      if (!grouped[file]) grouped[file] = {};
      grouped[file][m.metric] = Number.parseFloat(m.value);
    }
    const results = {};
    for (const metric of metricKeys.split(',')) {
      const descending = ['duplicated_lines_density', 'cognitive_complexity', 'complexity', 'violations'];
      const sign = descending.includes(metric) ? -1 : 1;
      const entries = Object.entries(grouped)
        .filter(([, v]) => v[metric] !== undefined)
        .sort((a, b) => sign * (a[1][metric] - b[1][metric]))
        .slice(0, max)
        .map(([path, v]) => ({ path, value: v[metric] }));
      if (entries.length) results[metric] = entries;
      else results[metric] = [];
    }
    return { projectKey: key, metrics: metricKeys.split(','), results };
  }),

  tool('sonar_duplications', 'Get duplication blocks for a specific file. Returns duplicate blocks grouped by file with line ranges.', {
    key: componentKey,
  }, async ({ key }) => {
    requireKey(key);
    return sonarGet(`/api/duplications/show?key=${encode(key)}`);
  }),
];

export const TOOL_CONFIGS = filterTools(ALL_TOOLS);
