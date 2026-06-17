import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TOOL_CONFIGS } from '../src/handlers.mjs';

describe('handlers', () => {
  it('all handlers exist and are functions', () => {
    for (const { name, handler } of TOOL_CONFIGS) {
      assert.equal(typeof handler, 'function', `${name} handler should be a function`);
    }
  });

  it('sonar_rule throws when ruleKey missing', async () => {
    const h = TOOL_CONFIGS.find((t) => t.name === 'sonar_rule').handler;
    await assert.rejects(() => h({}), /ruleKey is required/);
  });

  it('sonar_source throws when key missing', async () => {
    const h = TOOL_CONFIGS.find((t) => t.name === 'sonar_source').handler;
    await assert.rejects(() => h({}), /component key/);
  });

  it('sonar_raw throws when path missing', async () => {
    const h = TOOL_CONFIGS.find((t) => t.name === 'sonar_raw').handler;
    await assert.rejects(() => h({}), /path must start with/);
  });

  it('sonar_raw throws when path does not start with /', async () => {
    const h = TOOL_CONFIGS.find((t) => t.name === 'sonar_raw').handler;
    await assert.rejects(() => h({ path: 'api/test' }), /path must start with/);
  });

  it('sonar_setup_scanner handler exists', () => {
    const h = TOOL_CONFIGS.find((t) => t.name === 'sonar_setup_scanner');
    assert.ok(h);
    assert.equal(typeof h.handler, 'function');
  });

  it('sonar_run_analysis handler exists', () => {
    const h = TOOL_CONFIGS.find((t) => t.name === 'sonar_run_analysis');
    assert.ok(h);
    assert.equal(typeof h.handler, 'function');
    assert.ok(h.schema.cwd);
    assert.ok(h.schema.token);
  });
});
