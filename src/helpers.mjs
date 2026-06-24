// @ts-check
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { z } from 'zod';
import { sonarGet, resolveProjectKey } from './api.mjs';
export { sonarGet, resolveProjectKey };
export { sonarPost, sonarCheckServer, orgQuery, maybeTruncated, getHostUrl } from './api.mjs';

/**
 * @typedef {'python'|'javascript'|'typescript'|'java'|'kotlin'|'go'|'csharp'} Language
 */

/**
 * @type {Record<string, { sources: string, tests: string, coverage: string, exclusions: string, binaries?: string, coverageProperty?: string }>}
 */
export const LANG_CONFIGS = {
  python: {
    sources: 'src',
    tests: 'test',
    coverage: 'coverage.xml',
    exclusions: 'venv/**,.venv/**,__pycache__/**,*.pyc,*.pyo,.mypy_cache/,.pytest_cache/',
    coverageProperty: 'sonar.python.coverage.reportPaths',
  },
  javascript: {
    sources: 'src',
    tests: 'test',
    coverage: 'coverage/lcov.info',
    exclusions: 'node_modules/**,bower_components/**,dist/**,build/**',
    coverageProperty: 'sonar.javascript.lcov.reportPaths',
  },
  typescript: {
    sources: 'src',
    tests: 'test',
    coverage: 'coverage/lcov.info',
    exclusions: 'node_modules/**,bower_components/**,dist/**,build/**,**/*.d.ts',
    coverageProperty: 'sonar.javascript.lcov.reportPaths',
  },
  java: {
    sources: 'src/main',
    tests: 'src/test',
    coverage: 'target/site/jacoco/jacoco.xml',
    exclusions: 'build/**,target/**,*.class,*.jar',
    binaries: 'build/classes/java/main',
    coverageProperty: 'sonar.coverage.jacoco.xmlReportPaths',
  },
  kotlin: {
    sources: 'src/main',
    tests: 'src/test',
    coverage: 'build/reports/kover/report.xml',
    exclusions: 'build/**,target/**',
    binaries: 'build/classes/kotlin/main',
    coverageProperty: 'sonar.coverage.jacoco.xmlReportPaths',
  },
  go: {
    sources: '.',
    tests: '.',
    coverage: 'coverage.out',
    exclusions: 'vendor/**,*.pb.go',
    coverageProperty: 'sonar.go.coverage.reportPaths',
  },
  csharp: {
    sources: 'src',
    tests: 'test',
    coverage: 'coverage.cobertura.xml',
    exclusions: 'bin/**,obj/**,**/node_modules/**',
    coverageProperty: 'sonar.cs.coverage.reportPaths',
  },
};

/**
 * Detect project language by sniffing for well-known files.
 * @param {string} dir — project root directory
 * @returns {Language|null}
 */
export const detectLanguage = (dir) => {
  if (existsSync(join(dir, 'package.json'))) {
    try {
      const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps?.typescript || deps?.tslib || deps?.['@types/node']) return 'typescript';
    } catch {}
    return 'javascript';
  }
  if (existsSync(join(dir, 'requirements.txt')) || existsSync(join(dir, 'setup.py')) || existsSync(join(dir, 'pyproject.toml')) || existsSync(join(dir, 'Pipfile'))) return 'python';
  if (existsSync(join(dir, 'pom.xml')) || existsSync(join(dir, 'build.gradle')) || existsSync(join(dir, 'build.gradle.kts'))) {
    if (existsSync(join(dir, 'pom.xml'))) {
      const pom = readFileSync(join(dir, 'pom.xml'), 'utf8');
      if (pom.includes('kotlin')) return 'kotlin';
    }
    return 'java';
  }
  if (existsSync(join(dir, 'go.mod'))) return 'go';
  try {
    const files = readdirSync(dir);
    if (files.some((f) => f.endsWith('.csproj'))) return 'csharp';
  } catch {}
  return null;
};

/**
 * Build sonar-project.properties content with language-aware defaults.
 * @param {string} projectKey
 * @param {string} hostUrl
 * @param {string} sources
 * @param {Language|null} lang
 * @returns {string}
 */
