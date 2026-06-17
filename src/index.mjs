#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const HOST = (process.env.SONARQUBE_URL ?? 'http://localhost:9000').replace(/\/$/, '');
const TOKEN = process.env.SONARQUBE_TOKEN ?? '';
const DEFAULT_PROJECT = process.env.SONARQUBE_PROJECT ?? '';
const ORGANIZATION = process.env.SONARQUBE_ORGANIZATION ?? '';
const AUTH_SCHEME = process.env.SONARQUBE_AUTH_SCHEME ?? 'basic';

const log = (m) => process.stderr.write(`[sonarqube-mcp] ${m}\n`);

const authHeader = () =>
  AUTH_SCHEME === 'bearer'
    ? `Bearer ${TOKEN}`
    : `Basic ${Buffer.from(TOKEN + ':').toString('base64')}`;

const sonarGet = async (path) => {
  if (!TOKEN) throw new Error('SONARQUBE_TOKEN is not set');
  const res = await fetch(`${HOST}${path}`, { headers: { authorization: authHeader() } });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) {
    const detail = typeof body === 'object' ? JSON.stringify(body) : body;
    if (res.status === 403 && path.startsWith('/api/hotspots/')) {
      throw new Error(`SonarQube 403: security hotspots require a User token (squ_ prefix) with Browse permission. Project/Global analysis tokens (sqp_/sqa_) cannot read hotspots.`);
    }
    throw new Error(`SonarQube ${res.status}: ${detail}`);
  }
  return body;
};

const orgQuery = () => ORGANIZATION ? `&organization=${encodeURIComponent(ORGANIZATION)}` : '';

const projectKey = (args) => args.projectKey || DEFAULT_PROJECT || (() => { throw new Error('projectKey required — set SONARQUBE_PROJECT or pass projectKey'); })();

const DEFAULT_METRIC_KEYS = 'bugs,vulnerabilities,code_smells,security_hotspots,coverage,duplicated_lines_density,ncloc,reliability_rating,security_rating,sqale_rating';

const TOOLS = [
  {
    name: 'sonar_search_projects',
    description: 'Search/find SonarQube project keys. Use when no project is configured or to discover available projects.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Optional search query to filter projects by name/key' },
        limit: { type: 'number', description: 'Max results (default 50, max 500)' },
      },
    },
  },
  {
    name: 'sonar_quality_gate',
    description: 'Get the SonarQube quality gate status (OK/ERROR) for a project, including each failing condition with metric, actual value, and threshold.',
    inputSchema: {
      type: 'object',
      properties: {
        projectKey: { type: 'string', description: `Project key (defaults to SONARQUBE_PROJECT)` },
      },
    },
  },
  {
    name: 'sonar_measures',
    description: 'Get SonarQube metrics for a project: bugs, vulnerabilities, code smells, coverage, duplication, lines of code, and maintainability/security ratings.',
    inputSchema: {
      type: 'object',
      properties: {
        projectKey: { type: 'string', description: `Project key (defaults to SONARQUBE_PROJECT)` },
        metricKeys: { type: 'string', description: 'Comma-separated metric keys (default: bugs,vulnerabilities,code_smells,security_hotspots,coverage,duplicated_lines_density,ncloc,reliability_rating,security_rating,sqale_rating)' },
      },
    },
  },
  {
    name: 'sonar_issues',
    description: 'Search SonarQube issues for a project. Returns issues sorted by severity (most severe first). Supports filtering by severity, type, and resolution status.',
    inputSchema: {
      type: 'object',
      properties: {
        projectKey: { type: 'string', description: `Project key (defaults to SONARQUBE_PROJECT)` },
        severities: { type: 'string', description: 'Comma-separated: INFO,MINOR,MAJOR,CRITICAL,BLOCKER' },
        types: { type: 'string', description: 'Comma-separated: CODE_SMELL,BUG,VULNERABILITY,SECURITY_HOTSPOT' },
        resolved: { type: 'boolean', description: 'Include resolved issues (default false)' },
        limit: { type: 'number', description: 'Max issues (default 30, max 500)' },
      },
    },
  },
  {
    name: 'sonar_hotspots',
    description: 'Search SonarQube security hotspots for a project. Requires a User token (squ_ prefix) with Browse permission — analysis tokens (sqp_/sqa_) will get a 403 error.',
    inputSchema: {
      type: 'object',
      properties: {
        projectKey: { type: 'string', description: `Project key (defaults to SONARQUBE_PROJECT)` },
        status: { type: 'string', description: 'TO_REVIEW or REVIEWED (default TO_REVIEW)' },
        limit: { type: 'number', description: 'Max results (default 30, max 500)' },
      },
    },
  },
  {
    name: 'sonar_rule',
    description: 'Get detailed information about a specific SonarQube rule: description, severity, type, and remediation guidance. Useful after seeing an issue to understand what it means and how to fix it.',
    inputSchema: {
      type: 'object',
      properties: {
        ruleKey: { type: 'string', description: 'Rule key (e.g. typescript:S6544, java:S123, squid:S00100)' },
      },
      required: ['ruleKey'],
    },
  },
  {
    name: 'sonar_source',
    description: 'View source code lines for a SonarQube file component. Useful to see the context around a flagged issue or hotspot.',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Full component key (e.g. my-project:src/index.ts)' },
        from: { type: 'number', description: 'Starting line number (1-indexed)' },
        to: { type: 'number', description: 'Ending line number (inclusive)' },
      },
      required: ['key'],
    },
  },
  {
    name: 'sonar_analysis_status',
    description: 'Check if a project has been analyzed on SonarQube. Returns whether analysis data exists and guidance if not.',
    inputSchema: {
      type: 'object',
      properties: {
        projectKey: { type: 'string', description: `Project key (defaults to SONARQUBE_PROJECT)` },
      },
    },
  },
  {
    name: 'sonar_raw',
    description: 'Escape hatch — call any SonarQube Web API GET endpoint directly. Path must start with /api/. Returns the raw JSON response.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'API path starting with /api/ (e.g. /api/system/health, /api/metrics/search)' },
      },
      required: ['path'],
    },
  },
];

