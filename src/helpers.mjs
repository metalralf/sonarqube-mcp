// @ts-check
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';
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
    /* c8 ignore next */ } catch {}
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
  /* c8 ignore next */ } catch {}
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
export const buildSonarProps = (projectKey, hostUrl, sources, lang, dir) => {
  const cfg = lang && LANG_CONFIGS[lang];
  /* c8 ignore next */ const src = sources || cfg?.sources || 'src';
  let props = `sonar.host.url=${hostUrl}\nsonar.projectKey=${projectKey}\nsonar.sources=${src}\n`;
  if (cfg) {
    props += `sonar.exclusions=${cfg.exclusions}\n`;
    if (cfg.coverageProperty) props += `${cfg.coverageProperty}=${cfg.coverage}\n`;
    if (cfg.binaries) props += `sonar.java.binaries=${cfg.binaries}\n`;
  }
  /* c8 ignore start */ if (dir) {
    const javaVersion = detectJavaVersion(dir);
    if (javaVersion) props += `sonar.java.source=${javaVersion}\n`;
    const branch = detectGitBranch(dir);
    if (branch && branch !== 'HEAD') props += `sonar.branch.name=${branch}\n`;
  } /* c8 ignore end */
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
  /* c8 ignore next */ catch { dockerPath = '/usr/bin/docker'; }
  return dockerPath;
};
export { resolveDocker };

export const hasDocker = () => {
  if (process.env.SONARQUBE_DISABLE_DOCKER === 'true') return false;
  try { execSync(`${resolveDocker()} info`, { stdio: 'ignore', timeout: 5000 }); return true; }
  /* c8 ignore next */ catch { return false; }
};

/**
 * Get Docker image for scanner.
 * @returns {string} — override with SONARQUBE_DOCKER_IMAGE
 */
export const getDockerImage = () => process.env.SONARQUBE_DOCKER_IMAGE || 'sonarsource/sonar-scanner-cli:11.1';

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
  /* c8 ignore start */
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
  /* c8 ignore end */
};

/**
 * Detect Java version from build.gradle or pom.xml.
 * @param {string} dir — project root
 * @returns {number|null} — Java version (e.g. 21), or null
 */
