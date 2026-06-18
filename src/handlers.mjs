// @ts-check
import { z } from 'zod';
import { execSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sonarGet, sonarPost, sonarCheckServer, orgQuery, resolveProjectKey, maybeTruncated, getHostUrl } from './api.mjs';

const encode = (/** @type {string} */ v) => encodeURIComponent(v);

/**
 * @callback ToolHandler
 * @param {Object} params
 * @returns {Promise<any>}
 */

/** @type {Array<{ name: string; description: string; schema: Record<string, import('zod').ZodTypeAny>; handler: ToolHandler }>} */
export const TOOL_CONFIGS = [
  {
    name: 'sonar_search_projects',
    description: 'Search/find SonarQube project keys. Use when no project is configured or to discover available projects.',
    schema: {
      query: z.string().optional().describe('Optional search query to filter projects by name/key'),
      limit: z.number().optional().describe('Max results (default 50, max 500)'),
    },
    handler: async ({ query, limit }) => {
      const params = new URLSearchParams({ ps: String(Math.min(Number(limit) || 50, 500)) });
      if (query) params.set('q', query);
      return maybeTruncated(await sonarGet(`/api/projects/search?${params.toString()}${orgQuery()}`));
    },
  },

  {
    name: 'sonar_quality_gate',
    description: 'Get the SonarQube quality gate status (OK/ERROR) for a project, including each failing condition with metric, actual value, and threshold.',
    schema: {
      projectKey: z.string().optional().describe('Project key (defaults to SONARQUBE_PROJECT)'),
    },
    handler: async ({ projectKey: pk }) => {
      return sonarGet(`/api/qualitygates/project_status?projectKey=${encode(resolveProjectKey({ projectKey: pk }))}`);
    },
  },

  {
    name: 'sonar_measures',
    description: 'Get SonarQube metrics for a project: bugs, vulnerabilities, code smells, coverage, duplication, lines of code, and maintainability/security ratings.',
    schema: {
      projectKey: z.string().optional().describe('Project key (defaults to SONARQUBE_PROJECT)'),
      metricKeys: z.string().optional().describe('Comma-separated metric keys (default: bugs,vulnerabilities,code_smells,security_hotspots,coverage,duplicated_lines_density,ncloc,reliability_rating,security_rating,sqale_rating)'),
    },
    handler: async ({ projectKey: pk, metricKeys }) => {
      const key = resolveProjectKey({ projectKey: pk });
      const keys = metricKeys || 'bugs,vulnerabilities,code_smells,security_hotspots,coverage,duplicated_lines_density,ncloc,reliability_rating,security_rating,sqale_rating';
      return sonarGet(`/api/measures/component?component=${encode(key)}&metricKeys=${encode(keys)}`);
    },
  },

  {
    name: 'sonar_issues',
    description: 'Search SonarQube issues for a project. Returns issues sorted by severity (most severe first). Supports filtering by severity, type, resolution, compact mode, and source embedding.',
    schema: {
      projectKey: z.string().optional().describe('Project key (defaults to SONARQUBE_PROJECT)'),
      severities: z.string().optional().describe('Comma-separated: INFO,MINOR,MAJOR,CRITICAL,BLOCKER'),
      types: z.string().optional().describe('Comma-separated: CODE_SMELL,BUG,VULNERABILITY,SECURITY_HOTSPOT'),
      resolved: z.boolean().optional().describe('Include resolved issues (default false)'),
      statuses: z.string().optional().describe('Comma-separated issue statuses: OPEN,CONFIRMED,REOPENED,RESOLVED,CLOSED (default OPEN,CONFIRMED,REOPENED)'),
      limit: z.number().optional().describe('Max issues (default 30, max 500)'),
      compact: z.boolean().optional().describe('Strip verbose fields (flows, textRange, messageFormattings) for token efficiency'),
      include_source: z.boolean().optional().describe('Embed source lines for each issue (requires extra API calls)'),
    },
    handler: async ({ projectKey: pk, severities, types, resolved, statuses, limit, compact, include_source }) => {
      const key = resolveProjectKey({ projectKey: pk });
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

      if (severities) params.set('severities', severities);
      if (types) params.set('types', types);

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
    },
  },

  {
    name: 'sonar_issues_summary',
    description: 'Get aggregated counts of issues by severity and type. Lightweight alternative to sonar_issues — returns only summary stats.',
    schema: {
      projectKey: z.string().optional().describe('Project key (defaults to SONARQUBE_PROJECT)'),
      resolved: z.boolean().optional().describe('Include resolved issues in summary (default false)'),
    },
    handler: async ({ projectKey: pk, resolved }) => {
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
    },
  },

  {
    name: 'sonar_new_issues',
    description: 'Get issues created since the last analysis. Useful for seeing what changed after a scan.',
    schema: {
      projectKey: z.string().optional().describe('Project key (defaults to SONARQUBE_PROJECT)'),
      severities: z.string().optional().describe('Comma-separated: INFO,MINOR,MAJOR,CRITICAL,BLOCKER'),
      types: z.string().optional().describe('Comma-separated: CODE_SMELL,BUG,VULNERABILITY,SECURITY_HOTSPOT'),
      limit: z.number().optional().describe('Max issues (default 30, max 500)'),
      compact: z.boolean().optional().describe('Strip verbose fields for token efficiency'),
    },
    handler: async ({ projectKey: pk, severities, types, limit, compact }) => {
      const key = resolveProjectKey({ projectKey: pk });
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
      if (severities) params.set('severities', severities);
      if (types) params.set('types', types);

      const data = await sonarGet(`/api/issues/search?${params.toString()}`);
      maybeTruncated(data);

      if (compact && data.issues) {
        data.issues = data.issues.map(({ flows, textRange, messageFormattings, codeVariants, internalTags, ...rest }) => rest);
      }

      return data;
    },
  },

  {
    name: 'sonar_hotspots',
    description: 'Search SonarQube security hotspots for a project. Requires a User token (squ_ prefix) with Browse permission — analysis tokens (sqp_/sqa_) will get a 403 error.',
    schema: {
      projectKey: z.string().optional().describe('Project key (defaults to SONARQUBE_PROJECT)'),
      status: z.string().optional().describe('TO_REVIEW or REVIEWED (default TO_REVIEW)'),
      limit: z.number().optional().describe('Max results (default 30, max 500)'),
    },
    handler: async ({ projectKey: pk, status, limit }) => {
      const key = resolveProjectKey({ projectKey: pk });
      const params = new URLSearchParams({
        projectKey: key,
        status: status || 'TO_REVIEW',
        ps: String(Math.min(Number(limit) || 30, 500)),
      });
      return maybeTruncated(await sonarGet(`/api/hotspots/search?${params.toString()}`));
    },
  },

  {
    name: 'sonar_rule',
    description: 'Get detailed information about a specific SonarQube rule: description, severity, type, and remediation guidance.',
    schema: {
      ruleKey: z.string().describe('Rule key (e.g. typescript:S6544, java:S123)'),
    },
    handler: async ({ ruleKey }) => {
      if (!ruleKey) throw new Error('ruleKey is required');
      return sonarGet(`/api/rules/show?key=${encode(ruleKey)}`);
    },
  },

  {
    name: 'sonar_source',
    description: 'View source code lines for a SonarQube file component. Useful to see the context around a flagged issue or hotspot.',
    schema: {
      key: z.string().describe('Full component key (e.g. my-project:src/index.ts)'),
      from: z.number().optional().describe('Starting line number (1-indexed)'),
      to: z.number().optional().describe('Ending line number (inclusive)'),
    },
    handler: async ({ key, from, to }) => {
      if (!key) throw new Error('key (component key) is required');
      const params = new URLSearchParams({ key });
      if (from) params.set('from', String(from));
      if (to) params.set('to', String(to));
      return sonarGet(`/api/sources/lines?${params.toString()}`);
    },
  },

  {
    name: 'sonar_analysis_status',
    description: 'Check if a project has been analyzed on SonarQube. Returns whether analysis data exists and guidance if not.',
    schema: {
      projectKey: z.string().optional().describe('Project key (defaults to SONARQUBE_PROJECT)'),
    },
    handler: async ({ projectKey: pk }) => {
      const key = resolveProjectKey({ projectKey: pk });

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
    },
  },

  {
    name: 'sonar_set_issue_status',
    description: 'Transition a SonarQube issue status: mark as confirmed, false positive, wontfix, or resolved. Use after reviewing an issue to track intentional decisions.',
    schema: {
      issueKey: z.string().describe('Issue key (e.g. the "key" field from sonar_issues)'),
      transition: z.enum(['confirm', 'unconfirm', 'reopen', 'resolve', 'falsepositive', 'wontfix']).describe('Transition to apply'),
    },
    handler: async ({ issueKey, transition }) => {
      if (!issueKey) throw new Error('issueKey is required');
      const body = new URLSearchParams({ issue: issueKey, transition }).toString();
      return sonarPost('/api/issues/do_transition', body);
    },
  },

  {
    name: 'sonar_raw',
    description: 'Escape hatch — call any SonarQube Web API GET endpoint directly. Path must start with /api/. Returns the raw JSON response.',
    schema: {
      path: z.string().describe('API path starting with /api/ (e.g. /api/system/health)'),
    },
    handler: async ({ path }) => {
      if (!path?.startsWith('/')) throw new Error('path must start with /');
      return sonarGet(path);
    },
  },

  {
    name: 'sonar_setup_scanner',
    description: 'Install sonar-scanner as a devDependency in the project. Detects pnpm, yarn, or npm from lock files.',
    schema: {
      cwd: z.string().optional().describe('Project root directory (defaults to current working directory)'),
    },
    handler: async ({ cwd }) => {
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
    },
  },

  {
    name: 'sonar_run_analysis',
    description: 'Run sonar-scanner analysis on the project. Auto-creates sonar-project.properties if missing using provided or default values.',
    schema: {
      cwd: z.string().optional().describe('Project root directory (defaults to current working directory)'),
      token: z.string().optional().describe('SonarQube token (defaults to SONARQUBE_TOKEN env var)'),
      projectKey: z.string().optional().describe('Project key (overrides sonar.projectKey in properties, or creates one)'),
      host: z.string().optional().describe('SonarQube server URL (defaults to SONARQUBE_URL env var)'),
      sources: z.string().optional().describe('Source directories (default: src)'),
    },
    handler: async ({ cwd, token, projectKey, host, sources }) => {
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
    },
  },

  {
    name: 'sonar_list_branches',
    description: 'List branches for a project with their analysis dates and quality gate status.',
    schema: {
      projectKey: z.string().optional().describe('Project key (defaults to SONARQUBE_PROJECT)'),
    },
    handler: async ({ projectKey: pk }) => {
      const key = resolveProjectKey({ projectKey: pk });
      const data = await sonarGet(`/api/project_branches/list?project=${encode(key)}`);
      return (data.branches || []).map(({ name, isMain, analysisDate, status }) => ({
        name, isMain, analysisDate, status: status?.qualityGateStatus,
      }));
    },
  },

  {
    name: 'sonar_coverage_files',
    description: 'List files in a project with coverage below a threshold. Useful to find under-tested files.',
    schema: {
      projectKey: z.string().optional().describe('Project key (defaults to SONARQUBE_PROJECT)'),
      threshold: z.number().optional().describe('Coverage % threshold (default 80). Files below this value are returned.'),
    },
    handler: async ({ projectKey: pk, threshold }) => {
      const key = resolveProjectKey({ projectKey: pk });
      const t = threshold ?? 80;
      const data = await sonarGet(`/api/measures/search?projectKeys=${encode(key)}&metricKeys=coverage&ps=500`);
      const files = (data.measures || [])
        .filter((m) => m.value !== undefined && m.component !== key && m.component)
        .map((m) => ({ path: m.component.split(':').pop(), coverage: Number.parseFloat(m.value) }))
        .filter((f) => f.coverage < t)
        .sort((a, b) => a.coverage - b.coverage);
      return { total: files.length, threshold: t, files };
    },
  },

  {
    name: 'sonar_search_duplicated_files',
    description: 'Find files in a project with duplication density above a threshold. Complements sonar_measures duplication metric.',
    schema: {
      projectKey: z.string().optional().describe('Project key (defaults to SONARQUBE_PROJECT)'),
      threshold: z.number().optional().describe('Duplication density % threshold (default 3). Files above this value are returned.'),
    },
    handler: async ({ projectKey: pk, threshold }) => {
      const key = resolveProjectKey({ projectKey: pk });
      const t = threshold ?? 3;
      const data = await sonarGet(`/api/measures/search?projectKeys=${encode(key)}&metricKeys=duplicated_lines_density&ps=500`);
      const files = (data.measures || [])
        .filter((m) => m.value !== undefined && m.component !== key && m.component)
        .map((m) => ({ path: m.component.split(':').pop(), duplicatedLinesDensity: Number.parseFloat(m.value) }))
        .filter((f) => f.duplicatedLinesDensity > t)
        .sort((a, b) => b.duplicatedLinesDensity - a.duplicatedLinesDensity);
      return { total: files.length, threshold: t, files };
    },
  },

  {
    name: 'sonar_duplications',
    description: 'Get duplication blocks for a specific file. Returns duplicate blocks grouped by file with line ranges.',
    schema: {
      key: z.string().describe('Full component key (e.g. my-project:src/file.ts)'),
    },
    handler: async ({ key }) => {
      if (!key) throw new Error('key (component key) is required');
      return sonarGet(`/api/duplications/show?key=${encode(key)}`);
    },
  },
];
