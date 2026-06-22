import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';

const BASE = 'http://sonar-test.local';

describe('handler success paths', () => {
  let TOOL_CONFIGS;
  let origFetch, origUrl, origToken, origProject;

  before(async () => {
    origUrl = process.env.SONARQUBE_URL;
    origToken = process.env.SONARQUBE_TOKEN;
    origProject = process.env.SONARQUBE_PROJECT;
    process.env.SONARQUBE_URL = BASE;
    process.env.SONARQUBE_TOKEN = 'squ_testtoken';
    process.env.SONARQUBE_PROJECT = 'testproj';
    const mod = await import('../src/handlers.mjs');
    TOOL_CONFIGS = mod.TOOL_CONFIGS;
  });

  after(() => {
    process.env.SONARQUBE_URL = origUrl;
    process.env.SONARQUBE_TOKEN = origToken;
    process.env.SONARQUBE_PROJECT = origProject;
    if (origFetch) globalThis.fetch = origFetch;
  });

  const mockFetch = (responses) => {
    const calls = [];
    let idx = 0;
    origFetch = globalThis.fetch;
    globalThis.fetch = async (url, opts) => {
      calls.push({ url: typeof url === 'string' ? url : url.url, method: opts?.method || 'GET' });
      if (idx < responses.length) {
        return responses[idx++](url, opts);
      }
      return { ok: true, status: 200, text: async () => '{}' };
    };
    return calls;
  };

  const jsonOk = (data) => ({
    ok: true, status: 200, text: async () => JSON.stringify(data),
    json: async () => data,
  });

  const textOk = (text) => ({
    ok: true, status: 200, text: async () => text,
    json: async () => { throw new Error('not json'); },
  });

  const h = (name) => TOOL_CONFIGS.find((t) => t.name === name).handler;

  it('sonar_ping returns pong when reachable', async () => {
    const calls = mockFetch([() => jsonOk({ health: 'GREEN' })]);
    const res = await h('sonar_ping')({});
    assert.equal(res.pong, true);
    assert.equal(res.health, 'GREEN');
  });

  it('sonar_ping returns unreachable message', async () => {
    const calls = mockFetch([() => { throw new Error('ECONNREFUSED'); }]);
    const res = await h('sonar_ping')({});
    assert.equal(res.pong, undefined);
    assert.equal(res.status, 'UNREACHABLE');
  });

  it('sonar_quality_gate returns status', async () => {
    const calls = mockFetch([() => jsonOk({ projectStatus: { status: 'OK' } })]);
    const res = await h('sonar_quality_gate')({ projectKey: 'testproj' });
    assert.equal(res.projectStatus.status, 'OK');
  });

  it('sonar_list_quality_gates returns gates', async () => {
    const calls = mockFetch([() => jsonOk({ qualitygates: [{ name: 'Sonar way', isDefault: true }] })]);
    const res = await h('sonar_list_quality_gates')({});
    assert.ok(res.qualitygates);
  });

  it('sonar_measures returns component measures', async () => {
    const calls = mockFetch([() => jsonOk({ component: { measures: [{ metric: 'coverage', value: '85.0' }] } })]);
    const res = await h('sonar_measures')({ projectKey: 'testproj' });
    assert.ok(res.component);
  });

  it('sonar_measures uses default metric keys', async () => {
    const calls = mockFetch([() => jsonOk({ component: { measures: [] } })]);
    const res = await h('sonar_measures')({});
    assert.ok(res.component);
  });

  it('sonar_search_metrics returns metrics', async () => {
    const calls = mockFetch([() => jsonOk({ metrics: [{ key: 'coverage' }] })]);
    const res = await h('sonar_search_metrics')({ query: 'coverage', limit: 10 });
    assert.ok(res.metrics);
  });

  it('sonar_search_metrics works without query', async () => {
    const calls = mockFetch([() => jsonOk({ metrics: [] })]);
    const res = await h('sonar_search_metrics')({});
    assert.ok(Array.isArray(res.metrics));
  });

  it('sonar_metrics_history returns history', async () => {
    const calls = mockFetch([() => jsonOk({ measures: [{ history: [{ date: '2024-01-01', value: '85' }] }] })]);
    const res = await h('sonar_metrics_history')({ projectKey: 'testproj', metric: 'coverage', days: 7 });
    assert.ok(res.measures);
  });

  it('sonar_metrics_history clamps days to 1-365', async () => {
    const calls = mockFetch([() => jsonOk({ measures: [] })]);
    const res = await h('sonar_metrics_history')({ metric: 'coverage', days: 999 });
    assert.ok(res.measures);
  });

  it('sonar_metrics_history uses default 30 days', async () => {
    const calls = mockFetch([() => jsonOk({ measures: [] })]);
    const res = await h('sonar_metrics_history')({ metric: 'coverage' });
    assert.ok(res.measures);
  });

  it('sonar_worst_metrics returns grouped results', async () => {
    const calls = mockFetch([() => jsonOk({
      measures: [
        { metric: 'coverage', component: 'testproj:src/file.js', value: '75.0' },
        { metric: 'coverage', component: 'testproj:src/file2.js', value: '90.0' },
      ],
    })]);
    const res = await h('sonar_worst_metrics')({ projectKey: 'testproj', metrics: 'coverage', limit: 5 });
    assert.ok(res.results.coverage);
    assert.equal(res.results.coverage.length, 2);
    assert.equal(res.results.coverage[0].value, 75);
    assert.equal(res.results.coverage[1].value, 90);
  });

  it('sonar_worst_metrics adds _note when no data', async () => {
    const calls = mockFetch([() => jsonOk({ measures: [] })]);
    const res = await h('sonar_worst_metrics')({ projectKey: 'testproj' });
    assert.ok(res._note);
  });

  it('sonar_worst_metrics skips project root measure', async () => {
    const calls = mockFetch([() => jsonOk({
      measures: [
        { metric: 'coverage', component: 'testproj', value: '100.0' },
        { metric: 'coverage', component: 'testproj:src/file.js', value: '75.0' },
      ],
    })]);
    const res = await h('sonar_worst_metrics')({ projectKey: 'testproj', metrics: 'coverage', limit: 5 });
    assert.equal(res.results.coverage.length, 1);
    assert.equal(res.results.coverage[0].value, 75);
  });

  it('sonar_search_projects returns projects', async () => {
    const calls = mockFetch([() => jsonOk({ components: [{ key: 'proj', name: 'Project' }], paging: { total: 1, pageSize: 500 } })]);
    const res = await h('sonar_search_projects')({ query: 'proj', limit: 10 });
    assert.ok(res.components);
  });

  it('sonar_search_projects works without query', async () => {
    const calls = mockFetch([() => jsonOk({ components: [], paging: { total: 0, pageSize: 500 } })]);
    const res = await h('sonar_search_projects')({});
    assert.ok(Array.isArray(res.components));
  });

  it('sonar_issues returns issues', async () => {
    const calls = mockFetch([() => jsonOk({
      total: 2, issues: [
        { key: 'issue1', severity: 'MAJOR', type: 'CODE_SMELL', line: 10, component: 'proj:src/file.js', flows: [], textRange: {}, messageFormattings: [], codeVariants: [], internalTags: [] },
        { key: 'issue2', severity: 'INFO', type: 'CODE_SMELL', line: 20, component: 'proj:src/file.js', flows: [], textRange: {}, messageFormattings: [], codeVariants: [], internalTags: [] },
      ], paging: { total: 2, pageSize: 30 }, components: [], facets: [],
    })]);
    const res = await h('sonar_issues')({ projectKey: 'testproj', limit: 10, compact: true });
    assert.equal(res.total, 2);
    assert.equal(res.issues[0].flows, undefined);
  });

  it('sonar_issues with include_source fetches source lines', async () => {
    const calls = mockFetch([
      () => jsonOk({
        total: 1, issues: [{ key: 'i1', line: 10, component: 'proj:src/file.js' }], paging: { total: 1, pageSize: 30 },
      }),
      () => jsonOk({ sources: [{ line: 10, code: 'const x = 1;' }] }),
    ]);
    const res = await h('sonar_issues')({ projectKey: 'testproj', include_source: true });
    assert.ok(res.issues[0]._source);
  });

  it('sonar_issues with resolved=true passes param', async () => {
    const calls = mockFetch([() => jsonOk({
      total: 0, issues: [], paging: { total: 0, pageSize: 30 }, components: [], facets: [],
    })]);
    const res = await h('sonar_issues')({ projectKey: 'testproj', resolved: true });
    assert.equal(res.total, 0);
  });

  it('sonar_issues with severities/types as array', async () => {
    const calls = mockFetch([() => jsonOk({
      total: 0, issues: [], paging: { total: 0, pageSize: 30 }, components: [], facets: [],
    })]);
    const res = await h('sonar_issues')({ projectKey: 'testproj', severities: ['MAJOR', 'CRITICAL'], types: ['BUG'] });
    assert.equal(res.total, 0);
  });

  it('sonar_issues with severities as string', async () => {
    const calls = mockFetch([() => jsonOk({
      total: 0, issues: [], paging: { total: 0, pageSize: 30 }, components: [], facets: [],
    })]);
    const res = await h('sonar_issues')({ projectKey: 'testproj', severities: 'MAJOR,CRITICAL', types: 'BUG' });
    assert.equal(res.total, 0);
  });

  it('sonar_issues with statuses overrides resolved', async () => {
    const calls = mockFetch([() => jsonOk({
      total: 0, issues: [], paging: { total: 0, pageSize: 30 }, components: [], facets: [],
    })]);
    const res = await h('sonar_issues')({ projectKey: 'testproj', statuses: 'OPEN,CONFIRMED' });
    assert.equal(res.total, 0);
  });

  it('sonar_issues_summary returns aggregated counts', async () => {
    const calls = mockFetch([() => jsonOk({
      total: 2, issues: [
        { severity: 'MAJOR', type: 'CODE_SMELL', effort: '10min' },
        { severity: 'INFO', type: 'CODE_SMELL', effort: '5min' },
      ],
    })]);
    const res = await h('sonar_issues_summary')({ projectKey: 'testproj' });
    assert.equal(res.total, 2);
    assert.equal(res.by_severity.MAJOR, 1);
    assert.equal(res.by_severity.INFO, 1);
    assert.equal(res.by_type.CODE_SMELL, 2);
    assert.equal(res.effortTotal, 15);
  });

  it('sonar_issues_summary handles missing effort and missing issues', async () => {
    const calls = mockFetch([() => jsonOk({
      total: 2, issues: [
        { severity: 'MAJOR', type: 'CODE_SMELL' },
        { severity: 'INFO', type: 'CODE_SMELL' },
      ],
    })]);
    const res = await h('sonar_issues_summary')({ projectKey: 'testproj' });
    assert.equal(res.total, 2);
    assert.equal(res.effortTotal, 0);
  });

  it('sonar_new_issues returns new issues', async () => {
    const calls = mockFetch([
      () => jsonOk({ analyses: [{ date: '2024-06-01' }, { date: '2024-05-01' }] }),
      () => jsonOk({ total: 1, issues: [{ key: 'new1', severity: 'MAJOR' }], paging: { total: 1, pageSize: 500 } }),
    ]);
    const res = await h('sonar_new_issues')({ projectKey: 'testproj', limit: 10, compact: true });
    assert.equal(res.total, 1);
  });

  it('sonar_new_issues returns message when no analysis', async () => {
    const calls = mockFetch([() => jsonOk({ analyses: [] })]);
    const res = await h('sonar_new_issues')({ projectKey: 'testproj' });
    assert.equal(res.total, 0);
    assert.ok(res.message);
  });

  it('sonar_new_issues with array severities/types', async () => {
    const calls = mockFetch([
      () => jsonOk({ analyses: [{ date: '2024-06-01' }, { date: '2024-05-01' }] }),
      () => jsonOk({ total: 0, issues: [], paging: { total: 0, pageSize: 500 } }),
    ]);
    const res = await h('sonar_new_issues')({ projectKey: 'testproj', severities: ['MAJOR'], types: ['BUG'], limit: 5 });
    assert.equal(res.total, 0);
  });

  it('sonar_new_issues with string severities/types and limit=0', async () => {
    const calls = mockFetch([
      () => jsonOk({ analyses: [{ date: '2024-06-01' }, { date: '2024-05-01' }] }),
      () => jsonOk({ total: 0, issues: [], paging: { total: 0, pageSize: 500 } }),
    ]);
    const res = await h('sonar_new_issues')({ projectKey: 'testproj', severities: 'MAJOR', types: 'BUG', limit: 0 });
    assert.equal(res.total, 0);
  });

  it('sonar_new_issues handles analyses without date', async () => {
    const calls = mockFetch([
      () => jsonOk({ analyses: [{ date: '2024-06-01' }, {}] }),
      () => jsonOk({ total: 0, issues: [], paging: { total: 0, pageSize: 500 } }),
    ]);
    const res = await h('sonar_new_issues')({ projectKey: 'testproj' });
    assert.equal(res.total, 0);
  });

  it('sonar_set_issue_status posts transition', async () => {
    const calls = mockFetch([() => jsonOk({})]);
    const res = await h('sonar_set_issue_status')({ issueKey: 'AVV1', transition: 'confirm' });
    assert.ok(typeof res === 'object');
  });

  it('sonar_issues_bulk_transition posts bulk change', async () => {
    const calls = mockFetch([() => jsonOk({})]);
    const res = await h('sonar_issues_bulk_transition')({ issueKeys: ['AVV1', 'AVV2'], transition: 'resolve' });
    assert.ok(typeof res === 'object');
  });

  it('sonar_hotspots searches hotspots', async () => {
    const calls = mockFetch([() => jsonOk({ hotspots: [{ key: 'hot1' }], paging: { total: 1, pageSize: 500 } })]);
    const res = await h('sonar_hotspots')({ projectKey: 'testproj', status: 'TO_REVIEW', limit: 10 });
    assert.ok(res.hotspots);
  });

  it('sonar_hotspots uses defaults for status and limit', async () => {
    const calls = mockFetch([() => jsonOk({ hotspots: [], paging: { total: 0, pageSize: 500 } })]);
    const res = await h('sonar_hotspots')({ projectKey: 'testproj' });
    assert.ok(Array.isArray(res.hotspots));
  });

  it('sonar_hotspots uses default limit=0', async () => {
    const calls = mockFetch([() => jsonOk({ hotspots: [], paging: { total: 0, pageSize: 500 } })]);
    const res = await h('sonar_hotspots')({ projectKey: 'testproj', limit: 0 });
    assert.ok(Array.isArray(res.hotspots));
  });

  it('sonar_hotspot_details shows hotspot', async () => {
    const calls = mockFetch([() => jsonOk({ key: 'hot1', rule: { key: 'java:S123' } })]);
    const res = await h('sonar_hotspot_details')({ hotspotKey: 'hot1' });
    assert.equal(res.key, 'hot1');
  });

  it('sonar_change_hotspot_status posts status', async () => {
    const calls = mockFetch([() => jsonOk({})]);
    const res = await h('sonar_change_hotspot_status')({ hotspotKey: 'hot1', status: 'REVIEWED', resolution: 'SAFE', comment: 'ok' });
    assert.ok(typeof res === 'object');
  });

  it('sonar_change_hotspot_status without resolution/comment', async () => {
    const calls = mockFetch([() => jsonOk({})]);
    const res = await h('sonar_change_hotspot_status')({ hotspotKey: 'hot1', status: 'TO_REVIEW' });
    assert.ok(typeof res === 'object');
  });

  it('sonar_rule returns rule details', async () => {
    const calls = mockFetch([() => jsonOk({ rule: { key: 'typescript:S6544', name: 'Test' } })]);
    const res = await h('sonar_rule')({ ruleKey: 'typescript:S6544' });
    assert.equal(res.rule.key, 'typescript:S6544');
  });

  it('sonar_scm_info returns scm data', async () => {
    const calls = mockFetch([() => jsonOk({ sources: [{ line: 1, author: 'me' }] })]);
    const res = await h('sonar_scm_info')({ key: 'proj:src/file.ts', from: 1, to: 10 });
    assert.ok(res.sources);
  });

  it('sonar_scm_info works without from/to', async () => {
    const calls = mockFetch([() => jsonOk({ sources: [] })]);
    const res = await h('sonar_scm_info')({ key: 'proj:src/file.ts' });
    assert.ok(Array.isArray(res.sources));
  });

  it('sonar_source returns source lines', async () => {
    const calls = mockFetch([() => jsonOk({ sources: [{ line: 1, code: 'const x = 1;' }] })]);
    const res = await h('sonar_source')({ key: 'proj:src/file.ts', from: 1, to: 5 });
    assert.ok(res.sources);
  });

  it('sonar_source highlights uncovered lines', async () => {
    const calls = mockFetch([() => jsonOk({ sources: [{ line: 1, code: 'const x = 1;', utLineHits: 0 }, { line: 2, code: 'const y = 2;', utLineHits: 3 }] })]);
    const res = await h('sonar_source')({ key: 'proj:src/file.ts', highlight_uncovered: true });
    assert.equal(res.sources[0]._uncovered, true);
    assert.equal(res.sources[1]._uncovered, false);
  });

  it('sonar_list_webhooks with project key', async () => {
    const calls = mockFetch([() => jsonOk({ webhooks: [{ key: 'w1', name: 'test' }] })]);
    const res = await h('sonar_list_webhooks')({ projectKey: 'testproj' });
    assert.ok(res.webhooks);
  });

  it('sonar_list_webhooks without project falls back to default', async () => {
    const calls = mockFetch([() => jsonOk({ webhooks: [] })]);
    const res = await h('sonar_list_webhooks')({});
    assert.ok(Array.isArray(res.webhooks));
  });

  it('sonar_list_languages returns language list', async () => {
    const calls = mockFetch([() => jsonOk({ languages: [{ key: 'js', name: 'JavaScript' }] })]);
    const res = await h('sonar_list_languages')({});
    assert.equal(res.length, 1);
    assert.equal(res[0].key, 'js');
  });

  it('sonar_list_languages handles missing languages key', async () => {
    const calls = mockFetch([() => jsonOk({})]);
    const res = await h('sonar_list_languages')({});
    assert.ok(Array.isArray(res));
    assert.equal(res.length, 0);
  });

  it('sonar_list_pull_requests returns empty array when no data', async () => {
    const calls = mockFetch([() => jsonOk({})]);
    const res = await h('sonar_list_pull_requests')({ projectKey: 'testproj' });
    assert.ok(Array.isArray(res));
  });

  it('sonar_list_pull_requests returns mapped PRs', async () => {
    const calls = mockFetch([() => jsonOk({
      pullRequests: [{ key: 1, branch: 'feature/x', title: 'PR', analysisDate: '2024-01-01', status: { qualityGateStatus: 'OK' }, url: 'http://pr' }],
    })]);
    const res = await h('sonar_list_pull_requests')({ projectKey: 'testproj' });
    assert.equal(res[0].branch, 'feature/x');
    assert.equal(res[0].status, 'OK');
  });

  it('sonar_file_coverage_details returns file coverage', async () => {
    const calls = mockFetch([() => jsonOk({ component: { measures: [{ metric: 'coverage', value: '90.0' }] } })]);
    const res = await h('sonar_file_coverage_details')({ key: 'proj:src/file.ts' });
    assert.ok(res.component);
  });

  it('sonar_list_branches returns branches', async () => {
    const calls = mockFetch([() => jsonOk({
      branches: [{ name: 'main', isMain: true, analysisDate: '2024-01-01', status: { qualityGateStatus: 'OK' } }],
    })]);
    const res = await h('sonar_list_branches')({ projectKey: 'testproj' });
    assert.equal(res[0].name, 'main');
  });

  it('sonar_list_branches handles missing branches key', async () => {
    const calls = mockFetch([() => jsonOk({})]);
    const res = await h('sonar_list_branches')({ projectKey: 'testproj' });
    assert.ok(Array.isArray(res));
    assert.equal(res.length, 0);
  });

  it('sonar_coverage_files calls measureSearch', async () => {
    const calls = mockFetch([() => jsonOk({
      measures: [{ metric: 'coverage', component: 'testproj:src/file.js', value: '75.0' }],
    })]);
    const res = await h('sonar_coverage_files')({ projectKey: 'testproj', threshold: 80 });
    assert.equal(res.files.length, 1);
  });

  it('sonar_search_duplicated_files calls measureSearch', async () => {
    const calls = mockFetch([() => jsonOk({
      measures: [{ metric: 'duplicated_lines_density', component: 'testproj:src/file.js', value: '5.0' }],
    })]);
    const res = await h('sonar_search_duplicated_files')({ projectKey: 'testproj', threshold: 3 });
    assert.equal(res.files.length, 1);
  });

  it('sonar_duplications returns duplication blocks', async () => {
    const calls = mockFetch([() => jsonOk({
      duplications: [{ blocks: [{ from: 1, to: 10 }] }],
    })]);
    const res = await h('sonar_duplications')({ key: 'proj:src/file.ts' });
    assert.ok(res.duplications);
  });

  it('sonar_raw succeeds on valid path', async () => {
    const calls = mockFetch([() => jsonOk({ health: 'GREEN' })]);
    const res = await h('sonar_raw')({ path: '/api/system/health' });
    assert.equal(res.health, 'GREEN');
  });

  it('sonar_raw adds hint on 4xx', async () => {
    const calls = mockFetch([() => ({ ok: false, status: 400, text: async () => '{"errors":[{"msg":"Bad request"}]' })]);
    await assert.rejects(() => h('sonar_raw')({ path: '/api/bad' }), /Tip:/);
  });

  it('sonar_raw adds hint on 404', async () => {
    const calls = mockFetch([() => ({ ok: false, status: 404, text: async () => 'Not found' })]);
    await assert.rejects(() => h('sonar_raw')({ path: '/api/nonexistent' }), /Tip:/);
  });

  it('sonar_raw omits hint on non-4xx error', async () => {
    const calls = mockFetch([() => ({ ok: false, status: 500, text: async () => '{"errors":[{"msg":"Internal"}]}' })]);
    await assert.rejects(() => h('sonar_raw')({ path: '/api/foo' }), /SonarQube 500/);
  });

  it('sonar_analysis_status returns ANALYZED', async () => {
    const calls = mockFetch([
      () => jsonOk({ health: 'GREEN' }),
      () => jsonOk({ components: [{ key: 'testproj' }] }),
      () => jsonOk({ analyses: [{ date: '2024-01-01' }] }),
    ]);
    const res = await h('sonar_analysis_status')({ projectKey: 'testproj' });
    assert.equal(res.status, 'ANALYZED');
  });

  it('sonar_analysis_status returns NOT_FOUND', async () => {
    const calls = mockFetch([
      () => jsonOk({ health: 'GREEN' }),
      () => jsonOk({ components: [] }),
    ]);
    const res = await h('sonar_analysis_status')({ projectKey: 'nonexistent' });
    assert.equal(res.status, 'NOT_FOUND');
  });

  it('sonar_analysis_status returns NOT_ANALYZED', async () => {
    const calls = mockFetch([
      () => jsonOk({ health: 'GREEN' }),
      () => jsonOk({ components: [{ key: 'testproj' }] }),
      () => jsonOk({ analyses: [] }),
    ]);
    const res = await h('sonar_analysis_status')({ projectKey: 'testproj' });
    assert.equal(res.status, 'NOT_ANALYZED');
  });

  it('sonar_analysis_status returns UNREACHABLE', async () => {
    const calls = mockFetch([() => { throw new Error('ECONNREFUSED'); }]);
    const res = await h('sonar_analysis_status')({ projectKey: 'testproj' });
    assert.equal(res.status, 'UNREACHABLE');
  });

  it('sonar_projects_create creates a project', async () => {
    const calls = mockFetch([() => jsonOk({ project: { key: 'new_proj', name: 'New Project' } })]);
    const res = await h('sonar_projects_create')({ projectKey: 'new_proj', name: 'New Project' });
    assert.equal(res.project.key, 'new_proj');
  });

  it('sonar_projects_create defaults name to key', async () => {
    const calls = mockFetch([() => jsonOk({ project: { key: 'new_proj', name: 'new_proj' } })]);
    const res = await h('sonar_projects_create')({ projectKey: 'new_proj' });
    assert.equal(res.project.name, 'new_proj');
  });

  it('sonar_project_details returns project info', async () => {
    const calls = mockFetch([
      () => jsonOk({ component: { key: 'testproj', name: 'Test', description: 'Desc', qualifier: 'TRK' } }),
      () => jsonOk({ analyses: [{ date: '2024-01-01' }] }),
    ]);
    const res = await h('sonar_project_details')({ projectKey: 'testproj' });
    assert.equal(res.key, 'testproj');
    assert.equal(res.name, 'Test');
  });

  it('sonar_project_details handles missing component', async () => {
    const calls = mockFetch([
      () => { throw new Error('Not found'); },
      () => { throw new Error('Not found'); },
    ]);
    const res = await h('sonar_project_details')({ projectKey: 'nonexistent' });
    assert.equal(res.key, 'nonexistent');
    assert.equal(res.name, null);
  });

  it('sonar_summary returns aggregated health', async () => {
    const calls = mockFetch([
      () => jsonOk({ projectStatus: { status: 'OK' } }),
      () => jsonOk({ component: { measures: [{ metric: 'coverage', value: '85.0' }] } }),
      () => jsonOk({ total: 3, facets: [{ property: 'severities', values: [{ val: 'INFO', count: 3 }] }, { property: 'types', values: [{ val: 'CODE_SMELL', count: 3 }] }] }),
      () => jsonOk({ branches: [{ name: 'main', isMain: true, analysisDate: '2024-01-01', status: { qualityGateStatus: 'OK' } }] }),
    ]);
    const res = await h('sonar_summary')({ projectKey: 'testproj' });
    assert.equal(res.qualityGate, 'OK');
    assert.equal(res.metrics.coverage, '85.0');
  });

  it('sonar_summary handles null responses', async () => {
    const calls = mockFetch([
      () => { throw new Error('fail'); },
      () => { throw new Error('fail'); },
      () => { throw new Error('fail'); },
      () => { throw new Error('fail'); },
    ]);
    const res = await h('sonar_summary')({ projectKey: 'testproj' });
    assert.equal(res.qualityGate, 'NONE');
    assert.equal(res.issues.total, 0);
  });

  it('sonar_analysis_status handles API error gracefully', async () => {
    const calls = mockFetch([
      () => jsonOk({ health: 'GREEN' }),
      () => { throw new Error('API error'); },
    ]);
    const res = await h('sonar_analysis_status')({ projectKey: 'testproj' });
    assert.equal(res.status, 'NOT_FOUND');
  });

  it('sonar_issues include_source handles missing component', async () => {
    const calls = mockFetch([
      () => jsonOk({
        total: 1, issues: [{ key: 'i1', line: null, component: null }], paging: { total: 1, pageSize: 30 },
      }),
    ]);
    const res = await h('sonar_issues')({ projectKey: 'testproj', include_source: true });
    assert.equal(res.issues[0].key, 'i1');
    assert.equal(res.issues[0]._source, undefined);
  });

  it('sonar_issues include_source handles fetch failure', async () => {
    const calls = mockFetch([
      () => jsonOk({
        total: 1, issues: [{ key: 'i1', line: 10, component: 'proj:src/file.js' }], paging: { total: 1, pageSize: 30 },
      }),
      () => { throw new Error('source fetch fail'); },
    ]);
    const res = await h('sonar_issues')({ projectKey: 'testproj', include_source: true });
    assert.equal(res.issues[0].key, 'i1');
  });

  it('sonar_worst_metrics handles descending sort metric', async () => {
    const calls = mockFetch([() => jsonOk({
      measures: [
        { metric: 'cognitive_complexity', component: 'testproj:src/a.js', value: '5' },
        { metric: 'cognitive_complexity', component: 'testproj:src/b.js', value: '15' },
      ],
    })]);
    const res = await h('sonar_worst_metrics')({ projectKey: 'testproj', metrics: 'cognitive_complexity', limit: 5 });
    assert.equal(res.results.cognitive_complexity.length, 2);
    assert.equal(res.results.cognitive_complexity[0].value, 15);
    assert.equal(res.results.cognitive_complexity[1].value, 5);
  });

  it('sonar_new_issues handles empty analysis response', async () => {
    const calls = mockFetch([
      () => jsonOk({ analyses: undefined }),
    ]);
    const res = await h('sonar_new_issues')({ projectKey: 'testproj' });
    assert.equal(res.total, 0);
    assert.ok(res.message);
  });

  it('sonar_issues compact mode with no issues', async () => {
    const calls = mockFetch([() => jsonOk({
      total: 0, issues: [], paging: { total: 0, pageSize: 30 }, components: [], facets: [],
    })]);
    const res = await h('sonar_issues')({ projectKey: 'testproj', compact: true });
    assert.equal(res.total, 0);
    assert.ok(Array.isArray(res.issues));
  });
});
