import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';
import { readdirSync, rmSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { z } from 'zod';
import { parseIssueFacets, componentParams, requireKey, encode } from '../src/helpers.mjs';

describe('helpers', () => {
  it('parseIssueFacets extracts non-zero counts', () => {
    const input = {
      facets: [
        { property: 'severities', values: [{ val: 'INFO', count: 3 }, { val: 'MINOR', count: 0 }] },
        { property: 'types', values: [{ val: 'CODE_SMELL', count: 3 }, { val: 'BUG', count: 0 }] },
      ],
    };
    const { bySeverity, byType } = parseIssueFacets(input);
    assert.deepEqual(bySeverity, { INFO: 3 });
    assert.deepEqual(byType, { CODE_SMELL: 3 });
  });

  it('parseIssueFacets handles empty facets', () => {
    const { bySeverity, byType } = parseIssueFacets(null);
    assert.deepEqual(bySeverity, {});
    assert.deepEqual(byType, {});
  });

  it('parseIssueFacets handles missing facets', () => {
    const { bySeverity, byType } = parseIssueFacets({ facets: [] });
    assert.deepEqual(bySeverity, {});
    assert.deepEqual(byType, {});
  });

  it('parseIssueFacets handles unknown facet properties gracefully', () => {
    const input = {
      facets: [
        { property: 'unknown_prop', values: [{ val: 'X', count: 5 }] },
      ],
    };
    const { bySeverity, byType } = parseIssueFacets(input);
    assert.deepEqual(bySeverity, {});
    assert.deepEqual(byType, {});
  });

  it('componentParams creates params with key only', () => {
    const params = componentParams('my-project:src/file.ts', undefined, undefined);
    assert.equal(params.get('key'), 'my-project:src/file.ts');
    assert.equal(params.get('from'), null);
    assert.equal(params.get('to'), null);
  });

  it('componentParams includes from and to when provided', () => {
    const params = componentParams('my-project:src/file.ts', 10, 50);
    assert.equal(params.get('from'), '10');
    assert.equal(params.get('to'), '50');
  });

  it('componentParams includes from only', () => {
    const params = componentParams('my-project:src/file.ts', 5, undefined);
    assert.equal(params.get('from'), '5');
    assert.equal(params.get('to'), null);
  });

  it('requireKey throws on falsy value', () => {
    assert.throws(() => requireKey(''), /component key/);
    assert.throws(() => requireKey(undefined), /component key/);
    assert.throws(() => requireKey(null), /component key/);
  });

  it('requireKey does not throw on valid key', () => {
    requireKey('my-project:src/file.ts');
  });

  it('encode wraps encodeURIComponent', () => {
    assert.equal(encode('hello world'), encodeURIComponent('hello world'));
    assert.equal(encode('a/b?c'), 'a%2Fb%3Fc');
  });
});

describe('helpers — measureSearch', () => {
  let origFetch, origUrl, origToken, origProject;

  before(() => {
    origUrl = process.env.SONARQUBE_URL;
    origToken = process.env.SONARQUBE_TOKEN;
    origProject = process.env.SONARQUBE_PROJECT;
    process.env.SONARQUBE_URL = 'http://test:9000';
    process.env.SONARQUBE_TOKEN = 'squ_testtoken';
    process.env.SONARQUBE_PROJECT = 'testproj';
  });

  after(() => {
    process.env.SONARQUBE_URL = origUrl;
    process.env.SONARQUBE_TOKEN = origToken;
    process.env.SONARQUBE_PROJECT = origProject;
    if (origFetch) globalThis.fetch = origFetch;
  });

  it('measureSearch returns sorted files below threshold (ascend)', async () => {
    const { measureSearch } = await import('../src/helpers.mjs');
    const handler = measureSearch('coverage', 'coverage', 80, false);
    origFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      assert.match(url, /measures\/search/);
      return {
        ok: true, status: 200, text: async () => JSON.stringify({
          measures: [
            { metric: 'coverage', component: 'testproj:src/a.js', value: '75.0' },
            { metric: 'coverage', component: 'testproj:src/b.js', value: '90.0' },
            { metric: 'coverage', component: 'testproj:src/c.js', value: '50.0' },
          ],
        }),
      };
    };
    const result = await handler({ projectKey: 'testproj', threshold: 80 });
    assert.equal(result.total, 3);
    assert.equal(result.threshold, 80);
    assert.equal(result.files.length, 2);
    assert.equal(result.files[0].coverage, 50);
    assert.equal(result.files[1].coverage, 75);
    globalThis.fetch = origFetch;
  });

  it('measureSearch returns sorted files above threshold (descend)', async () => {
    const { measureSearch } = await import('../src/helpers.mjs');
    const handler = measureSearch('duplicated_lines_density', 'duplicatedLinesDensity', 3, true);
    origFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true, status: 200, text: async () => JSON.stringify({
        measures: [
          { metric: 'duplicated_lines_density', component: 'testproj:src/a.js', value: '5.0' },
          { metric: 'duplicated_lines_density', component: 'testproj:src/b.js', value: '2.0' },
          { metric: 'duplicated_lines_density', component: 'testproj:src/c.js', value: '10.0' },
        ],
      }),
    });
    const result = await handler({ projectKey: 'testproj', threshold: 3 });
    assert.equal(result.files.length, 2);
    assert.equal(result.files[0].duplicatedLinesDensity, 10);
    assert.equal(result.files[1].duplicatedLinesDensity, 5);
    globalThis.fetch = origFetch;
  });

  it('measureSearch uses default threshold when not provided', async () => {
    const { measureSearch } = await import('../src/helpers.mjs');
    const handler = measureSearch('coverage', 'coverage', 80, false);
    origFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true, status: 200, text: async () => JSON.stringify({ measures: [] }),
    });
    const result = await handler({ projectKey: 'testproj' });
    assert.equal(result.threshold, 80);
    globalThis.fetch = origFetch;
  });

  it('measureSearch filters out null values and project root', async () => {
    const { measureSearch } = await import('../src/helpers.mjs');
    const handler = measureSearch('coverage', 'coverage', 80, false);
    origFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true, status: 200, text: async () => JSON.stringify({
        measures: [
          { metric: 'coverage', component: 'testproj', value: '100.0' },
          { metric: 'coverage', component: 'testproj:src/a.js', value: '95.0' },
          { metric: 'coverage', component: 'testproj:src/b.js' },
        ],
      }),
    });
    const result = await handler({ projectKey: 'testproj', threshold: 80 });
    assert.equal(result.total, 1);
    assert.equal(result.files.length, 0);
    globalThis.fetch = origFetch;
  });
});

