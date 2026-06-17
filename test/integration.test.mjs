import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getHostUrl, getToken, sonarGet } from '../src/api.mjs';

const TOKEN = getToken();
const HOST = getHostUrl();
import { HANDLERS } from '../src/handlers.mjs';

describe('integration', { skip: !TOKEN }, () => {
  it('sonarGet can reach the server', async () => {
    const res = await sonarGet('/api/system/health');
    assert.ok(res.health);
  });

  it('sonar_quality_gate returns status', async () => {
    const res = await HANDLERS.sonar_quality_gate({ projectKey: 'sonarcube_mcp' });
    assert.ok(res.projectStatus);
    assert.ok(['OK', 'ERROR', 'NONE'].includes(res.projectStatus.status));
  });

  it('sonar_measures returns component with measures', async () => {
    const res = await HANDLERS.sonar_measures({ projectKey: 'sonarcube_mcp' });
    assert.ok(res.component);
    assert.equal(res.component.key, 'sonarcube_mcp');
  });

  it('sonar_analysis_status returns ANALYZED', async () => {
    const res = await HANDLERS.sonar_analysis_status({ projectKey: 'sonarcube_mcp' });
    assert.equal(res.status, 'ANALYZED');
    assert.ok(res.lastAnalysis);
    assert.ok(res.projectUrl);
  });

  it('sonar_search_projects returns projects', async () => {
    const res = await HANDLERS.sonar_search_projects({});
    assert.ok(res.components);
    assert.ok(res.paging);
  });

  it('sonar_issues returns issue list', async () => {
    const res = await HANDLERS.sonar_issues({ projectKey: 'sonarcube_mcp' });
    assert.ok(Array.isArray(res.issues));
  });

  it('sonar_hotspots returns error hint for non-user tokens', async () => {
    try {
      await HANDLERS.sonar_hotspots({ projectKey: 'sonarcube_mcp' });
    } catch (e) {
      assert.match(e.message, /user token/);
    }
  });

  it('sonar_raw calls arbitrary endpoint', async () => {
    const res = await HANDLERS.sonar_raw({ path: '/api/system/health' });
    assert.ok(res.health);
  });
});
