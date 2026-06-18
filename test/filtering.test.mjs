import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const freshConfigs = async (env) => {
  const prev = {};
  for (const [k, v] of Object.entries(env)) {
    prev[k] = process.env[k];
    process.env[k] = v;
  }
  const url = new URL('../src/handlers.mjs', import.meta.url).href + '?t=' + Date.now();
  const mod = await import(url);
  for (const [k, v] of Object.entries(env)) {
    if (prev[k] === undefined) delete process.env[k];
    else process.env[k] = prev[k];
  }
  return mod.TOOL_CONFIGS;
};

describe('toolset filtering', () => {
  it('exposes all 30 tools by default', async () => {
    const configs = await freshConfigs({});
    assert.equal(configs.length, 30);
    const names = configs.map((t) => t.name);
    assert.ok(names.includes('sonar_issues'));
    assert.ok(names.includes('sonar_hotspots'));
    assert.ok(names.includes('sonar_run_analysis'));
  });

  it('read-only mode excludes write tools', async () => {
    const configs = await freshConfigs({ SONARQUBE_READ_ONLY: 'true' });
    const names = configs.map((t) => t.name);
    assert.ok(names.includes('sonar_issues'), 'read tools present');
    assert.ok(!names.includes('sonar_set_issue_status'), 'write tools excluded');
    assert.ok(!names.includes('sonar_change_hotspot_status'), 'write tools excluded');
    assert.ok(!names.includes('sonar_run_analysis'), 'write tools excluded');
    assert.ok(!names.includes('sonar_setup_scanner'), 'write tools excluded');
  });

  it('toolset filtering limits to requested categories', async () => {
    const configs = await freshConfigs({ SONARQUBE_TOOLSETS: 'issues,quality' });
    const names = configs.map((t) => t.name);
    assert.ok(names.includes('sonar_issues'), 'issues toolset present');
    assert.ok(names.includes('sonar_quality_gate'), 'quality toolset present');
    assert.ok(!names.includes('sonar_hotspots'), 'hotspots excluded');
    assert.ok(!names.includes('sonar_coverage_files'), 'coverage excluded');
  });

  it('read-only + toolset filtering work together', async () => {
    const configs = await freshConfigs({ SONARQUBE_TOOLSETS: 'issues,hotspots', SONARQUBE_READ_ONLY: 'true' });
    const names = configs.map((t) => t.name);
    assert.ok(names.includes('sonar_issues'), 'issues present');
    assert.ok(names.includes('sonar_hotspots'), 'hotspots present');
    assert.ok(!names.includes('sonar_set_issue_status'), 'write tools excluded');
    assert.ok(!names.includes('sonar_change_hotspot_status'), 'write tools excluded');
    assert.ok(!names.includes('sonar_quality_gate'), 'quality excluded');
  });
});