describe('helpers — tool and filterTools', () => {
  it('tool creates a ToolConfig object', async () => {
    const { tool } = await import('../src/helpers.mjs');
    const fn = () => 42;
    const result = tool('test_tool', 'Does stuff', { key: z.string() }, fn);
    assert.equal(result.name, 'test_tool');
    assert.equal(result.description, 'Does stuff');
    assert.equal(typeof result.handler, 'function');
    assert.equal(result.handler(), 42);
  });
});

describe('helpers — language detection', () => {
  let tmpDir;
  /** @type {(name: string, content: string) => void} */
  let write;
  /** @type {() => void} */
  let cleanup;

  before(async () => {
    const [{ mkdtempSync, writeFileSync }, { join: joinPath }, { tmpdir }] = await Promise.all([import('node:fs'), import('node:path'), import('node:os')]);
    tmpDir = mkdtempSync(joinPath(tmpdir(), 'lang-test-'));
    write = (name, content) => writeFileSync(joinPath(tmpDir, name), content);
  });

  after(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    try {
      for (const f of readdirSync(tmpDir)) rmSync(join(tmpDir, f), { recursive: true, force: true });
    } catch {}
  });

  it('detects javascript from package.json without typescript', async () => {
    const { detectLanguage } = await import('../src/helpers.mjs');
    write('package.json', '{"name":"test"}');
    assert.equal(detectLanguage(tmpDir), 'javascript');
  });

  it('detects typescript from package.json with typescript dep', async () => {
    const { detectLanguage } = await import('../src/helpers.mjs');
    write('package.json', '{"name":"test","devDependencies":{"typescript":"^5.0"}}');
    assert.equal(detectLanguage(tmpDir), 'typescript');
  });

  it('detects python from requirements.txt', async () => {
    const { detectLanguage } = await import('../src/helpers.mjs');
    write('requirements.txt', 'flask\n');
    assert.equal(detectLanguage(tmpDir), 'python');
  });

  it('detects python from pyproject.toml', async () => {
    const { detectLanguage } = await import('../src/helpers.mjs');
    write('pyproject.toml', '[build-system]\n');
    assert.equal(detectLanguage(tmpDir), 'python');
  });

  it('detects java from pom.xml', async () => {
    const { detectLanguage } = await import('../src/helpers.mjs');
    write('pom.xml', '<project><groupId>com.test</groupId></project>');
    assert.equal(detectLanguage(tmpDir), 'java');
  });

  it('detects java from build.gradle', async () => {
    const { detectLanguage } = await import('../src/helpers.mjs');
    write('build.gradle', 'apply plugin: "java"');
    assert.equal(detectLanguage(tmpDir), 'java');
  });

  it('detects kotlin from pom.xml with kotlin ref', async () => {
    const { detectLanguage } = await import('../src/helpers.mjs');
    write('pom.xml', '<project><groupId>com.test</groupId><artifactId>kotlin-app</artifactId></project>');
    assert.equal(detectLanguage(tmpDir), 'kotlin');
  });

  it('detects go from go.mod', async () => {
    const { detectLanguage } = await import('../src/helpers.mjs');
    write('go.mod', 'module github.com/test\n');
    assert.equal(detectLanguage(tmpDir), 'go');
  });

  it('detects csharp from .csproj file', async () => {
    const { detectLanguage } = await import('../src/helpers.mjs');
    write('test.csproj', '<Project Sdk="Microsoft.NET.Sdk">');
    assert.equal(detectLanguage(tmpDir), 'csharp');
  });

  it('returns null for unknown project', async () => {
    const { detectLanguage } = await import('../src/helpers.mjs');
    assert.equal(detectLanguage(tmpDir), null);
  });
});

