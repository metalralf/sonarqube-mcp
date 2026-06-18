import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TOOL_CONFIGS } from '../src/handlers.mjs';

describe('toolset filtering', () => {
  const isFiltered = process.env.SONARQUBE_TOOLSETS || process.env.SONARQUBE_READ_ONLY;

  it('TOOL_CATEGORIES covers all 29 tools when no filtering active', { skip: !!isFiltered }, () => {
    assert.equal(TOOL_CONFIGS.length, 29);
  });

  it('read-only mode excludes write tools', { skip: process.env.SONARQUBE_READ_ONLY !== 'true' }, () => {
    const names = TOOL_CONFIGS.map((t) => t.name);
    assert.ok(names.includes('sonar_issues'), 'read tools present');
    assert.ok(!names.includes('sonar_set_issue_status'), 'write tools excluded');
    assert.ok(!names.includes('sonar_change_hotspot_status'), 'write tools excluded');
    assert.ok(!names.includes('sonar_run_analysis'), 'write tools excluded');
    assert.ok(!names.includes('sonar_setup_scanner'), 'write tools excluded');
  });

  it('toolset filtering only includes requested categories', { skip: !process.env.SONARQUBE_TOOLSETS }, () => {
    const names = TOOL_CONFIGS.map((t) => t.name);
    assert.ok(names.includes('sonar_issues'), 'issues toolset present');
    assert.ok(!names.includes('sonar_hotspots'), 'hotspots excluded');
  });
});
