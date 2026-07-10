import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { TOOL_CONFIGS } from '../src/handlers.mjs';

describe('handlers', () => {
  it('all handlers exist and are functions', () => {
    for (const { name, handler } of TOOL_CONFIGS) {
      assert.equal(
        typeof handler,
        'function',
        `${name} handler should be a function`,
      );
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

  it('sonar_hotspot_details throws when key missing', async () => {
    const h = TOOL_CONFIGS.find(
      (t) => t.name === 'sonar_hotspot_details',
    ).handler;
    await assert.rejects(() => h({}), /hotspotKey is required/);
  });

  it('sonar_change_hotspot_status throws when key missing', async () => {
    const h = TOOL_CONFIGS.find(
      (t) => t.name === 'sonar_change_hotspot_status',
    ).handler;
    await assert.rejects(() => h({}), /hotspotKey is required/);
  });

  it('sonar_issues_bulk_transition throws when keys missing', async () => {
    const h = TOOL_CONFIGS.find(
      (t) => t.name === 'sonar_issues_bulk_transition',
    ).handler;
    await assert.rejects(() => h({}), /issueKeys array is required/);
    await assert.rejects(
      () => h({ issueKeys: [] }),
      /issueKeys array is required/,
    );
  });

  it('sonar_raw adds usage hint on 4xx errors', {
    skip: !process.env.SONARQUBE_TOKEN,
  }, async () => {
    const h = TOOL_CONFIGS.find((t) => t.name === 'sonar_raw').handler;
    try {
      await h({ path: '/api/measures/component?metricKeys=coverage' });
      assert.fail('should have thrown');
    } catch (e) {
      const msg = /** @type {Error} */ (e).message;
      assert.ok(msg.includes('SonarQube 400'), 'should have 400 error');
      assert.ok(msg.includes('Tip:'), 'should include usage hint');
    }
  });

  it('sonar_list_pull_requests returns empty array on CE', {
    skip: !process.env.SONARQUBE_TOKEN,
  }, async () => {
    const h = TOOL_CONFIGS.find(
      (t) => t.name === 'sonar_list_pull_requests',
    ).handler;
    try {
      const res = await h({ projectKey: 'sonarcube_mcp' });
      assert.ok(Array.isArray(res));
    } catch (e) {
      assert.ok(e.message.includes('404'));
    }
  });

  it('sonar_list_webhooks falls back to default project', {
    skip: !process.env.SONARQUBE_PROJECT,
  }, async () => {
    const h = TOOL_CONFIGS.find(
      (t) => t.name === 'sonar_list_webhooks',
    ).handler;
    const res = await h({});
    assert.ok(res.webhooks !== undefined);
  });

  it('sonar_hotspots token check warns on non-squ token', async () => {
    const prev = process.env.SONARQUBE_TOKEN;
    process.env.SONARQUBE_TOKEN = 'sqp_testtoken';
    const h = TOOL_CONFIGS.find((t) => t.name === 'sonar_hotspots').handler;
    await assert.rejects(() => h({ projectKey: 'test' }), /User token/);
    process.env.SONARQUBE_TOKEN = prev;
  });

  it('sonar_run_analysis auto-creates properties and tries to run scanner', async () => {
    process.env.SONARQUBE_DISABLE_DOCKER = 'true';
    const h = TOOL_CONFIGS.find((t) => t.name === 'sonar_run_analysis').handler;
    const tmp = mkdtempSync(join(tmpdir(), 'sonar-test-'));
    const res = await h({
      cwd: tmp,
      host: 'http://test:9000',
      projectKey: 'test',
      sources: '.',
    });
    assert.equal(res.success, false);
    assert.ok(res.output);
    const propsPath = join(tmp, 'sonar-project.properties');
    assert.ok(existsSync(propsPath), 'properties file should be auto-created');
    const content = readFileSync(propsPath, 'utf8');
    assert.match(content, /sonar\.projectKey=test/);
    assert.match(content, /sonar\.host\.url=http:\/\/test:9000/);
    delete process.env.SONARQUBE_DISABLE_DOCKER;
  });

  it('sonar_run_analysis throws without token', async () => {
    const prev = process.env.SONARQUBE_TOKEN;
    delete process.env.SONARQUBE_TOKEN;
    const h = TOOL_CONFIGS.find((t) => t.name === 'sonar_run_analysis').handler;
    const tmp = mkdtempSync(join(tmpdir(), 'sonar-test-'));
    writeFileSync(
      join(tmp, 'sonar-project.properties'),
      'sonar.projectKey=test\nsonar.sources=.\n',
    );
    await assert.rejects(() => h({ cwd: tmp }), /No token/);
    process.env.SONARQUBE_TOKEN = prev;
  });

  it('sonar_setup_scanner detects pnpm lock file', async () => {
    process.env.SONARQUBE_DISABLE_DOCKER = 'true';
    const h = TOOL_CONFIGS.find(
      (t) => t.name === 'sonar_setup_scanner',
    ).handler;
    const tmp = mkdtempSync(join(tmpdir(), 'sonar-test-'));
    writeFileSync(
      join(tmp, 'package.json'),
      '{"name":"test","version":"1.0.0"}',
    );
    writeFileSync(join(tmp, 'pnpm-lock.yaml'), 'lockfileVersion: 1\n');
    const res = await h({ cwd: tmp });
    assert.ok(res.installed);
    assert.equal(res.packageManager, 'pnpm');
    delete process.env.SONARQUBE_DISABLE_DOCKER;
  });

  it('sonar_setup_scanner detects yarn lock file', async () => {
    process.env.SONARQUBE_DISABLE_DOCKER = 'true';
    const h = TOOL_CONFIGS.find(
      (t) => t.name === 'sonar_setup_scanner',
    ).handler;
    const tmp = mkdtempSync(join(tmpdir(), 'sonar-test-'));
    writeFileSync(
      join(tmp, 'package.json'),
      '{"name":"test","version":"1.0.0"}',
    );
    writeFileSync(join(tmp, 'yarn.lock'), '# yarn lockfile\n');
    await assert.rejects(() => h({ cwd: tmp }), /Command failed/);
    delete process.env.SONARQUBE_DISABLE_DOCKER;
  });

  it('sonar_setup_scanner runs npm in temp dir with package.json', async () => {
    process.env.SONARQUBE_DISABLE_DOCKER = 'true';
    const h = TOOL_CONFIGS.find(
      (t) => t.name === 'sonar_setup_scanner',
    ).handler;
    const tmp = mkdtempSync(join(tmpdir(), 'sonar-test-'));
    writeFileSync(
      join(tmp, 'package.json'),
      '{"name":"test","version":"1.0.0"}',
    );
    const res = await h({ cwd: tmp });
    assert.ok(res.installed);
    assert.ok(res.output);
    assert.ok(
      existsSync(join(tmp, 'node_modules', 'sonar-scanner', 'package.json')),
    );
    delete process.env.SONARQUBE_DISABLE_DOCKER;
  });

  it('sonar_run_analysis uses defaults for host/projectKey/sources', async () => {
    process.env.SONARQUBE_DISABLE_DOCKER = 'true';
    const prevUrl = process.env.SONARQUBE_URL;
    const prevProj = process.env.SONARQUBE_PROJECT;
    process.env.SONARQUBE_URL = 'http://default:9000';
    process.env.SONARQUBE_PROJECT = 'default_proj';
    const h = TOOL_CONFIGS.find((t) => t.name === 'sonar_run_analysis').handler;
    const tmp = mkdtempSync(join(tmpdir(), 'sonar-test-'));
    const res = await h({ cwd: tmp });
    assert.equal(res.success, false);
    const propsPath = join(tmp, 'sonar-project.properties');
    assert.ok(existsSync(propsPath), 'properties should be auto-created');
    const content = readFileSync(propsPath, 'utf8');
    assert.match(content, /sonar\.projectKey=default_proj/);
    assert.match(content, /sonar\.host\.url=http:\/\/default:9000/);
    assert.match(content, /sonar\.sources=src/);
    process.env.SONARQUBE_URL = prevUrl;
    process.env.SONARQUBE_PROJECT = prevProj;
    delete process.env.SONARQUBE_DISABLE_DOCKER;
  });

  it('sonar_run_analysis uses global scanner when not in node_modules', async () => {
    process.env.SONARQUBE_DISABLE_DOCKER = 'true';
    const prev = process.env.SONARQUBE_TOKEN;
    process.env.SONARQUBE_TOKEN = 'squ_test';
    const h = TOOL_CONFIGS.find((t) => t.name === 'sonar_run_analysis').handler;
    const tmp = mkdtempSync(join(tmpdir(), 'sonar-test-'));
    writeFileSync(
      join(tmp, 'sonar-project.properties'),
      'sonar.host.url=http://test:9000\nsonar.projectKey=test\nsonar.sources=.\n',
    );
    const res = await h({ cwd: tmp });
    assert.equal(res.success, false);
    process.env.SONARQUBE_TOKEN = prev;
    delete process.env.SONARQUBE_DISABLE_DOCKER;
  });

  it('sonar_run_analysis uses Docker when available', async () => {
    process.env.SONARQUBE_DISABLE_DOCKER = 'true';
    const prev = process.env.SONARQUBE_TOKEN;
    process.env.SONARQUBE_TOKEN = 'squ_test';
    const h = TOOL_CONFIGS.find((t) => t.name === 'sonar_run_analysis').handler;
    const tmp = mkdtempSync(join(tmpdir(), 'sonar-test-'));
    const res = await h({
      cwd: tmp,
      host: 'http://test:9000',
      projectKey: 'test',
      sources: '.',
    });
    assert.equal(res.success, false);
    process.env.SONARQUBE_TOKEN = prev;
    delete process.env.SONARQUBE_DISABLE_DOCKER;
  });
});