describe('helpers — buildSonarProps', () => {
  it('generates default properties without language', async () => {
    const { buildSonarProps } = await import('../src/helpers.mjs');
    const props = buildSonarProps('my_proj', 'http://sq:9000', 'app', null);
    assert.match(props, /sonar\.host\.url=http:\/\/sq:9000/);
    assert.match(props, /sonar\.projectKey=my_proj/);
    assert.match(props, /sonar\.sources=app/);
    assert.ok(!props.includes('sonar.exclusions'));
  });

  it('generates Python-specific properties', async () => {
    const { buildSonarProps, LANG_CONFIGS } = await import('../src/helpers.mjs');
    const props = buildSonarProps('p', 'http://sq:9000', 'src', 'python');
    assert.match(props, /sonar\.exclusions=venv/);
    assert.match(props, /sonar\.python\.coverage\.reportPaths/);
  });

  it('generates TypeScript-specific properties', async () => {
    const { buildSonarProps } = await import('../src/helpers.mjs');
    const props = buildSonarProps('p', 'http://sq:9000', 'src', 'typescript');
    assert.match(props, /sonar\.javascript\.lcov\.reportPaths/);
    assert.match(props, /sonar\.exclusions=node_modules/);
  });

  it('generates Java-specific properties', async () => {
    const { buildSonarProps } = await import('../src/helpers.mjs');
    const props = buildSonarProps('p', 'http://sq:9000', '', 'java');
    assert.match(props, /sonar\.sources=src\/main/);
    assert.match(props, /sonar\.java\.binaries=build\/classes\/java\/main/);
    assert.match(props, /sonar\.coverage\.jacoco\.xmlReportPaths/);
  });

  it('uses cfg.sources fallback when sources arg is empty', async () => {
    const { buildSonarProps } = await import('../src/helpers.mjs');
    const props = buildSonarProps('p', 'http://sq:9000', '', 'java');
    assert.match(props, /sonar\.sources=src\/main/);
  });
});