export const buildSonarProps = (projectKey, hostUrl, sources, lang) => {
  const cfg = lang && LANG_CONFIGS[lang];
  const src = sources || cfg?.sources || 'src';
  let props = `sonar.host.url=${hostUrl}\nsonar.projectKey=${projectKey}\nsonar.sources=${src}\n`;
  if (cfg) {
    props += `sonar.exclusions=${cfg.exclusions}\nsonar.tests=${cfg.tests}\n`;
    if (cfg.coverageProperty) props += `${cfg.coverageProperty}=${cfg.coverage}\n`;
    if (cfg.binaries) props += `sonar.java.binaries=${cfg.binaries}\n`;
  }
  return props;
};

/**
 * Check if Docker is available on the host.
 * Disable with SONARQUBE_DISABLE_DOCKER=true for deterministic tests.
 * @returns {boolean}
 */
let dockerPath = '';
const resolveDocker = () => {
  if (dockerPath) return dockerPath;
  try { dockerPath = execSync('command -v docker', { encoding: 'utf8', timeout: 3000 }).trim(); }
  catch { dockerPath = '/usr/bin/docker'; }
  return dockerPath;
};
export { resolveDocker };

export const hasDocker = () => {
  if (process.env.SONARQUBE_DISABLE_DOCKER === 'true') return false;
  try { execSync(`${resolveDocker()} info`, { stdio: 'ignore', timeout: 5000 }); return true; }
  catch { return false; }
};

/**
 * Get Docker image for scanner.
 * @returns {string} — override with SONARQUBE_DOCKER_IMAGE
 */
export const getDockerImage = () => process.env.SONARQUBE_DOCKER_IMAGE || 'sonarsource/sonar-scanner-cli';

/**
 * Get Docker run flags.
 * @returns {string} — override with SONARQUBE_DOCKER_FLAGS (e.g. '--network=bridge' or '')
 */
export const getDockerFlags = () => process.env.SONARQUBE_DOCKER_FLAGS ?? '--network=host';

/**
 * Get scanner timeout in ms.
 * @returns {number} — override with SONARQUBE_SCANNER_TIMEOUT (default 300000 = 5 min)
 */
export const getScannerTimeout = () => Number.parseInt(process.env.SONARQUBE_SCANNER_TIMEOUT || '300000', 10);

/**
 * Get API timeout in ms for health check.
 * @returns {number} — override with SONARQUBE_API_TIMEOUT (default 5000)
 */
export const getApiTimeout = () => Number.parseInt(process.env.SONARQUBE_API_TIMEOUT || '5000', 10);

/**
 * Get Docker mount path inside container.
 * @returns {string} — override with SONARQUBE_DOCKER_MOUNT_PATH (default /usr/src)
 */
export const getDockerMountPath = () => process.env.SONARQUBE_DOCKER_MOUNT_PATH || '/usr/src';

/**
 * Get source context lines around issues.
 * @returns {number} — override with SONARQUBE_SOURCE_CONTEXT (default 2)
 */
export const getSourceContext = () => Number.parseInt(process.env.SONARQUBE_SOURCE_CONTEXT || '2', 10);

/**
 * Auto-detect build tool and attempt to build a compiled language project.
 * @param {string} dir — project root
 * @param {{ binaries?: string }} langCfg — language config with optional binaries path
 * @returns {{ performed: boolean }}
 */
export const autoBuild = (dir, langCfg) => {
  if (!langCfg?.binaries || existsSync(join(dir, langCfg.binaries))) return { performed: false };
  const hasGradle = existsSync(join(dir, 'build.gradle')) || existsSync(join(dir, 'build.gradle.kts'));
  const hasMaven = existsSync(join(dir, 'pom.xml'));
  if (hasGradle) {
    execSync(`${existsSync(join(dir, 'gradlew')) ? './gradlew' : 'gradle'} build -x test`, { cwd: dir, encoding: 'utf8', timeout: 300000 });
    return { performed: true };
  }
  if (hasMaven) {
    execSync(`${existsSync(join(dir, 'mvnw')) ? './mvnw' : 'mvn'} compile -DskipTests`, { cwd: dir, encoding: 'utf8', timeout: 300000 });
    return { performed: true };
  }
  return { performed: false };
};

