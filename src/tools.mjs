export const TOOLS = [
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
        projectKey: { type: 'string', description: 'Project key (defaults to SONARQUBE_PROJECT)' },
      },
    },
  },
  {
    name: 'sonar_measures',
    description: 'Get SonarQube metrics for a project: bugs, vulnerabilities, code smells, coverage, duplication, lines of code, and maintainability/security ratings.',
    inputSchema: {
      type: 'object',
      properties: {
        projectKey: { type: 'string', description: 'Project key (defaults to SONARQUBE_PROJECT)' },
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
        projectKey: { type: 'string', description: 'Project key (defaults to SONARQUBE_PROJECT)' },
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
        projectKey: { type: 'string', description: 'Project key (defaults to SONARQUBE_PROJECT)' },
        status: { type: 'string', description: 'TO_REVIEW or REVIEWED (default TO_REVIEW)' },
        limit: { type: 'number', description: 'Max results (default 30, max 500)' },
      },
    },
  },
  {
    name: 'sonar_rule',
    description: 'Get detailed information about a specific SonarQube rule: description, severity, type, and remediation guidance.',
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
        projectKey: { type: 'string', description: 'Project key (defaults to SONARQUBE_PROJECT)' },
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