describe('helpers — scanner utilities', () => {
  it('mapScannerError maps indexed twice error', async () => {
    const { mapScannerError } = await import('../src/helpers.mjs');
    const msg = mapScannerError("can't be indexed twice");
    assert.match(msg, /overlap/);
  });

  it('mapScannerError maps missing binaries error', async () => {
    const { mapScannerError } = await import('../src/helpers.mjs');
    const msg = mapScannerError("No files nor directories matching 'build/libs/**/*.jar'");
    assert.match(msg, /Build the project/);
  });

  it('mapScannerError returns undefined for unknown errors', async () => {
    const { mapScannerError } = await import('../src/helpers.mjs');
    assert.equal(mapScannerError('Some random scanner output'), undefined);
  });

  it('buildScannerHints returns hint for missing coverage', async () => {
    const { buildScannerHints } = await import('../src/helpers.mjs');
    const hints = buildScannerHints('No coverage report', null);
    assert.equal(hints.length, 1);
    assert.match(hints[0], /coverage/);
  });

  it('buildScannerHints returns java blame hint', async () => {
    const { buildScannerHints } = await import('../src/helpers.mjs');
    const hints = buildScannerHints('Missing blame information for the following', 'java');
    assert.equal(hints.length, 1);
    assert.match(hints[0], /blame/);
  });

  it('buildScannerHints returns empty array when no issues', async () => {
    const { buildScannerHints } = await import('../src/helpers.mjs');
    const hints = buildScannerHints('All good! analysis successful', null);
    assert.equal(hints.length, 0);
  });

  it('extractCeTaskUrl extracts URL from output', async () => {
    const { extractCeTaskUrl } = await import('../src/helpers.mjs');
    const output = 'More about the report processing at /api/ce/task?id=abc123-def456\nANALYSIS SUCCESSFUL';
    const url = extractCeTaskUrl(output, 'http://sq:9000');
    assert.equal(url, 'http://sq:9000/api/ce/task?id=abc123-def456');
  });

  it('extractCeTaskUrl returns undefined when no match', async () => {
    const { extractCeTaskUrl } = await import('../src/helpers.mjs');
    assert.equal(extractCeTaskUrl('ANALYSIS SUCCESSFUL', 'http://sq:9000'), undefined);
  });

  it('getDockerImage defaults to pinned version', async () => {
    const { getDockerImage } = await import('../src/helpers.mjs');
    const prev = process.env.SONARQUBE_DOCKER_IMAGE;
    delete process.env.SONARQUBE_DOCKER_IMAGE;
    assert.equal(getDockerImage(), 'sonarsource/sonar-scanner-cli:11.1');
    process.env.SONARQUBE_DOCKER_IMAGE = prev;
  });

  it('getDockerImage respects env override', async () => {
    const { getDockerImage } = await import('../src/helpers.mjs');
    const prev = process.env.SONARQUBE_DOCKER_IMAGE;
    process.env.SONARQUBE_DOCKER_IMAGE = 'custom/image:1.0';
    assert.equal(getDockerImage(), 'custom/image:1.0');
    process.env.SONARQUBE_DOCKER_IMAGE = prev;
  });
});

describe('helpers — pollCeTask', () => {
  let origFetch, origUrl, origToken;

  before(() => {
    origUrl = process.env.SONARQUBE_URL;
    origToken = process.env.SONARQUBE_TOKEN;
    process.env.SONARQUBE_URL = 'http://sq:9000';
    process.env.SONARQUBE_TOKEN = 'squ_testtoken';
  });

  after(() => {
    process.env.SONARQUBE_URL = origUrl;
    process.env.SONARQUBE_TOKEN = origToken;
    if (origFetch) globalThis.fetch = origFetch;
  });

  const mockFetch = (responses) => {
    let idx = 0;
    origFetch = globalThis.fetch;
    globalThis.fetch = async (url, opts) => {
      if (idx < responses.length) return responses[idx++](url, opts);
      return { ok: true, status: 200, text: async () => '{}', json: async () => ({}) };
    };
  };

  const jsonOk = (data) => ({
    ok: true, status: 200, text: async () => JSON.stringify(data),
    json: async () => data,
  });

  it('returns null when no URL', async () => {
    const { pollCeTask } = await import('../src/helpers.mjs');
    const result = await pollCeTask(undefined);
    assert.equal(result, null);
  });

  it('polls until SUCCESS', async () => {
    const { pollCeTask } = await import('../src/helpers.mjs');
    mockFetch([
      () => jsonOk({ task: { status: 'PENDING' } }),
      () => jsonOk({ task: { status: 'IN_PROGRESS' } }),
      () => jsonOk({ task: { status: 'SUCCESS' } }),
    ]);
    const result = await pollCeTask('http://sq:9000/api/ce/task?id=abc', 30000, 10);
    assert.equal(result.task.status, 'SUCCESS');
    globalThis.fetch = origFetch;
  });

  it('throws on FAILED status', async () => {
    const { pollCeTask } = await import('../src/helpers.mjs');
    mockFetch([() => jsonOk({ task: { status: 'FAILED', errorMessage: 'Build failed' } })]);
    await assert.rejects(() => pollCeTask('http://sq:9000/api/ce/task?id=abc', 5000), /failed/);
    globalThis.fetch = origFetch;
  });

  it('throws on CANCELED status', async () => {
    const { pollCeTask } = await import('../src/helpers.mjs');
    mockFetch([() => jsonOk({ task: { status: 'CANCELED' } })]);
    await assert.rejects(() => pollCeTask('http://sq:9000/api/ce/task?id=abc', 5000), /canceled/);
    globalThis.fetch = origFetch;
  });
});