/**
 * Run Docker scanner and return output.
 * @param {string} dir
 * @returns {string}
 */
const runDockerScanner = (dir, baseArgs) => execSync(`${resolveDocker()} run --rm ${getDockerFlags() ? getDockerFlags() + ' ' : ''}-v "${dir}:${getDockerMountPath()}" ${getDockerImage()} ${baseArgs.join(' ')}`, { encoding: 'utf8', timeout: getScannerTimeout() });

/**
 * Run local sonar-scanner and return output.
 * @param {string} dir
 * @returns {string}
 */
const runLocalScanner = (dir, baseArgs) => {
  const scannerBin = existsSync(join(dir, 'node_modules', '.bin', 'sonar-scanner')) ? join(dir, 'node_modules', '.bin', 'sonar-scanner') : 'sonar-scanner';
  return execSync(`${scannerBin} ${baseArgs.join(' ')}`, { cwd: dir, encoding: 'utf8', timeout: getScannerTimeout() });
};

export { runDockerScanner, runLocalScanner };

/**
 * Build hints array from scanner output.
 * @param {string} output — scanner log
 * @param {string|null} lang — detected language
 * @returns {string[]}
 */
export const buildScannerHints = (output, lang) => {
  const hints = [];
  if (output.includes('No coverage')) hints.push('Coverage report was not found. Run tests with coverage enabled before analysis (e.g. ./gradlew test jacocoTestReport).');
  if (output.includes('Missing blame information') && lang === 'java') hints.push('SCM blame info is missing. Run analysis from the project root directory with git history.');
  return hints;
};

/**
 * Extract CE task URL from scanner output.
 * @param {string} output
 * @param {string} hostUrl
 * @returns {string|undefined}
 */
export const extractCeTaskUrl = (output, hostUrl) => {
  const re = /api\/ce\/task\?id=([a-f0-9-]+)/;
  const m = re.exec(output);
  return m ? `${hostUrl}/api/ce/task?id=${m[1]}` : undefined;
};

/**
 * Map common scanner errors to actionable messages.
 * @param {string} msg — raw error message from scanner
 * @returns {string|undefined} — mapped message, or undefined if no match
 */
export const mapScannerError = (msg) => {
  if (msg.includes("can't be indexed twice")) return 'Your sonar.sources and sonar.tests paths overlap. Set sonar.sources=src/main (or the correct source directory) and sonar.tests=src/test.';
  if (msg.includes('No files nor directories matching') || msg.includes('sonar.java.binaries')) return 'No compiled class files found. Build the project first (e.g. ./gradlew build) or set sonar.java.binaries to the correct path.';
  return undefined;
};

/**
 * @param {string} v
 * @returns {string}
 */
export const encode = (v) => encodeURIComponent(v);

/**
 * @callback ToolHandler
 * @param {Object} params
 * @returns {Promise<any>}
 */

/**
 * @typedef {Object} ToolConfig
 * @property {string} name
 * @property {string} description
 * @property {Record<string, import('zod').ZodTypeAny>} schema
 * @property {ToolHandler} handler
 */

/**
 * @param {string} name
 * @param {string} description
 * @param {Record<string, import('zod').ZodTypeAny>} schema
 * @param {ToolHandler} handler
 * @returns {ToolConfig}
 */
export const tool = (name, description, schema, handler) => ({ name, description, schema, handler });

export const projectKey = /** @type {import('zod').ZodOptional<import('zod').ZodString>} */ (z.string().optional().describe('Project key (defaults to SONARQUBE_PROJECT)'));
export const componentKey = /** @type {import('zod').ZodString} */ (z.string().describe('Full component key (e.g. my-project:src/file.ts)'));
export const maxResults = /** @type {import('zod').ZodOptional<import('zod').ZodNumber>} */ (z.number().optional().describe('Max results (default 50, max 500)'));