const RE_SC_GRADLE = /sourceCompatibility\s*=\s*['"]?(\d+)/;
const RE_SC_GRADLE2 = /JavaVersion\.VERSION_(\d+)/;
const RE_SC_GRADLE3 = /java\s*\{[^}]*sourceCompatibility\s*=\s*(\d+)/s;
const RE_SC_POM_JV = /<java\.version>(\d+)<\/java\.version>/;
const RE_SC_POM_MC = /<maven\.compiler\.(source|release)>(\d+)<\/maven\.compiler\./;

export const detectJavaVersion = (dir) => {
  const gradle = join(dir, 'build.gradle');
  if (existsSync(gradle)) {
    const text = readFileSync(gradle, 'utf8');
    let m = RE_SC_GRADLE.exec(text) || RE_SC_GRADLE2.exec(text);
    if (m) return Number.parseInt(m[1], 10);
    const m2 = RE_SC_GRADLE3.exec(text);
    if (m2) return Number.parseInt(m2[1], 10);
  }
  const pom = join(dir, 'pom.xml');
  if (existsSync(pom)) {
    const text = readFileSync(pom, 'utf8');
    const m = RE_SC_POM_JV.exec(text) || RE_SC_POM_MC.exec(text);
    if (m) return Number.parseInt(m[1] || m[2], 10);
  }
  return null;
};

/**
 * Detect if Gradle or Maven project has submodules.
 * @param {string} dir — project root
 * @returns {{ hasSubmodules: boolean, type?: string }}
 */
export const detectMultiModule = (dir) => {
  const settings = ['settings.gradle', 'settings.gradle.kts'].find((f) => existsSync(join(dir, f)));
  if (settings) {
    const text = readFileSync(join(dir, settings), 'utf8');
    if (text.includes('include ')) return { hasSubmodules: true, type: 'Gradle' };
  }
  const pom = join(dir, 'pom.xml');
  if (existsSync(pom)) {
    const text = readFileSync(pom, 'utf8');
    if (text.includes('<module>')) return { hasSubmodules: true, type: 'Maven' };
  }
  return { hasSubmodules: false };
};

/**
 * Detect current git branch.
 * @param {string} dir — project root
 * @returns {string|null}
 */
let gitPath = '';
const resolveGit = () => {
  if (gitPath) return gitPath;
  try { gitPath = execSync('command -v git', { encoding: 'utf8', timeout: 3000 }).trim(); }
  catch { gitPath = '/usr/bin/git'; }
  return gitPath;
};

export const detectGitBranch = (dir) => {
  try {
    const branch = execSync(`${resolveGit()} rev-parse --abbrev-ref HEAD`, { cwd: dir, encoding: 'utf8', timeout: 5000 }).trim();
    return branch || null;
  } catch { return null; }
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
 * Build scanner CLI arguments from user params.
 * @param {{ auth: string, projectKey?: string, sonarSources: string, sonarTests?: string }} opts
 * @returns {string[]}
 */
export const buildScannerArgs = ({ auth, projectKey, sonarSources, sonarTests }) => {
  const args = [];
  if (auth) args.push(`-Dsonar.token=${auth}`);
  if (projectKey) args.push(`-Dsonar.projectKey=${projectKey}`);
  args.push(`-Dsonar.sources=${sonarSources}`);
  if (sonarTests !== undefined) args.push(`-Dsonar.tests=${sonarTests}`);
  return args;
};

/**
 * Run scanner (Docker or local) and return output.
 * @param {string} dir
 * @param {boolean} useDocker
 * @param {string[]} baseArgs
 * @returns {string}
 */
export const runScanner = (dir, useDocker, baseArgs) => {
  if (useDocker) return runDockerScanner(dir, baseArgs);
  return runLocalScanner(dir, baseArgs);
};

/**
 * Poll a SonarQube CE task until completion.
 * @param {string|undefined} ceTaskUrl
 * @param {number} [timeout] - max poll time in ms (default 60000)
 * @param {number} [interval] - poll interval in ms (default 2000)
 * @returns {Promise<{ task: { status: string } }|null>}
 */
export const pollCeTask = async (ceTaskUrl, timeout = 60000, interval = 2000) => {
  if (!ceTaskUrl) return null;
  const url = new URL(ceTaskUrl);
  const path = url.pathname + url.search;
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const data = await sonarGet(path);
    const status = data.task?.status;
    if (status === 'SUCCESS') return data;
    if (status === 'FAILED' || status === 'CANCELED') throw new Error(`CE task ${status.toLowerCase()}: ${data.task?.errorMessage || 'Unknown error'}`);
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error('CE task polling timed out after 60s');
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

/** @type {Record<string, string>} file extension -> SonarQube language key */
export const EXT_LANGUAGE_MAP = {
  '.ts': 'ts', '.tsx': 'ts',
  '.js': 'js', '.jsx': 'js', '.mjs': 'js', '.cjs': 'js',
  '.py': 'py',
  '.java': 'java',
  '.cs': 'cs',
  '.go': 'go',
  '.rb': 'ruby',
  '.kt': 'kotlin', '.kts': 'kotlin',
  '.scala': 'scala',
  '.php': 'php',
  '.rs': 'rust',
  '.swift': 'swift',
  '.css': 'css', '.scss': 'css', '.less': 'css', '.sass': 'css',
  '.html': 'web', '.htm': 'web',
  '.xml': 'xml', '.xsd': 'xml', '.xsl': 'xml',
  '.yaml': 'yaml', '.yml': 'yaml',
  '.tf': 'terraform',
  '.json': 'json',
  '.sh': 'shell',
  '.sql': 'sql',
};

/** @type {Record<string, string>} SonarQube language key -> display name */
export const LANGUAGE_NAMES = {
  ts: 'TypeScript', js: 'JavaScript', py: 'Python', java: 'Java', cs: 'C#',
  go: 'Go', ruby: 'Ruby', kotlin: 'Kotlin', scala: 'Scala', php: 'PHP',
  rust: 'Rust', swift: 'Swift', css: 'CSS', web: 'HTML', xml: 'XML',
  yaml: 'YAML', terraform: 'Terraform', json: 'JSON', shell: 'Shell',
  sql: 'SQL', docker: 'Docker',
};

/** @type {Set<string>} directories to skip when walking for source files */
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'target', 'venv', '.venv', '__pycache__', '.next', 'coverage', 'obj', 'bin', '.idea', '.vscode']);

/**
 * Walk a source directory and inventory detected SonarQube language keys.
 * @param {string} dir — project root
 * @param {string} [sources] - sources path relative to dir (default 'src')
 * @returns {string[]} — sorted unique language keys
 */
export const detectSourceLanguages = (dir, sources = 'src') => {
  const root = sources === '.' ? dir : join(dir, sources);
  if (!existsSync(root)) return [];
  const langs = new Set();
  const walk = (d, depth) => {
    if (depth > 8) return;
    let entries;
    try { entries = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(join(d, e.name), depth + 1); }
      else {
        if (e.name === 'Dockerfile' || e.name.startsWith('Dockerfile.')) langs.add('docker');
        const ext = extname(e.name).toLowerCase();
        const k = EXT_LANGUAGE_MAP[ext];
        if (k) langs.add(k);
      }
    }
  };
  walk(root, 0);
  return [...langs].sort((a, b) => a.localeCompare(b));
};