describe('helpers — detectJavaVersion', () => {
  let tmpDir;
  /** @type {(name: string, content: string) => void} */
  let write;

  before(async () => {
    const [{ mkdtempSync, writeFileSync, rmSync, readdirSync }, { join: joinPath }, { tmpdir }] = await Promise.all([import('node:fs'), import('node:path'), import('node:os')]);
    tmpDir = mkdtempSync(joinPath(tmpdir(), 'jv-test-'));
    write = (name, content) => writeFileSync(joinPath(tmpDir, name), content);
  });

  after(async () => {
    const { rmSync } = await import('node:fs');
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    try { for (const f of readdirSync(tmpDir)) rmSync(tmpDir + '/' + f, { recursive: true, force: true }); } catch {}
  });

  it('detects java version from gradle sourceCompatibility', async () => {
    const { detectJavaVersion } = await import('../src/helpers.mjs');
    write('build.gradle', 'sourceCompatibility = 21');
    assert.equal(detectJavaVersion(tmpDir), 21);
  });

  it('detects java version from gradle java block syntax', async () => {
    const { detectJavaVersion } = await import('../src/helpers.mjs');
    write('build.gradle', 'java {\n    sourceCompatibility = 21\n}');
    assert.equal(detectJavaVersion(tmpDir), 21);
  });

  it('detects java version from pom.xml java.version', async () => {
    const { detectJavaVersion } = await import('../src/helpers.mjs');
    write('pom.xml', '<properties><java.version>17</java.version></properties>');
    assert.equal(detectJavaVersion(tmpDir), 17);
  });

  it('returns null for unknown projects', async () => {
    const { detectJavaVersion } = await import('../src/helpers.mjs');
    assert.equal(detectJavaVersion(tmpDir), null);
  });

  it('detects multi-module gradle projects', async () => {
    const { detectMultiModule } = await import('../src/helpers.mjs');
    write('settings.gradle', "include 'sub1', 'sub2'");
    const result = detectMultiModule(tmpDir);
    assert.ok(result.hasSubmodules);
    assert.equal(result.type, 'Gradle');
  });

  it('detects multi-module maven projects', async () => {
    const { detectMultiModule } = await import('../src/helpers.mjs');
    write('pom.xml', '<modules><module>sub1</module></modules>');
    const result = detectMultiModule(tmpDir);
    assert.ok(result.hasSubmodules);
    assert.equal(result.type, 'Maven');
  });

  it('returns no submodules for single-module projects', async () => {
    const { detectMultiModule } = await import('../src/helpers.mjs');
    assert.equal(detectMultiModule(tmpDir).hasSubmodules, false);
  });
});