/**
 * @param {string} key
 * @returns {void}
 */
export const requireKey = (key) => { if (!key) throw new Error('key (component key) is required'); };

/**
 * @param {string} key
 * @param {number | undefined} from
 * @param {number | undefined} to
 * @returns {URLSearchParams}
 */
export const componentParams = (key, from, to) => {
  const params = new URLSearchParams({ key });
  if (from) params.set('from', String(from));
  if (to) params.set('to', String(to));
  return params;
};

/**
 * @param {any} issueData — response from /api/issues/search
 * @returns {{ bySeverity: Record<string, number>, byType: Record<string, number> }}
 */
export const parseIssueFacets = (issueData) => {
  /** @type {Record<string, number>} */
  const bySeverity = {};
  /** @type {Record<string, number>} */
  const byType = {};
  for (const f of issueData?.facets || []) {
    if (f.property !== 'severities' && f.property !== 'types') continue;
    const target = f.property === 'severities' ? bySeverity : byType;
    for (const v of f.values) if (v.count > 0) target[v.val] = v.count;
  }
  return { bySeverity, byType };
};

/**
 * @param {string} metricKey
 * @param {string} valueKey
 * @param {number} defaultThresh
 * @param {boolean} descend
 * @returns {ToolHandler}
 */
export const measureSearch = (metricKey, valueKey, defaultThresh, descend) => async ({ projectKey, threshold }) => {
  const key = resolveProjectKey({ projectKey });
  const t = threshold ?? defaultThresh;
  const data = await sonarGet(`/api/measures/search?projectKeys=${encode(key)}&metricKeys=${metricKey}&ps=500`);
  const extract = (/** @type {any} */ m) => ({ path: m.component.split(':').pop(), [valueKey]: Number.parseFloat(m.value) });
  const items = (data.measures || []).filter((/** @type {any} */ m) => m.value !== undefined && m.component !== key && m.component);
  const sorted = items.map(extract).filter((/** @type {any} */ f) => (descend ? f[valueKey] > t : f[valueKey] < t)).sort((/** @type {any} */ a, /** @type {any} */ b) => descend ? b[valueKey] - a[valueKey] : a[valueKey] - b[valueKey]);
  return { total: items.length, threshold: t, files: sorted };
};

/** @type {Record<string, string[]>} */
export const TOOL_CATEGORIES = {
  projects: ['sonar_search_projects', 'sonar_summary', 'sonar_project_report', 'sonar_analyze_and_report', 'sonar_analysis_status', 'sonar_project_details', 'sonar_projects_create'],
  issues: ['sonar_issues', 'sonar_issues_summary', 'sonar_new_issues', 'sonar_set_issue_status', 'sonar_issues_bulk_transition'],
  hotspots: ['sonar_hotspots', 'sonar_hotspot_details', 'sonar_change_hotspot_status'],
  quality: ['sonar_quality_gate', 'sonar_list_quality_gates', 'sonar_measures', 'sonar_search_metrics'],
  coverage: ['sonar_coverage_files', 'sonar_file_coverage_details'],
  duplications: ['sonar_search_duplicated_files', 'sonar_duplications'],
  history: ['sonar_metrics_history'],
  worst: ['sonar_worst_metrics'],
  scm: ['sonar_source', 'sonar_scm_info'],
  branches: ['sonar_list_branches', 'sonar_list_pull_requests'],
  admin: ['sonar_list_webhooks', 'sonar_list_languages', 'sonar_ping', 'sonar_setup_scanner', 'sonar_run_analysis', 'sonar_fix_and_verify'],
  rules: ['sonar_rule'],
  raw: ['sonar_raw'],
};

/** @type {Set<string>} */
export const READ_ONLY_TOOLS = new Set(['sonar_set_issue_status', 'sonar_change_hotspot_status', 'sonar_run_analysis', 'sonar_setup_scanner']);

/**
 * @param {ToolConfig[]} all
 * @returns {ToolConfig[]}
 */
export const filterTools = (all) => {
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
