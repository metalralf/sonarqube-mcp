// @ts-check
import { execSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { tool, projectKey, componentKey, maxResults, encode, requireKey, componentParams, measureSearch, parseIssueFacets, getHostUrl, filterTools, sonarGet, sonarPost, sonarCheckServer, orgQuery, resolveProjectKey, maybeTruncated, detectLanguage, buildSonarProps, hasDocker, resolveDocker, getDockerImage, getDockerFlags, getScannerTimeout, getDockerMountPath, getSourceContext, LANG_CONFIGS } from './helpers.mjs';

const ALL_TOOLS = [
  tool('sonar_projects_create', 'Create a new project in SonarQube. Requires admin permissions.', {
    projectKey: z.string().describe('Key for the new project (e.g. my_new_project)'),
    name: z.string().optional().describe('Display name (defaults to projectKey)'),
  }, async ({ projectKey: pk, name }) => {
    const params = new URLSearchParams({ project: pk, name: name || pk });
    return sonarPost('/api/projects/create', params.toString());
  }),

  tool('sonar_project_details', 'Get detailed information about a project.', {
    projectKey,
  }, async ({ projectKey: pk }) => {
    const key = resolveProjectKey({ projectKey: pk });
    const [comp, analyses] = await Promise.all([
      sonarGet(`/api/components/show?component=${encode(key)}`).catch(() => null),
      sonarGet(`/api/project_analyses/search?project=${encode(key)}&ps=1`).catch(() => null),
    ]);
    return { key, name: comp?.component?.name || null, description: comp?.component?.description || null, qualifier: comp?.component?.qualifier || null, analysisDate: analyses?.analyses?.[0]?.date || null, projectUrl: `${getHostUrl()}/dashboard?id=${encode(key)}` };
  }),

  tool('sonar_search_projects', 'Search/find SonarQube project keys.', {
    query: z.string().optional().describe('Optional search query to filter projects by name/key'),
    limit: maxResults,
  }, async ({ query, limit }) => {
    const params = new URLSearchParams({ ps: String(Math.min(Number(limit) || 50, 500)) });
    if (query) params.set('q', query);
    return maybeTruncated(await sonarGet(`/api/projects/search?${params.toString()}${orgQuery()}`));
  }),

  tool('sonar_summary', 'Get aggregated project health: QG, metrics, issues, branches.', {
    projectKey,
  }, async ({ projectKey: pk }) => {
    const key = resolveProjectKey({ projectKey: pk });
    const [quality, measures, issueData, branches] = await Promise.all([
      sonarGet(`/api/qualitygates/project_status?projectKey=${encode(key)}`).catch(() => null),
      sonarGet(`/api/measures/component?component=${encode(key)}&metricKeys=bugs,vulnerabilities,code_smells,coverage,duplicated_lines_density,ncloc,reliability_rating,security_rating,sqale_rating`).catch(() => null),
      sonarGet(`/api/issues/search?componentKeys=${encode(key)}&ps=1&resolved=false&facets=severities,types`).catch(() => null),
      sonarGet(`/api/project_branches/list?project=${encode(key)}`).catch(() => null),
    ]);
    const metricMap = {};
    for (const m of measures?.component?.measures || []) metricMap[m.metric] = m.value;
    const { bySeverity, byType } = parseIssueFacets(issueData);
    return {
      projectKey: key,
      qualityGate: quality?.projectStatus?.status || 'NONE',
      metrics: metricMap,
      issues: { total: issueData?.total || 0, by_severity: bySeverity, by_type: byType },
      branches: (branches?.branches || []).map((b) => ({ name: b.name, isMain: b.isMain, analysisDate: b.analysisDate, qg: b.status?.qualityGateStatus })),
    };
  }),

  tool('sonar_analysis_status', 'Check if a project has been analyzed.', {
    projectKey,
  }, async ({ projectKey: pk }) => {
    const key = resolveProjectKey({ projectKey: pk });
    const health = await sonarCheckServer();
    if (!health.reachable) return { status: 'UNREACHABLE', message: `Cannot reach SonarQube at ${getHostUrl()}.`, hint: health.hint };
    const proj = await sonarGet(`/api/projects/search?q=${encode(key)}&ps=1`).catch(() => null);
    if (!proj?.components?.length) return { status: 'NOT_FOUND', message: `Project "${key}" does not exist.` };
    const analyses = await sonarGet(`/api/project_analyses/search?project=${encode(key)}&ps=1`).catch(() => null);
    if (!analyses?.analyses?.length) return { status: 'NOT_ANALYZED', message: `Project "${key}" exists but has no analysis data.` };
    const last = analyses.analyses[0];
    return { status: 'ANALYZED', lastAnalysis: last.date, projectUrl: `${getHostUrl()}/dashboard?id=${encode(key)}` };
  }),

  tool('sonar_ping', 'Ping server health — returns pong + status.', {
  }, async () => {
    const health = await sonarCheckServer();
    if (!health.reachable) return { status: 'UNREACHABLE', message: `Cannot reach SonarQube at ${getHostUrl()}`, hint: health.hint };
    return { pong: true, health: health.health || 'unknown' };
  }),

  tool('sonar_raw', 'Escape hatch — call any GET endpoint.',
    { path: z.string().describe('API path starting with /api/ (e.g. /api/system/health)') },
  async ({ path }) => {
    if (!path?.startsWith('/')) throw new Error('path must start with /');
    try { return await sonarGet(path); } catch (e) {
      const msg = (/** @type {Error} */ (e)).message;
      const hint = msg.includes('400') || msg.includes('404') ? `\n\nTip: sonar_raw calls GET ${path}. Missing query params? Try:\n  sonar_raw path=/api/...\n  sonar_raw path=/api/measures/component?component=my_project&metricKeys=coverage` : '';
      throw new Error(msg + hint);
    }
  }),

  tool('sonar_quality_gate', 'Get QG status with failing conditions.', {
    projectKey,
  }, async ({ projectKey: pk }) => sonarGet(`/api/qualitygates/project_status?projectKey=${encode(resolveProjectKey({ projectKey: pk }))}`)),

  tool('sonar_list_quality_gates', 'List all quality gates.', {
  }, async () => sonarGet('/api/qualitygates/list')),

  tool('sonar_measures', 'Get metrics: bugs, smells, coverage, ratings, ncloc, dup.', {
    projectKey,
    metricKeys: z.string().optional().describe('Comma-separated metric keys'),
  }, async ({ projectKey: pk, metricKeys }) => {
    const key = resolveProjectKey({ projectKey: pk });
    const keys = metricKeys || 'bugs,vulnerabilities,code_smells,security_hotspots,coverage,duplicated_lines_density,ncloc,reliability_rating,security_rating,sqale_rating';
    return sonarGet(`/api/measures/component?component=${encode(key)}&metricKeys=${encode(keys)}`);
  }),

  tool('sonar_search_metrics', 'Browse available metric definitions.', {
    query: z.string().optional().describe('Search query'),
    limit: maxResults,
  }, async ({ query, limit }) => {
    const params = new URLSearchParams({ ps: String(Math.min(Number(limit) || 50, 500)) });
    if (query) params.set('q', query);
    return sonarGet(`/api/metrics/search?${params.toString()}`);
  }),

  tool('sonar_metrics_history', 'Get metric history over time (e.g. coverage trajectory).', {
    projectKey,
    metric: z.string().describe('Metric key (use sonar_search_metrics to list)'),
    days: z.number().optional().describe('Days of history (default 30)'),
  }, async ({ projectKey, metric, days }) => {
    const key = resolveProjectKey({ projectKey });
    const d = Math.min(Math.max(Number(days) || 30, 1), 365);
    const from = new Date(Date.now() - d * 86400000).toISOString().split('T')[0];
    return sonarGet(`/api/measures/search_history?component=${encode(key)}&metrics=${encode(metric)}&from=${from}`);
  }),

  tool('sonar_worst_metrics', 'Find files with worst metric values.', {
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
    let anyData = false;
    for (const metric of metricKeys.split(',')) {
      const descending = ['duplicated_lines_density', 'cognitive_complexity', 'complexity', 'violations'];
      const sign = descending.includes(metric) ? -1 : 1;
      const entries = Object.entries(grouped).filter(([, v]) => v[metric] !== undefined).sort((a, b) => sign * (a[1][metric] - b[1][metric])).slice(0, max).map(([path, v]) => ({ path, value: v[metric] }));
      if (entries.length) { results[metric] = entries; anyData = true; } else results[metric] = [];
    }
    const out = { projectKey: key, metrics: metricKeys.split(','), results };
    if (!anyData) out._note = 'No file-level metric data found. Files may lack coverage or measurement data.';
    return out;
  }),

  tool('sonar_issues', 'Search open issues sorted by severity.', {
    projectKey,
    severities: z.union([z.string(), z.array(z.string())]).optional().describe('Comma-separated or array: INFO,MINOR,MAJOR,CRITICAL,BLOCKER'),
    types: z.union([z.string(), z.array(z.string())]).optional().describe('Comma-separated or array: CODE_SMELL,BUG,VULNERABILITY,SECURITY_HOTSPOT'),
    resolved: z.boolean().optional().describe('Include resolved issues'),
    statuses: z.string().optional().describe('Comma-separated statuses: OPEN,CONFIRMED,REOPENED,RESOLVED,CLOSED'),
    limit: maxResults,
    compact: z.boolean().optional().describe('Strip verbose fields for token efficiency'),
    include_source: z.boolean().optional().describe('Embed source lines for each issue'),
  }, async ({ projectKey, severities, types, resolved, statuses, limit, compact, include_source }) => {
    const key = resolveProjectKey({ projectKey });
    const params = new URLSearchParams({ componentKeys: key, ps: String(Math.min(Number(limit) || 30, 500)), s: 'SEVERITY', asc: 'false' });
    if (statuses) params.set('statuses', statuses);
    else if (!resolved) params.set('resolved', 'false');
    if (severities) params.set('severities', Array.isArray(severities) ? severities.join(',') : severities);
    if (types) params.set('types', Array.isArray(types) ? types.join(',') : types);
    const data = await sonarGet(`/api/issues/search?${params.toString()}`);
    maybeTruncated(data);
    if (compact && data.issues) data.issues = data.issues.map(({ flows, textRange, messageFormattings, codeVariants, internalTags, ...rest }) => rest);
    if (include_source && data.issues) {
      data.issues = await Promise.all(data.issues.map(async (issue) => {
        if (!issue.component || !issue.line) return issue;
        try { const ctx = getSourceContext(); const src = await sonarGet(`/api/sources/lines?key=${encode(issue.component)}&from=${Math.max(1, issue.line - ctx)}&to=${issue.line + ctx}`); return { ...issue, _source: src }; }
        catch { return issue; }
      }));
    }
    return data;
  }),

  tool('sonar_issues_summary', 'Aggregated issue counts by severity and type.', {
    projectKey,
    resolved: z.boolean().optional().describe('Include resolved issues'),
  }, async ({ projectKey: pk, resolved }) => {
    const key = resolveProjectKey({ projectKey: pk });
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

  tool('sonar_new_issues', 'Issues created since the last analysis.', {
    projectKey,
    severities: z.union([z.string(), z.array(z.string())]).optional().describe('Comma-separated or array'),
    types: z.union([z.string(), z.array(z.string())]).optional().describe('Comma-separated or array'),
    limit: maxResults,
    compact: z.boolean().optional().describe('Strip verbose fields'),
  }, async ({ projectKey: pk, severities, types, limit, compact }) => {
    const key = resolveProjectKey({ projectKey: pk });
    const analyses = await sonarGet(`/api/project_analyses/search?project=${encode(key)}&ps=2`).catch(() => null);
    const createdAfter = analyses?.analyses?.[1]?.date || analyses?.analyses?.[0]?.date;
    if (!createdAfter) return { total: 0, issues: [], message: 'No previous analysis found to compare against.' };
    const params = new URLSearchParams({ componentKeys: key, ps: String(Math.min(Number(limit) || 30, 500)), s: 'SEVERITY', asc: 'false', createdAfter });
    if (severities) params.set('severities', Array.isArray(severities) ? severities.join(',') : severities);
    if (types) params.set('types', Array.isArray(types) ? types.join(',') : types);
    const data = await sonarGet(`/api/issues/search?${params.toString()}`);
    maybeTruncated(data);
    if (compact && data.issues) data.issues = data.issues.map(({ flows, textRange, messageFormattings, codeVariants, internalTags, ...rest }) => rest);
    return data;
  }),

  tool('sonar_set_issue_status', 'Mark issue as confirmed, false positive, wontfix, resolved.', {
    issueKey: z.string().describe('Issue key'),
    transition: z.enum(['confirm', 'unconfirm', 'reopen', 'resolve', 'falsepositive', 'wontfix']).describe('Transition'),
  }, async ({ issueKey, transition }) => {
    if (!issueKey) throw new Error('issueKey is required');
    return sonarPost('/api/issues/do_transition', new URLSearchParams({ issue: issueKey, transition }).toString());
  }),

  tool('sonar_issues_bulk_transition', 'Transition multiple issues at once.', {
    issueKeys: z.array(z.string()).describe('Array of issue keys'),
    transition: z.enum(['confirm', 'unconfirm', 'reopen', 'resolve', 'falsepositive', 'wontfix']).describe('Transition for all'),
  }, async ({ issueKeys, transition }) => {
    if (!issueKeys?.length) throw new Error('issueKeys array is required');
    return sonarPost('/api/issues/bulk_change', new URLSearchParams({ issues: issueKeys.join(','), transition }).toString());
  }),

  tool('sonar_hotspots', 'Search security hotspots (needs squ_ token).', {
    projectKey,
    status: z.string().optional().describe('TO_REVIEW or REVIEWED'),
    limit: z.number().optional().describe('Max results (default 30, max 500)'),
  }, async ({ projectKey, status, limit }) => {
    const token = process.env.SONARQUBE_TOKEN || '';
    if (token && !token.startsWith('squ_')) throw new Error('Hotspots require a User token (squ_ prefix). Current token starts with "' + token.slice(0, 4) + '...".');
    const key = resolveProjectKey({ projectKey });
    return maybeTruncated(await sonarGet(`/api/hotspots/search?projectKey=${encode(key)}&status=${status || 'TO_REVIEW'}&ps=${String(Math.min(Number(limit) || 30, 500))}`));
  }),

  tool('sonar_hotspot_details', 'Full hotspot details: rule, code context, flows, comments.', {
    hotspotKey: z.string().describe('Hotspot key'),
  }, async ({ hotspotKey }) => {
    if (!hotspotKey) throw new Error('hotspotKey is required');
    return sonarGet(`/api/hotspots/show?hotspot=${encode(hotspotKey)}`);
  }),

  tool('sonar_change_hotspot_status', 'Review a hotspot: REVIEWED with resolution or TO_REVIEW.', {
    hotspotKey: z.string().describe('Hotspot key'),
    status: z.enum(['TO_REVIEW', 'REVIEWED']).describe('New status'),
    resolution: z.enum(['FIXED', 'SAFE', 'ACKNOWLEDGED']).optional().describe('Required when REVIEWED'),
    comment: z.string().optional().describe('Optional comment'),
  }, async ({ hotspotKey, status, resolution, comment }) => {
    if (!hotspotKey) throw new Error('hotspotKey is required');
    const body = new URLSearchParams({ hotspot: hotspotKey, status });
    if (resolution) body.set('resolution', resolution);
    if (comment) body.set('comment', comment);
    return sonarPost('/api/hotspots/change_status', body.toString());
  }),

  tool('sonar_rule', 'Explain a rule.', {
    ruleKey: z.string().describe('Rule key (e.g. typescript:S6544)'),
  }, async ({ ruleKey }) => {
    if (!ruleKey) throw new Error('ruleKey is required');
    return sonarGet(`/api/rules/show?key=${encode(ruleKey)}`);
  }),

  tool('sonar_scm_info', 'Git blame per line: author, date, revision.', {
    key: componentKey,
    from: z.number().optional().describe('Starting line'),
    to: z.number().optional().describe('Ending line'),
  }, async ({ key, from, to }) => {
    requireKey(key);
    return sonarGet(`/api/sources/scm?${componentParams(key, from, to).toString()}`);
  }),

  tool('sonar_source', 'View source lines. Optional highlight_uncovered marks untested lines.', {
    key: componentKey,
    from: z.number().optional().describe('Starting line'),
    to: z.number().optional().describe('Ending line'),
    highlight_uncovered: z.boolean().optional().describe('Mark lines with 0 test hits'),
  }, async ({ key, from, to, highlight_uncovered }) => {
    requireKey(key);
    const data = await sonarGet(`/api/sources/lines?${componentParams(key, from, to).toString()}`);
    if (highlight_uncovered && data.sources) data.sources = data.sources.map((l) => ({ ...l, _uncovered: l.utLineHits === 0 }));
    return data;
  }),

  tool('sonar_list_webhooks', 'List webhooks for a project.', {
    projectKey: z.string().optional().describe('Project key. Omit for global webhooks.'),
  }, async ({ projectKey: pk }) => {
    const params = new URLSearchParams();
    if (pk) params.set('project', pk);
    else { const def = resolveProjectKey({}); if (def) params.set('project', def); }
    return sonarGet(`/api/webhooks/list?${params.toString()}`);
  }),

  tool('sonar_list_languages', 'List all supported languages.', {
  }, async () => { const d = await sonarGet('/api/languages/list'); return d.languages || []; }),

  tool('sonar_setup_scanner', 'Install sonar-scanner (detects Docker first, falls back to pnpm/yarn/npm).', {
    cwd: z.string().optional().describe('Project root'),
  }, async ({ cwd }) => {
    const dir = cwd || process.cwd();
    if (hasDocker()) return { installed: true, packageManager: 'docker', output: 'Docker available — scanner will run via sonarsource/sonar-scanner-cli' };
    const hasPnpm = existsSync(join(dir, 'pnpm-lock.yaml'));
    const hasYarn = existsSync(join(dir, 'yarn.lock'));
    let cmd, args;
    if (hasPnpm) { cmd = 'pnpm'; args = ['add', '-D', 'sonar-scanner']; }
    else if (hasYarn) { cmd = 'yarn'; args = ['add', '-D', 'sonar-scanner']; }
    else { cmd = 'npm'; args = ['install', '--save-dev', 'sonar-scanner']; }
    return { installed: true, packageManager: cmd, output: execSync(`${cmd} ${args.join(' ')}`, { cwd: dir, encoding: 'utf8', timeout: getScannerTimeout() }) };
  }),

  tool('sonar_run_analysis', 'Run sonar-scanner analysis (auto-detects language, prefers Docker, falls back to local sonar-scanner via npm/PATH).', {
    cwd: z.string().optional().describe('Project root'),
    token: z.string().optional().describe('Token'),
    projectKey: z.string().optional().describe('Override project key'),
    host: z.string().optional().describe('SonarQube URL'),
    sources: z.string().optional().describe('Source dirs'),
    language: z.enum(['python', 'javascript', 'typescript', 'java', 'kotlin', 'go', 'csharp']).optional().describe('Project language — auto-detected if omitted'),
    scanner: z.enum(['auto', 'docker', 'local']).optional().describe('Scanner method: auto (default — Docker first, fallback to npm/PATH sonar-scanner), docker, or local'),
  }, async ({ cwd, token, projectKey, host, sources, language, scanner: scannerMethod }) => {
    const dir = cwd || process.cwd();
    const auth = token || process.env.SONARQUBE_TOKEN || '';
    if (!auth) throw new Error('No token provided.');
    const lang = language || detectLanguage(dir);
    const useDocker = scannerMethod === 'docker' || (scannerMethod !== 'local' && hasDocker());
    if (scannerMethod === 'docker' && !useDocker) throw new Error('Docker scanner requested but Docker is not available.');
    const hostUrl = host || process.env.SONARQUBE_URL || 'http://localhost:9000';
    const langCfg = lang && LANG_CONFIGS[lang];
    const src = sources || langCfg?.sources || 'src';
    const propsPath = join(dir, 'sonar-project.properties');

    if (!existsSync(propsPath)) {
      writeFileSync(propsPath, buildSonarProps(projectKey || process.env.SONARQUBE_PROJECT || 'my_project', hostUrl, src, lang));
    }

    const buildLogs = [];
    if (langCfg?.binaries && !existsSync(join(dir, langCfg.binaries))) {
      const hasGradle = existsSync(join(dir, 'build.gradle')) || existsSync(join(dir, 'build.gradle.kts'));
      const hasMaven = existsSync(join(dir, 'pom.xml'));
      if (hasGradle) {
        const gradleCmd = existsSync(join(dir, 'gradlew')) ? './gradlew' : 'gradle';
        buildLogs.push(`Building with ${gradleCmd}...`);
        execSync(`${gradleCmd} build -x test`, { cwd: dir, encoding: 'utf8', timeout: 300000 });
      } else if (hasMaven) {
        const mvnCmd = existsSync(join(dir, 'mvnw')) ? './mvnw' : 'mvn';
        buildLogs.push(`Building with ${mvnCmd}...`);
        execSync(`${mvnCmd} compile -DskipTests`, { cwd: dir, encoding: 'utf8', timeout: 300000 });
      }
    }

    let output, scannerType;
    const baseArgs = [];
    if (auth) baseArgs.push(`-Dsonar.token=${auth}`);
    if (projectKey) baseArgs.push(`-Dsonar.projectKey=${projectKey}`);

    const dedupWarnings = new Set();

    if (useDocker) {
      scannerType = 'docker';
      const dockerFlags = getDockerFlags();
      try {
        output = execSync(`${resolveDocker()} run --rm ${dockerFlags ? dockerFlags + ' ' : ''}-v "${dir}:${getDockerMountPath()}" ${getDockerImage()} ${baseArgs.join(' ')}`, { encoding: 'utf8', timeout: getScannerTimeout() });
      } catch (e) {
        const msg = /** @type {Error} */ (e).message;
        if (msg.includes("can't be indexed twice")) throw new Error('Your sonar.sources and sonar.tests paths overlap. Set sonar.sources=src/main (or the correct source directory) and sonar.tests=src/test.');
        if (msg.includes('No files nor directories matching') || msg.includes('sonar.java.binaries')) throw new Error('No compiled class files found. Build the project first (e.g. ./gradlew build) or set sonar.java.binaries to the correct path.');
        if (msg.includes('Missing blame information')) dedupWarnings.add('scm');
        if (msg.includes('No coverage')) dedupWarnings.add('coverage');
        throw e;
      }
    } else {
      const scannerBin = existsSync(join(dir, 'node_modules', '.bin', 'sonar-scanner')) ? join(dir, 'node_modules', '.bin', 'sonar-scanner') : 'sonar-scanner';
      scannerType = 'local';
      try {
        output = execSync(`${scannerBin} ${baseArgs.join(' ')}`, { cwd: dir, encoding: 'utf8', timeout: getScannerTimeout() });
      } catch (e) {
        const msg = /** @type {Error} */ (e).message;
        if (msg.includes("can't be indexed twice")) throw new Error('Your sonar.sources and sonar.tests paths overlap. Set sonar.sources=src/main (or the correct source directory) and sonar.tests=src/test.');
        if (msg.includes('No files nor directories matching') || msg.includes('sonar.java.binaries')) throw new Error('No compiled class files found. Build the project first (e.g. ./gradlew build) or set sonar.java.binaries to the correct path.');
        throw e;
      }
    }

    const hints = [];
    if (output.includes('No coverage')) hints.push('Coverage report was not found. Run tests with coverage enabled before analysis (e.g. ./gradlew test jacocoTestReport).');
    if (output.includes('Missing blame information') && lang === 'java') hints.push('SCM blame info is missing. Run analysis from the project root directory with git history.');

    const ceMatch = output.match(/api\/ce\/task\?id=([a-f0-9-]+)/);
    const ceTaskUrl = ceMatch ? `${hostUrl}/api/ce/task?id=${ceMatch[1]}` : undefined;

    const pk = projectKey || process.env.SONARQUBE_PROJECT || 'my_project';

    return {
      success: true,
      scanner: scannerType,
      language: lang || 'unknown',
      dashboardUrl: `${hostUrl}/dashboard?id=${encodeURIComponent(pk)}`,
      ceTaskUrl,
      buildPerformed: buildLogs.length > 0,
      hints: hints.length ? hints : undefined,
      output,
    };
  }),

  tool('sonar_list_pull_requests', 'List PRs (requires Developer Edition+).', {
    projectKey,
  }, async ({ projectKey: pk }) => {
    const key = resolveProjectKey({ projectKey: pk });
    const data = await sonarGet(`/api/project_pull_requests/list?project=${encode(key)}`);
    if (!data.pullRequests) return [];
    return data.pullRequests.map(({ key: k, branch, title, analysisDate, status, url }) => ({ key: k, branch, title, analysisDate, status: status?.qualityGateStatus, url }));
  }),

  tool('sonar_file_coverage_details', 'Line/condition coverage % for a file.', {
    key: componentKey,
  }, async ({ key }) => {
    requireKey(key);
    return sonarGet(`/api/measures/component?component=${encode(key)}&metricKeys=coverage,uncovered_lines,uncovered_conditions,lines_to_cover,conditions_to_cover,branch_coverage`);
  }),

  tool('sonar_list_branches', 'List branches with analysis dates and QG status.', {
    projectKey,
  }, async ({ projectKey: pk }) => {
    const key = resolveProjectKey({ projectKey: pk });
    const data = await sonarGet(`/api/project_branches/list?project=${encode(key)}`);
    return (data.branches || []).map(({ name, isMain, analysisDate, status }) => ({ name, isMain, analysisDate, status: status?.qualityGateStatus }));
  }),

  tool('sonar_coverage_files', 'Find files with coverage below threshold.', {
    projectKey,
    threshold: z.number().optional().describe('Coverage % threshold (default 80)'),
  }, measureSearch('coverage', 'coverage', 80, false)),

  tool('sonar_search_duplicated_files', 'Find files with duplication above threshold.', {
    projectKey,
    threshold: z.number().optional().describe('Duplication % threshold (default 3)'),
  }, measureSearch('duplicated_lines_density', 'duplicatedLinesDensity', 3, true)),

  tool('sonar_duplications', 'Get duplication blocks for a file.', {
    key: componentKey,
  }, async ({ key }) => {
    requireKey(key);
    return sonarGet(`/api/duplications/show?key=${encode(key)}`);
  }),
];

/** @type {Array<{ name: string; description: string; schema: Record<string, import('zod').ZodTypeAny>; handler: Function }>} */
export const TOOL_CONFIGS = filterTools(ALL_TOOLS);
