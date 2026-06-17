import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TOOLS } from '../src/tools.mjs';

describe('tools', () => {
  it('exports TOOLS array with 9 entries', () => {
    assert.equal(TOOLS.length, 9);
  });

  it('each tool has name, description, inputSchema', () => {
    for (const tool of TOOLS) {
      assert.ok(tool.name, `missing name: ${JSON.stringify(tool)}`);
      assert.ok(tool.description, `missing description: ${tool.name}`);
      assert.ok(tool.inputSchema, `missing inputSchema: ${tool.name}`);
      assert.equal(tool.inputSchema.type, 'object');
    }
  });

  it('tool names use snake_case prefix', () => {
    for (const tool of TOOLS) {
      assert.match(tool.name, /^sonar_/, `${tool.name} should start with sonar_`);
    }
  });

  it('required fields are specified where needed', () => {
    const withRequired = TOOLS.filter(t => t.inputSchema.required);
    const names = withRequired.map(t => t.name);
    assert.deepEqual(names.sort(), ['sonar_raw', 'sonar_rule', 'sonar_source']);
  });

  it('has expected tools', () => {
    const names = TOOLS.map(t => t.name).sort();
    assert.deepEqual(names, [
      'sonar_analysis_status',
      'sonar_hotspots',
      'sonar_issues',
      'sonar_measures',
      'sonar_quality_gate',
      'sonar_raw',
      'sonar_rule',
      'sonar_search_projects',
      'sonar_source',
    ]);
  });
});
