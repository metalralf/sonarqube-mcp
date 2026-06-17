import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

describe('handlers', () => {
  it('exports HANDLERS object with all tools', async () => {
    const mod = await import('../src/handlers.mjs');
    const expected = [
      'sonar_search_projects',
      'sonar_quality_gate',
      'sonar_measures',
      'sonar_issues',
      'sonar_hotspots',
      'sonar_rule',
      'sonar_source',
      'sonar_analysis_status',
      'sonar_raw',
    ];
    for (const name of expected) {
      assert.equal(typeof mod.HANDLERS[name], 'function', `${name} should be a function`);
    }
  });

  it('sonar_rule throws when ruleKey missing', async () => {
    const mod = await import('../src/handlers.mjs?sr');
    await assert.rejects(() => mod.HANDLERS.sonar_rule({}), /ruleKey is required/);
  });

  it('sonar_source throws when key missing', async () => {
    const mod = await import('../src/handlers.mjs?ss');
    await assert.rejects(() => mod.HANDLERS.sonar_source({}), /key \(component key\) is required/);
  });

  it('sonar_raw throws when path missing', async () => {
    const mod = await import('../src/handlers.mjs?raw1');
    await assert.rejects(() => mod.HANDLERS.sonar_raw({}), /path must start with/);
  });

  it('sonar_raw throws when path does not start with /', async () => {
    const mod = await import('../src/handlers.mjs?raw2');
    await assert.rejects(() => mod.HANDLERS.sonar_raw({ path: 'api/test' }), /path must start with/);
  });
});
