// @ts-check
import { execSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import {
  addBranchParams,
  autoBuild,
  branch,
  buildScannerArgs,
  buildScannerHints,
  buildSonarProps,
  componentKey,
  componentParams,
  detectLanguage,
  detectProjectConfig,
  encode,
  extractCeTaskUrl,
  filterTools,
  getHostUrl,
  getScannerTimeout,
  getSourceContext,
  hasDocker,
  LANG_CONFIGS,
  mapScannerError,
  maxResults,
  maybeTruncated,
  measureSearch,
  orgQuery,
  parseIssueFacets,
  pollCeTask,
  projectKey,
  pullRequest,
  requireKey,
  resolveProjectKey,
  runScanner,
  sonarCheckServer,
  sonarGet,
  sonarPost,
  tool,
} from './helpers.mjs';

/**
 * Execute a single tool call for sonar_call_multiple.
 * @param {{ name: string, args?: Record<string, any> }} call
 * @param {number} order — 1-based position in the original input
 * @returns {Promise<{ result: { order: number, name: string, ok: boolean, result?: any, error?: string }, ok: boolean }>}
 */
const executeCall = async (call, order) => {
  const name = call.name;
  const args = call.args || {};
  if (name === 'sonar_call_multiple') {
    return {
      result: {
        order,
        name,
        ok: false,
        error: 'Recursive sonar_call_multiple is not allowed',
      },
      ok: false,
    };
  }
  const t = ALL_TOOLS.find((x) => x.name === name);
  if (!t) {
    return {
      result: { order, name, ok: false, error: `Unknown tool: ${name}` },
      ok: false,
    };
  }
  try {
    const result = await t.handler(args);
    return { result: { order, name, ok: true, result }, ok: true };
  } catch (e) {
    return {
      result: {
        order,
        name,
        ok: false,
        error: /** @type {Error} */ (e).message,
      },
      ok: false,
    };
  }
};

const ALL_TOOLS = [
  tool(
    'sonar_projects_create',
    'Create a new project in SonarQube. Requires admin permissions. Examples: sonar_projects_create({ projectKey: "new_project" }), sonar_projects_create({ projectKey: "new_project", name: "My Project" })',
    {
      projectKey: z
        .string()
        .describe('Key for the new project (e.g. my_new_project)'),
      name: z
        .string()
        .optional()
        .describe('Display name (defaults to projectKey)'),
    },
    async ({ projectKey: pk, name }) => {
      const params = new URLSearchParams({ project: pk, name: name || pk });
      return sonarPost('/api/projects/create', params.toString());
    },
  ),

  tool(
    'sonar_project_details',
    'Get detailed information about a project. Examples: sonar_project_details({ projectKey: "my_proj" })',
    {
      projectKey,
      branch,
      pullRequest,
    },
    async ({ projectKey: pk, branch, pullRequest }) => {
      const key = resolveProjectKey({ projectKey: pk });
      const compParams = addBranchParams(
        new URLSearchParams({ component: key }),
        { branch, pullRequest },
      );
      const analysisParams = addBranchParams(
        new URLSearchParams({ project: key, ps: '1' }),
        { branch, pullRequest },
      );
      const [comp, analyses] = await Promise.all([
        sonarGet(`/api/components/show?${compParams.toString()}`).catch(
          () => null,
        ),
        sonarGet(
          `/api/project_analyses/search?${analysisParams.toString()}`,
        ).catch(() => null),
      ]);
      return {
        key,
        name: comp?.component?.name || null,
        description: comp?.component?.description || null,
        qualifier: comp?.component?.qualifier || null,
        analysisDate: analyses?.analyses?.[0]?.date || null,
        projectUrl: `${getHostUrl()}/dashboard?id=${encode(key)}`,
      };
    },
  ),

  tool(
    'sonar_search_projects',
    'Search/find SonarQube project keys. Examples: sonar_search_projects({ query: "my" }), sonar_search_projects({ limit: 10 })',
    {
      query: z
        .string()
        .optional()
        .describe('Optional search query to filter projects by name/key'),
      limit: maxResults,
      branch,
      pullRequest,
    },
    async ({ query, limit, branch, pullRequest }) => {
      const params = addBranchParams(
        new URLSearchParams({ ps: String(Math.min(Number(limit) || 50, 500)) }),
        { branch, pullRequest },
      );
      if (query) params.set('q', query);
      return maybeTruncated(
        await sonarGet(
          `/api/projects/search?${params.toString()}${orgQuery()}`,
        ),
      );
    },
  ),

  tool(
    'sonar_summary',
    'Get aggregated project health: QG, metrics, issues, branches. Examples: sonar_summary({ projectKey: "my_proj" })',
    {
      projectKey,
      branch,
      pullRequest,
    },
    async ({ projectKey: pk, branch, pullRequest }) => {
      const key = resolveProjectKey({ projectKey: pk });
      const qgParams = addBranchParams(
        new URLSearchParams({ projectKey: key }),
        { branch, pullRequest },
      );
      const measuresParams = addBranchParams(
        new URLSearchParams({
          component: key,
          metricKeys:
            'bugs,vulnerabilities,code_smells,coverage,duplicated_lines_density,ncloc,reliability_rating,security_rating,sqale_rating',
        }),
        { branch, pullRequest },
      );
      const issuesParams = addBranchParams(
        new URLSearchParams({
          componentKeys: key,
          ps: '1',
          resolved: 'false',
          facets: 'severities,types',
        }),
        { branch, pullRequest },
      );
      const [quality, measures, issueData, branches] = await Promise.all([
        sonarGet(
          `/api/qualitygates/project_status?${qgParams.toString()}`,
        ).catch(() => null),
        sonarGet(`/api/measures/component?${measuresParams.toString()}`).catch(
          () => null,
        ),
        sonarGet(`/api/issues/search?${issuesParams.toString()}`).catch(
          () => null,
        ),
        sonarGet(`/api/project_branches/list?project=${encode(key)}`).catch(
          () => null,
        ),
      ]);
      const metricMap = {};
      for (const m of measures?.component?.measures || [])
        metricMap[m.metric] = m.value;
      const { bySeverity, byType } = parseIssueFacets(issueData);
      return {
        projectKey: key,
        qualityGate: quality?.projectStatus?.status || 'NONE',
        metrics: metricMap,
        issues: {
          total: issueData?.total || 0,
          by_severity: bySeverity,
          by_type: byType,
        },
        branches: (branches?.branches || []).map((b) => ({
          name: b.name,
          isMain: b.isMain,
          analysisDate: b.analysisDate,
          qg: b.status?.qualityGateStatus,
        })),
      };
    },
  ),

  tool(
    'sonar_analysis_status',
    'Check if a project has been analyzed. Examples: sonar_analysis_status({ projectKey: "my_proj" })',
    {
      projectKey,
      branch,
      pullRequest,
    },
    async ({ projectKey: pk, branch, pullRequest }) => {
      const key = resolveProjectKey({ projectKey: pk });
      const health = await sonarCheckServer();
      if (!health.reachable)
        return {
          status: 'UNREACHABLE',
          message: `Cannot reach SonarQube at ${getHostUrl()}.`,
          hint: health.hint,
        };
      const projParams = addBranchParams(
        new URLSearchParams({ q: key, ps: '1' }),
        { branch, pullRequest },
      );
      const proj = await sonarGet(
        `/api/projects/search?${projParams.toString()}`,
      ).catch(() => null);
      if (!proj?.components?.length)
        return {
          status: 'NOT_FOUND',
          message: `Project "${key}" does not exist.`,
        };
      const analysisParams = addBranchParams(
        new URLSearchParams({ project: key, ps: '1' }),
        { branch, pullRequest },
      );
      const analyses = await sonarGet(
        `/api/project_analyses/search?${analysisParams.toString()}`,
      ).catch(() => null);
      if (!analyses?.analyses?.length)
        return {
          status: 'NOT_ANALYZED',
          message: `Project "${key}" exists but has no analysis data.`,
        };
      const last = analyses.analyses[0];
      return {
        status: 'ANALYZED',
        lastAnalysis: last.date,
        projectUrl: `${getHostUrl()}/dashboard?id=${encode(key)}`,
      };
    },
  ),

  tool(
    'sonar_ping',
    'Ping server health — returns pong + status. Examples: sonar_ping({})',
    {},
    async () => {
      const health = await sonarCheckServer();
      if (!health.reachable)
        return {
          status: 'UNREACHABLE',
          message: `Cannot reach SonarQube at ${getHostUrl()}`,
          hint: health.hint,
        };
      return { pong: true, health: health.health || 'unknown' };
    },
  ),

  tool(
    'sonar_raw',
    'Escape hatch — call any GET endpoint. Requires appropriate token permissions for the endpoint. Examples: sonar_raw({ path: "/api/system/health" })',
    {
      path: z
        .string()
        .describe('API path starting with /api/ (e.g. /api/system/health)'),
    },
    async ({ path }) => {
      if (!path?.startsWith('/')) throw new Error('path must start with /');
      try {
        return await sonarGet(path);
      } catch (e) {
        const msg = /** @type {Error} */ (e).message;
        const hint =
          msg.includes('400') || msg.includes('404')
            ? `\n\nTip: sonar_raw calls GET ${path}. Missing query params? Try:\n  sonar_raw path=/api/...\n  sonar_raw path=/api/measures/component?component=my_project&metricKeys=coverage`
            : '';
        throw new Error(msg + hint);
      }
    },
  ),

  tool(
    'sonar_quality_gate',
    'Get QG status with failing conditions. Examples: sonar_quality_gate({ projectKey: "my_proj" })',
    {
      projectKey,
      branch,
      pullRequest,
    },
    async ({ projectKey: pk, branch, pullRequest }) => {
      const key = resolveProjectKey({ projectKey: pk });
      const params = addBranchParams(new URLSearchParams({ projectKey: key }), {
        branch,
        pullRequest,
      });
      return sonarGet(`/api/qualitygates/project_status?${params.toString()}`);
    },
  ),

  tool(
    'sonar_list_quality_gates',
    'List all quality gates. Examples: sonar_list_quality_gates({})',
    {},
    async () => sonarGet('/api/qualitygates/list'),
  ),

  tool(
    'sonar_measures',
    'Get metrics: bugs, smells, coverage, ratings, ncloc, dup. Examples: sonar_measures({ projectKey: "my_proj" }), sonar_measures({ projectKey: "my_proj", metricKeys: "coverage,bugs" })',
    {
      projectKey,
      branch,
      pullRequest,
      metricKeys: z.string().optional().describe('Comma-separated metric keys'),
    },
    async ({ projectKey: pk, branch, pullRequest, metricKeys }) => {
      const key = resolveProjectKey({ projectKey: pk });
      const keys =
        metricKeys ||
        'bugs,vulnerabilities,code_smells,security_hotspots,coverage,duplicated_lines_density,ncloc,reliability_rating,security_rating,sqale_rating';
      const params = addBranchParams(
        new URLSearchParams({ component: key, metricKeys: keys }),
        { branch, pullRequest },
      );
      return sonarGet(`/api/measures/component?${params.toString()}`);
    },
  ),

  tool(
    'sonar_search_metrics',
    'Browse available metric definitions. Examples: sonar_search_metrics({ query: "coverage" })',
    {
      query: z.string().optional().describe('Search query'),
      limit: maxResults,
    },
    async ({ query, limit }) => {
      const params = new URLSearchParams({
        ps: String(Math.min(Number(limit) || 50, 500)),
      });
      if (query) params.set('q', query);
      return sonarGet(`/api/metrics/search?${params.toString()}`);
    },
  ),

  tool(
    'sonar_metrics_history',
    'Get metric history over time (e.g. coverage trajectory). Examples: sonar_metrics_history({ projectKey: "my_proj", metric: "coverage" }), sonar_metrics_history({ projectKey: "my_proj", metric: "bugs", days: 14 })',
    {
      projectKey,
      branch,
      pullRequest,
      metric: z
        .string()
        .describe('Metric key (use sonar_search_metrics to list)'),
      days: z.number().optional().describe('Days of history (default 30)'),
    },
    async ({ projectKey, branch, pullRequest, metric, days }) => {
      const key = resolveProjectKey({ projectKey });
      const d = Math.min(Math.max(Number(days) || 30, 1), 365);
      const from = new Date(Date.now() - d * 86400000)
        .toISOString()
        .split('T')[0];
      const params = addBranchParams(
        new URLSearchParams({ component: key, metrics: metric, from }),
        { branch, pullRequest },
      );
      return sonarGet(`/api/measures/search_history?${params.toString()}`);
    },
  ),

  tool(
    'sonar_worst_metrics',
    'Find files with worst metric values. Examples: sonar_worst_metrics({ projectKey: "my_proj" }), sonar_worst_metrics({ projectKey: "my_proj", metrics: "coverage,duplicated_lines_density", limit: 5 })',
    {
      projectKey,
      branch,
      pullRequest,
      metrics: z
        .string()
        .optional()
        .describe(
          'Comma-separated metric keys (default: coverage,duplicated_lines_density,cognitive_complexity)',
        ),
      limit: z
        .number()
        .optional()
        .describe('Max results per metric (default 10, max 50)'),
    },
    async ({ projectKey, branch, pullRequest, metrics, limit }) => {
      const key = resolveProjectKey({ projectKey });
      const metricKeys =
        metrics || 'coverage,duplicated_lines_density,cognitive_complexity';
      const max = Math.min(Number(limit) || 10, 50);
      const searchParams = addBranchParams(
        new URLSearchParams({ projectKeys: key, metricKeys, ps: '500' }),
        { branch, pullRequest },
      );
      const data = await sonarGet(
        `/api/measures/search?${searchParams.toString()}`,
      );
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
        const descending = [
          'duplicated_lines_density',
          'cognitive_complexity',
          'complexity',
          'violations',
        ];
        const sign = descending.includes(metric) ? -1 : 1;
        const entries = Object.entries(grouped)
          .filter(([, v]) => v[metric] !== undefined)
          .sort((a, b) => sign * (a[1][metric] - b[1][metric]))
          .slice(0, max)
          .map(([path, v]) => ({ path, value: v[metric] }));
        if (entries.length) {
          results[metric] = entries;
          anyData = true;
        } else results[metric] = [];
      }
      const out = { projectKey: key, metrics: metricKeys.split(','), results };
      if (!anyData)
        out._note =
          'No file-level metric data found. Files may lack coverage or measurement data.';
      return out;
    },
  ),

  tool(
    'sonar_issues',
    'Search open issues sorted by severity. Examples: sonar_issues({ projectKey: "my_proj" }), sonar_issues({ projectKey: "my_proj", severities: "CRITICAL,BLOCKER", types: "BUG", compact: true })',
    {
      projectKey,
      branch,
      pullRequest,
      severities: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .describe(
          'Comma-separated or array: INFO,MINOR,MAJOR,CRITICAL,BLOCKER. Example: "CRITICAL,BLOCKER"',
        ),
      types: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .describe(
          'Comma-separated or array: CODE_SMELL,BUG,VULNERABILITY,SECURITY_HOTSPOT. Example: "BUG,CODE_SMELL"',
        ),
      resolved: z.boolean().optional().describe('Include resolved issues'),
      statuses: z
        .string()
        .optional()
        .describe(
          'Comma-separated statuses: OPEN,CONFIRMED,REOPENED,RESOLVED,CLOSED',
        ),
      limit: maxResults,
      compact: z
        .boolean()
        .optional()
        .describe('Strip verbose fields for token efficiency'),
      include_source: z
        .boolean()
        .optional()
        .describe('Embed source lines for each issue'),
    },
    async ({
      projectKey,
      branch,
      pullRequest,
      severities,
      types,
      resolved,
      statuses,
      limit,
      compact,
      include_source,
    }) => {
      const key = resolveProjectKey({ projectKey });
      const params = addBranchParams(
        new URLSearchParams({
          componentKeys: key,
          ps: String(Math.min(Number(limit) || 30, 500)),
          s: 'SEVERITY',
          asc: 'false',
        }),
        { branch, pullRequest },
      );
      if (statuses) params.set('statuses', statuses);
      else if (!resolved) params.set('resolved', 'false');
      if (severities)
        params.set(
          'severities',
          Array.isArray(severities) ? severities.join(',') : severities,
        );
      if (types)
        params.set('types', Array.isArray(types) ? types.join(',') : types);
      const data = await sonarGet(`/api/issues/search?${params.toString()}`);
      maybeTruncated(data);
      if (compact && data.issues)
        data.issues = data.issues.map(
          ({
            flows,
            textRange,
            messageFormattings,
            codeVariants,
            internalTags,
            ...rest
          }) => rest,
        );
      if (include_source && data.issues) {
        data.issues = await Promise.all(
          data.issues.map(async (issue) => {
            if (!issue.component || !issue.line) return issue;
            try {
              const ctx = getSourceContext();
              const src = await sonarGet(
                `/api/sources/lines?key=${encode(issue.component)}&from=${Math.max(1, issue.line - ctx)}&to=${issue.line + ctx}`,
              );
              return { ...issue, _source: src };
            } catch {
              return issue;
            }
          }),
        );
      }
      return data;
    },
  ),

  tool(
    'sonar_issues_summary',
    'Aggregated issue counts by severity and type. Examples: sonar_issues_summary({ projectKey: "my_proj" })',
    {
      projectKey,
      branch,
      pullRequest,
      resolved: z.boolean().optional().describe('Include resolved issues'),
    },
    async ({ projectKey: pk, branch, pullRequest, resolved }) => {
      const key = resolveProjectKey({ projectKey: pk });
      const params = addBranchParams(
        new URLSearchParams({
          componentKeys: key,
          ps: '500',
          resolved: String(Boolean(resolved)),
        }),
        { branch, pullRequest },
      );
      const data = await sonarGet(`/api/issues/search?${params.toString()}`);
      const bySeverity = {};
      const byType = {};
      let effortTotal = 0;
      for (const issue of data.issues || []) {
        bySeverity[issue.severity] = (bySeverity[issue.severity] || 0) + 1;
        byType[issue.type] = (byType[issue.type] || 0) + 1;
        effortTotal += Number(issue.effort?.replace('min', '')) || 0;
      }
      return {
        total: data.total,
        by_severity: bySeverity,
        by_type: byType,
        effortTotal,
      };
    },
  ),

  tool(
    'sonar_new_issues',
    'Issues created since the last analysis. Examples: sonar_new_issues({ projectKey: "my_proj", compact: true })',
    {
      projectKey,
      branch,
      pullRequest,
      severities: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .describe('Comma-separated or array. Example: "CRITICAL,BLOCKER"'),
      types: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .describe('Comma-separated or array. Example: "BUG,CODE_SMELL"'),
      limit: maxResults,
      compact: z.boolean().optional().describe('Strip verbose fields'),
    },
    async ({
      projectKey: pk,
      branch,
      pullRequest,
      severities,
      types,
      limit,
      compact,
    }) => {
      const key = resolveProjectKey({ projectKey: pk });
      const analyses = await sonarGet(
        `/api/project_analyses/search?project=${encode(key)}&ps=2`,
      ).catch(() => null);
      const createdAfter =
        analyses?.analyses?.[1]?.date || analyses?.analyses?.[0]?.date;
      if (!createdAfter)
        return {
          total: 0,
          issues: [],
          message: 'No previous analysis found to compare against.',
        };
      const params = addBranchParams(
        new URLSearchParams({
          componentKeys: key,
          ps: String(Math.min(Number(limit) || 30, 500)),
          s: 'SEVERITY',
          asc: 'false',
          createdAfter,
        }),
        { branch, pullRequest },
      );
      if (severities)
        params.set(
          'severities',
          Array.isArray(severities) ? severities.join(',') : severities,
        );
      if (types)
        params.set('types', Array.isArray(types) ? types.join(',') : types);
      const data = await sonarGet(`/api/issues/search?${params.toString()}`);
      maybeTruncated(data);
      if (compact && data.issues)
        data.issues = data.issues.map(
          ({
            flows,
            textRange,
            messageFormattings,
            codeVariants,
            internalTags,
            ...rest
          }) => rest,
        );
      return data;
    },
  ),

  tool(
    'sonar_set_issue_status',
    'Mark issue as confirmed, false positive, wontfix, resolved — requires Browse permission on the project. Examples: sonar_set_issue_status({ issueKey: "AX12345", transition: "confirm" }), sonar_set_issue_status({ issueKey: "AX12345", transition: "falsepositive" })',
    {
      issueKey: z.string().describe('Issue key'),
      transition: z
        .enum([
          'confirm',
          'unconfirm',
          'reopen',
          'resolve',
          'falsepositive',
          'wontfix',
        ])
        .describe(
          'Transition. Examples: "confirm", "falsepositive", "resolve", "wontfix", "reopen"',
        ),
    },
    async ({ issueKey, transition }) => {
      if (!issueKey) throw new Error('issueKey is required');
      return sonarPost(
        '/api/issues/do_transition',
        new URLSearchParams({ issue: issueKey, transition }).toString(),
      );
    },
  ),

  tool(
    'sonar_issues_bulk_transition',
    'Transition multiple issues at once — requires Browse permission on the project. Examples: sonar_issues_bulk_transition({ issueKeys: ["AX12345", "AX12346"], transition: "resolve" })',
    {
      issueKeys: z.array(z.string()).describe('Array of issue keys'),
      transition: z
        .enum([
          'confirm',
          'unconfirm',
          'reopen',
          'resolve',
          'falsepositive',
          'wontfix',
        ])
        .describe(
          'Transition for all. Examples: "confirm", "falsepositive", "resolve", "wontfix", "reopen"',
        ),
    },
    async ({ issueKeys, transition }) => {
      if (!issueKeys?.length) throw new Error('issueKeys array is required');
      return sonarPost(
        '/api/issues/bulk_change',
        new URLSearchParams({
          issues: issueKeys.join(','),
          transition,
        }).toString(),
      );
    },
  ),

  tool(
    'sonar_hotspots',
    'Search security hotspots (needs squ_ token). Examples: sonar_hotspots({ projectKey: "my_proj" }), sonar_hotspots({ projectKey: "my_proj", status: "TO_REVIEW" })',
    {
      projectKey,
      branch,
      pullRequest,
      status: z
        .string()
        .optional()
        .describe('TO_REVIEW or REVIEWED. Example: "TO_REVIEW"'),
      limit: z
        .number()
        .optional()
        .describe('Max results (default 30, max 500)'),
    },
    async ({ projectKey, branch, pullRequest, status, limit }) => {
      const token = process.env.SONARQUBE_TOKEN || '';
      if (token && !token.startsWith('squ_'))
        throw new Error(
          'Hotspots require a User token (squ_ prefix). Current token starts with "' +
            token.slice(0, 4) +
            '...".',
        );
      const key = resolveProjectKey({ projectKey });
      const params = addBranchParams(
        new URLSearchParams({
          projectKey: key,
          status: status || 'TO_REVIEW',
          ps: String(Math.min(Number(limit) || 30, 500)),
        }),
        { branch, pullRequest },
      );
      return maybeTruncated(
        await sonarGet(`/api/hotspots/search?${params.toString()}`),
      );
    },
  ),

  tool(
    'sonar_hotspot_details',
    'Full hotspot details: rule, code context, flows, comments (needs squ_ token — project/global tokens return 403). Examples: sonar_hotspot_details({ hotspotKey: "AZ67890" })',
    {
      hotspotKey: z.string().describe('Hotspot key'),
    },
    async ({ hotspotKey }) => {
      if (!hotspotKey) throw new Error('hotspotKey is required');
      return sonarGet(`/api/hotspots/show?hotspot=${encode(hotspotKey)}`);
    },
  ),

  tool(
    'sonar_change_hotspot_status',
    'Review a hotspot: REVIEWED with resolution or TO_REVIEW (needs squ_ token with Browse permission). Examples: sonar_change_hotspot_status({ hotspotKey: "AZ67890", status: "REVIEWED", resolution: "SAFE" })',
    {
      hotspotKey: z.string().describe('Hotspot key'),
      status: z
        .enum(['TO_REVIEW', 'REVIEWED'])
        .describe('New status. Example: "TO_REVIEW"'),
      resolution: z
        .enum(['FIXED', 'SAFE', 'ACKNOWLEDGED'])
        .optional()
        .describe('Required when REVIEWED. Example: "SAFE"'),
      comment: z.string().optional().describe('Optional comment'),
    },
    async ({ hotspotKey, status, resolution, comment }) => {
      if (!hotspotKey) throw new Error('hotspotKey is required');
      const body = new URLSearchParams({ hotspot: hotspotKey, status });
      if (resolution) body.set('resolution', resolution);
      if (comment) body.set('comment', comment);
      return sonarPost('/api/hotspots/change_status', body.toString());
    },
  ),

  tool(
    'sonar_rule',
    'Explain a rule. Examples: sonar_rule({ ruleKey: "typescript:S6544" })',
    {
      ruleKey: z.string().describe('Rule key (e.g. typescript:S6544)'),
    },
    async ({ ruleKey }) => {
      if (!ruleKey) throw new Error('ruleKey is required');
      return sonarGet(`/api/rules/show?key=${encode(ruleKey)}`);
    },
  ),

  tool(
    'sonar_scm_info',
    'Git blame per line: author, date, revision. Examples: sonar_scm_info({ key: "my_proj:src/file.ts" })',
    {
      key: componentKey,
      from: z.number().optional().describe('Starting line'),
      to: z.number().optional().describe('Ending line'),
    },
    async ({ key, from, to }) => {
      requireKey(key);
      return sonarGet(
        `/api/sources/scm?${componentParams(key, from, to).toString()}`,
      );
    },
  ),

  tool(
    'sonar_source',
    'View source lines. Optional highlight_uncovered marks untested lines. Examples: sonar_source({ key: "my_proj:src/file.ts" }), sonar_source({ key: "my_proj:src/file.ts", from: 10, to: 50 })',
    {
      key: componentKey,
      from: z.number().optional().describe('Starting line'),
      to: z.number().optional().describe('Ending line'),
      highlight_uncovered: z
        .boolean()
        .optional()
        .describe('Mark lines with 0 test hits'),
    },
    async ({ key, from, to, highlight_uncovered }) => {
      requireKey(key);
      const data = await sonarGet(
        `/api/sources/lines?${componentParams(key, from, to).toString()}`,
      );
      if (highlight_uncovered && data.sources)
        data.sources = data.sources.map((l) => ({
          ...l,
          _uncovered: l.utLineHits === 0,
        }));
      return data;
    },
  ),

  tool(
    'sonar_list_webhooks',
    'List webhooks for a project — requires Admin permissions. Examples: sonar_list_webhooks({ projectKey: "my_proj" })',
    {
      projectKey: z
        .string()
        .optional()
        .describe('Project key. Omit for global webhooks.'),
    },
    async ({ projectKey: pk }) => {
      const params = new URLSearchParams();
      if (pk) params.set('project', pk);
      else {
        const def = resolveProjectKey({});
        if (def) params.set('project', def);
      }
      return sonarGet(`/api/webhooks/list?${params.toString()}`);
    },
  ),

  tool(
    'sonar_list_languages',
    'List all supported languages. Examples: sonar_list_languages({})',
    {},
    async () => {
      const d = await sonarGet('/api/languages/list');
      return d.languages || [];
    },
  ),

  tool(
    'sonar_setup_scanner',
    'Install sonar-scanner (detects Docker first, falls back to pnpm/yarn/npm). Examples: sonar_setup_scanner({ cwd: "/path/to/project" })',
    {
      cwd: z.string().optional().describe('Project root'),
    },
    async ({ cwd }) => {
      const dir = cwd || process.cwd();
      /* c8 ignore start */
      if (hasDocker())
        return {
          installed: true,
          packageManager: 'docker',
          output:
            'Docker available — scanner will run via sonarsource/sonar-scanner-cli',
        };
      /* c8 ignore end */
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
      return {
        installed: true,
        packageManager: cmd,
        output: execSync(`${cmd} ${args.join(' ')}`, {
          cwd: dir,
          encoding: 'utf8',
          timeout: getScannerTimeout(),
        }),
      };
    },
  ),

  tool(
    'sonar_detect_project_config',
    'Inspect a project directory and return a suggested SonarQube analysis configuration (sources, tests, exclusions, coverage, build tool). Does not modify anything — review then pass to sonar_run_analysis. Examples: sonar_detect_project_config({ projectRoot: "/path/to/project" })',
    {
      projectRoot: z
        .string()
        .optional()
        .describe('Project root (defaults to cwd)'),
    },
    async ({ projectRoot }) => {
      const dir = projectRoot || process.cwd();
      if (!existsSync(dir))
        throw new Error(`Project root does not exist: ${dir}`);
      const cfg = detectProjectConfig(dir);
      // Cross-reference detected languages against the connected SonarQube instance.
      // Best-effort: if the API is unreachable, keep all detected languages.
      try {
        const data = await sonarGet('/api/languages/list');
        const supported = new Set(
          (data.languages || []).map((/** @type {{ name: string }} */ l) =>
            l.name.toLowerCase(),
          ),
        );
        if (supported.size)
          cfg.detectedLanguages = cfg.detectedLanguages.filter((n) =>
            supported.has(n.toLowerCase()),
          );
      } catch {
        /* keep detected languages as-is */
      }
      return cfg;
    },
  ),

  tool(
    'sonar_run_analysis',
    'Run sonar-scanner analysis (auto-detects language, prefers Docker, falls back to local sonar-scanner via npm/PATH). Requires a user token (squ_, sqp_, or sqa_) with Execute Analysis permission. Examples: sonar_run_analysis({ cwd: "/path/to/project" })',
    {
      cwd: z.string().optional().describe('Project root'),
      token: z.string().optional().describe('Token'),
      projectKey: z.string().optional().describe('Override project key'),
      host: z.string().optional().describe('SonarQube URL'),
      sources: z.string().optional().describe('Source dirs'),
      tests: z
        .string()
        .optional()
        .describe(
          'Test dirs (optional — omitted by default, pass empty string to disable)',
        ),
      language: z
        .enum([
          'python',
          'javascript',
          'typescript',
          'java',
          'kotlin',
          'go',
          'csharp',
        ])
        .optional()
        .describe('Project language — auto-detected if omitted'),
      scanner: z
        .enum(['auto', 'docker', 'local'])
        .optional()
        .describe(
          'Scanner method: auto (default — Docker first, fallback to npm/PATH sonar-scanner), docker, or local',
        ),
    },
    async ({
      cwd,
      token,
      projectKey,
      host,
      sources,
      tests,
      language,
      scanner: scannerMethod,
    }) => {
      const dir = cwd || process.cwd();
      const auth = token || process.env.SONARQUBE_TOKEN || '';
      if (!auth) throw new Error('No token provided.');
      const lang = language || detectLanguage(dir);
      const useDocker =
        scannerMethod === 'docker' ||
        (scannerMethod !== 'local' && hasDocker());
      if (scannerMethod === 'docker' && !useDocker)
        /* c8 ignore start */
        throw new Error(
          'Docker scanner requested but Docker is not available.',
        );
      /* c8 ignore end */
      const hostUrl =
        host || process.env.SONARQUBE_URL || 'http://localhost:9000';
      const langCfg = lang && LANG_CONFIGS[lang];
      const propsPath = join(dir, 'sonar-project.properties');

      const sonarSources = sources || langCfg?.sources || 'src';
      const sonarTests = tests;

      writeFileSync(
        propsPath,
        buildSonarProps(
          projectKey || process.env.SONARQUBE_PROJECT || 'my_project',
          hostUrl,
          sonarSources,
          lang,
          dir,
        ),
      );

      const buildResult = autoBuild(dir, langCfg);
      const baseArgs = buildScannerArgs({
        auth,
        projectKey,
        sonarSources,
        sonarTests,
      });
      const scannerType = useDocker ? 'docker' : 'local';

      let output;
      try {
        output = runScanner(dir, useDocker, baseArgs);
      } catch (e) {
        const msg = /** @type {Error} */ (e).message;
        const mapped = mapScannerError(msg);
        if (mapped) throw new Error(mapped);
        /* c8 ignore start */
        return {
          success: false,
          scanner: scannerType,
          error: 'Scanner command failed',
          output: msg,
        };
      }
      /* c8 ignore end */

      /* c8 ignore start */
      const hints = buildScannerHints(output, lang);
      const ceTaskUrl = extractCeTaskUrl(output, hostUrl);
      let ceStatus;
      try {
        const ce = await pollCeTask(ceTaskUrl);
        ceStatus = ce?.task?.status;
      } catch {}
      /* c8 ignore end */

      const pk = projectKey || process.env.SONARQUBE_PROJECT || 'my_project';

      return {
        success: true,
        scanner: scannerType,
        language: lang || 'unknown',
        dashboardUrl: `${hostUrl}/dashboard?id=${encodeURIComponent(pk)}`,
        ceTaskUrl,
        ceStatus,
        buildPerformed: buildResult.performed,
        hints: hints.length ? hints : undefined,
        output,
      };
    },
  ),

  tool(
    'sonar_list_pull_requests',
    'List PRs (requires Developer Edition+). Examples: sonar_list_pull_requests({ projectKey: "my_proj" })',
    {
      projectKey,
    },
    async ({ projectKey: pk }) => {
      const key = resolveProjectKey({ projectKey: pk });
      const data = await sonarGet(
        `/api/project_pull_requests/list?project=${encode(key)}`,
      );
      if (!data.pullRequests) return [];
      return data.pullRequests.map(
        ({ key: k, branch, title, analysisDate, status, url }) => ({
          key: k,
          branch,
          title,
          analysisDate,
          status: status?.qualityGateStatus,
          url,
        }),
      );
    },
  ),

  tool(
    'sonar_file_coverage_details',
    'Line/condition coverage % for a file. Examples: sonar_file_coverage_details({ key: "my_proj:src/file.ts" })',
    {
      key: componentKey,
    },
    async ({ key }) => {
      requireKey(key);
      return sonarGet(
        `/api/measures/component?component=${encode(key)}&metricKeys=coverage,uncovered_lines,uncovered_conditions,lines_to_cover,conditions_to_cover,branch_coverage`,
      );
    },
  ),

  tool(
    'sonar_list_branches',
    'List branches with analysis dates and QG status. Examples: sonar_list_branches({ projectKey: "my_proj" })',
    {
      projectKey,
    },
    async ({ projectKey: pk }) => {
      const key = resolveProjectKey({ projectKey: pk });
      const data = await sonarGet(
        `/api/project_branches/list?project=${encode(key)}`,
      );
      return (data.branches || []).map(
        ({ name, isMain, analysisDate, status }) => ({
          name,
          isMain,
          analysisDate,
          status: status?.qualityGateStatus,
        }),
      );
    },
  ),

  tool(
    'sonar_coverage_files',
    'Find files with coverage below threshold. Examples: sonar_coverage_files({ projectKey: "my_proj" }), sonar_coverage_files({ projectKey: "my_proj", threshold: 50 })',
    {
      projectKey,
      branch,
      pullRequest,
      threshold: z
        .number()
        .optional()
        .describe('Coverage % threshold (default 80)'),
    },
    measureSearch('coverage', 'coverage', 80, false),
  ),

  tool(
    'sonar_search_duplicated_files',
    'Find files with duplication above threshold. Examples: sonar_search_duplicated_files({ projectKey: "my_proj" }), sonar_search_duplicated_files({ projectKey: "my_proj", threshold: 5 })',
    {
      projectKey,
      branch,
      pullRequest,
      threshold: z
        .number()
        .optional()
        .describe('Duplication % threshold (default 3)'),
    },
    measureSearch(
      'duplicated_lines_density',
      'duplicatedLinesDensity',
      3,
      true,
    ),
  ),

  tool(
    'sonar_duplications',
    'Get duplication blocks for a file. Examples: sonar_duplications({ key: "my_proj:src/file.ts" })',
    {
      key: componentKey,
    },
    async ({ key }) => {
      requireKey(key);
      return sonarGet(`/api/duplications/show?key=${encode(key)}`);
    },
  ),

  // --- Composite / workflow tools ---

  tool(
    'sonar_project_report',
    'One-shot project health: QG + measures + issues summary + hotspots + worst files + branches. Examples: sonar_project_report({ projectKey: "my_proj" })',
    {
      projectKey,
      branch,
      pullRequest,
    },
    async ({ projectKey: pk, branch, pullRequest }) => {
      const key = resolveProjectKey({ projectKey: pk });
      const qgParams = addBranchParams(
        new URLSearchParams({ projectKey: key }),
        { branch, pullRequest },
      );
      const measuresParams = addBranchParams(
        new URLSearchParams({
          component: key,
          metricKeys:
            'bugs,vulnerabilities,code_smells,coverage,duplicated_lines_density,ncloc,reliability_rating,security_rating,sqale_rating',
        }),
        { branch, pullRequest },
      );
      const issuesParams = addBranchParams(
        new URLSearchParams({
          componentKeys: key,
          ps: '1',
          resolved: 'false',
          facets: 'severities,types',
        }),
        { branch, pullRequest },
      );
      const hotspotsParams = addBranchParams(
        new URLSearchParams({ projectKey: key, ps: '1' }),
        { branch, pullRequest },
      );
      const worstParams = addBranchParams(
        new URLSearchParams({
          projectKeys: key,
          metricKeys: 'coverage,duplicated_lines_density,cognitive_complexity',
          ps: '500',
        }),
        { branch, pullRequest },
      );
      const [quality, measures, issueData, hotspots, branches, worst] =
        await Promise.all([
          sonarGet(
            `/api/qualitygates/project_status?${qgParams.toString()}`,
          ).catch(() => null),
          sonarGet(
            `/api/measures/component?${measuresParams.toString()}`,
          ).catch(() => null),
          sonarGet(`/api/issues/search?${issuesParams.toString()}`).catch(
            () => null,
          ),
          sonarGet(`/api/hotspots/search?${hotspotsParams.toString()}`).catch(
            () => null,
          ),
          sonarGet(`/api/project_branches/list?project=${encode(key)}`).catch(
            () => null,
          ),
          sonarGet(`/api/measures/search?${worstParams.toString()}`).catch(
            () => null,
          ),
        ]);
      const metricMap = {};
      for (const m of measures?.component?.measures || [])
        metricMap[m.metric] = m.value;
      const { bySeverity, byType } = parseIssueFacets(issueData);
      const severityOrder = ['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR', 'INFO'];
      const topSeverities = severityOrder
        .filter((s) => bySeverity[s])
        .map((s) => `${s}: ${bySeverity[s]}`);
      const worstFiles = {};
      for (const m of worst?.measures || []) {
        if (m.component === key) continue;
        const file = m.component.split(':').pop();
        if (!worstFiles[file]) worstFiles[file] = {};
        worstFiles[file][m.metric] = Number.parseFloat(m.value);
      }
      const sorted = Object.entries(worstFiles)
        .sort((a, b) => (a[1].coverage || 100) - (b[1].coverage || 100))
        .slice(0, 5)
        .map(([p, v]) => ({
          path: p,
          coverage: v.coverage,
          complexity: v.cognitive_complexity,
        }));
      return {
        projectKey: key,
        qualityGate: quality?.projectStatus?.status || 'NONE',
        metrics: metricMap,
        issues: {
          total: issueData?.total || 0,
          by_severity: bySeverity,
          by_type: byType,
          top_severities: topSeverities,
        },
        hotspots: {
          total: hotspots?.paging?.total || 0,
          status: hotspots?.hotspots?.[0]?.status || 'NONE',
        },
        branches: (branches?.branches || []).map((b) => ({
          name: b.name,
          isMain: b.isMain,
          analysisDate: b.analysisDate,
          qg: b.status?.qualityGateStatus,
        })),
        worstFiles: sorted,
      };
    },
  ),

  tool(
    'sonar_analyze_and_report',
    'Run analysis, then return full project report — saves 6+ calls into 1. Examples: sonar_analyze_and_report({ cwd: "/path/to/project" })',
    {
      cwd: z.string().optional().describe('Project root'),
      token: z.string().optional().describe('Token'),
      projectKey,
      host: z.string().optional().describe('SonarQube URL'),
      sources: z.string().optional().describe('Source dirs'),
      tests: z.string().optional().describe('Test dirs (optional)'),
      language: z
        .enum([
          'python',
          'javascript',
          'typescript',
          'java',
          'kotlin',
          'go',
          'csharp',
        ])
        .optional()
        .describe('Project language'),
    },
    async ({ cwd, token, projectKey: pk, host, sources, tests, language }) => {
      /* c8 ignore next 3 */
      const scanResult = await ALL_TOOLS.find(
        (t) => t.name === 'sonar_run_analysis',
      ).handler({ cwd, token, projectKey: pk, host, sources, tests, language });
      if (!scanResult.success) {
        return { scan: scanResult, report: null };
      }
      const report = await ALL_TOOLS.find(
        (t) => t.name === 'sonar_project_report',
      ).handler({ projectKey: pk });
      return {
        scan: {
          success: scanResult.success,
          scanner: scanResult.scanner,
          language: scanResult.language,
          dashboardUrl: scanResult.dashboardUrl,
          ceTaskUrl: scanResult.ceTaskUrl,
          ceStatus: scanResult.ceStatus,
          hints: scanResult.hints,
        },
        report,
      };
    },
  ),

  tool(
    'sonar_file_issues',
    'Get issues + source context for a file — saves 2 calls into 1. Examples: sonar_file_issues({ key: "my_proj:src/file.ts" }), sonar_file_issues({ key: "my_proj:src/file.ts", from: 10, to: 50 })',
    {
      key: componentKey,
      from: z.number().optional().describe('Starting line'),
      to: z.number().optional().describe('Ending line'),
      severities: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .describe('Filter by severity. Example: "CRITICAL,BLOCKER"'),
      types: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .describe('Filter by type. Example: "BUG,CODE_SMELL"'),
    },
    async ({ key, from, to, severities, types }) => {
      requireKey(key);
      const params = new URLSearchParams({
        componentKeys: key,
        ps: '50',
        s: 'SEVERITY',
        asc: 'false',
      });
      if (severities)
        params.set(
          'severities',
          Array.isArray(severities) ? severities.join(',') : severities,
        );
      if (types)
        params.set('types', Array.isArray(types) ? types.join(',') : types);
      const [issues, source] = await Promise.all([
        sonarGet(`/api/issues/search?${params.toString()}`).catch(() => null),
        sonarGet(
          `/api/sources/lines?${componentParams(key, from, to).toString()}`,
        ).catch(() => null),
      ]);
      return {
        total: issues?.total || 0,
        issues: (issues?.issues || []).map(
          ({
            flows,
            textRange,
            messageFormattings,
            codeVariants,
            internalTags,
            ...rest
          }) => rest,
        ),
        source: source?.sources || [],
      };
    },
  ),

  tool(
    'sonar_new_issues_since',
    'New issues since last analysis + project context — saves 2+ calls into 1. Examples: sonar_new_issues_since({ projectKey: "my_proj", compact: true })',
    {
      projectKey,
      branch,
      pullRequest,
      severities: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .describe('Filter by severity. Example: "CRITICAL,BLOCKER"'),
      types: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .describe('Filter by type. Example: "BUG,CODE_SMELL"'),
      limit: maxResults,
      compact: z.boolean().optional().describe('Strip verbose fields'),
    },
    async ({
      projectKey: pk,
      branch,
      pullRequest,
      severities,
      types,
      limit,
      compact,
    }) => {
      const key = resolveProjectKey({ projectKey: pk });
      const analyses = await sonarGet(
        `/api/project_analyses/search?project=${encode(key)}&ps=2`,
      ).catch(() => null);
      const createdAfter =
        analyses?.analyses?.[1]?.date || analyses?.analyses?.[0]?.date;
      if (!createdAfter)
        return {
          total: 0,
          newIssues: [],
          message: 'No previous analysis found to compare against.',
          projectKey: key,
        };
      const params = addBranchParams(
        new URLSearchParams({
          componentKeys: key,
          ps: String(Math.min(Number(limit) || 30, 500)),
          s: 'SEVERITY',
          asc: 'false',
          createdAfter,
        }),
        { branch, pullRequest },
      );
      if (severities)
        params.set(
          'severities',
          Array.isArray(severities) ? severities.join(',') : severities,
        );
      if (types)
        params.set('types', Array.isArray(types) ? types.join(',') : types);
      const data = await sonarGet(`/api/issues/search?${params.toString()}`);
      return {
        projectKey: key,
        total: data.total,
        newIssues:
          compact && data.issues
            ? data.issues.map(
                ({
                  flows,
                  textRange,
                  messageFormattings,
                  codeVariants,
                  internalTags,
                  ...rest
                }) => rest,
              )
            : data.issues || [],
        since: createdAfter,
      };
    },
  ),

  tool(
    'sonar_fix_and_verify',
    'Fix → rebuild → re-analyze → verify issue resolved — closes the dev loop. Examples: sonar_fix_and_verify({ issueKey: "AX12345", cwd: "/path/to/project" })',
    {
      issueKey: z
        .string()
        .describe(
          'Issue key to verify (e.g. from sonar_issues or sonar_project_report)',
        ),
      cwd: z.string().optional().describe('Project root'),
      projectKey,
      host: z.string().optional().describe('SonarQube URL'),
      language: z
        .enum([
          'python',
          'javascript',
          'typescript',
          'java',
          'kotlin',
          'go',
          'csharp',
        ])
        .optional()
        .describe('Project language'),
    },
    async ({ issueKey, cwd, projectKey: pk, host, language }) => {
      /* c8 ignore start */
      const runH = ALL_TOOLS.find(
        (t) => t.name === 'sonar_run_analysis',
      ).handler;
      const reportH = ALL_TOOLS.find(
        (t) => t.name === 'sonar_project_report',
      ).handler;
      const scan = await runH({ cwd, projectKey: pk, host, language });
      const report = await reportH({ projectKey: pk });
      let resolved = false;
      if (issueKey) {
        try {
          const check = await sonarGet(
            `/api/issues/search?issues=${encode(issueKey)}`,
          );
          resolved = check.total === 0;
        } catch {
          resolved = false;
        }
      }
      return { fixVerified: resolved, scan, report, issueKey };
      /* c8 ignore end */
    },
  ),

  tool(
    'sonar_file_review',
    'Review a single file in one call: issues + source context + coverage + duplications. Saves 3-4 calls into 1. Examples: sonar_file_review({ key: "my_proj:src/file.ts" })',
    {
      key: componentKey,
      from: z.number().optional().describe('Starting line'),
      to: z.number().optional().describe('Ending line'),
      severities: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .describe('Filter issues by severity. Example: "CRITICAL,BLOCKER"'),
      types: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .describe('Filter issues by type. Example: "BUG,CODE_SMELL"'),
    },
    async ({ key, from, to, severities, types }) => {
      requireKey(key);
      const [issues, coverage, duplications] = await Promise.all([
        ALL_TOOLS.find((t) => t.name === 'sonar_file_issues').handler({
          key,
          from,
          to,
          severities,
          types,
        }),
        ALL_TOOLS.find((t) => t.name === 'sonar_file_coverage_details').handler(
          { key },
        ),
        ALL_TOOLS.find((t) => t.name === 'sonar_duplications').handler({ key }),
      ]);
      return {
        key,
        issuesTotal: issues.total,
        issues: issues.issues,
        source: issues.source,
        coverage: coverage?.component?.measures || [],
        duplications: duplications?.duplications || [],
      };
    },
  ),

  tool(
    'sonar_scan_workflow',
    'Full scan happy path: detect project config (sources/tests/exclusions) → run analysis → return project report. Explicit params override detected defaults. Examples: sonar_scan_workflow({ cwd: "/path/to/project" })',
    {
      cwd: z.string().optional().describe('Project root'),
      token: z.string().optional().describe('Token'),
      projectKey,
      host: z.string().optional().describe('SonarQube URL'),
      sources: z
        .string()
        .optional()
        .describe('Source dirs (overrides detected)'),
      tests: z
        .string()
        .optional()
        .describe(
          'Test dirs — pass empty string to disable (overrides detected)',
        ),
      language: z
        .enum([
          'python',
          'javascript',
          'typescript',
          'java',
          'kotlin',
          'go',
          'csharp',
        ])
        .optional()
        .describe('Project language'),
      scanner: z
        .enum(['auto', 'docker', 'local'])
        .optional()
        .describe('Scanner method'),
    },
    async ({
      cwd,
      token,
      projectKey: pk,
      host,
      sources,
      tests,
      language,
      scanner: scannerMethod,
    }) => {
      const dir = cwd || process.cwd();
      // 1. Detect config to fill sensible defaults.
      let config = null;
      try {
        config = await ALL_TOOLS.find(
          (t) => t.name === 'sonar_detect_project_config',
        ).handler({ projectRoot: dir });
      } catch {
        /* detection failed — proceed with explicit params only */
      }
      const mergedSources = sources || config?.sources;
      const mergedTests = tests === undefined ? config?.tests : tests;
      // 2. Run analysis with merged params.
      /* c8 ignore next 4 */
      const scan = await ALL_TOOLS.find(
        (t) => t.name === 'sonar_run_analysis',
      ).handler({
        cwd: dir,
        token,
        projectKey: pk,
        host,
        sources: mergedSources,
        tests: mergedTests,
        language,
        scanner: scannerMethod,
      });
      if (!scan.success) return { config, scan, report: null };
      // 3. Pull the project report.
      const report = await ALL_TOOLS.find(
        (t) => t.name === 'sonar_project_report',
      ).handler({ projectKey: pk });
      return { config, scan, report };
    },
  ),

  tool(
    'sonar_call_multiple',
    'Batch-execute multiple SonarQube tools in linear order in a single round-trip. Pass an ordered list of { name, args } entries; returns { total, duplicates, truncated, results: [{ order, name, ok, result|error }] }. Consecutive exact duplicates are collapsed (non-adjacent repeats are kept — state may change between them). Capped at 25 calls. Cannot call itself recursively. Examples: sonar_call_multiple({ calls: [{ name: "sonar_ping", args: {} }, { name: "sonar_measures", args: { projectKey: "my_proj" } }] })',
    {
      calls: z
        .array(
          z.object({
            name: z
              .string()
              .describe('Tool name (e.g. sonar_ping, sonar_measures)'),
            args: z
              .record(z.string(), z.any())
              .optional()
              .describe(
                'Arguments object for the tool (omit for no-arg tools)',
              ),
          }),
        )
        .describe('Ordered list of tool calls to execute sequentially'),
      stopOnError: z
        .boolean()
        .optional()
        .describe(
          'Stop after the first failing call (default false — collect all results)',
        ),
    },
    async ({ calls, stopOnError }) => {
      const MAX_CALLS = 25;
      const stop = stopOnError === true;
      const truncated = calls.length > MAX_CALLS;
      const input = truncated ? calls.slice(0, MAX_CALLS) : calls;
      const results = [];
      let duplicates = 0;
      let prevSig = '';
      for (let i = 0; i < input.length; i++) {
        const c = input[i];
        const sig = c.name + '|' + JSON.stringify(c.args || {});
        if (sig === prevSig) {
          duplicates++;
          continue;
        }
        prevSig = sig;
        const entry = await executeCall(c, i + 1);
        results.push(entry.result);
        if (stop && !entry.ok) break;
      }
      return {
        total: results.length,
        duplicates,
        truncated,
        maxCalls: MAX_CALLS,
        results,
      };
    },
  ),
];

/** @type {Array<{ name: string; description: string; schema: Record<string, import('zod').ZodTypeAny>; handler: Function }>} */
export const TOOL_CONFIGS = filterTools(ALL_TOOLS);