/** @type {string[]} candidate test directory names in priority order */
const TEST_DIR_CANDIDATES = ['test', 'tests', 'spec', '__tests__', 'e2e', 'integration-test'];

/**
 * Find the first existing test directory.
 * @param {string} dir — project root
 * @returns {string} — directory name, or '' if none found
 */
export const detectTestsDir = (dir) => TEST_DIR_CANDIDATES.find((d) => existsSync(join(dir, d))) || '';

/**
 * Read and parse .gitignore into a list of patterns (comments and negations removed).
 * @param {string} dir — project root
 * @returns {string[]}
 */
export const parseGitignore = (dir) => {
  const path = join(dir, '.gitignore');
  if (!existsSync(path)) return [];
  try {
    const text = readFileSync(path, 'utf8');
    return text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && !l.startsWith('!'));
  } /* c8 ignore next */ catch { return []; }
};

/** @type {string[]} known build-artifact / generated patterns always excluded */
const ARTIFACT_PATTERNS = ['node_modules/**', 'dist/**', 'build/**', 'target/**', 'venv/**', '.venv/**', '__pycache__/**', '.next/**', 'coverage/**', 'obj/**', 'bin/**', '*.g.cs', '*.generated.*'];

/**
 * Build a comma-separated exclusions list from .gitignore dir patterns merged with known artifacts.
 * @param {string} dir — project root
 * @returns {string}
 */
export const detectExclusions = (dir) => {
  const gi = parseGitignore(dir);
  const giPatterns = gi.map((p) => (p.endsWith('/') ? `${p}**` : p));
  const merged = [...new Set([...giPatterns, ...ARTIFACT_PATTERNS])];
  return merged.join(',');
};

/** @type {{ file: string, property: string }[]} well-known coverage report locations */
const COVERAGE_FILES = [
  { file: 'coverage/lcov.info', property: 'sonar.javascript.lcov.reportPaths' },
  { file: 'coverage.xml', property: 'sonar.python.coverage.reportPaths' },
  { file: 'target/site/jacoco/jacoco.xml', property: 'sonar.coverage.jacoco.xmlReportPaths' },
  { file: 'coverage.cobertura.xml', property: 'sonar.coverage.cobertura.reportPaths' },
];

/**
 * Detect a coverage report file and its SonarQube property.
 * @param {string} dir — project root
 * @returns {{ reportPaths: string, property: string } | null}
 */
export const detectCoverageReport = (dir) => {
  const found = COVERAGE_FILES.find((c) => existsSync(join(dir, c.file)));
  if (!found) return null;
  return { reportPaths: found.file, property: found.property };
};

/** @type {{ file: string, buildTool: string, scanner: string }[]} build-tool detection rules */
const BUILD_TOOLS = [
  { file: 'pnpm-lock.yaml', buildTool: 'pnpm', scanner: 'sonar-scanner-cli' },
  { file: 'package-lock.json', buildTool: 'npm', scanner: 'sonar-scanner-cli' },
  { file: 'yarn.lock', buildTool: 'yarn', scanner: 'sonar-scanner-cli' },
  { file: 'pom.xml', buildTool: 'Maven', scanner: 'sonar-scanner-maven' },
  { file: 'build.gradle', buildTool: 'Gradle', scanner: 'sonar-scanner-gradle' },
  { file: 'build.gradle.kts', buildTool: 'Gradle', scanner: 'sonar-scanner-gradle' },
  { file: 'requirements.txt', buildTool: 'pip', scanner: 'sonar-scanner-cli' },
  { file: 'pyproject.toml', buildTool: 'pdm', scanner: 'sonar-scanner-cli' },
  { file: 'go.mod', buildTool: 'Go modules', scanner: 'sonar-scanner-cli' },
  { file: 'Cargo.toml', buildTool: 'Cargo', scanner: 'sonar-scanner-cli' },
];

/**
 * Detect build tool and suggested scanner from well-known manifest files.
 * Handles .sln (any filename) as a special case.
 * @param {string} dir — project root
 * @returns {{ buildTool: string, scanner: string } | null}
 */
export const detectBuildTool = (dir) => {
  const found = BUILD_TOOLS.find((b) => existsSync(join(dir, b.file)));
  if (found) return { buildTool: found.buildTool, scanner: found.scanner };
  try {
    const sln = readdirSync(dir).find((f) => f.endsWith('.sln'));
    if (sln) return { buildTool: '.NET / MSBuild', scanner: 'sonar-scanner-dotnet' };
  } /* c8 ignore next */ catch {}
  return null;
};