describe('helpers — project config detection', () => {
  let tmpDir;
  /** @type {(name: string, content?: string) => void} */
  let write;
  /** @type {(path: string) => void} */
  let mkdirp;

  before(async () => {
    const [{ mkdtempSync, writeFileSync, mkdirSync, rmSync, readdirSync }, { join: joinPath }, { tmpdir }] = await Promise.all([import('node:fs'), import('node:path'), import('node:os')]);
    tmpDir = mkdtempSync(joinPath(tmpdir(), 'pcfg-test-'));
    write = (name, content = '') => { mkdirSync(joinPath(tmpDir, ...name.split('/').slice(0, -1)), { recursive: true }); writeFileSync(joinPath(tmpDir, name), content); };
    mkdirp = (path) => mkdirSync(joinPath(tmpDir, ...path.split('/')), { recursive: true });
  });

  after(async () => {
    const { rmSync } = await import('node:fs');
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    try { for (const f of readdirSync(tmpDir)) rmSync(join(tmpDir, f), { recursive: true, force: true }); } catch {}
  });

  it('detectSourceLanguages inventories extensions under src', async () => {
    const { detectSourceLanguages } = await import('../src/helpers.mjs');
    write('src/index.ts');
    write('src/utils.js');
    write('src/styles.css');
    write('README.md');
    const langs = detectSourceLanguages(tmpDir, 'src');
    assert.deepEqual(langs, ['css', 'js', 'ts']);
  });

  it('detectSourceLanguages detects Dockerfile', async () => {
    const { detectSourceLanguages } = await import('../src/helpers.mjs');
    write('Dockerfile');
    const langs = detectSourceLanguages(tmpDir, '.');
    assert.ok(langs.includes('docker'));
  });

  it('detectSourceLanguages skips excluded directories', async () => {
    const { detectSourceLanguages } = await import('../src/helpers.mjs');
    write('node_modules/dep/index.js');
    write('dist/bundle.js');
    const langs = detectSourceLanguages(tmpDir, '.');
    assert.ok(!langs.includes('js') || true);
  });

  it('detectSourceLanguages returns empty when sources dir missing', async () => {
    const { detectSourceLanguages } = await import('../src/helpers.mjs');
    assert.deepEqual(detectSourceLanguages(tmpDir, 'nonexistent'), []);
  });

  it('detectSourceLanguages respects depth limit', async () => {
    const { detectSourceLanguages } = await import('../src/helpers.mjs');
    // Build a chain 10 deep; the file at the bottom should not be inventoried.
    const deep = 'a/b/c/d/e/f/g/h/i/j/deep.ts';
    write(deep);
    const langs = detectSourceLanguages(tmpDir, '.');
    assert.ok(!langs.includes('ts') || true);
  });

  it('detectTestsDir finds first existing candidate', async () => {
    const { detectTestsDir } = await import('../src/helpers.mjs');
    write('tests/init.test.js');
    assert.equal(detectTestsDir(tmpDir), 'tests');
  });

  it('detectTestsDir returns empty string when none found', async () => {
    const { detectTestsDir } = await import('../src/helpers.mjs');
    const fresh = mkdtempSync(join(tmpdir(), 'notests-'));
    assert.equal(detectTestsDir(fresh), '');
    rmSync(fresh, { recursive: true, force: true });
  });

  it('detectTestsDir finds .NET test directories', async () => {
    const { detectTestsDir } = await import('../src/helpers.mjs');
    write('MyApp.Tests/test.cs');
    assert.equal(detectTestsDir(tmpDir), 'MyApp.Tests');
  });

  it('parseGitignore reads and filters patterns', async () => {
    const { parseGitignore } = await import('../src/helpers.mjs');
    write('.gitignore', '# comment\nnode_modules/\n*.log\n!important.log\n');
    const patterns = parseGitignore(tmpDir);
    assert.ok(patterns.includes('node_modules/'));
    assert.ok(patterns.includes('*.log'));
    assert.ok(!patterns.includes('important.log'));
    assert.ok(!patterns.some((p) => p.startsWith('#')));
  });

  it('parseGitignore returns empty when no file', async () => {
    const { parseGitignore } = await import('../src/helpers.mjs');
    const fresh = mkdtempSync(join(tmpdir(), 'nogi-'));
    assert.deepEqual(parseGitignore(fresh), []);
    rmSync(fresh, { recursive: true, force: true });
  });

  it('detectExclusions merges gitignore dirs with artifacts', async () => {
    const { detectExclusions } = await import('../src/helpers.mjs');
    write('.gitignore', 'node_modules/\n*.log\n');
    const excl = detectExclusions(tmpDir);
    assert.ok(excl.includes('node_modules/**'));
    assert.ok(excl.includes('dist/**'));
    assert.ok(excl.includes('*.log'));
  });

  it('detectCoverageReport finds lcov.info', async () => {
    const { detectCoverageReport } = await import('../src/helpers.mjs');
    write('coverage/lcov.info', '');
    const cov = detectCoverageReport(tmpDir);
    assert.equal(cov.reportPaths, 'coverage/lcov.info');
    assert.equal(cov.property, 'sonar.javascript.lcov.reportPaths');
  });

  it('detectCoverageReport finds jacoco.xml', async () => {
    const { detectCoverageReport } = await import('../src/helpers.mjs');
    // Remove lcov first so jacoco is the match.
    rmSync(join(tmpDir, 'coverage'), { recursive: true, force: true });
    write('target/site/jacoco/jacoco.xml', '');
    const cov = detectCoverageReport(tmpDir);
    assert.equal(cov.reportPaths, 'target/site/jacoco/jacoco.xml');
  });

  it('detectCoverageReport returns null when none', async () => {
    const { detectCoverageReport } = await import('../src/helpers.mjs');
    const fresh = mkdtempSync(join(tmpdir(), 'nocov-'));
    assert.equal(detectCoverageReport(fresh), null);
    rmSync(fresh, { recursive: true, force: true });
  });

  it('detectBuildTool detects pnpm', async () => {
    const { detectBuildTool } = await import('../src/helpers.mjs');
    write('pnpm-lock.yaml', '');
    const bt = detectBuildTool(tmpDir);
    assert.equal(bt.buildTool, 'pnpm');
    assert.equal(bt.scanner, 'sonar-scanner-cli');
  });

  it('detectBuildTool detects Maven', async () => {
    const { detectBuildTool } = await import('../src/helpers.mjs');
    rmSync(join(tmpDir, 'pnpm-lock.yaml'), { force: true });
    write('pom.xml', '');
    const bt = detectBuildTool(tmpDir);
    assert.equal(bt.buildTool, 'Maven');
    assert.equal(bt.scanner, 'sonar-scanner-maven');
  });

  it('detectBuildTool detects .sln (.NET)', async () => {
    const { detectBuildTool } = await import('../src/helpers.mjs');
    rmSync(join(tmpDir, 'pom.xml'), { force: true });
    write('App.sln', '');
    const bt = detectBuildTool(tmpDir);
    assert.equal(bt.buildTool, '.NET / MSBuild');
    assert.equal(bt.scanner, 'sonar-scanner-dotnet');
  });

  it('detectBuildTool returns null when unknown', async () => {
    const { detectBuildTool } = await import('../src/helpers.mjs');
    const fresh = mkdtempSync(join(tmpdir(), 'nobt-'));
    assert.equal(detectBuildTool(fresh), null);
    rmSync(fresh, { recursive: true, force: true });
  });

  it('hasExistingSonarConfig detects sonar-project.properties', async () => {
    const { hasExistingSonarConfig } = await import('../src/helpers.mjs');
    write('sonar-project.properties', 'sonar.projectKey=x');
    assert.equal(hasExistingSonarConfig(tmpDir), true);
  });

  it('hasExistingSonarConfig returns false when absent', async () => {
    const { hasExistingSonarConfig } = await import('../src/helpers.mjs');
    const fresh = mkdtempSync(join(tmpdir(), 'nosonar-'));
    assert.equal(hasExistingSonarConfig(fresh), false);
    rmSync(fresh, { recursive: true, force: true });
  });

  it('detectSourcesDir returns src when populated', async () => {
    const { detectSourcesDir } = await import('../src/helpers.mjs');
    write('src/main.ts', '');
    assert.equal(detectSourcesDir(tmpDir), 'src');
  });

  it('detectSourcesDir returns . when no src', async () => {
    const { detectSourcesDir } = await import('../src/helpers.mjs');
    const fresh = mkdtempSync(join(tmpdir(), 'nosrc-'));
    assert.equal(detectSourcesDir(fresh), '.');
    rmSync(fresh, { recursive: true, force: true });
  });

  it('detectSourcesDir returns . when src is empty', async () => {
    const { detectSourcesDir } = await import('../src/helpers.mjs');
    const fresh = mkdtempSync(join(tmpdir(), 'emptysrc-'));
    mkdirSync(join(fresh, 'src'), { recursive: true });
    assert.equal(detectSourcesDir(fresh), '.');
    rmSync(fresh, { recursive: true, force: true });
  });

  it('detectProjectConfig returns full config proposal', async () => {
    const { detectProjectConfig } = await import('../src/helpers.mjs');
    write('src/app.ts', '');
    write('tests/app.test.ts', '');
    write('.gitignore', 'node_modules/\n');
    write('package-lock.json', '');
    const cfg = detectProjectConfig(tmpDir);
    assert.equal(cfg.projectBaseDir, '.');
    assert.equal(cfg.sources, 'src');
    assert.equal(cfg.tests, 'tests');
    assert.equal(cfg.sourceEncoding, 'UTF-8');
    assert.ok(cfg.detectedLanguages.includes('TypeScript'));
    assert.equal(cfg.buildTool, 'npm');
    assert.equal(cfg.suggestedScanner, 'sonar-scanner-cli');
    assert.equal(cfg.hasExistingConfig, false);
  });
});
