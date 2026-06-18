import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TOOL_CONFIGS } from '../src/handlers.mjs';

describe('tools', () => {
  const toolNames = TOOL_CONFIGS.map((t) => t.name).sort();
  const expected = [
    'sonar_analysis_status',
    'sonar_coverage_files',
    'sonar_duplications',
    'sonar_file_coverage_details',
    'sonar_change_hotspot_status',
    'sonar_hotspot_details',
    'sonar_hotspots',
    'sonar_issues',
    'sonar_issues_bulk_transition',
    'sonar_issues_summary',
    'sonar_list_branches',
    'sonar_list_languages',
    'sonar_list_quality_gates',
    'sonar_list_webhooks',
    'sonar_list_pull_requests',
    'sonar_measures',
    'sonar_metrics_history',
    'sonar_new_issues',
    'sonar_ping',
    'sonar_projects_create',
    'sonar_project_details',
    'sonar_quality_gate',
    'sonar_raw',
    'sonar_rule',
    'sonar_run_analysis',
    'sonar_scm_info',
    'sonar_search_duplicated_files',
    'sonar_search_metrics',
    'sonar_search_projects',
    'sonar_set_issue_status',
    'sonar_worst_metrics',
    'sonar_summary',
    'sonar_setup_scanner',
    'sonar_source',
  ];

  it(`exports ${expected.length} tool configs`, () => {
    assert.equal(TOOL_CONFIGS.length, expected.length);
  });

  it('each tool has name, description, schema, handler', () => {
    for (const tool of TOOL_CONFIGS) {
      assert.ok(tool.name, `missing name`);
      assert.ok(tool.description, `missing description: ${tool.name}`);
      assert.ok(tool.schema, `missing schema: ${tool.name}`);
      assert.equal(typeof tool.handler, 'function', `handler not a function: ${tool.name}`);
    }
  });

  it('tool names use snake_case prefix', () => {
    for (const tool of TOOL_CONFIGS) {
      assert.match(tool.name, /^sonar_/, `${tool.name} should start with sonar_`);
    }
  });

  it('has expected tools', () => {
    assert.deepEqual(toolNames, expected.sort());
  });
});