/** @type {string[]} SonarQube config files that indicate an existing analysis configuration */
const SONAR_CONFIG_FILES = ['sonar-project.properties', '.sonarcloud.properties', 'sonar-project.xml'];

/**
 * Check whether the project already has a SonarQube analysis configuration.
 * @param {string} dir — project root
 * @returns {boolean}
 */
export const hasExistingSonarConfig = (dir) => SONAR_CONFIG_FILES.some((f) => existsSync(join(dir, f)));

/**
 * Detect the sources directory: 'src' if it exists and contains files, otherwise '.'.
 * @param {string} dir — project root
 * @returns {string}
 */
export const detectSourcesDir = (dir) => {
  const src = join(dir, 'src');
  if (!existsSync(src)) return '.';
  try { if (readdirSync(src, { withFileTypes: true }).length === 0) return '.'; }
  /* c8 ignore next */ catch { return '.'; }
  return 'src';
};

/**
 * Project introspection result.
 * @typedef {Object} ProjectConfig
 * @property {string} projectBaseDir
 * @property {string} sources
 * @property {string} tests
 * @property {string} exclusions
 * @property {string} sourceEncoding
 * @property {string[]} detectedLanguages
 * @property {string} coverageReportPaths
 * @property {string} [coverageProperty]
 * @property {string} buildTool
 * @property {string} suggestedScanner
 * @property {boolean} hasExistingConfig
 */

/**
 * Inspect a project directory and return a suggested SonarQube analysis configuration.
 * Pure filesystem inspection — does not call the SonarQube API.
 * @param {string} dir — project root
 * @returns {ProjectConfig}
 */
export const detectProjectConfig = (dir) => {
  const hasExistingConfig = hasExistingSonarConfig(dir);
  const sources = detectSourcesDir(dir);
  const tests = detectTestsDir(dir);
  const exclusions = detectExclusions(dir);
  const langKeys = detectSourceLanguages(dir, sources);
  const detectedLanguages = langKeys.map((k) => LANGUAGE_NAMES[k] || k);
  const cov = detectCoverageReport(dir);
  const bt = detectBuildTool(dir);
  return {
    projectBaseDir: '.',
    sources,
    tests,
    exclusions,
    sourceEncoding: 'UTF-8',
    detectedLanguages,
    coverageReportPaths: cov ? cov.reportPaths : '',
    coverageProperty: cov ? cov.property : undefined,
    buildTool: bt ? bt.buildTool : '',
    suggestedScanner: bt ? bt.scanner : 'sonar-scanner-cli',
    hasExistingConfig,
  };
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
export const branch = /** @type {import('zod').ZodOptional<import('zod').ZodString>} */ (z.string().optional().describe('Long-lived branch name (e.g. main, develop). Use sonar_list_branches to discover valid names.'));
export const pullRequest = /** @type {import('zod').ZodOptional<import('zod').ZodString>} */ (z.string().optional().describe('Pull request key/ID. Use sonar_list_pull_requests to discover valid keys.'));

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
 * Add optional branch/pullRequest params to a URLSearchParams.
 * @param {URLSearchParams} params
 * @param {{ branch?: string, pullRequest?: string }} opts
 * @returns {URLSearchParams}
 */
export const addBranchParams = (params, { branch, pullRequest }) => {
  if (branch) params.set('branch', branch);
  if (pullRequest) params.set('pullRequest', pullRequest);
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
export const measureSearch = (metricKey, valueKey, defaultThresh, descend) => async ({ projectKey, branch, pullRequest, threshold }) => {
  const key = resolveProjectKey({ projectKey });
  const t = threshold ?? defaultThresh;
  const params = addBranchParams(new URLSearchParams({ projectKeys: key, metricKeys: metricKey, ps: '500' }), { branch, pullRequest });
  const data = await sonarGet(`/api/measures/search?${params.toString()}`);
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
  admin: ['sonar_list_webhooks', 'sonar_list_languages', 'sonar_ping', 'sonar_setup_scanner', 'sonar_run_analysis', 'sonar_fix_and_verify', 'sonar_detect_project_config'],
  rules: ['sonar_rule'],
  raw: ['sonar_raw'],
  composite: ['sonar_project_report', 'sonar_analyze_and_report', 'sonar_file_issues', 'sonar_new_issues_since', 'sonar_fix_and_verify', 'sonar_detect_project_config', 'sonar_file_review', 'sonar_scan_workflow', 'sonar_call_multiple'],
};

/** @type {Set<string>} */
export const READ_ONLY_TOOLS = new Set(['sonar_set_issue_status', 'sonar_change_hotspot_status', 'sonar_run_analysis', 'sonar_setup_scanner', 'sonar_call_multiple']);

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
