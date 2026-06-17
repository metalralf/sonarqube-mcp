import { z } from 'zod';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { sonarGet, orgQuery, resolveProjectKey, maybeTruncated, getHostUrl } from './api.mjs';

const encode = (v) => encodeURIComponent(v);

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
    description: 'Search SonarQube issues for a project. Returns issues sorted by severity (most severe first). Supports filtering by severity, type, and resolution status.',
    schema: {
      projectKey: z.string().optional().describe('Project key (defaults to SONARQUBE_PROJECT)'),
      severities: z.string().optional().describe('Comma-separated: INFO,MINOR,MAJOR,CRITICAL,BLOCKER'),
      types: z.string().optional().describe('Comma-separated: CODE_SMELL,BUG,VULNERABILITY,SECURITY_HOTSPOT'),
      resolved: z.boolean().optional().describe('Include resolved issues (default false)'),
      limit: z.number().optional().describe('Max issues (default 30, max 500)'),
    },
    handler: async ({ projectKey: pk, severities, types, resolved, limit }) => {
      const key = resolveProjectKey({ projectKey: pk });
      const params = new URLSearchParams({
        componentKeys: key,
        resolved: String(Boolean(resolved)),
        ps: String(Math.min(Number(limit) || 30, 500)),
        s: 'SEVERITY',
        asc: 'false',
      });
      if (severities) params.set('severities', severities);
      if (types) params.set('types', types);
      return maybeTruncated(await sonarGet(`/api/issues/search?${params.toString()}`));
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
    description: 'Run sonar-scanner analysis on the project. Requires sonar-project.properties in the project root and sonar-scanner installed.',
    schema: {
      cwd: z.string().optional().describe('Project root directory (defaults to current working directory)'),
      token: z.string().optional().describe('SonarQube token (defaults to SONARQUBE_TOKEN env var)'),
      projectKey: z.string().optional().describe('Overrides sonar.projectKey in properties file'),
    },
    handler: async ({ cwd, token, projectKey }) => {
      const dir = cwd || process.cwd();
      const propsPath = join(dir, 'sonar-project.properties');
      if (!existsSync(propsPath)) {
        throw new Error(`No sonar-project.properties found in ${dir}. Create one with at minimum:\n\nsonar.host.url=http://localhost:9000\nsonar.projectKey=my_project\nsonar.sources=src`);
      }

      const auth = token || process.env.SONARQUBE_TOKEN || '';
      if (!auth) {
        throw new Error('No token provided. Pass token argument or set SONARQUBE_TOKEN env var.');
      }

      const scannerPath = join(dir, 'node_modules', '.bin', 'sonar-scanner');
      const scanner = existsSync(scannerPath) ? scannerPath : 'sonar-scanner';

      const args = [`-Dsonar.token=${auth}`];
      if (projectKey) args.push(`-Dsonar.projectKey=${projectKey}`);

      const result = execSync(`${scanner} ${args.join(' ')}`, { cwd: dir, encoding: 'utf8', timeout: 300000 });
      return { success: true, output: result };
    },
  },
];