const HANDLERS = {
  sonar_search_projects: async (args) => {
    const params = new URLSearchParams({ ps: String(Math.min(Number(args.limit) || 50, 500)) });
    if (args.query) params.set('q', args.query);
    const data = await sonarGet(`/api/projects/search?${params.toString()}${orgQuery()}`);
    if (data.paging) data._truncated = data.paging.total > data.paging.pageSize;
    return data;
  },

  sonar_quality_gate: async (args) => {
    const pk = projectKey(args);
    return sonarGet(`/api/qualitygates/project_status?projectKey=${encodeURIComponent(pk)}`);
  },

  sonar_measures: async (args) => {
    const pk = projectKey(args);
    const metricKeys = args.metricKeys || DEFAULT_METRIC_KEYS;
    return sonarGet(`/api/measures/component?component=${encodeURIComponent(pk)}&metricKeys=${encodeURIComponent(metricKeys)}`);
  },

  sonar_issues: async (args) => {
    const pk = projectKey(args);
    const params = new URLSearchParams({
      componentKeys: pk,
      resolved: String(Boolean(args.resolved)),
      ps: String(Math.min(Number(args.limit) || 30, 500)),
      s: 'SEVERITY',
      asc: 'false',
    });
    if (args.severities) params.set('severities', args.severities);
    if (args.types) params.set('types', args.types);
    const data = await sonarGet(`/api/issues/search?${params.toString()}`);
    if (data.paging) data._truncated = data.paging.total > data.paging.pageSize;
    return data;
  },

  sonar_hotspots: async (args) => {
    const pk = projectKey(args);
    const params = new URLSearchParams({
      projectKey: pk,
      status: args.status || 'TO_REVIEW',
      ps: String(Math.min(Number(args.limit) || 30, 500)),
    });
    const data = await sonarGet(`/api/hotspots/search?${params.toString()}`);
    if (data.paging) data._truncated = data.paging.total > data.paging.pageSize;
    return data;
  },

  sonar_rule: async (args) => {
    if (!args.ruleKey) throw new Error('ruleKey is required');
    return sonarGet(`/api/rules/show?key=${encodeURIComponent(args.ruleKey)}`);
  },

  sonar_source: async (args) => {
    if (!args.key) throw new Error('key (component key) is required');
    const params = new URLSearchParams({ key: args.key });
    if (args.from) params.set('from', String(args.from));
    if (args.to) params.set('to', String(args.to));
    return sonarGet(`/api/sources/lines?${params.toString()}`);
  },

  sonar_analysis_status: async (args) => {
    const pk = projectKey(args);
    const proj = await sonarGet(`/api/projects/search?q=${encodeURIComponent(pk)}&ps=1`).catch(() => null);
    if (!proj?.components?.length) {
      return { status: 'NOT_FOUND', message: `Project "${pk}" does not exist on ${HOST}. Run sonar-scanner first:\n\n  sonar-scanner -Dsonar.login=squ_...\n\nOr create it via the SonarQube UI, then run analysis.` };
    }
    const analyses = await sonarGet(`/api/project_analyses/search?project=${encodeURIComponent(pk)}&ps=1`).catch(() => null);
    if (!analyses?.analyses?.length) {
      return { status: 'NOT_ANALYZED', message: `Project "${pk}" exists but has no analysis data. Run sonar-scanner:\n\n  sonar-scanner -Dsonar.login=squ_...` };
    }
    const last = analyses.analyses[0];
    return { status: 'ANALYZED', lastAnalysis: last.date, projectUrl: `${HOST}/dashboard?id=${encodeURIComponent(pk)}`, message: `Project "${pk}" was last analyzed on ${last.date}.` };
  },

  sonar_raw: async (args) => {
    if (!args.path?.startsWith('/')) throw new Error('path must start with /');
    return sonarGet(args.path);
  },
};

const server = new Server({ name: 'sonarqube-mcp', version: '1.0.0' }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const handler = HANDLERS[req.params.name];
  if (!handler) {
    return { content: [{ type: 'text', text: `Unknown tool: ${req.params.name}` }], isError: true };
  }
  try {
    const data = await handler(req.params.arguments ?? {});
    const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    return { content: [{ type: 'text', text }] };
  } catch (e) {
    return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
  }
});

await server.connect(new StdioServerTransport());
log(`ready — host=${HOST} project=${DEFAULT_PROJECT || '(none)'} token=${TOKEN ? 'set' : 'MISSING'}`);
