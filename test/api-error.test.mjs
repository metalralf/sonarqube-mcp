import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { after, before, describe, it } from 'node:test';

const BASE = 'http://sonarqube-mcp-test.local';

describe('sonarGet error handling', () => {
  let api;
  let origFetch;
  let origUrl, origToken;

  before(() => {
    origUrl = process.env.SONARQUBE_URL;
    origToken = process.env.SONARQUBE_TOKEN;
    process.env.SONARQUBE_URL = BASE;
    process.env.SONARQUBE_TOKEN = 'squ_test_token';
    return import('../src/api.mjs').then((m) => {
      api = m;
    });
  });

  after(() => {
    process.env.SONARQUBE_URL = origUrl;
    process.env.SONARQUBE_TOKEN = origToken;
  });

  it('throws user token hint on 403 for hotspots', async () => {
    origFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: false,
      status: 403,
      text: async () => '{"errors":[{"msg":"Insufficient privileges"}]}',
    });

    await assert.rejects(
      () => api.sonarGet('/api/hotspots/search?projectKey=test'),
      /User token/,
    );
    globalThis.fetch = origFetch;
  });

  it('throws generic error on 403 for non-hotspots', async () => {
    origFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: false,
      status: 403,
      text: async () => 'Forbidden',
    });

    await assert.rejects(
      () => api.sonarGet('/api/system/info'),
      /SonarQube 403/,
    );
    globalThis.fetch = origFetch;
  });

  it('throws with detail on 500', async () => {
    origFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: false,
      status: 500,
      text: async () => '{"errors":[{"msg":"Internal error"}]}',
    });

    await assert.rejects(() => api.sonarGet('/api/foo'), /Internal error/);
    globalThis.fetch = origFetch;
  });

  it('throws with plain text on non-JSON error', async () => {
    origFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: false,
      status: 404,
      text: async () => 'Not Found',
    });

    await assert.rejects(
      () => api.sonarGet('/api/nonexistent'),
      /SonarQube 404: Not Found/,
    );
    globalThis.fetch = origFetch;
  });
});

describe('entry point smoke test', () => {
  it('starts, responds to initialize, and exits cleanly', async () => {
    const proc = spawn('node', ['src/index.mjs'], {
      env: {
        ...process.env,
        SONARQUBE_URL: BASE,
        SONARQUBE_TOKEN: 'squ_test_token',
        SONARQUBE_PROJECT: 'test_proj',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const lines = [];
    proc.stdout.on('data', (chunk) => {
      lines.push(...chunk.toString().trim().split('\n'));
    });

    const stderrLines = [];
    proc.stderr.on('data', (chunk) => {
      stderrLines.push(chunk.toString().trim());
    });

    await new Promise((r) => setTimeout(r, 300));

    proc.stdin.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '1' },
        },
      }) + '\n',
    );
    proc.stdin.write(
      JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) +
        '\n',
    );
    proc.stdin.write(
      JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n',
    );
    proc.stdin.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'sonar_search_projects', arguments: { limit: 1 } },
      }) + '\n',
    );
    proc.stdin.end();

    await new Promise((r) => proc.on('exit', r));

    assert.ok(lines.length >= 1, 'should have at least one stdout line');

    const initResp = JSON.parse(lines[0]);
    assert.equal(initResp.id, 1);
    assert.equal(initResp.result.serverInfo.name, 'sonarqube-mcp');

    const toolListResp = lines.find(
      (l) => l.includes('tools/list') || l.includes('tools'),
    );
    assert.ok(toolListResp, 'should have tools/list response');

    const stderrText = stderrLines.join('\n');
    assert.match(stderrText, /ready/);
    assert.match(stderrText, /host=/);
    assert.match(stderrText, /token=set/);
  });

  it('returns isError for unknown tool', async () => {
    const proc = spawn('node', ['src/index.mjs'], {
      env: {
        ...process.env,
        SONARQUBE_URL: BASE,
        SONARQUBE_TOKEN: 'squ_test_token',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const lines = [];
    proc.stdout.on('data', (chunk) => {
      lines.push(...chunk.toString().trim().split('\n'));
    });

    await new Promise((r) => setTimeout(r, 300));

    proc.stdin.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '1' },
        },
      }) + '\n',
    );
    proc.stdin.write(
      JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) +
        '\n',
    );
    proc.stdin.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'nonexistent_tool', arguments: {} },
      }) + '\n',
    );
    proc.stdin.end();

    await new Promise((r) => proc.on('exit', r));

    const errResp = lines.find((l) => l.includes('nonexistent_tool'));
    assert.ok(errResp, 'should have error response');
    const parsed = JSON.parse(errResp);
    assert.ok(parsed.result.isError);
    assert.match(
      parsed.result.content[0].text,
      /Tool nonexistent_tool not found/,
    );
  });
});
