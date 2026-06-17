import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
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

  it('sonar_run_analysis throws without sonar-project.properties', async () => {
    const h = TOOL_CONFIGS.find((t) => t.name === 'sonar_run_analysis').handler;
    const tmp = mkdtempSync(join(tmpdir(), 'sonar-test-'));
    await assert.rejects(() => h({ cwd: tmp }), /No sonar-project.properties found/);
  });

  it('sonar_run_analysis throws without token', async () => {
    const prev = process.env.SONARQUBE_TOKEN;
    delete process.env.SONARQUBE_TOKEN;
    const h = TOOL_CONFIGS.find((t) => t.name === 'sonar_run_analysis').handler;
    const tmp = mkdtempSync(join(tmpdir(), 'sonar-test-'));
    writeFileSync(join(tmp, 'sonar-project.properties'), 'sonar.projectKey=test\nsonar.sources=.\n');
    await assert.rejects(() => h({ cwd: tmp }), /No token/);
    process.env.SONARQUBE_TOKEN = prev;
  });

  it('sonar_setup_scanner runs in temp dir with package.json', async () => {
    const h = TOOL_CONFIGS.find((t) => t.name === 'sonar_setup_scanner').handler;
    const tmp = mkdtempSync(join(tmpdir(), 'sonar-test-'));
    writeFileSync(join(tmp, 'package.json'), '{"name":"test","version":"1.0.0"}');
    const res = await h({ cwd: tmp });
    assert.ok(res.installed);
    assert.ok(res.output);
    assert.ok(existsSync(join(tmp, 'node_modules', 'sonar-scanner', 'package.json')));
  });
});
