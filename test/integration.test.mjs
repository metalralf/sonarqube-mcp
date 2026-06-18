import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import { getHostUrl, getToken, sonarGet, sonarPost } from '../src/api.mjs';

const TOKEN = getToken();
const HOST = getHostUrl();

import { TOOL_CONFIGS } from '../src/handlers.mjs';

const handler = (name) => TOOL_CONFIGS.find((t) => t.name === name).handler;

const createdProjects = [];

const deleteProject = async (key) => {
  try {
    await sonarPost('/api/projects/delete', new URLSearchParams({ project: key }).toString());
  } catch {}
};

const ensureProject = async (prefix) => {
  const pk = prefix + Date.now() + Math.random().toString(36).slice(2, 6);
  const res = await fetch(`${HOST}/api/projects/create?name=${pk}&project=${pk}`, {
    method: 'POST', headers: { authorization: `Basic ${Buffer.from(TOKEN + ':').toString('base64')}` },
  });
  if (res.ok) createdProjects.push(pk);
  return pk;
};

describe('integration', { skip: !TOKEN }, () => {
  after(async () => {
    for (const key of createdProjects) await deleteProject(key);
  });
  it('sonarGet can reach the server', async () => {
    const res = await sonarGet('/api/system/health');
    assert.ok(res.health);
  });

  it('sonar_summary returns aggregated project health', async () => {
    const res = await handler('sonar_summary')({ projectKey: 'sonarcube_mcp' });
    assert.equal(res.projectKey, 'sonarcube_mcp');
    assert.ok(res.qualityGate);
    assert.ok(res.metrics);
    assert.ok(res.metrics.coverage);
    assert.equal(typeof res.issues.total, 'number');
    assert.ok(Array.isArray(res.branches));
  });

  it('sonar_quality_gate returns status', async () => {
    const res = await handler('sonar_quality_gate')({ projectKey: 'sonarcube_mcp' });
    assert.ok(res.projectStatus);
    assert.ok(['OK', 'ERROR', 'NONE'].includes(res.projectStatus.status));
  });

  it('sonar_measures returns component with measures', async () => {
    const res = await handler('sonar_measures')({ projectKey: 'sonarcube_mcp' });
    assert.ok(res.component);
    assert.equal(res.component.key, 'sonarcube_mcp');
  });

  it('sonar_analysis_status returns ANALYZED', async () => {
    const res = await handler('sonar_analysis_status')({ projectKey: 'sonarcube_mcp' });
    assert.equal(res.status, 'ANALYZED');
    assert.ok(res.lastAnalysis);
    assert.ok(res.projectUrl);
  });

  it('sonar_search_projects returns projects', async () => {
    const res = await handler('sonar_search_projects')({});
    assert.ok(res.components);
    assert.ok(res.paging);
  });

  it('sonar_issues returns issue list', async () => {
    const res = await handler('sonar_issues')({ projectKey: 'sonarcube_mcp' });
    assert.ok(Array.isArray(res.issues));
  });

  it('sonar_change_hotspot_status rejects missing key', async () => {
    await assert.rejects(
      () => handler('sonar_change_hotspot_status')({}),
      /hotspotKey is required/,
    );
  });

  it('sonar_change_hotspot_status rejects nonexistent hotspot', async () => {
    await assert.rejects(
      () => handler('sonar_change_hotspot_status')({ hotspotKey: 'nonexistent', status: 'REVIEWED', resolution: 'FIXED' }),
      /SonarQube 400|SonarQube 404/,
    );
  });

  it('sonar_hotspots returns error hint for non-user tokens', async () => {
    try {
      await handler('sonar_hotspots')({ projectKey: 'sonarcube_mcp' });
    } catch (e) {
      assert.match(e.message, /User token/);
    }
  });

  it('sonar_hotspot_details rejects missing key', async () => {
    await assert.rejects(
      () => handler('sonar_hotspot_details')({}),
      /hotspotKey is required/,
    );
  });

  it('sonar_hotspot_details rejects nonexistent hotspot', async () => {
    await assert.rejects(
      () => handler('sonar_hotspot_details')({ hotspotKey: 'nonexistent' }),
      /SonarQube 400|SonarQube 404/,
    );
  });

  it('sonar_rule returns rule details', async () => {
    const res = await handler('sonar_rule')({ ruleKey: 'javascript:S6582' });
    assert.ok(res.rule);
    assert.equal(res.rule.key, 'javascript:S6582');
  });

  it('sonar_source returns source lines', async () => {
    const res = await handler('sonar_source')({ key: 'sonarcube_mcp:src/index.mjs' });
    assert.ok(res.sources);
    assert.ok(res.sources.length > 0);
  });

  it('sonar_analysis_status returns NOT_FOUND for nonexistent project', async () => {
    const res = await handler('sonar_analysis_status')({ projectKey: 'zzz_nonexistent_98765' });
    assert.equal(res.status, 'NOT_FOUND');
    assert.match(res.message, /does not exist/);
  });

  it('sonar_analysis_status returns NOT_ANALYZED for an unanalyzed project', async () => {
    const pk = await ensureProject('zz_test_unanalyzed_');
    const status = await handler('sonar_analysis_status')({ projectKey: pk });
    assert.equal(status.status, 'NOT_ANALYZED');
    assert.match(status.message, /no analysis data/);
  });

  it('sonar_issues compact mode strips verbose fields', async () => {
    const res = await handler('sonar_issues')({ projectKey: 'sonarcube_mcp', compact: true, limit: 5 });
    assert.ok(Array.isArray(res.issues));
    if (res.issues.length > 0) {
      assert.equal(res.issues[0].flows, undefined);
    }
  });

  it('sonar_issues_summary returns counts', async () => {
    const res = await handler('sonar_issues_summary')({ projectKey: 'sonarcube_mcp' });
    assert.equal(typeof res.total, 'number');
    assert.ok(res.by_severity);
    assert.ok(res.by_type);
  });

  it('sonar_new_issues returns results', async () => {
    const res = await handler('sonar_new_issues')({ projectKey: 'sonarcube_mcp', compact: true, limit: 5 });
    assert.ok(res.issues || res.total === 0);
  });

  it('sonar_search_metrics returns metrics list', async () => {
    const res = await handler('sonar_search_metrics')({});
    assert.ok(res.metrics);
    assert.ok(Array.isArray(res.metrics));
    assert.ok(res.metrics.length > 0);
    assert.ok(res.metrics[0].key);
    assert.ok(res.metrics[0].name);
  });

  it('sonar_ping returns pong', async () => {
    const res = await handler('sonar_ping')({});
    assert.ok(res.pong);
    assert.ok(res.health);
  });

  it('sonar_raw calls arbitrary endpoint', async () => {
    const res = await handler('sonar_raw')({ path: '/api/system/health' });
    assert.ok(res.health);
  });

  it('sonar_issues with status filter', async () => {
    const res = await handler('sonar_issues')({ projectKey: 'gyartas_frontend_web', statuses: 'OPEN', limit: 3 });
    assert.ok(res.issues);
  });

  it('sonar_issues with include_source', async () => {
    const res = await handler('sonar_issues')({ projectKey: 'gyartas_frontend_web', limit: 3, include_source: true });
    assert.ok(res.issues);
    if (res.issues.length > 0 && res.issues[0].line) {
      assert.ok(res.issues[0]._source, 'should have _source when line is present');
    }
  });

  it('sonar_new_issues on unanalyzed project returns message', async () => {
    const pk = await ensureProject('zz_test_unanalyzed_');
    const res = await handler('sonar_new_issues')({ projectKey: pk });
    assert.match(res.message, /No previous analysis/);
  });

  it('sonar_issues_summary aggregation loops over issues', async () => {
    const res = await handler('sonar_issues_summary')({ projectKey: 'gyartas_frontend_web' });
    assert.ok(res.total > 0, 'gyartas_frontend_web should have issues');
    assert.ok(Object.keys(res.by_severity).length > 0, 'by_severity should have entries');
    assert.ok(Object.keys(res.by_type).length > 0, 'by_type should have entries');
    assert.equal(typeof res.effortTotal, 'number');
  });

  it('sonar_set_issue_status rejects invalid issue key', async () => {
    await assert.rejects(
      () => handler('sonar_set_issue_status')({ issueKey: 'nonexistent', transition: 'confirm' }),
      /SonarQube 400|SonarQube 404/,
    );
  });

  it('sonar_list_webhooks returns webhooks for project', async () => {
    const res = await handler('sonar_list_webhooks')({ projectKey: 'sonarcube_mcp' });
    assert.ok(res.webhooks !== undefined);
    assert.ok(Array.isArray(res.webhooks));
  });

  it('sonar_list_pull_requests returns error hint on CE', async () => {
    try {
      const res = await handler('sonar_list_pull_requests')({ projectKey: 'sonarcube_mcp' });
      assert.ok(Array.isArray(res));
    } catch (e) {
      assert.match(e.message, /404|SonarQube|Developer|Enterprise/);
    }
  });

  it('sonar_list_branches returns branches', async () => {
    const res = await handler('sonar_list_branches')({ projectKey: 'sonarcube_mcp' });
    assert.ok(Array.isArray(res));
    assert.ok(res.length > 0);
    const main = res.find((b) => b.isMain);
    assert.ok(main, 'should have a main branch');
    assert.ok(main.name);
  });

  it('sonar_list_languages returns language list', async () => {
    const res = await handler('sonar_list_languages')({});
    assert.ok(Array.isArray(res));
    assert.ok(res.length > 0);
    assert.ok(res[0].key);
    assert.ok(res[0].name);
  });

  it('sonar_list_quality_gates returns quality gate list', async () => {
    const res = await handler('sonar_list_quality_gates')({});
    assert.ok(res.qualitygates);
    assert.ok(Array.isArray(res.qualitygates));
    assert.ok(res.qualitygates.length > 0);
    assert.ok(res.qualitygates[0].name);
  });

  it('sonar_scm_info returns SCM data for a file', async () => {
    const res = await handler('sonar_scm_info')({ key: 'sonarcube_mcp:src/index.mjs' });
    assert.ok(res.scm);
    assert.ok(Array.isArray(res.scm));
  });

  it('sonar_file_coverage_details returns coverage for a file', async () => {
    const res = await handler('sonar_file_coverage_details')({ key: 'sonarcube_mcp:src/handlers.mjs' });
    assert.ok(res.component);
    assert.equal(res.component.qualifier, 'FIL');
    assert.ok(res.component.measures);
    assert.ok(res.component.measures.find((m) => m.metric === 'coverage'));
  });

  it('sonar_coverage_files returns files below threshold', async () => {
    const res = await handler('sonar_coverage_files')({ projectKey: 'sonarcube_mcp', threshold: 100 });
    assert.equal(typeof res.total, 'number');
    assert.ok(Array.isArray(res.files));
    assert.equal(res.threshold, 100);
  });

  it('sonar_search_duplicated_files returns files above threshold', async () => {
    const res = await handler('sonar_search_duplicated_files')({ projectKey: 'sonarcube_mcp', threshold: 0 });
    assert.equal(typeof res.total, 'number');
    assert.ok(Array.isArray(res.files));
    assert.equal(res.threshold, 0);
  });

  it('sonar_worst_metrics returns ranked results', async () => {
    const res = await handler('sonar_worst_metrics')({ projectKey: 'sonarcube_mcp', metrics: 'coverage,duplicated_lines_density', limit: 5 });
    assert.ok(res.projectKey);
    assert.ok(Array.isArray(res.metrics));
    assert.ok(res.results);
    assert.ok('coverage' in res.results);
  });

  it('sonar_duplications returns data for a file', async () => {
    const res = await handler('sonar_duplications')({ key: 'sonarcube_mcp:src/index.mjs' });
    assert.ok(res.duplications !== undefined);
  });

  it('sonarPost authentication validate succeeds', async () => {
    const { sonarPost } = await import('../src/api.mjs');
    const res = await sonarPost('/api/authentication/validate', '');
    assert.ok(res.valid !== undefined);
  });
});
